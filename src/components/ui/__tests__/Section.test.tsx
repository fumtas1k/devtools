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

  it('title は heading role として描画される（a11y / E2E getByRole 用）', () => {
    render(
      <Section title="鍵ペア">
        <p>本文</p>
      </Section>
    );
    expect(screen.getByRole('heading', { name: '鍵ペア' })).toBeTruthy();
  });

  it('headingLevel を省略すると aria-level が default の 3 になる（旧 h3 との後方互換）', () => {
    render(
      <Section title="デフォルト見出し">
        <p>本文</p>
      </Section>
    );
    expect(screen.getByRole('heading', { name: 'デフォルト見出し', level: 3 })).toBeTruthy();
  });

  it('headingLevel={2} を指定すると aria-level が 2 になる', () => {
    render(
      <Section title="レベル2見出し" headingLevel={2}>
        <p>本文</p>
      </Section>
    );
    expect(screen.getByRole('heading', { name: 'レベル2見出し', level: 2 })).toBeTruthy();
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
    // ヘッダーに使われる bg-subtle クラスを持つ div は存在しない
    const headerDivs = Array.from(container.querySelectorAll('div')).filter((el) =>
      (el as HTMLElement).className.includes('bg-subtle')
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
    // headerSlot がないとき flex クラスの指定がない
    const flexDivs = Array.from(allDivs).filter((el) =>
      (el as HTMLElement).className.split(' ').includes('flex')
    );
    expect(flexDivs).toHaveLength(0);
  });
});
