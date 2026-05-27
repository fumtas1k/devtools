import { describe, it, expect } from 'vitest';
import { analyzeRedos } from '../redos';

describe('analyzeRedos', () => {
  // 陽性対照: 既知の脆弱パターンを必ず vulnerable と判定できること
  it('陽性対照: (a+)+$ を vulnerable と判定し攻撃文字列を返す', () => {
    const r = analyzeRedos('(a+)+$', '');
    expect(r.status).toBe('vulnerable');
    expect(typeof r.attackString).toBe('string');
    expect(r.attackString!.length).toBeGreaterThan(0);
    expect(r.complexity).toBeTruthy();
  });

  // 陰性対照: 安全なパターンを safe と判定すること
  it('陰性対照: ^[a-z]+$ を safe と判定する', () => {
    const r = analyzeRedos('^[a-z]+$', '');
    expect(r.status).toBe('safe');
    expect(r.attackString).toBeUndefined();
  });

  it('vulnerable のとき hotspot を返す', () => {
    const r = analyzeRedos('(a+)+$', '');
    expect(Array.isArray(r.hotspot)).toBe(true);
  });
});
