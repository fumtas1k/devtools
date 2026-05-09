import { describe, expect, it } from 'vitest';
import { assertCssLength } from '../css-length';

describe('assertCssLength', () => {
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

  it('label がエラーメッセージに含まれる', () => {
    expect(() => assertCssLength('bad', 'column[id].width')).toThrow(/column\[id\]\.width/);
  });
});
