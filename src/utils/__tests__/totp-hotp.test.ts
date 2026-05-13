import { describe, it, expect } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRandomBase32Secret,
  hotp,
  totp,
  verifyTotp,
  buildOtpauthUri,
} from '@/utils/totp-hotp';

// RFC 4226 / 6238 テストベクタ用 secret（ASCII バイト列）
const RFC_SECRET_SHA1 = new TextEncoder().encode('12345678901234567890');
const RFC_SECRET_SHA256 = new TextEncoder().encode('12345678901234567890123456789012');
const RFC_SECRET_SHA512 = new TextEncoder().encode(
  '1234567890123456789012345678901234567890123456789012345678901234'
);

// ─── base32Decode / base32Encode ───────────────────────────────────────────

describe('base32Decode - 正常系', () => {
  it('空文字列を空の Uint8Array にデコードする', () => {
    expect(base32Decode('')).toEqual(new Uint8Array([]));
  });

  it('大文字・小文字を区別しない', () => {
    expect(base32Decode('ME======')).toEqual(base32Decode('me======'));
  });

  it('パディングあり・なし両方を受け付ける', () => {
    // 'a' (0x61) の Base32 は "ME======"
    expect(base32Decode('ME======')).toEqual(new Uint8Array([0x61]));
    expect(base32Decode('ME')).toEqual(new Uint8Array([0x61]));
  });

  it('0x00 → "AA======", 0xff → "74======"', () => {
    expect(base32Decode('AA======')).toEqual(new Uint8Array([0x00]));
    expect(base32Decode('74======')).toEqual(new Uint8Array([0xff]));
  });
});

// 陽性対照: バリデータが実際に不正入力を検知して throw することを確認
describe('base32Decode - 不正入力バリデーション（陽性対照）', () => {
  it('数字 "1" (Base32 アルファベット外) で throw する', () => {
    expect(() => base32Decode('ME1')).toThrow();
  });

  it('記号 "!" で throw する', () => {
    expect(() => base32Decode('MEOW!')).toThrow();
  });

  // RFC 4648 §6 で許容される padding 除去後の長さは 0/2/4/5/7 (mod 8) のみ。
  // それ以外は末尾 bit を黙って捨てると user 側で「コードが一致しない原因」を
  // 特定しづらいため明示的に throw する。
  it.each([
    ['1 文字', 'A'],
    ['3 文字', 'AAA'],
    ['6 文字', 'AAAAAA'],
  ])('Base32 長さが無効 (%s) で throw する', (_label, input) => {
    expect(() => base32Decode(input)).toThrow();
  });
});

describe('base32Encode', () => {
  it('空の Uint8Array を空文字列にエンコードする', () => {
    expect(base32Encode(new Uint8Array([]))).toBe('');
  });

  it('0x61 ("a") を "ME======" にエンコードする', () => {
    expect(base32Encode(new Uint8Array([0x61]))).toBe('ME======');
  });

  it('0x00 を "AA======" にエンコードする', () => {
    expect(base32Encode(new Uint8Array([0x00]))).toBe('AA======');
  });

  it('0xff を "74======" にエンコードする', () => {
    expect(base32Encode(new Uint8Array([0xff]))).toBe('74======');
  });
});

