/**
 * key-convert.test.ts
 *
 * convertKey / detectKeyInput のユニットテスト。
 *
 * 構成:
 *   - 陰性対照（round-trip 正常系）: RSA/EC 各曲線で入力形式ごとの round-trip を検証
 *   - 陽性対照（不正入力の検知）: 壊れた入力・未対応形式が error を返すことを検証
 *     ※ test-gates skill 準拠: 陰性対照と別 describe に分離し、
 *       「旧実装が throw していた場合にこのテストが fail する」設計にする
 *
 * 鉄則:
 *   1. 陽性対照は旧実装（throw する実装）に当てると fail するよう設計
 *   2. 陰性対照と陽性対照は別 describe に分離
 *   3. 観測可能な振る舞い（戻り値の error フィールド / unsupportedReason）を assert
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { convertKey } from '@/utils/key/convert';
import { detectKeyInput } from '@/utils/key/detect';

// ---- テスト用鍵生成ヘルパー ----

/** Uint8Array を base64 テキストに変換する */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** DER バイト列から PEM テキストを構築する */
function toPem(derBytes: Uint8Array, label: string): string {
  const b64 = toBase64(derBytes);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** JWK の比較対象フィールドを抽出する（RSA） */
function extractRsaFields(jwk: JsonWebKey, isPrivate: boolean) {
  const base = { kty: jwk.kty, n: jwk.n, e: jwk.e };
  if (!isPrivate) return base;
  return { ...base, d: jwk.d, p: jwk.p, q: jwk.q, dp: jwk.dp, dq: jwk.dq, qi: jwk.qi };
}

/** JWK の比較対象フィールドを抽出する（EC） */
function extractEcFields(jwk: JsonWebKey, isPrivate: boolean) {
  const base = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  if (!isPrivate) return base;
  return { ...base, d: jwk.d };
}

// ---- 鍵素材の事前生成 ----

interface KeyMaterial {
  cryptoKey: CryptoKey;
  derBytes: Uint8Array;
  pem: string;
  jwkObject: JsonWebKey;
  jwkText: string;
}

async function generateRsaMaterial(isPrivate: boolean): Promise<KeyMaterial> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const cryptoKey = isPrivate ? keyPair.privateKey : keyPair.publicKey;
  const exportFormat = isPrivate ? 'pkcs8' : 'spki';
  const label = isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY';

  const derBuf = await crypto.subtle.exportKey(exportFormat, cryptoKey);
  const derBytes = new Uint8Array(derBuf);
  const pem = toPem(derBytes, label);
  const jwkObject = await crypto.subtle.exportKey('jwk', cryptoKey);
  const jwkText = JSON.stringify(jwkObject, null, 2);

  return { cryptoKey, derBytes, pem, jwkObject, jwkText };
}

async function generateEcMaterial(namedCurve: string, isPrivate: boolean): Promise<KeyMaterial> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve }, true, [
    'sign',
    'verify',
  ]);
  const cryptoKey = isPrivate ? keyPair.privateKey : keyPair.publicKey;
  const exportFormat = isPrivate ? 'pkcs8' : 'spki';
  const label = isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY';

  const derBuf = await crypto.subtle.exportKey(exportFormat, cryptoKey);
  const derBytes = new Uint8Array(derBuf);
  const pem = toPem(derBytes, label);
  const jwkObject = await crypto.subtle.exportKey('jwk', cryptoKey);
  const jwkText = JSON.stringify(jwkObject, null, 2);

  return { cryptoKey, derBytes, pem, jwkObject, jwkText };
}

// ---- 素材の保持 ----

let rsaPublic: KeyMaterial;
let rsaPrivate: KeyMaterial;
let ecP256Public: KeyMaterial;
let ecP256Private: KeyMaterial;
let ecP384Public: KeyMaterial;
let ecP384Private: KeyMaterial;
let ecP521Public: KeyMaterial;
let ecP521Private: KeyMaterial;

beforeAll(async () => {
  [
    rsaPublic,
    rsaPrivate,
    ecP256Public,
    ecP256Private,
    ecP384Public,
    ecP384Private,
    ecP521Public,
    ecP521Private,
  ] = await Promise.all([
    generateRsaMaterial(false),
    generateRsaMaterial(true),
    generateEcMaterial('P-256', false),
    generateEcMaterial('P-256', true),
    generateEcMaterial('P-384', false),
    generateEcMaterial('P-384', true),
    generateEcMaterial('P-521', false),
    generateEcMaterial('P-521', true),
  ]);
});

