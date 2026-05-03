// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ActionButton } from '@/components/ui/ActionButton';
import { colors } from '@/utils/styles';

afterEach(() => {
  cleanup();
});

describe('ActionButton', () => {
  it('children を描画する', () => {
    render(<ActionButton onClick={() => {}}>送信</ActionButton>);
    expect(screen.getByRole('button', { name: '送信' })).toBeTruthy();
  });

  it('onClick が呼ばれる', () => {
    const handler = vi.fn();
    render(<ActionButton onClick={handler}>クリック</ActionButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disabled=true のとき disabled 属性が付く', () => {
    const handler = vi.fn();
    render(
      <ActionButton onClick={handler} disabled>
        無効
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('loading=true のとき aria-busy="true" が付与される', () => {
    render(
      <ActionButton onClick={() => {}} loading>
        生成中…
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('loading=true のとき disabled 状態になる', () => {
    render(
      <ActionButton onClick={() => {}} loading>
        処理中
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('loading=false のとき aria-busy が付与されない', () => {
    render(
      <ActionButton onClick={() => {}} loading={false}>
        通常
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBeNull();
  });

  it('variant="primary" を指定できる', () => {
    render(
      <ActionButton onClick={() => {}} variant="primary">
        プライマリ
      </ActionButton>
    );
    expect(screen.getByRole('button', { name: 'プライマリ' })).toBeTruthy();
  });

  it('variant="danger" を指定できる', () => {
    render(
      <ActionButton onClick={() => {}} variant="danger">
        削除
      </ActionButton>
    );
    expect(screen.getByRole('button', { name: '削除' })).toBeTruthy();
  });

  it('variant="default" がデフォルト', () => {
    render(<ActionButton onClick={() => {}}>デフォルト</ActionButton>);
    expect(screen.getByRole('button', { name: 'デフォルト' })).toBeTruthy();
  });

  it('variant="secondary" を指定できる', () => {
    render(
      <ActionButton onClick={() => {}} variant="secondary">
        セカンダリ
      </ActionButton>
    );
    expect(screen.getByRole('button', { name: 'セカンダリ' })).toBeTruthy();
  });

  it('variant="secondary" は背景透過・primary 色のボーダーと文字色を持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="secondary">
        セカンダリ
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.color).toBe(colors.primary);
    // jsdom は border shorthand を borderColor に分解しないため、shorthand 全体を比較する
    expect(btn.style.border).toBe(`1px solid ${colors.primary}`);
  });

  it('variant="primary" + disabled は bg-subtle 塗り・border 不可視', () => {
    render(
      <ActionButton onClick={() => {}} variant="primary" disabled>
        無効プライマリ
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    // jsdom は background shorthand に var(...) を含む値を backgroundColor へ分解しないため shorthand を直接比較
    expect(btn.style.background).toBe(colors.bgSubtle);
    // disabled primary は border を bg と同色にして不可視化（旧 DownloadButton primary の border:none 相当）
    expect(btn.style.border).toBe(`1px solid ${colors.bgSubtle}`);
  });

  it('variant="secondary" + disabled は背景透過・グレーボーダーを維持', () => {
    render(
      <ActionButton onClick={() => {}} variant="secondary" disabled>
        無効セカンダリ
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.border).toBe(`1px solid ${colors.border}`);
  });

  it('variant="default" + disabled は既存 (bg-subtle / border-input) を維持', () => {
    render(
      <ActionButton onClick={() => {}} variant="default" disabled>
        無効デフォルト
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    // jsdom は background shorthand に var(...) を含む値を backgroundColor へ分解しないため shorthand を直接比較
    expect(btn.style.background).toBe(colors.bgSubtle);
    expect(btn.style.border).toBe(`1px solid ${colors.borderInput}`);
  });

  it('disabled 時は variant 不問で文字色が muted', () => {
    render(
      <ActionButton onClick={() => {}} variant="primary" disabled>
        無効
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.style.color).toBe(colors.muted);
  });
});
