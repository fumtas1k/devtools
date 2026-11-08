// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { RegexVisualizer } from '../RegexVisualizer';
import { mockRegexWorker, requests } from './regexWorkerMock';

beforeEach(mockRegexWorker);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// 解析ユーティリティ（regexp-tree / recheck）は client mount 後に動的 import されるため、
// fake timers ではなく実時間 + 非同期 findBy* で「動的 import 完了 → debounce(300ms) → 解析反映」
// を待つ（timeout は余裕を持たせる）。
const FIND = { timeout: 3000 } as const;

function setPattern(value: string) {
  fireEvent.change(screen.getByLabelText('正規表現'), { target: { value } });
}

describe('RegexVisualizer', () => {
  it('旧 safe 判定で変更後の脆弱パターンを実行しない', async () => {
    render(<RegexVisualizer />);
    setPattern('a+');
    await screen.findAllByText(/安全/, undefined, FIND);
    fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value: 'aaaa!' } });
    await screen.findByText(/1 件マッチ/, undefined, FIND);
    requests.length = 0;

    vi.useFakeTimers();
    setPattern('(a+)+$');
    act(() => vi.advanceTimersByTime(300));
    expect(requests).toHaveLength(0);
    expect(screen.getByText(/マッチ実行を無効化/)).toBeTruthy();
  });

  it('フラグ変更と連続編集の間は旧結果を隠し、最新の safe 判定後に実行する', async () => {
    render(<RegexVisualizer />);
    setPattern('a+');
    await screen.findAllByText(/安全/, undefined, FIND);
    fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value: 'aa bb' } });
    await screen.findByText(/1 件マッチ/, undefined, FIND);
    requests.length = 0;

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'g: 全マッチ' }));
    expect(screen.queryByText(/1 件マッチ/)).toBeNull();
    setPattern('b');
    act(() => vi.advanceTimersByTime(200));
    setPattern('b+');
    act(() => vi.advanceTimersByTime(300));
    expect(requests).toHaveLength(0);
    act(() => vi.advanceTimersByTime(300));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      pattern: 'b+',
      flags: 'g',
      text: 'aa bb',
      maxLength: undefined,
    });
    expect(screen.getByText(/1 件マッチ/)).toBeTruthy();
  });

  it('解析前に入力を消すか不正にすると予約済みマッチを実行しない', async () => {
    render(<RegexVisualizer />);
    setPattern('a+');
    await screen.findAllByText(/安全/, undefined, FIND);
    fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value: 'aaa' } });
    vi.useFakeTimers();
    setPattern('(');
    act(() => vi.advanceTimersByTime(300));
    expect(requests).toHaveLength(0);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    setPattern('');
    act(() => vi.advanceTimersByTime(600));
    expect(requests).toHaveLength(0);
  });

  it('有効な正規表現を入力すると AST ラベルが表示される', async () => {
    render(<RegexVisualizer />);
    setPattern('a+');
    expect(await screen.findByText(/1 回以上の繰り返し/, undefined, FIND)).toBeTruthy();
  });

  it('不正な正規表現でエラーを表示する', async () => {
    render(<RegexVisualizer />);
    setPattern('(');
    const alerts = await screen.findAllByRole('alert', undefined, FIND);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('脆弱な正規表現で危険判定を表示する', async () => {
    render(<RegexVisualizer />);
    setPattern('(a+)+$');
    // StatusBadge（「脆弱」）と NotificationBanner title（「脆弱：ReDoS…」）の両方が表示される
    const els = await screen.findAllByText(/脆弱/, undefined, FIND);
    expect(els.length).toBeGreaterThan(0);
  });

  it('安全な正規表現で安全判定を表示する', async () => {
    render(<RegexVisualizer />);
    setPattern('^[a-z]+$');
    // StatusBadge（「安全」）と NotificationBanner title（「安全：ReDoS…」）の両方が表示される
    const els = await screen.findAllByText(/安全/, undefined, FIND);
    expect(els.length).toBeGreaterThan(0);
  });

  it('鉄道図タブに切り替えると SVG が表示される', async () => {
    render(<RegexVisualizer />);
    setPattern('abc');
    // まず構造ツリーに結果が出るのを待つ（動的 import + debounce 完了の目印）
    await screen.findByText(/連結|文字 "a"/, undefined, FIND);
    fireEvent.click(screen.getByRole('button', { name: '鉄道図' }));
    const svg = await screen.findByRole('img', { name: '正規表現の鉄道図' }, FIND);
    expect(svg).toBeTruthy();
  });

  it('鉄道図タブで脆弱パターンの hotspot が強調される', async () => {
    render(<RegexVisualizer />);
    setPattern('(a+)+$');
    // StatusBadge + NotificationBanner title の両方にマッチするので findAllByText で待機
    await screen.findAllByText(/脆弱/, undefined, FIND);
    fireEvent.click(screen.getByRole('button', { name: '鉄道図' }));
    const svg = await screen.findByRole('img', { name: '正規表現の鉄道図' }, FIND);
    expect(svg.querySelector('.rr-box-hot')).toBeTruthy();
  });

  it('安全な正規表現でテスト文字列を入力するとマッチが集計される', async () => {
    render(<RegexVisualizer />);
    setPattern('\\d+');
    // safe 判定の確定を待つ（StatusBadge + title の両方にマッチするので findAllByText）
    await screen.findAllByText(/安全/, undefined, FIND);
    fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value: 'a1 b2' } });
    expect(await screen.findByText(/件マッチ/, undefined, FIND)).toBeTruthy();
  });

  it('脆弱な正規表現ではマッチ実行が無効化される', async () => {
    render(<RegexVisualizer />);
    setPattern('(a+)+$');
    // StatusBadge + NotificationBanner title の両方にマッチするので findAllByText で待機
    await screen.findAllByText(/脆弱/, undefined, FIND);
    expect(await screen.findByText(/マッチ実行を無効化/, undefined, FIND)).toBeTruthy();
  });
});
