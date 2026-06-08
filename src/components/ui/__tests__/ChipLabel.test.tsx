// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ChipLabel } from '@/components/ui/ChipLabel';

afterEach(() => cleanup());

describe('ChipLabel', () => {
  it('children が描画される', () => {
    const { getByText } = render(<ChipLabel color="red">ReDoS 危険箇所</ChipLabel>);
    expect(getByText('ReDoS 危険箇所')).toBeTruthy();
  });

  it('color="red" で chip-label--red クラスが付く', () => {
    const { container } = render(<ChipLabel color="red">ReDoS 危険箇所</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label--red');
  });

  it('color="blue" で chip-label--blue クラスが付く', () => {
    const { container } = render(<ChipLabel color="blue">情報</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label--blue');
  });

  it('color="gray" で chip-label--gray クラスが付く', () => {
    const { container } = render(<ChipLabel color="gray">その他</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label--gray');
  });

  it('chip-label ベースクラスが常に付く', () => {
    const { container } = render(<ChipLabel color="red">テスト</ChipLabel>);
    expect((container.firstChild as HTMLElement).className).toContain('chip-label');
  });

  it('任意の className が追加される', () => {
    const { container } = render(
      <ChipLabel color="red" className="ml-2">
        テスト
      </ChipLabel>
    );
    expect((container.firstChild as HTMLElement).className).toContain('ml-2');
  });

  it('icon prop が描画される', () => {
    const { getByText } = render(
      <ChipLabel color="red" icon={<span>icon</span>}>
        ラベル
      </ChipLabel>
    );
    expect(getByText('icon')).toBeTruthy();
    expect(getByText('ラベル')).toBeTruthy();
  });
});
