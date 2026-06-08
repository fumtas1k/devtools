// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';

afterEach(() => cleanup());

describe('StatusBadge', () => {
  it('children が描画される', () => {
    const { getByText } = render(<StatusBadge tone="error">脆弱</StatusBadge>);
    expect(getByText('脆弱')).toBeTruthy();
  });

  it('tone="error" で status-badge--error クラスが付く', () => {
    const { container } = render(<StatusBadge tone="error">脆弱</StatusBadge>);
    expect(container.firstChild).not.toBeNull();
    expect((container.firstChild as HTMLElement).className).toContain('status-badge--error');
  });

  it('tone="success" で status-badge--success クラスが付く', () => {
    const { container } = render(<StatusBadge tone="success">安全</StatusBadge>);
    expect((container.firstChild as HTMLElement).className).toContain('status-badge--success');
  });

  it('tone="warning" で status-badge--warning クラスが付く', () => {
    const { container } = render(<StatusBadge tone="warning">判定不能</StatusBadge>);
    expect((container.firstChild as HTMLElement).className).toContain('status-badge--warning');
  });

  it('tone="info" で status-badge--info クラスが付く', () => {
    const { container } = render(<StatusBadge tone="info">情報</StatusBadge>);
    expect((container.firstChild as HTMLElement).className).toContain('status-badge--info');
  });

  it('status-badge ベースクラスが常に付く', () => {
    const { container } = render(<StatusBadge tone="error">脆弱</StatusBadge>);
    expect((container.firstChild as HTMLElement).className).toContain('status-badge');
  });

  it('任意の className が追加される', () => {
    const { container } = render(
      <StatusBadge tone="error" className="ml-2">
        脆弱
      </StatusBadge>
    );
    expect((container.firstChild as HTMLElement).className).toContain('ml-2');
  });

  it('decorative=true で aria-hidden="true" が付く', () => {
    const { container } = render(
      <StatusBadge tone="success" decorative>
        安全
      </StatusBadge>
    );
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });

  it('decorative 未指定でデフォルト false: aria-hidden が付かない', () => {
    const { container } = render(<StatusBadge tone="error">脆弱</StatusBadge>);
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBeNull();
  });

  it('decorative=false 明示でも aria-hidden が付かない', () => {
    const { container } = render(
      <StatusBadge tone="info" decorative={false}>
        情報
      </StatusBadge>
    );
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBeNull();
  });
});