describe('generateRandomBase32Secret', () => {
  it('Base32 アルファベットのみで構成される 32 文字を返す（160 bit secret）', () => {
    const secret = generateRandomBase32Secret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('返り値は base32Decode で 20 byte に decode できる', () => {
    const secret = generateRandomBase32Secret();
    const decoded = base32Decode(secret);
    expect(decoded.length).toBe(20);
  });
});

// 陽性対照: CSPRNG が固定値を返すような silent regression を検知する。
// 旧実装で `crypto.getRandomValues` を `new Uint8Array(20)` で初期化したまま
// 渡し忘れた場合、常に全 0 (= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") が返るため
// 連続呼び出しで同一値が出る → 本テストが fail に昇格する。
describe('generateRandomBase32Secret - 固定値返却の silent regression 検知（陽性対照）', () => {
  it('連続呼び出しで異なる secret を生成する', () => {
    const a = generateRandomBase32Secret();
    const b = generateRandomBase32Secret();
    const c = generateRandomBase32Secret();
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });
});

describe('base32 往復変換', () => {
  it('任意バイト列を Encode→Decode で往復できる', () => {
    const bytes = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('全 0 バイト列を往復できる', () => {
    const bytes = new Uint8Array(10);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });
});

// ─── hotp – RFC 4226 Appendix D テストベクタ ─────────────────────────────

describe('hotp - RFC 4226 Appendix D テストベクタ (SHA-1, 6桁)', () => {
  const vectors: [bigint, string][] = [
    [0n, '755224'],
    [1n, '287082'],
    [2n, '359152'],
    [3n, '969429'],
    [4n, '338314'],
    [5n, '254676'],
    [6n, '287922'],
    [7n, '162583'],
    [8n, '399871'],
    [9n, '520489'],
  ];

  it.each(vectors)('counter=%i → %s', async (counter, expected) => {
    const code = await hotp(RFC_SECRET_SHA1, counter, { algorithm: 'SHA-1', digits: 6 });
    expect(code).toBe(expected);
  });

  it('ゼロ埋めを含む場合に桁数を保持する', async () => {
    // コードが先頭 0 を持つ場合でも digits 桁にゼロ埋めされること
    // counter=1 の結果 "287082" は 6 桁 ✓
    const code = await hotp(RFC_SECRET_SHA1, 1n, { algorithm: 'SHA-1', digits: 6 });
    expect(code).toHaveLength(6);
  });
});

// ─── totp – RFC 6238 Appendix B テストベクタ (digits=8) ──────────────────

describe('totp - RFC 6238 Appendix B SHA-1 (digits=8)', () => {
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('T=%i → %s', async (tSec, expected) => {
    const code = await totp(RFC_SECRET_SHA1, {
      algorithm: 'SHA-1',
      digits: 8,
      period: 30,
      timestamp: tSec * 1000,
    });
    expect(code).toBe(expected);
  });
});

describe('totp - RFC 6238 Appendix B SHA-256 (digits=8)', () => {
  const vectors: [number, string][] = [
    [59, '46119246'],
    [1111111109, '68084774'],
    [1111111111, '67062674'],
    [1234567890, '91819424'],
    [2000000000, '90698825'],
    [20000000000, '77737706'],
  ];

  it.each(vectors)('T=%i → %s', async (tSec, expected) => {
    const code = await totp(RFC_SECRET_SHA256, {
      algorithm: 'SHA-256',
      digits: 8,
      period: 30,
      timestamp: tSec * 1000,
    });
    expect(code).toBe(expected);
  });
});

describe('totp - RFC 6238 Appendix B SHA-512 (digits=8)', () => {
  const vectors: [number, string][] = [
    [59, '90693936'],
    [1111111109, '25091201'],
    [1111111111, '99943326'],
    [1234567890, '93441116'],
    [2000000000, '38618901'],
    [20000000000, '47863826'],
  ];

  it.each(vectors)('T=%i → %s', async (tSec, expected) => {
    const code = await totp(RFC_SECRET_SHA512, {
      algorithm: 'SHA-512',
      digits: 8,
      period: 30,
      timestamp: tSec * 1000,
    });
    expect(code).toBe(expected);
  });
});

describe('totp - 60秒周期対応', () => {
  it('period=60 で同じ期間内のコードは同じになる', async () => {
    const code1 = await totp(RFC_SECRET_SHA1, {
      algorithm: 'SHA-1',
      digits: 6,
      period: 60,
      timestamp: 1234567800 * 1000,
    });
    const code2 = await totp(RFC_SECRET_SHA1, {
      algorithm: 'SHA-1',
      digits: 6,
      period: 60,
      timestamp: 1234567859 * 1000, // 同じ 60 秒期間内
    });
    expect(code1).toBe(code2);
  });

  it('period=60 で異なる期間のコードは通常異なる', async () => {
    const code1 = await totp(RFC_SECRET_SHA1, {
      algorithm: 'SHA-1',
      digits: 6,
      period: 60,
      timestamp: 1234567800 * 1000,
    });
    const code2 = await totp(RFC_SECRET_SHA1, {
      algorithm: 'SHA-1',
      digits: 6,
      period: 60,
      timestamp: 1234567860 * 1000, // 次の期間
    });
    // 統計的に一致する確率は 1/1000000 → テストで無視できる
    expect(code1).not.toBe(code2);
  });
});

// ─── verifyTotp ──────────────────────────────────────────────────────────

describe('verifyTotp', () => {
  const opts = { algorithm: 'SHA-1' as const, digits: 8 as const, period: 30 as const };
  const tNow = 1234567890 * 1000; // period counter = 41152263

  it('現在期間のコードを valid と判定する (offset=0)', async () => {
    const code = await totp(RFC_SECRET_SHA1, { ...opts, timestamp: tNow });
    const result = await verifyTotp(code, RFC_SECRET_SHA1, { ...opts, timestamp: tNow });
    expect(result).toEqual({ valid: true, offset: 0 });
  });

  it('前の期間のコードを window=1 で valid と判定する (offset=-1)', async () => {
    const tPrev = (1234567890 - 30) * 1000; // period counter = 41152262
    const code = await totp(RFC_SECRET_SHA1, { ...opts, timestamp: tPrev });
    const result = await verifyTotp(code, RFC_SECRET_SHA1, { ...opts, timestamp: tNow, window: 1 });
    expect(result).toEqual({ valid: true, offset: -1 });
  });

  it('次の期間のコードを window=1 で valid と判定する (offset=+1)', async () => {
    const tNext = (1234567890 + 30) * 1000; // period counter = 41152264
    const code = await totp(RFC_SECRET_SHA1, { ...opts, timestamp: tNext });
    const result = await verifyTotp(code, RFC_SECRET_SHA1, { ...opts, timestamp: tNow, window: 1 });
    expect(result).toEqual({ valid: true, offset: 1 });
  });

  it('window 外のコードは invalid を返す (offset=null)', async () => {
    // 3 periods 前 → window=1 では範囲外
    const tOld = (1234567890 - 90) * 1000;
    const code = await totp(RFC_SECRET_SHA1, { ...opts, timestamp: tOld });
    const result = await verifyTotp(code, RFC_SECRET_SHA1, { ...opts, timestamp: tNow, window: 1 });
    expect(result).toEqual({ valid: false, offset: null });
  });

  it('全く異なるコードは invalid を返す', async () => {
    // 89005924 が正解なので 00000000 は invalid (確率 1/10^8)
    const result = await verifyTotp('00000000', RFC_SECRET_SHA1, {
      ...opts,
      timestamp: tNow,
      window: 1,
    });
    expect(result).toEqual({ valid: false, offset: null });
  });

  it('window=0 では現在期間のコードのみ valid', async () => {
    const tPrev = (1234567890 - 30) * 1000;
    const codePrev = await totp(RFC_SECRET_SHA1, { ...opts, timestamp: tPrev });
    const result = await verifyTotp(codePrev, RFC_SECRET_SHA1, {
      ...opts,
      timestamp: tNow,
      window: 0,
    });
    expect(result).toEqual({ valid: false, offset: null });
  });
});

// ─── buildOtpauthUri ──────────────────────────────────────────────────────

describe('buildOtpauthUri', () => {
  it('TOTP URI を生成する（完全形）', () => {
    const uri = buildOtpauthUri({
      type: 'totp',
      issuer: 'Example',
      account: 'user@example.com',
      secretBase32: 'JBSWY3DPEB3W64TMMQ',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });
    expect(uri).toBe(
      'otpauth://totp/Example%3Auser%40example.com?secret=JBSWY3DPEB3W64TMMQ&issuer=Example&algorithm=SHA1&digits=6&period=30'
    );
  });

  it('HOTP URI には counter パラメータが含まれる', () => {
    const uri = buildOtpauthUri({
      type: 'hotp',
      issuer: 'Example',
      account: 'user@example.com',
      secretBase32: 'JBSWY3DPEB3W64TMMQ',
      algorithm: 'SHA-1',
      digits: 6,
      counter: 5n,
    });
    expect(uri).toMatch(/^otpauth:\/\/hotp\//);
    expect(uri).toContain('counter=5');
    expect(uri).not.toContain('period=');
  });

  it('issuer/account に空白が含まれる場合 %20 にエンコードする', () => {
    const uri = buildOtpauthUri({
      type: 'totp',
      issuer: 'My App',
      account: 'alice',
      secretBase32: 'JBSWY3DPEB3W64TMMQ',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });
    // ラベル部分またはクエリパラメータ内で空白がエンコードされること
    expect(uri).toContain('My%20App');
  });

  it('SHA-1 は algorithm=SHA1 に変換する（Google Authenticator 互換）', () => {
    const uri = buildOtpauthUri({
      type: 'totp',
      issuer: 'Test',
      account: 'test',
      secretBase32: 'JBSWY3DPEB3W64TMMQ',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).not.toContain('algorithm=SHA-1');
  });

  it('SHA-256 は algorithm=SHA256 に変換する', () => {
    const uri = buildOtpauthUri({
      type: 'totp',
      issuer: 'Test',
      account: 'test',
      secretBase32: 'JBSWY3DPEB3W64TMMQ',
      algorithm: 'SHA-256',
      digits: 6,
      period: 30,
    });
    expect(uri).toContain('algorithm=SHA256');
  });

  it('SHA-512 は algorithm=SHA512 に変換する', () => {
    const uri = buildOtpauthUri({
      type: 'totp',
      issuer: 'Test',
      account: 'test',
      secretBase32: 'JBSWY3DPEB3W64TMMQ',
      algorithm: 'SHA-512',
      digits: 6,
      period: 30,
    });
    expect(uri).toContain('algorithm=SHA512');
  });
});

// 陽性対照: issuer バリデータが実際にコロンを検知して throw することを確認
describe('buildOtpauthUri - 不正入力バリデーション（陽性対照）', () => {
  it('issuer にコロンが含まれる場合 throw する', () => {
    expect(() =>
      buildOtpauthUri({
        type: 'totp',
        issuer: 'bad:issuer',
        account: 'test',
        secretBase32: 'JBSWY3DPEB3W64TMMQ',
        algorithm: 'SHA-1',
        digits: 6,
        period: 30,
      })
    ).toThrow();
  });
});