// ===========================================================================
// 陰性対照（正常系 round-trip）
// ===========================================================================

describe('陰性対照: 正常系 round-trip', () => {
  // ---- RSA ----

  describe('RSA 公開鍵', () => {
    it('PEM 入力 → JWK の n/e が一致する', async () => {
      const result = await convertKey(rsaPublic.pem);
      expect(result.error).toBeUndefined();
      expect(result.visibility).toBe('public');
      expect(result.algorithm).toBe('RSA');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractRsaFields(outJwk, false)).toEqual(extractRsaFields(rsaPublic.jwkObject, false));
    });

    it('DER (Uint8Array) 入力 → JWK の n/e が一致する', async () => {
      const result = await convertKey(rsaPublic.derBytes);
      expect(result.error).toBeUndefined();
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractRsaFields(outJwk, false)).toEqual(extractRsaFields(rsaPublic.jwkObject, false));
    });

    it('DER (base64テキスト) 入力 → JWK の n/e が一致する', async () => {
      const result = await convertKey(toBase64(rsaPublic.derBytes));
      expect(result.error).toBeUndefined();
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractRsaFields(outJwk, false)).toEqual(extractRsaFields(rsaPublic.jwkObject, false));
    });

    it('JWK テキスト入力 → JWK の n/e が一致する', async () => {
      const result = await convertKey(rsaPublic.jwkText);
      expect(result.error).toBeUndefined();
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractRsaFields(outJwk, false)).toEqual(extractRsaFields(rsaPublic.jwkObject, false));
    });

    it('keySizeBits が 2048 を返す', async () => {
      const result = await convertKey(rsaPublic.pem);
      expect(result.keySizeBits).toBe(2048);
    });
  });

  describe('RSA 秘密鍵', () => {
    it('PEM 入力 → JWK の n/e/d/p/q が一致する', async () => {
      const result = await convertKey(rsaPrivate.pem);
      expect(result.error).toBeUndefined();
      expect(result.visibility).toBe('private');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractRsaFields(outJwk, true)).toEqual(extractRsaFields(rsaPrivate.jwkObject, true));
    });

    it('JWK テキスト入力 → JWK の n/e/d が一致する', async () => {
      const result = await convertKey(rsaPrivate.jwkText);
      expect(result.error).toBeUndefined();
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractRsaFields(outJwk, true)).toEqual(extractRsaFields(rsaPrivate.jwkObject, true));
    });
  });

  // ---- EC P-256 ----

  describe('EC P-256 公開鍵', () => {
    it('PEM 入力 → JWK の crv/x/y が一致する', async () => {
      const result = await convertKey(ecP256Public.pem);
      expect(result.error).toBeUndefined();
      expect(result.algorithm).toBe('EC');
      expect(result.namedCurve).toBe('P-256');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, false)).toEqual(
        extractEcFields(ecP256Public.jwkObject, false)
      );
    });

    it('JWK テキスト入力 → JWK の crv/x/y が一致する', async () => {
      const result = await convertKey(ecP256Public.jwkText);
      expect(result.error).toBeUndefined();
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, false)).toEqual(
        extractEcFields(ecP256Public.jwkObject, false)
      );
    });
  });

  describe('EC P-256 秘密鍵', () => {
    it('PEM 入力 → JWK の crv/x/y/d が一致する', async () => {
      const result = await convertKey(ecP256Private.pem);
      expect(result.error).toBeUndefined();
      expect(result.visibility).toBe('private');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, true)).toEqual(extractEcFields(ecP256Private.jwkObject, true));
    });
  });

  // ---- EC P-384 ----

  describe('EC P-384 公開鍵', () => {
    it('PEM 入力 → JWK の crv が P-384 になる', async () => {
      const result = await convertKey(ecP384Public.pem);
      expect(result.error).toBeUndefined();
      expect(result.namedCurve).toBe('P-384');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, false)).toEqual(
        extractEcFields(ecP384Public.jwkObject, false)
      );
    });
  });

  describe('EC P-384 秘密鍵', () => {
    it('PEM 入力 → JWK の crv/d が一致する', async () => {
      const result = await convertKey(ecP384Private.pem);
      expect(result.error).toBeUndefined();
      expect(result.namedCurve).toBe('P-384');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, true)).toEqual(extractEcFields(ecP384Private.jwkObject, true));
    });
  });

  // ---- EC P-521 ----

  describe('EC P-521 公開鍵', () => {
    it('PEM 入力 → JWK の crv が P-521 になる', async () => {
      const result = await convertKey(ecP521Public.pem);
      expect(result.error).toBeUndefined();
      expect(result.namedCurve).toBe('P-521');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, false)).toEqual(
        extractEcFields(ecP521Public.jwkObject, false)
      );
    });
  });

  describe('EC P-521 秘密鍵', () => {
    it('PEM 入力 → JWK の crv/d が一致する', async () => {
      const result = await convertKey(ecP521Private.pem);
      expect(result.error).toBeUndefined();
      expect(result.namedCurve).toBe('P-521');
      const outJwk = JSON.parse(result.jwk!) as JsonWebKey;
      expect(extractEcFields(outJwk, true)).toEqual(extractEcFields(ecP521Private.jwkObject, true));
    });
  });

  // ---- 出力形式の検証 ----

  describe('出力形式', () => {
    it('PEM 出力はヘッダ・フッタ付きで 64 文字折返しになっている', async () => {
      const result = await convertKey(rsaPublic.pem);
      expect(result.pem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
      expect(result.pem).toMatch(/\n-----END PUBLIC KEY-----$/);
      // 本文行が 64 文字以内であること
      const body = result.pem!.split('\n').slice(1, -1);
      expect(body.every((line) => line.length <= 64)).toBe(true);
    });

    it('秘密鍵の PEM ラベルは PRIVATE KEY になる', async () => {
      const result = await convertKey(rsaPrivate.pem);
      expect(result.pem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    });

    it('derBase64 は空白なしの Base64 文字列になっている', async () => {
      const result = await convertKey(rsaPublic.pem);
      expect(result.derBase64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('JWK 出力は JSON.parse 可能で kty を持つ', async () => {
      const result = await convertKey(rsaPublic.pem);
      const parsed = JSON.parse(result.jwk!);
      expect(parsed).toHaveProperty('kty');
    });

    it('derBytes は Uint8Array で先頭が 0x30 (DER SEQUENCE)', async () => {
      const result = await convertKey(rsaPublic.pem);
      expect(result.derBytes).toBeInstanceOf(Uint8Array);
      expect(result.derBytes![0]).toBe(0x30);
    });
  });
});

// ===========================================================================
// 陽性対照（不正入力の検知）
// test-gates 準拠: 旧実装が throw していた場合、これらのテストが fail する。
// convertKey が throw せず error フィールドを返すことがこのセクションの証明対象。
// ===========================================================================

describe('陽性対照: 不正入力を検知して error を返す', () => {
  it('空入力 → error なし・空の ConvertResult を返す（throw しない）', async () => {
    // 空入力は「不正」ではなく idle 状態として扱うため error は undefined
    const result = await convertKey('');
    // throw が発生していないこと自体が陽性対照の主な証明
    expect(result).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.pem).toBeUndefined();
  });

  it('壊れた base64 → throw せず error を返す', async () => {
    // 'AAAA' は有効な base64 だが DER SEQUENCE ではない（先頭 0x00）
    const result = await convertKey('AAAA');
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  it('{} 始まりだが kty なし JWK → throw せず error を返す', async () => {
    const result = await convertKey('{"alg":"RS256"}');
    expect(result.error).toBeDefined();
  });

  it('不正な JSON → throw せず error を返す', async () => {
    const result = await convertKey('{not valid json}');
    expect(result.error).toBeDefined();
  });

  it('切り詰めた DER → throw せず error を返す', async () => {
    // DER の先頭 0x30 だけを残した壊れたバイト列
    const truncated = new Uint8Array([0x30, 0x82, 0x01]);
    const result = await convertKey(truncated);
    expect(result.error).toBeDefined();
  });

  it('Ed25519 JWK (kty: OKP) → throw せず unsupportedReason = unknown-algorithm を返す', async () => {
    const ed25519Jwk = JSON.stringify({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'somebase64url',
    });
    const result = await convertKey(ed25519Jwk);
    expect(result.error).toBeDefined();
    expect(result.unsupportedReason).toBe('unknown-algorithm');
  });

  it('legacy PEM (RSA PRIVATE KEY) → throw せず unsupportedReason = legacy-pem を返す', async () => {
    const legacyPem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAMc=',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const result = await convertKey(legacyPem);
    expect(result.error).toBeDefined();
    expect(result.unsupportedReason).toBe('legacy-pem');
  });

  it('encrypted PEM (ENCRYPTED PRIVATE KEY) → throw せず unsupportedReason = encrypted を返す', async () => {
    const encryptedPem = [
      '-----BEGIN ENCRYPTED PRIVATE KEY-----',
      'MIIFHDBOBgkqhkiG9w0BBQ0wQTApBgkqhkiG9w0BBQwwHAIIJkFake==',
      '-----END ENCRYPTED PRIVATE KEY-----',
    ].join('\n');
    const result = await convertKey(encryptedPem);
    expect(result.error).toBeDefined();
    expect(result.unsupportedReason).toBe('encrypted');
  });

  it('EC P-256 JWK だが x が壊れている → throw せず error を返す', async () => {
    const brokenJwk = JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: '!!!notbase64!!!',
      y: 'somebase64',
    });
    const result = await convertKey(brokenJwk);
    expect(result.error).toBeDefined();
  });

  it('全くランダムなバイト列 → throw せず error を返す', async () => {
    // 先頭が 0x30 ではない完全無効バイト列
    const random = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xff]);
    const result = await convertKey(random);
    expect(result.error).toBeDefined();
  });
});

