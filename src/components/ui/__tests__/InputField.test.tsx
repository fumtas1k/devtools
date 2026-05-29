// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InputField } from '@/components/ui/InputField';

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe('InputField error/hint 表示契約 (#510)', () => {
  it('error と hint が同時指定なら両方描画する（併存）', () => {
    render(
      <InputField
        id="f"
        label="ラベル"
        value="x"
        onChange={noop}
        error="不正です"
        hint="ヒント文"
      />
    );
    // 旧実装（排他）では error 時に hint が描画されず、この行で fail する（陽性対照）。
    expect(screen.getByText('ヒント文')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('不正です');
  });

  it('error の id が aria-describedby に含まれ、その要素が実在する（dangling 参照なし）', () => {
    render(
      <InputField
        id="f"
        label="ラベル"
        value="x"
        onChange={noop}
        error="不正です"
        hint="ヒント文"
      />
    );
    const input = screen.getByLabelText('ラベル');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids).toContain('f-error');
    expect(ids).toContain('f-hint');
    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('hint のみ指定なら hint だけ・error なし', () => {
    render(<InputField id="f" label="ラベル" value="x" onChange={noop} hint="ヒント文" />);
    expect(screen.getByText('ヒント文')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('error のみ指定なら error だけ表示する', () => {
    render(<InputField id="f" label="ラベル" value="x" onChange={noop} error="不正です" />);
    expect(screen.getByRole('alert').textContent).toContain('不正です');
  });
});
