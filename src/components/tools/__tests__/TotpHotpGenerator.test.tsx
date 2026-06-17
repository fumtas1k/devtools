import { describe, it, expect } from 'vitest';
import { SAMPLE_SECRET_BASE32, DEFAULTS } from '../TotpHotpGenerator';
import { base32Decode, totp } from '@/utils/totp-hotp';

describe('SAMPLE_SECRET_BASE32', () => {
  it('有効な Base32 文字列である（デコード時に throw しない）', () => {
    expect(() => base32Decode(SAMPLE_SECRET_BASE32)).not.toThrow();
  });

  // 陽性対照: RFC 4226 §4 R6 強推奨の 160 bit (= 20 byte) を満たすか検証。
  // ツール自身が「ランダム生成は 160 bit」と謳いつつ、サンプルだけ短い (90 bit 等) に
  // 戻る silent regression を本テストが捕捉して fail させる。
  it('RFC 4226 §4 R6 強推奨の 160 bit (= 20 byte) 以上を満たす', () => {
    expect(base32Decode(SAMPLE_SECRET_BASE32).length).toBeGreaterThanOrEqual(20);
  });
});

describe('DEFAULTS', () => {
  it('アルゴリズムデフォルトは SHA-1（最も広くサポートされる）', () => {
    expect(DEFAULTS.algorithm).toBe('SHA-1');
  });

  it('桁数デフォルトは 6（RFC 4226 標準）', () => {
    expect(DEFAULTS.digits).toBe(6);
  });

  it('周期デフォルトは 30秒（RFC 6238 推奨）', () => {
    expect(DEFAULTS.period).toBe(30);
  });

  it('DEFAULTS でサンプル secret を使って totp を生成できる', async () => {
    const secretBytes = base32Decode(SAMPLE_SECRET_BASE32);
    const code = await totp(secretBytes, { ...DEFAULTS, timestamp: 1234567890 * 1000 });
    expect(code).toHaveLength(DEFAULTS.digits);
    expect(/^\d+$/.test(code)).toBe(true);
  });
});
