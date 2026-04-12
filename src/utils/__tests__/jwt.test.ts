import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  base64UrlToBytes,
  parseJwt,
  formatTimestamp,
  formatRemaining,
} from '../jwt';

// HS256 で署名されたサンプルトークン（有効期限なし）
// header: {"alg":"HS256","typ":"JWT"}, payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// 有効期限付き（未来）
function makeTokenWithExp(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payload = btoa(JSON.stringify({ sub: 'test', exp }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${payload}.fakesig`;
}

// ────────────────────────────────────────────
// base64UrlToBytes
// ────────────────────────────────────────────
describe('base64UrlToBytes', () => {
  it('標準 Base64URL（パディングなし）を正しくデコードする', () => {
    // "Man" → "TWFu"
    const result = base64UrlToBytes('TWFu');
    expect(Array.from(result)).toEqual([77, 97, 110]);
  });

  it('- と _ を + と / に変換してデコードする', () => {
    // "+" → "Kw==" → Base64URL "Kw"
    const result = base64UrlToBytes('Kw');
    expect(result[0]).toBe(43); // '+'
  });

  it('パディングが不足しても補完してデコードできる', () => {
    // 1, 2, 3 バイトのケースでパディング補完が機能するか確認
    const cases: [string, number[]][] = [
      ['YQ',   [97]],        // "a"   → 1バイト
      ['YWI',  [97, 98]],    // "ab"  → 2バイト
      ['YWJj', [97, 98, 99]], // "abc" → 3バイト
    ];
    for (const [input, expected] of cases) {
      expect(Array.from(base64UrlToBytes(input))).toEqual(expected);
    }
  });
});

// ────────────────────────────────────────────
// parseJwt
// ────────────────────────────────────────────
describe('parseJwt', () => {
  it('有効なトークンを正しくパースする', () => {
    const result = parseJwt(SAMPLE_TOKEN);
    expect(result).not.toBeNull();
    expect(result!.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(result!.payload.sub).toBe('1234567890');
    expect(result!.payload.name).toBe('John Doe');
  });

  it('署名部分を rawHeader.rawPayload.signature に分割する', () => {
    const result = parseJwt(SAMPLE_TOKEN);
    expect(result!.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(result!.rawHeader).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('exp がないトークンは expStatus = "no-exp"', () => {
    const result = parseJwt(SAMPLE_TOKEN);
    expect(result!.expStatus).toBe('no-exp');
    expect(result!.remainingMs).toBeUndefined();
  });

  it('有効期限内のトークンは expStatus = "valid"', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const result = parseJwt(makeTokenWithExp(futureExp));
    expect(result!.expStatus).toBe('valid');
    expect(result!.remainingMs).toBeGreaterThan(0);
  });

  it('有効期限切れのトークンは expStatus = "expired"', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const result = parseJwt(makeTokenWithExp(pastExp));
    expect(result!.expStatus).toBe('expired');
  });

  it('3パーツに分割できない文字列は null を返す', () => {
    expect(parseJwt('invalid')).toBeNull();
    expect(parseJwt('a.b')).toBeNull();
    expect(parseJwt('')).toBeNull();
  });

  it('Base64 として不正なペイロードは null を返す', () => {
    expect(parseJwt('!!.!!.!!')).toBeNull();
  });

  it('前後の空白を無視する', () => {
    const result = parseJwt(`  ${SAMPLE_TOKEN}  `);
    expect(result).not.toBeNull();
  });
});

// ────────────────────────────────────────────
// formatTimestamp
// ────────────────────────────────────────────
describe('formatTimestamp', () => {
  it('Unix タイムスタンプを UTC 文字列に変換する', () => {
    // 1516239022 → 2018-01-18 01:30:22 UTC
    expect(formatTimestamp(1516239022)).toBe('2018-01-18 01:30:22 UTC');
  });

  it('0（Unix epoch）を正しく変換する', () => {
    expect(formatTimestamp(0)).toBe('1970-01-01 00:00:00 UTC');
  });
});

// ────────────────────────────────────────────
// formatRemaining
// ────────────────────────────────────────────
describe('formatRemaining', () => {
  it('59秒以下は「残り N秒」', () => {
    expect(formatRemaining(30_000)).toBe('残り 30秒');
    expect(formatRemaining(59_999)).toBe('残り 59秒');
  });

  it('60秒〜59分は「残り N分」', () => {
    expect(formatRemaining(60_000)).toBe('残り 1分');
    expect(formatRemaining(90_000)).toBe('残り 1分');
    expect(formatRemaining(3_599_000)).toBe('残り 59分');
  });

  it('1時間〜23時間は「残り N時間」', () => {
    expect(formatRemaining(3_600_000)).toBe('残り 1時間');
    expect(formatRemaining(23 * 3_600_000)).toBe('残り 23時間');
  });

  it('24時間以上は「残り N日」', () => {
    expect(formatRemaining(24 * 3_600_000)).toBe('残り 1日');
    expect(formatRemaining(7 * 24 * 3_600_000)).toBe('残り 7日');
  });
});
