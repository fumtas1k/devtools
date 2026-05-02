// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { Section } from '@/components/ui/Section';

afterEach(() => {
  cleanup();
});

describe('Section', () => {
  it('children を描画する', () => {
    render(
      <Section>
        <p>コンテンツ</p>
      </Section>
    );
    expect(screen.getByText('コンテンツ')).toBeTruthy();
  });

  it('title を指定するとヘッダーに表示される', () => {
    render(
      <Section title="テストセクション">
        <p>本文</p>
      </Section>
    );
    expect(screen.getByText('テストセクション')).toBeTruthy();
    expect(screen.getByText('本文')).toBeTruthy();
  });

  it('headerSlot を指定すると右側に表示される', () => {
    render(
      <Section title="タイトル" headerSlot={<button type="button">アクション</button>}>
        <p>本文</p>
      </Section>
    );
    expect(screen.getByText('タイトル')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'アクション' })).toBeTruthy();
  });

  it('title も headerSlot も省略するとヘッダー要素を描画しない', () => {
    const { container } = render(
      <Section>
        <p>コンテンツのみ</p>
      </Section>
    );
    // ヘッダーに使われる bgSubtle スタイルを持つ div は存在しない
    const headerDivs = Array.from(container.querySelectorAll('div')).filter((el) =>
      (el as HTMLElement).style.background.includes('var(--color-bg-subtle)')
    );
    expect(headerDivs).toHaveLength(0);
  });

  it('title のみ指定した場合は flex レイアウトにならない（headerSlot なし）', () => {
    const { container } = render(
      <Section title="見出し">
        <span>body</span>
      </Section>
    );
    const allDivs = container.querySelectorAll('div');
    // headerSlot がないとき display: flex の指定がない
    const flexDivs = Array.from(allDivs).filter(
      (el) => (el as HTMLElement).style.display === 'flex'
    );
    expect(flexDivs).toHaveLength(0);
  });
});
