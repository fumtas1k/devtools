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

  it('variant="secondary" を指定できる', () => {
    render(
      <ActionButton onClick={() => {}} variant="secondary">
        セカンダリ
      </ActionButton>
    );
    expect(screen.getByRole('button', { name: 'セカンダリ' })).toBeTruthy();
  });

  it('variant="secondary" は btn-action--secondary クラスを持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="secondary">
        セカンダリ
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.className).toContain('btn-action--secondary');
    expect(btn.className).toContain('btn-action');
  });

  it('variant="primary" + disabled は disabled 属性と btn-action--primary クラスを持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="primary" disabled>
        無効プライマリ
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('btn-action--primary');
    // CSS :disabled 擬似クラスで bg/border を上書き（スタイル検証は E2E/VRT に委ねる）
  });

  it('variant="secondary" + disabled は disabled 属性と btn-action--secondary クラスを持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="secondary" disabled>
        無効セカンダリ
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('btn-action--secondary');
  });

  it('variant="default" + disabled は disabled 属性と btn-action--default クラスを持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="default" disabled>
        無効デフォルト
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('btn-action--default');
  });

  it('variant="danger" + disabled は disabled 属性と btn-action--danger クラスを持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="danger" disabled>
        無効削除
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // disabled でも variant class は剥がれない（border 中立グレー化は CSS :disabled 擬似で実現、
    // class が維持されることが前提。スタイル値検証は E2E/VRT に委ねる）。issue #259
    expect(btn.className).toContain('btn-action--danger');
  });

  it('disabled 時は variant 不問で disabled 属性が付く', () => {
    render(
      <ActionButton onClick={() => {}} variant="primary" disabled>
        無効
      </ActionButton>
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('size 未指定（default）は DADS の md（min-h-12 / min-w-24 / rounded-md / text-base font-bold leading-none）', () => {
    render(<ActionButton onClick={() => {}}>標準</ActionButton>);
    const classes = (screen.getByRole('button') as HTMLButtonElement).className.split(' ');
    for (const c of [
      'min-h-12',
      'min-w-24',
      'px-4',
      'py-2',
      'rounded-md',
      'text-base',
      'font-bold',
      'leading-none',
    ]) {
      expect(classes).toContain(c);
    }
    // 14px の caption は使わない（DADS のボタン文字は 16px）
    expect(classes).not.toContain('caption');
  });

  it('size="compact" は DADS の sm（min-h-9 / min-w-20 / rounded-button-sm）', () => {
    render(
      <ActionButton onClick={() => {}} size="compact">
        コンパクト
      </ActionButton>
    );
    const classes = (screen.getByRole('button') as HTMLButtonElement).className.split(' ');
    for (const c of [
      'min-h-9',
      'min-w-20',
      'px-3',
      'rounded-button-sm',
      'text-base',
      'font-bold',
      'leading-none',
    ]) {
      expect(classes).toContain(c);
    }
    expect(classes).not.toContain('px-4');
    expect(classes).not.toContain('rounded-md');
  });

  it('variant="text" は btn-action--text クラスを持つ', () => {
    render(
      <ActionButton onClick={() => {}} variant="text">
        テキスト
      </ActionButton>
    );
    expect(screen.getByRole('button').className.split(' ')).toContain('btn-action--text');
  });
});
