import { describe, expect, it } from 'vitest';
import { assertCssLength } from '../css-length';

describe('assertCssLength', () => {
  describe('既存単位 — 許容される値', () => {
    it.each([
      ['3.5rem', 'decimal rem'],
      ['56px', 'integer px'],
      ['100%', 'percent'],
      ['1fr', 'fr unit'],
      ['-1px', 'negative integer'],
      ['0', 'unitless zero'],
      ['10em', 'em'],
      ['50vh', 'vh'],
    ])('%s (%s) は許容される', (value) => {
      expect(() => assertCssLength(value, 'test')).not.toThrow();
    });
  });

  describe('追加単位 (viewport 系) — 許容される値', () => {
    it.each([
      ['10vmin', 'vmin'],
      ['10vmax', 'vmax'],
      ['50dvh', 'dvh'],
      ['50dvw', 'dvw'],
      ['50svh', 'svh'],
      ['50svw', 'svw'],
      ['50lvh', 'lvh'],
      ['50lvw', 'lvw'],
    ])('%s (%s) は許容される', (value) => {
      expect(() => assertCssLength(value, 'test')).not.toThrow();
    });
  });

  describe('追加単位 (物理単位) — 許容される値', () => {
    it.each([
      ['2cm', 'cm'],
      ['10mm', 'mm'],
      ['1in', 'in'],
      ['6pc', 'pc'],
    ])('%s (%s) は許容される', (value) => {
      expect(() => assertCssLength(value, 'test')).not.toThrow();
    });
  });

  describe('unitless 0 — 許容される値', () => {
    it.each([
      ['0', 'unitless 0'],
      ['-0', 'unitless -0'],
    ])('%s (%s) は許容される', (value) => {
      expect(() => assertCssLength(value, 'test')).not.toThrow();
    });
  });

  describe('unitless non-zero — throw する (silent fail 防止)', () => {
    it.each([
      ['1.5', 'unitless decimal'],
      ['2', 'unitless integer'],
      ['-3', 'unitless negative integer'],
      ['-1.5', 'unitless negative decimal'],
    ])('%s (%s) は throw する', (value) => {
      expect(() => assertCssLength(value, 'test')).toThrow(/Invalid CSS length for test/);
    });
  });

  describe('不正値 — throw する', () => {
    it.each([
      ['3.5rem; }body{display:none;', 'CSS injection attempt'],
      ['calc(100% - 2px)', 'calc 関数'],
      ['var(--foo)', 'var 関数'],
      ['', 'empty string'],
      ['3.5remm', 'invalid unit'],
      ['rem', 'unit only'],
      ['url(http://evil.com)', 'url'],
    ])('%s (%s) は throw する', (value) => {
      expect(() => assertCssLength(value, 'test')).toThrow(/Invalid CSS length for test/);
    });
  });

  it('label がエラーメッセージに含まれる', () => {
    expect(() => assertCssLength('bad', 'column[id].width')).toThrow(/column\[id\]\.width/);
  });
});
