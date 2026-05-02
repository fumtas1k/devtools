// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ActionButton } from '@/components/ui/ActionButton';

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
});
