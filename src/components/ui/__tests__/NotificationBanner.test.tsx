// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NotificationBanner } from '@/components/ui/NotificationBanner';

afterEach(() => cleanup());

describe('NotificationBanner', () => {
  it('title が描画される', () => {
    const { getByText } = render(
      <NotificationBanner title="テストタイトル">本文テキスト</NotificationBanner>
    );
    expect(getByText('テストタイトル')).toBeTruthy();
  });

  it('children (本文) が描画される', () => {
    const { getByText } = render(
      <NotificationBanner title="タイトル">本文テキスト</NotificationBanner>
    );
    expect(getByText('本文テキスト')).toBeTruthy();
  });

  it('デフォルトで role="note" が付与される', () => {
    const { getByRole } = render(<NotificationBanner title="タイトル">本文</NotificationBanner>);
    expect(getByRole('note')).toBeTruthy();
  });

  it('デフォルト (variant="warning") で notification-banner--warning クラスが付く', () => {
    const { getByRole } = render(<NotificationBanner title="タイトル">本文</NotificationBanner>);
    const el = getByRole('note');
    expect(el.className).toContain('notification-banner--warning');
  });

  it('variant="error" で notification-banner--error クラスが付く', () => {
    const { getByRole } = render(
      <NotificationBanner variant="error" title="タイトル">
        本文
      </NotificationBanner>
    );
    const el = getByRole('note');
    expect(el.className).toContain('notification-banner--error');
  });
});
