import { describe, it, expect } from 'vitest';
import { maskValue, type MaskCategory } from '../mask';

const ALL_ON: Record<MaskCategory, boolean> = {
  SECRET: true,
  EMAIL: true,
  JWT: true,
  IP: true,
  CREDIT_CARD: true,
  PHONE_JP: true,
};

// 陰性対照: 非機密はそのまま・counts 0。
describe('maskValue 陰性対照（非機密は不変）', () => {
  it('普通の文字列・数値・boolean はそのまま', () => {
    const { masked, counts } = maskValue(
      { name: '東京タワー', n: 333, ok: true },
      { enabled: ALL_ON }
    );
    expect(masked).toEqual({ name: '東京タワー', n: 333, ok: true });
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
  });

  it('Luhn 不通過の 16 桁は CREDIT_CARD として検出しない', () => {
    const { masked, counts } = maskValue({ x: '1234567812345678' }, { enabled: ALL_ON });
    expect(masked).toEqual({ x: '1234567812345678' });
    expect(counts.CREDIT_CARD).toBe(0);
  });

  it('octet が 255 超の数列は IP として検出しない（isValidIpv4 ガード）', () => {
    const { masked, counts } = maskValue({ x: '999.999.999.999' }, { enabled: ALL_ON });
    expect(masked).toEqual({ x: '999.999.999.999' });
    expect(counts.IP).toBe(0);
  });
});

// 陽性対照（別 describe・最重要）: 原値が出力に一切残らない。
describe('maskValue 陽性対照（機密を検出してマスク）', () => {
  it('値パターン（email/JWT/IP）をプレースホルダーに置換し原値を残さない', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-_123';
    const input = { mail: 'taro@example.com', t: jwt, host: '192.168.0.1' };
    const { masked, counts } = maskValue(input, { enabled: ALL_ON });
    const text = JSON.stringify(masked);
    expect(text).toContain('[REDACTED:EMAIL]');
    expect(text).toContain('[REDACTED:JWT]');
    expect(text).toContain('[REDACTED:IP]');
    expect(text).not.toContain('taro@example.com');
    expect(text).not.toContain(jwt);
    expect(text).not.toContain('192.168.0.1');
    expect(counts.EMAIL).toBe(1);
    expect(counts.JWT).toBe(1);
    expect(counts.IP).toBe(1);
  });

  it('キー名規則（password 等）は値全体をマスクし非文字列値も隠す', () => {
    const { masked, counts } = maskValue(
      { password: 'hunter2', api_key: 12345, nested: { client_secret: { a: 1 } } },
      { enabled: ALL_ON }
    );
    expect(masked).toEqual({
      password: '[REDACTED:SECRET]',
      api_key: '[REDACTED:SECRET]',
      nested: { client_secret: '[REDACTED:SECRET]' },
    });
    expect(JSON.stringify(masked)).not.toContain('hunter2');
    expect(counts.SECRET).toBe(3);
  });

  it('Luhn 通過のカード番号を検出する', () => {
    const { masked, counts } = maskValue({ card: '4111111111111111' }, { enabled: ALL_ON });
    expect(masked).toEqual({ card: '[REDACTED:CREDIT_CARD]' });
    expect(counts.CREDIT_CARD).toBe(1);
  });

  it('数値で格納されたカード番号もマスクする（平文残存を防ぐ・レビュー#513-🔴）', () => {
    const { masked, counts } = maskValue({ card: 4111111111111111 }, { enabled: ALL_ON });
    expect(masked).toEqual({ card: '[REDACTED:CREDIT_CARD]' });
    expect(JSON.stringify(masked)).not.toContain('4111111111111111');
    expect(counts.CREDIT_CARD).toBe(1);
  });

  it('機密でない数値は数値のまま保持する（型を変えない）', () => {
    const { masked } = maskValue({ year: 2024, count: 12345 }, { enabled: ALL_ON });
    expect(masked).toEqual({ year: 2024, count: 12345 });
  });

  it('文字列の部分一致も置換し前後を保持する', () => {
    const { masked } = maskValue({ note: '連絡は taro@example.com まで' }, { enabled: ALL_ON });
    expect(masked).toEqual({ note: '連絡は [REDACTED:EMAIL] まで' });
  });

  it('種別 off にすると素通りする（原値保持・count 0）', () => {
    const enabled = { ...ALL_ON, EMAIL: false };
    const { masked, counts } = maskValue({ mail: 'taro@example.com' }, { enabled });
    expect(masked).toEqual({ mail: 'taro@example.com' });
    expect(counts.EMAIL).toBe(0);
  });
});
