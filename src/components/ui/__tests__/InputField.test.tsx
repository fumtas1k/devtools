// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { InputField } from '@/components/ui/InputField';

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe('InputField の onChange 契約 (#670)', () => {
  it.each([false, true])(
    'readOnly は onChange なしで描画・更新できる (multiline=%s)',
    (multiline) => {
      const { rerender } = render(
        <InputField id="f" label="ラベル" value="最初" readOnly multiline={multiline} />
      );
      const input = screen.getByLabelText('ラベル') as HTMLInputElement | HTMLTextAreaElement;
      expect(input.readOnly).toBe(true);
      expect(input.value).toBe('最初');
      expect(() => fireEvent.change(input, { target: { value: '変更' } })).not.toThrow();
      rerender(<InputField id="f" label="ラベル" value="更新後" readOnly multiline={multiline} />);
      expect(input.value).toBe('更新後');
    }
  );

  it.each([false, true])('編集時は文字列を onChange に一度渡す (multiline=%s)', (multiline) => {
    const onChange = vi.fn();
    render(<InputField id="f" label="ラベル" value="" onChange={onChange} multiline={multiline} />);
    fireEvent.change(screen.getByLabelText('ラベル'), { target: { value: '入力' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('入力');
  });

  it('readOnly と onChange の型契約', () => {
    const checkTypes = (flag: boolean) => {
      const readonly = <InputField id="f" label="ラベル" value="" readOnly />;
      const dynamicWithHandler = (
        <InputField id="f" label="ラベル" value="" readOnly={flag} onChange={noop} />
      );
      // @ts-expect-error 編集可能な欄では onChange を省略できない
      const editableWithoutHandler = <InputField id="f" label="ラベル" value="" />;
      // @ts-expect-error 動的な readOnly では onChange を省略できない
      const dynamicWithoutHandler = <InputField id="f" label="ラベル" value="" readOnly={flag} />;
      return [readonly, dynamicWithHandler, editableWithoutHandler, dynamicWithoutHandler];
    };
    expect(checkTypes(true)).toHaveLength(4);
  });
});

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
