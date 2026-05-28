import { describe, it, expect } from 'vitest';
import { truncateAttackString, ATTACK_STRING_DISPLAY_MAX } from '../format';

describe('truncateAttackString', () => {
  // 陰性対照: 上限以下はそのまま返し truncated=false（短い指数時間の攻撃文字列など）
  it('陰性対照: max 以下の文字列は truncate しない', () => {
    const s = 'a'.repeat(ATTACK_STRING_DISPLAY_MAX);
    const r = truncateAttackString(s);
    expect(r.display).toBe(s);
    expect(r.truncated).toBe(false);
  });

  // 陽性対照: 上限超（多項式時間の長大な pump 文字列）を必ず max 文字へ切り詰める。
  // 旧実装（全長表示・truncate なし）に当てると display.length が一致せず fail する。
  it('陽性対照: max 超の長大な文字列を max 文字へ truncate する', () => {
    const s = '0'.repeat(2000);
    const r = truncateAttackString(s);
    expect(r.truncated).toBe(true);
    expect(r.display.length).toBe(ATTACK_STRING_DISPLAY_MAX);
    expect(r.display).toBe('0'.repeat(ATTACK_STRING_DISPLAY_MAX));
  });

  it('明示 max を指定すると境界で切り替わる', () => {
    expect(truncateAttackString('abcde', 5)).toEqual({ display: 'abcde', truncated: false });
    expect(truncateAttackString('abcdef', 5)).toEqual({ display: 'abcde', truncated: true });
  });
});
