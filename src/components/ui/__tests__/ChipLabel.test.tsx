// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ChipLabel } from '@/components/ui/ChipLabel';

afterEach(() => cleanup());

describe('ChipLabel', () => {
  it('children が描画される', () => {
    const { getByText } = render(<ChipLabel tone="error">ReDoS 危険箇所</ChipLabel>);
    expect(getByText('ReDoS 危険箇所')).toBeTruthy();
  });

  it('tone="error" で chip-label--error クラスが付く', () => {
    const { container } = render(<ChipLabel tone="error">ReDoS 危険箇所</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label--error');
  });

  it('tone="info" で chip-label--info クラスが付く', () => {
    const { container } = render(<ChipLabel tone="info">情報</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label--info');
  });

  it('tone="neutral" で chip-label--neutral クラスが付く', () => {
    const { container } = render(<ChipLabel tone="neutral">その他</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label--neutral');
  });

  it('chip-label ベースクラスが常に付く', () => {
    const { container } = render(<ChipLabel tone="error">テスト</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label');
  });

  it('旧 color prop 由来のクラスが付かない（chip-label--red / --blue / --gray の残留がない）', () => {
    const { container: e } = render(<ChipLabel tone="error">error</ChipLabel>);
    const { container: i } = render(<ChipLabel tone="info">info</ChipLabel>);
    const { container: n } = render(<ChipLabel tone="neutral">neutral</ChipLabel>);
    expect((e.firstChild as HTMLElement).className).not.toContain('chip-label--red');
    expect((i.firstChild as HTMLElement).className).not.toContain('chip-label--blue');
    expect((n.firstChild as HTMLElement).className).not.toContain('chip-label--gray');
  });

  it('任意の className が追加される', () => {
    const { container } = render(
      <ChipLabel tone="error" className="ml-2">
        テスト
      </ChipLabel>
    );
    expect((container.firstChild as HTMLElement).className).toContain('ml-2');
  });

  it('icon prop が描画される', () => {
    const { getByText } = render(
      <ChipLabel tone="error" icon={<span>icon</span>}>
        ラベル
      </ChipLabel>
    );
    expect(getByText('icon')).toBeTruthy();
    expect(getByText('ラベル')).toBeTruthy();
  });
});
