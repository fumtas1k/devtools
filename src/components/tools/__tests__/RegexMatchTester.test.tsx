// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RegexMatchTester } from '../RegexMatchTester';

afterEach(() => {
  cleanup();
});

const FIND = { timeout: 2000 } as const;

function typeTest(value: string) {
  fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value } });
}

describe('RegexMatchTester', () => {
  it('safe 判定でテスト文字列を入力するとマッチ集計と表が出る', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    expect(await screen.findByText(/2 件マッチ/, undefined, FIND)).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('g なしは1件のみ + g ヒントを表示', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    expect(await screen.findByText(/1 件マッチ/, undefined, FIND)).toBeTruthy();
    expect(screen.getByText(/g フラグを付けると/)).toBeTruthy();
  });

  it('マッチなしは「マッチしませんでした」', async () => {
    render(<RegexMatchTester pattern="z+" flags="g" redosStatus="safe" regexValid />);
    typeTest('aaa');
    expect(await screen.findByText('マッチしませんでした。', undefined, FIND)).toBeTruthy();
  });

  it('vulnerable 判定ではマッチ実行を無効化する（陽性確認）', () => {
    render(<RegexMatchTester pattern="(a+)+$" flags="" redosStatus="vulnerable" regexValid />);
    expect(screen.queryByLabelText('テスト文字列')).toBeNull();
    expect(screen.getByText(/マッチ実行を無効化/)).toBeTruthy();
  });

  it('unknown 判定では自動実行せず、ボタン押下で実行する', async () => {
    render(
      <RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="unknown" regexValid />
    );
    typeTest('a1 b2');
    expect(screen.queryByText(/件マッチ/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /マッチを実行/ }));
    expect(await screen.findByText(/2 件マッチ/, undefined, FIND)).toBeTruthy();
  });

  it('regexValid=false なら案内文のみ', () => {
    render(<RegexMatchTester pattern="(" flags="" regexValid={false} />);
    expect(screen.getByText(/有効な正規表現を入力すると/)).toBeTruthy();
    expect(screen.queryByLabelText('テスト文字列')).toBeNull();
  });

  it('複数マッチで tabIndex=0 はちょうど 1 個（roving 初期状態）', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);

    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });
    expect(marks).toHaveLength(2);
    const tabbable = marks.filter((m) => m.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(marks[0].getAttribute('tabindex')).toBe('0');
    expect(marks[1].getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight で roving が次のマッチへ移動し、末尾で先頭に wrap する', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);
    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });

    marks[0].focus();
    fireEvent.keyDown(marks[0], { key: 'ArrowRight' });
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(marks[0].getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(marks[1]);

    // 末尾で ArrowRight → 先頭へ wrap
    fireEvent.keyDown(marks[1], { key: 'ArrowRight' });
    expect(marks[0].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[0]);

    // 先頭で ArrowLeft → 末尾へ wrap
    fireEvent.keyDown(marks[0], { key: 'ArrowLeft' });
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[1]);
  });

  it('Home / End で先頭・末尾のマッチへ roving 移動する', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);
    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });

    marks[0].focus();
    fireEvent.keyDown(marks[0], { key: 'End' });
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[1]);

    fireEvent.keyDown(marks[1], { key: 'Home' });
    expect(marks[0].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[0]);
  });

  it('Enter / Space は focus 移動ではなく選択（aria-pressed 切替）を行う', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);
    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });

    expect(marks[0].getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(marks[0], { key: 'Enter' });
    expect(marks[0].getAttribute('aria-pressed')).toBe('true');

    expect(marks[1].getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(marks[1], { key: ' ' });
    expect(marks[1].getAttribute('aria-pressed')).toBe('true');
  });
});
