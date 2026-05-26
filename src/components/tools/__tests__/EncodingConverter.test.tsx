// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

// `EncodingConverterTool` 内で呼ばれる encoding ユーティリティを spy 化する。
// 直接 `runDetect` / `runConvert` を spy する代わりに、内部から呼ばれる
// `detectEncoding` / `convertBytes` の呼び出し回数を検証することで
// effect の発火回数を観測する。partial mock でその他のシンボルは原型を保つ。
vi.mock('@/utils/encoding', async () => {
  const actual = await vi.importActual<typeof import('@/utils/encoding')>('@/utils/encoding');
  return {
    ...actual,
    detectEncoding: vi.fn(actual.detectEncoding),
    convertBytes: vi.fn(actual.convertBytes),
  };
});

import { EncodingConverterTool } from '@/components/tools/EncodingConverter';
import { detectEncoding, convertBytes } from '@/utils/encoding';

const DEBOUNCE_MS = 300;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(detectEncoding).mockClear();
  vi.mocked(convertBytes).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ────────────────────────────────────────────
// debounce 中の連続入力で detect が最終 1 回だけ走ること
// ────────────────────────────────────────────
describe('EncodingConverterTool — debounce 中の連続入力は最終入力 1 回だけ detect する', () => {
  it('300ms 内に複数回テキストが変化しても detectEncoding は最後の入力 1 回のみ呼ばれる', () => {
    const { container } = render(<EncodingConverterTool />);
    const textarea = container.querySelector(
      'textarea#enc-text-input'
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    // 連続入力: debounce 内に 3 回値を変える
    act(() => {
      fireEvent.change(textarea!, { target: { value: 'a' } });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      fireEvent.change(textarea!, { target: { value: 'ab' } });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      fireEvent.change(textarea!, { target: { value: 'abc' } });
    });

    // この時点で detect は debounce 待ち中なので呼ばれていない
    expect(vi.mocked(detectEncoding)).not.toHaveBeenCalled();

    // debounce 完了
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    // 最後の入力 'abc' に対して 1 回だけ呼ばれている
    expect(vi.mocked(detectEncoding)).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────
// useMemo によって不要な effect 再走が起きないこと
// ────────────────────────────────────────────
describe('EncodingConverterTool — 入力非依存の再 render では detect が再走しない', () => {
  it('同じ textInput のまま親由来で再 render しても detectEncoding は再呼び出しされない', () => {
    function Harness() {
      const [, setBump] = useState(0);
      return (
        <div>
          <button type="button" data-testid="bump" onClick={() => setBump((n) => n + 1)}>
            bump
          </button>
          <EncodingConverterTool />
        </div>
      );
    }

    const { container, getByTestId } = render(<Harness />);
    const textarea = container.querySelector(
      'textarea#enc-text-input'
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    act(() => {
      fireEvent.change(textarea!, { target: { value: 'hello' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(vi.mocked(detectEncoding)).toHaveBeenCalledTimes(1);

    // EncodingConverterTool 自身の入力は変えずに親側で state を更新して再 render を誘発。
    // activeBytes が useMemo で安定化されていれば判定 effect は再走しない。
    const bumpButton = getByTestId('bump') as HTMLButtonElement;
    act(() => {
      bumpButton.click();
    });
    act(() => {
      bumpButton.click();
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(vi.mocked(detectEncoding)).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────
// 変換モードでも debounce 中の連続入力は convert 1 回に集約される
// ────────────────────────────────────────────
// ────────────────────────────────────────────
// #391: file.arrayBuffer() の reject 時に error 表示が出る
// ────────────────────────────────────────────
describe('EncodingConverterTool — ファイル読込失敗時のエラー表示 (issue #391)', () => {
  it('file.arrayBuffer() が reject すると ErrorMessage に fallback が表示される', async () => {
    // beforeEach の fakeTimers だと waitFor の内部 setTimeout が回らないため
    // 本 test だけ real timer に戻す
    vi.useRealTimers();

    // jsdom は本物の File を返すが arrayBuffer は controllable ではないため
    // Object.defineProperty で reject に差し替える
    const file = new File(['dummy'], 'sample.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('read failed')),
    });

    const { container } = render(<EncodingConverterTool />);

    // 入力方式を「ファイル」に切替
    act(() => {
      screen.getByRole('button', { name: 'ファイル' }).click();
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      fireEvent.change(input!, { target: { files: [file] } });
    });

    // reject の microtask が flush されるのを待つ
    await waitFor(() => {
      const alerts = container.querySelectorAll('[role="alert"]');
      expect(alerts.length).toBeGreaterThan(0);
    });
    const alertText = Array.from(container.querySelectorAll('[role="alert"]'))
      .map((n) => n.textContent ?? '')
      .join('');
    // Error.message を優先するため "read failed" を含む。
    // (旧実装は .catch なしのため unhandled rejection で alert が出ず本 test は fail する)
    expect(alertText).toMatch(/read failed|ファイルの読み込みに失敗しました/);
  });
});

describe('EncodingConverterTool — 変換モードでも debounce で convert は最終 1 回', () => {
  it('変換モードに切替後、連続入力中は convertBytes が 1 回のみ呼ばれる', () => {
    const { container } = render(<EncodingConverterTool />);

    // 変換モードに切替（ToggleGroup の「変換」ボタンを押す）。
    // textContent 一致は i18n / ラベル変更で壊れやすいため getByRole を使う。
    const convertToggle = screen.getByRole('button', { name: '変換' });
    act(() => {
      convertToggle.click();
    });

    const textarea = container.querySelector(
      'textarea#enc-text-input'
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    act(() => {
      fireEvent.change(textarea!, { target: { value: 'x' } });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      fireEvent.change(textarea!, { target: { value: 'xy' } });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      fireEvent.change(textarea!, { target: { value: 'xyz' } });
    });

    expect(vi.mocked(convertBytes)).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(vi.mocked(convertBytes)).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────
// error 合流の優先順位（#394: 旧実装の error 相互上書き解消の回帰ガード）
//
// 旧実装は detect / convert effect が単一 error state を実行順で上書きしており、
// convert モードで detect が throw しても convert 成功が error を空に握り潰し得た。
// 新実装は error = fileError || detectError || convertError で合流し detect を優先する。
// 本テストは detect だけ throw・convert 成功という構成で detect error が表示される
// ことを assert する。error を convertError 優先（または detect を落とす）に戻すと
// fail する = 陽性対照。
// ────────────────────────────────────────────
describe('EncodingConverterTool — convert モードで detect error が convert 成功に握り潰されない', () => {
  it('detect throw・convert 成功時に detect の error が表示される（陽性対照）', () => {
    const { container } = render(<EncodingConverterTool />);

    // 変換モードに切替
    act(() => {
      screen.getByRole('button', { name: '変換' }).click();
    });

    // detect だけ throw させる（convert は actual 実装で成功する）
    vi.mocked(detectEncoding).mockImplementationOnce(() => {
      throw new Error('判定失敗テスト');
    });

    const textarea = container.querySelector(
      'textarea#enc-text-input'
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    act(() => {
      fireEvent.change(textarea!, { target: { value: 'hello' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    // 合流 error に detectError が出る（convert 成功で握り潰されない）
    expect(screen.queryByText('判定失敗テスト')).not.toBeNull();
  });
});
