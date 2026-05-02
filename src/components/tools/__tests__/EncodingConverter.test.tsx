// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

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
