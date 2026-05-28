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

  // 陽性対照: 切り出し位置が代理対を割る場合、孤立サロゲート（U+FFFD 表示）を残さない。
  // '😀' は 2 コード単位（index 1=上位 / index 2=下位）。max=2 だと境界が😀の前半で割れる。
  // 旧実装（無条件 slice(0, max)）に当てると display 末尾が上位サロゲート単独になり fail する。
  it('陽性対照: 代理対を割る位置では孤立サロゲートを残さない', () => {
    const r = truncateAttackString('a😀b', 2); // slice(0,2) は 'a' + 😀 の前半で割れる
    expect(r.truncated).toBe(true);
    expect(r.display).toBe('a'); // 割れる😀は丸ごと除外
    // 末尾が孤立した上位サロゲートでないこと
    const last = r.display.charCodeAt(r.display.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  it('代理対が境界内に収まる場合はそのまま含める', () => {
    const r = truncateAttackString('😀b', 2); // '😀'(2) がちょうど max=2 に収まる
    expect(r.display).toBe('😀');
  });
});
