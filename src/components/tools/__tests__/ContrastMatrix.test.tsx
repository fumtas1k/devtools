// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { ContrastMatrixTool } from '../ContrastMatrix';

beforeAll(() => {
  CSSStyleSheet.prototype.replaceSync = function (text: string) {
    while (this.cssRules.length) this.deleteRule(0);
    text
      .split('\n')
      .filter(Boolean)
      .forEach((rule) => this.insertRule(rule, this.cssRules.length));
  };
  if (!('adoptedStyleSheets' in document)) {
    Object.defineProperty(document, 'adoptedStyleSheets', { value: [], writable: true });
  }
});

afterEach(() => {
  cleanup();
  document.adoptedStyleSheets = [];
});

describe('ContrastMatrixTool のスタイルシート', () => {
  it('色の数に比例するルールを同一シートで更新し、不正入力を CSS に含めない', () => {
    const { getAllByLabelText, getByRole, unmount } = render(<ContrastMatrixTool />);
    expect(document.adoptedStyleSheets).toHaveLength(1);
    const sheet = document.adoptedStyleSheets[0];
    expect(sheet.cssRules).toHaveLength(8);
    const input = getAllByLabelText('色', { exact: true })[0];
    fireEvent.change(input, { target: { value: 'red; } body { color: red' } });
    expect(document.adoptedStyleSheets[0]).toBe(sheet);
    expect(sheet.cssRules).toHaveLength(6);
    expect(Array.from(sheet.cssRules, (rule) => rule.cssText).join(' ')).not.toContain('body');
    fireEvent.change(input, { target: { value: '#fff' } });
    fireEvent.change(input, { target: { value: 'rgb(1, 2, 3)' } });
    expect(sheet.cssRules).toHaveLength(8);
    expect(sheet.cssRules[0].cssText).toContain('rgb(1 2 3)');
    fireEvent.click(getByRole('button', { name: '＋ 色を追加' }));
    expect(sheet.cssRules).toHaveLength(10);
    expect(document.adoptedStyleSheets).toHaveLength(1);
    for (const colorInput of getAllByLabelText('色', { exact: true })) {
      fireEvent.change(colorInput, { target: { value: 'invalid' } });
    }
    expect(sheet.cssRules).toHaveLength(0);
    fireEvent.change(input, { target: { value: '#123' } });
    expect(document.adoptedStyleSheets[0]).toBe(sheet);
    expect(sheet.cssRules).toHaveLength(2);
    unmount();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('複数インスタンスのルールと終了処理を分離する', () => {
    const first = render(<ContrastMatrixTool />);
    const second = render(<ContrastMatrixTool />);
    const [firstSheet, secondSheet] = document.adoptedStyleSheets;
    expect(document.adoptedStyleSheets).toHaveLength(2);
    expect(firstSheet.cssRules[0].cssText).not.toEqual(secondSheet.cssRules[0].cssText);
    fireEvent.change(within(first.container).getAllByLabelText('色', { exact: true })[0], {
      target: { value: '#123456' },
    });
    expect(firstSheet.cssRules[0].cssText).toContain('rgb(18 52 86)');
    expect(secondSheet.cssRules[0].cssText).not.toContain('rgb(18 52 86)');
    first.unmount();
    expect(document.adoptedStyleSheets).toEqual([secondSheet]);
    second.unmount();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });
});