// ===========================================================================
// detectKeyInput の単体テスト（陽性対照：検知機能の確認）
// ===========================================================================

describe('陽性対照: detectKeyInput が未対応形式を正しく識別する', () => {
  it('空文字 → kind: empty を返す（throw しない）', () => {
    const detection = detectKeyInput('');
    expect(detection.kind).toBe('empty');
  });

  it('Uint8Array 空 → kind: empty を返す', () => {
    const detection = detectKeyInput(new Uint8Array(0));
    expect(detection.kind).toBe('empty');
  });

  it('RSA PRIVATE KEY ラベル PEM → kind: unsupported, reason: legacy-pem', () => {
    const legacy = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----';
    const detection = detectKeyInput(legacy);
    expect(detection.kind).toBe('unsupported');
    if (detection.kind === 'unsupported') {
      expect(detection.reason).toBe('legacy-pem');
      expect(detection.message).toBeTruthy();
    }
  });

  it('EC PRIVATE KEY ラベル PEM → kind: unsupported, reason: legacy-pem', () => {
    const legacy = '-----BEGIN EC PRIVATE KEY-----\nfake\n-----END EC PRIVATE KEY-----';
    const detection = detectKeyInput(legacy);
    expect(detection.kind).toBe('unsupported');
    if (detection.kind === 'unsupported') {
      expect(detection.reason).toBe('legacy-pem');
    }
  });

  it('ENCRYPTED PRIVATE KEY → kind: unsupported, reason: encrypted', () => {
    const enc = '-----BEGIN ENCRYPTED PRIVATE KEY-----\nfake\n-----END ENCRYPTED PRIVATE KEY-----';
    const detection = detectKeyInput(enc);
    expect(detection.kind).toBe('unsupported');
    if (detection.kind === 'unsupported') {
      expect(detection.reason).toBe('encrypted');
    }
  });

  it('kty: OKP の JWK → kind: unsupported, reason: unknown-algorithm', () => {
    const okp = JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'abc' });
    const detection = detectKeyInput(okp);
    expect(detection.kind).toBe('unsupported');
    if (detection.kind === 'unsupported') {
      expect(detection.reason).toBe('unknown-algorithm');
    }
  });

  it('kty: RSA の JWK → kind: ok, algorithm: RSA, visibility: public (d なし)', async () => {
    // RSA 公開鍵 JWK を生成して検出する
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const detection = detectKeyInput(JSON.stringify(jwk));
    expect(detection.kind).toBe('ok');
    if (detection.kind === 'ok') {
      expect(detection.algorithm).toBe('RSA');
      expect(detection.visibility).toBe('public');
    }
  });

  it('kty: EC crv: P-256, d あり → kind: ok, algorithm: EC, visibility: private', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const detection = detectKeyInput(JSON.stringify(jwk));
    expect(detection.kind).toBe('ok');
    if (detection.kind === 'ok') {
      expect(detection.algorithm).toBe('EC');
      expect(detection.visibility).toBe('private');
      expect(detection.namedCurve).toBe('P-256');
    }
  });
});
