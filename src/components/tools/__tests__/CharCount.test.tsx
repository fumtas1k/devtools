// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent, screen, within } from '@testing-library/react';

vi.mock('@/utils/char-count', async () => {
  const actual = await vi.importActual<typeof import('@/utils/char-count')>('@/utils/char-count');
  return { ...actual, count: vi.fn(actual.count) };
});

import { CharCountTool } from '@/components/tools/CharCount';
import { count } from '@/utils/char-count';
import type { CharCountWorkerRequest, CharCountWorkerResponse } from '@/workers/charCount.types';

const { count: realCount } =
  await vi.importActual<typeof import('@/utils/char-count')>('@/utils/char-count');
class FakeWorker {
  static instances: FakeWorker[] = [];
  static autoComplete = true;
  onmessage: ((event: MessageEvent<CharCountWorkerResponse>) => void) | null = null;
  onerror = null;
  onmessageerror = null;
  postMessage = vi.fn((request: CharCountWorkerRequest) => {
    if (FakeWorker.autoComplete) this.complete(request);
  });
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  complete(request = this.postMessage.mock.calls[0][0]) {
    this.onmessage?.({
      data: { type: 'result', requestId: request.requestId, result: realCount(request.text) },
    } as MessageEvent<CharCountWorkerResponse>);
  }
}

const DEBOUNCE_MS = 100;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(count).mockClear();
  FakeWorker.instances = [];
  FakeWorker.autoComplete = true;
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CharCountTool — 基本レイアウト', () => {
  it('入力テキスト textarea が表示される', () => {
    render(<CharCountTool />);
    expect(screen.getByLabelText('入力テキスト')).toBeTruthy();
  });

  it('5 セクションのタイトルが表示される', () => {
    render(<CharCountTool />);
    expect(screen.getByText('文字数')).toBeTruthy();
    expect(screen.getByText('エンコーディング互換性')).toBeTruthy();
    expect(screen.getByText('行')).toBeTruthy();
    expect(screen.getByText('SNS')).toBeTruthy();
    expect(screen.getByText('原稿')).toBeTruthy();
  });

  it('クリアボタンが表示される', () => {
    render(<CharCountTool />);
    expect(screen.getByRole('button', { name: 'クリア' })).toBeTruthy();
  });
});

describe('CharCountTool — debounce', () => {
  it('入力後 100ms 経過前は count() が呼ばれない', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'abc' } });
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(FakeWorker.instances).toHaveLength(0);
    expect(count).not.toHaveBeenCalled();
  });

  it('入力後 100ms 経過後に count() が呼ばれる', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'abc' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'count', text: 'abc' })
    );
    expect(count).not.toHaveBeenCalled();
  });
});

describe('CharCountTool — 結果表示', () => {
  it('"あいう" 入力後に書記素 3 が表示される', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'あいう' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    // 書記素・codePoints 等複数セルが "3" になるため getAllByText を使用
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('"😀" 入力後に utf8mb3 が ❌ と表示される (DB 互換性 core value)', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: '😀' } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    // utf8mb3 行が不可表示 (sr-only「不可」テキスト + " 不可: N 文字" フォーマット)
    const notOkElements = screen.queryAllByText(/不可/);
    expect(notOkElements.length).toBeGreaterThan(0);
  });

  it('クリアボタンでテキストが消える', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'hello' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    });
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });
});

