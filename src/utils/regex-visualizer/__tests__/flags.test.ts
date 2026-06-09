import { describe, it, expect } from 'vitest';
import { stripUnsupportedFlags } from '../flags';

describe('stripUnsupportedFlags', () => {
  // 陽性対照: d が除去されることを確認（ヘルパーが d を除去しないと fail する）
  it('陽性対照: d フラグを除去する', () => {
    expect(stripUnsupportedFlags('d')).toBe('');
  });

  it('陽性対照: gid など複合フラグから d のみ除去する', () => {
    expect(stripUnsupportedFlags('gid')).toBe('gi');
  });

  // 陰性対照: d 以外のフラグは保持されること
  it('d を含まないフラグはそのまま返す', () => {
    expect(stripUnsupportedFlags('gimsuy')).toBe('gimsuy');
  });

  it('空文字列はそのまま空文字列を返す', () => {
    expect(stripUnsupportedFlags('')).toBe('');
  });
});