describe('CharCountTool — 非同期集計', () => {
  it('処理中は前回結果や互換性表示を隠し、完了後に新しい結果を表示する', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト');
    fireEvent.change(textarea, { target: { value: 'abcdefghijk' } });
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(screen.getAllByText('11').length).toBeGreaterThan(0);
    FakeWorker.autoComplete = false;
    fireEvent.change(textarea, { target: { value: 'あいう' } });
    expect(screen.queryByText('11')).toBeNull();
    expect(screen.getByText(/集計中/)).toBeTruthy();
    expect(screen.queryByText('対応')).toBeNull();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    act(() => FakeWorker.instances[1].complete());
    expect(screen.queryByText(/集計中/)).toBeNull();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('worker エラーでは集計中を終了し、古い値や互換性を表示しない', () => {
    FakeWorker.autoComplete = false;
    render(<CharCountTool />);
    fireEvent.change(screen.getByLabelText('入力テキスト'), { target: { value: 'abc' } });
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    const worker = FakeWorker.instances[0];
    const request = worker.postMessage.mock.calls[0][0];
    act(() =>
      worker.onmessage?.({
        data: { type: 'error', requestId: request.requestId, message: 'failed' },
      } as MessageEvent<CharCountWorkerResponse>)
    );
    expect(screen.queryByText(/集計中/)).toBeNull();
    expect(screen.getByText(/文字数の集計に失敗しました/)).toBeTruthy();
    expect(screen.queryAllByText('対応')).toHaveLength(0);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('100万文字超でも main thread の count を呼ばず処理中になる（旧実装では失敗）', () => {
    FakeWorker.autoComplete = false;
    render(<CharCountTool />);
    fireEvent.change(screen.getByLabelText('入力テキスト'), {
      target: { value: 'a'.repeat(1_000_001) },
    });
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(screen.getByText(/集計中/)).toBeTruthy();
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledOnce();
    expect(count).not.toHaveBeenCalled();
  });
});

describe('CharCountTool — SNS 任意上限', () => {
  it('任意上限入力欄がデフォルト 280 で表示される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const limitInput = screen.getByLabelText('任意上限', { selector: 'input' }) as HTMLInputElement;
    expect(limitInput.value).toBe('280');
  });

  it('上限を 100 に変更すると入力欄に反映され、文字数が任意上限行に表示される', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'hello' } }); // 書記素 5
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const limitInput = screen.getByLabelText('任意上限', { selector: 'input' }) as HTMLInputElement;
    act(() => {
      fireEvent.change(limitInput, { target: { value: '100' } });
    });
    expect(limitInput.value).toBe('100');
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledOnce();
    // 「残り」表示は廃止 (Twitter/Bluesky と同じく count / limit のみ)
    // 任意上限行の count 部分に 5 が表示される (他セルにも 5 はあり得るので getAllByText)
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });

  // 陽性対照: handleSnsLimitChange バリデータが不正入力を reject することの検証。
  // 旧実装で validator を削除すると「0」や「abc」が setState され下記 assert が fail する。
  describe('handleSnsLimitChange — バリデータ陽性対照', () => {
    it('「0」を入力してもデフォルト値 280 のまま (先頭ゼロ不可)', () => {
      render(<CharCountTool />);
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });
      const limitInput = screen.getByLabelText('任意上限', {
        selector: 'input',
      }) as HTMLInputElement;
      act(() => {
        fireEvent.change(limitInput, { target: { value: '0' } });
      });
      // 0 は先頭ゼロ / ゼロ値のため validator が reject → 直前値 280 を保持
      expect(limitInput.value).toBe('280');
    });

    it('「-1」を入力してもデフォルト値 280 のまま (負数 reject)', () => {
      render(<CharCountTool />);
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });
      const limitInput = screen.getByLabelText('任意上限', {
        selector: 'input',
      }) as HTMLInputElement;
      act(() => {
        // type="number" input でも fireEvent は文字列 '-1' を onChange に渡す
        fireEvent.change(limitInput, { target: { value: '-1' } });
      });
      // 負数は /^[1-9]\d*$/ に不一致で reject → 直前値 280 を保持
      expect(limitInput.value).toBe('280');
    });

    it('「01」を入力してもデフォルト値 280 のまま (先頭ゼロ付き整数 reject)', () => {
      render(<CharCountTool />);
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });
      const limitInput = screen.getByLabelText('任意上限', {
        selector: 'input',
      }) as HTMLInputElement;
      act(() => {
        fireEvent.change(limitInput, { target: { value: '01' } });
      });
      // 先頭ゼロ付きは reject → 直前値 280 を保持
      expect(limitInput.value).toBe('280');
    });
  });
});

describe('CharCountTool — SNS カード', () => {
  it('SNS カード 3 枚 (X / Bluesky / 任意上限) が描画される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(screen.getByText('X (旧 Twitter)')).toBeTruthy();
    expect(screen.getByText('Bluesky')).toBeTruthy();
    expect(screen.getByText('任意上限')).toBeTruthy();
  });

  it('各カードに progressbar role が描画される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBe(3);
  });

  it('X カードの aria-valuemax は 280', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const xArticle = screen.getByText('X (旧 Twitter)').closest('article')!;
    const blueskyArticle = screen.getByText('Bluesky').closest('article')!;
    const customArticle = screen.getByText('任意上限').closest('article')!;
    expect(within(xArticle).getByRole('progressbar').getAttribute('aria-valuemax')).toBe('280');
    expect(within(blueskyArticle).getByRole('progressbar').getAttribute('aria-valuemax')).toBe(
      '300'
    );
    expect(within(customArticle).getByRole('progressbar').getAttribute('aria-valuemax')).toBe(
      '280'
    );
  });

  it('上限超過時: aria-valuenow が max で clamp される', () => {
    render(<CharCountTool />);
    const textarea = screen.getByLabelText('入力テキスト') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: 'a'.repeat(281) } });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const xArticle = screen.getByText('X (旧 Twitter)').closest('article')!;
    const customArticle = screen.getByText('任意上限').closest('article')!;
    expect(within(xArticle).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('280');
    expect(within(customArticle).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '280'
    );
  });

  it('カード caption に計算方法説明が表示される', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(screen.getByText(/URL を 23 字、CJK は 2 字換算/)).toBeTruthy();
    expect(screen.getByText(/絵文字や合字も 1 文字/)).toBeTruthy();
    expect(screen.getByText(/書記素クラスタ単位/)).toBeTruthy();
  });

  it('「概算」ラベルは X カードから消えている', () => {
    render(<CharCountTool />);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    // X カードの article 要素内に「概算」テキストが存在しないことを確認
    // (原稿セクションの「推定読了時間（概算）」は別セクションのため対象外)
    const xCard = screen.getByText('X (旧 Twitter)').closest('article');
    expect(xCard).not.toBeNull();
    expect(xCard!.textContent).not.toMatch(/概算/);
  });
});
