# cert-decoder PKCS#12 対応 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cert-decoder に PKCS#12（.pfx/.p12）対応を追加し、パスワード復号 → 証明書チェーン表示 ＋ 秘密鍵（メタ情報常時／PKCS#8 PEM はトグル開示）をブラウザ内完結で実現する。

**Architecture:** pkijs の `PFX` → `AuthenticatedSafe` → `SafeContents` → `SafeBag`（CertBag / PKCS8ShroudedKeyBag）を辿って証明書 DER と PKCS#8 秘密鍵を抽出する `parsePkcs12` を新設。証明書は既存の `ParsedCert` 化・チェーン検証パイプライン（`parseDerCertificates` として切り出し）に流す。UI は既存 `CertDecoder.tsx` に PKCS#12 モードを追加。

**Tech Stack:** TypeScript / React 19 / pkijs 3.4.0 / asn1js / Web Crypto（PBES2/AES のみ復号可）/ Vitest。

**前提知識（スパイクで検証済み）:**

- パスワードは `new TextEncoder().encode(password).buffer`（UTF-8 ArrayBuffer）を渡す。pkijs が内部で BMPString 変換する（`makePKCS12B2Key`）。
- 抽出フロー（検証済みコード）:
  ```
  const pfx = new PFX({ schema: asn1js.fromBER(ab).result });
  await pfx.parseInternalValues({ password: pwdAb, checkIntegrity: true });   // MAC 検証
  const authSafe = pfx.parsedValue.authenticatedSafe;
  await authSafe.parseInternalValues({ safeContents: authSafe.safeContents.map(() => ({ password: pwdAb })) });
  for (const sc of authSafe.parsedValue.safeContents)
    for (const bag of sc.value.safeBags) { ... }
  ```
- bagId: certBag=`1.2.840.113549.1.12.10.1.3`（`bag.bagValue.parsedValue` は `Certificate`、DER は `.toSchema().toBER(false)`）／pkcs8ShroudedKeyBag=`1.2.840.113549.1.12.10.1.2`（要 `await bag.bagValue.parseInternalValues({ password })`、`bag.bagValue.parsedValue` は `PrivateKeyInfo`）／keyBag=`1.2.840.113549.1.12.10.1.1`（`bag.bagValue` が `PrivateKeyInfo` 直）。
- エラー挙動: 誤パスワード → `pfx.parseInternalValues` が `Error("Integrity for the PKCS#12 data is broken!")` を throw。レガシー RC2/3DES → `authSafe.parseInternalValues` が `Error('Unknown "contentEncryptionAlgorithm": <OID>')` を throw。
- `asn1js` と `pkijs` は bare specifier で import する（既存 `parse.ts` と同様、単一インスタンスに dedupe され instanceof が成立する）。

---

## ファイル構成

- 新規 `src/utils/cert/pkcs12.ts` — `parsePkcs12(bytes, password)` / `looksLikePkcs12(der)`
- 改修 `src/utils/cert/parse.ts` — `parseDerCertificates(derList)` を export（`parseCertificates` から切り出し）
- 改修 `src/utils/cert/types.ts` — `Pkcs12KeyInfo` / `Pkcs12Result`
- 改修 `src/utils/cert/index.ts` — re-export 追加
- 改修 `src/components/tools/CertDecoder.tsx` — PKCS#12 モード
- 新規 `src/utils/__tests__/cert-pkcs12-fixtures.ts` — base64 fixtures
- 新規 `src/utils/__tests__/cert-pkcs12.test.ts` — 正常系＋陽性対照
- 改修 docs: `docs/decisions.md` / `docs/tools.md` / `README.md` / `SPEC.md`

---

### Task 1: 型定義の追加

**Files:**
- Modify: `src/utils/cert/types.ts`

- [ ] **Step 1: 型を追記**

`src/utils/cert/types.ts` の末尾に追記する（既存の型は変更しない）:

```ts
/** PKCS#12 から抽出した秘密鍵 1 件分の情報 */
export interface Pkcs12KeyInfo {
  /** 'RSA' | 'EC' | OID 文字列 */
  algorithm: string;
  keySizeBits?: number;
  namedCurve?: string;
  /** PKCS#8 PEM（-----BEGIN PRIVATE KEY----- ...）。トグル開示用 */
  pkcs8Pem: string;
}

/** parsePkcs12 の結果 */
export interface Pkcs12Result {
  /** 抽出した証明書 DER（parseDerCertificates へ渡す） */
  certs: Uint8Array[];
  /** 抽出した秘密鍵 */
  privateKeys: Pkcs12KeyInfo[];
  /** 失敗理由（成功時は undefined） */
  error?: string;
  errorKind?: 'wrong-password' | 'unsupported-encryption' | 'parse-error';
}
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（型追加のみ）

- [ ] **Step 3: コミット**

```bash
git add src/utils/cert/types.ts
git commit -m "feat: cert PKCS#12 用の型 Pkcs12Result / Pkcs12KeyInfo を追加 (#644)"
```

---

### Task 2: parseDerCertificates の切り出し

既存 `parseCertificates` の「DER 候補配列 → `ParsedCert[]`」部分を `parseDerCertificates` として切り出し export する。挙動は不変（リファクタ）。

**Files:**
- Modify: `src/utils/cert/parse.ts`
- Test: `src/utils/__tests__/cert-parse.test.ts`（既存テストが回帰検出に使える）

- [ ] **Step 1: parse.ts をリファクタ**

`src/utils/cert/parse.ts` の `parseCertificates` 内、`const certs: ParsedCert[] = [];` 〜 末尾 `return { certs };` のループ部分を新関数に切り出す。`parseCertificates` の `derList` 構築後（`if (derList.length === 0) {...}` の後）を以下に置き換える:

```ts
  return parseDerCertificates(derList);
}

/**
 * DER エンコード済み証明書の配列を ParsedCert[] に変換する。
 * PKCS#12 経路（pkcs12.ts）と PEM/DER/PKCS#7 経路（parseCertificates）の共通後段。
 * 1 枚のパース失敗は error フィールド付き ParsedCert として継続する。
 */
export async function parseDerCertificates(derList: Uint8Array[]): Promise<ParseResult> {
  ensureCryptoEngine();

  if (derList.length === 0) {
    return { certs: [], topLevelError: '証明書が見つかりませんでした' };
  }

  const certs: ParsedCert[] = [];

  for (const der of derList) {
    try {
      const parsed = await parseSingleDer(der);
      certs.push(parsed);
    } catch (e) {
      certs.push({
        subject: { full: '(パースエラー)', attributes: [] },
        issuer: { full: '(パースエラー)', attributes: [] },
        serialNumberHex: '',
        notBefore: new Date(0),
        notAfter: new Date(0),
        signatureAlgorithm: '',
        publicKey: { algorithm: '' },
        san: [],
        keyUsage: [],
        extKeyUsage: [],
        isCa: false,
        fingerprintSha256: '',
        sct: [],
        der,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { certs };
}
```

> 注意: `parseCertificates` 内に元々あった `if (derList.length === 0)` チェックと `certs` 構築ループは削除し、上記 `return parseDerCertificates(derList);` に置換する。`ensureCryptoEngine()` は両関数で呼ばれるが冪等（`engine.ts` で初回のみ初期化）なので問題ない。

- [ ] **Step 2: 既存テストで回帰がないことを確認**

Run: `npm run test -- cert-parse`
Expected: 既存の `cert-parse.test.ts` が全 PASS（挙動不変）

- [ ] **Step 3: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/utils/cert/parse.ts
git commit -m "refactor: 証明書 DER 配列パースを parseDerCertificates として切り出し (#644)"
```

---

### Task 3: テストフィクスチャの作成

OpenSSL 3 で生成した PBES2/AES-256-CBC + SHA256 MAC の `.p12`（RSA・EC）と、レガシー RC2/3DES の `.p12` を base64 で埋め込む。全てパスワードは `test-password`。証明書は 100 年有効（期限切れ無関係）。

**Files:**
- Create: `src/utils/__tests__/cert-pkcs12-fixtures.ts`

- [ ] **Step 1: フィクスチャファイルを作成**

`src/utils/__tests__/cert-pkcs12-fixtures.ts`:

```ts
/**
 * PKCS#12 テスト用フィクスチャ
 *
 * OpenSSL 3 で生成した PBES2/AES-256-CBC + SHA256 MAC の .p12（RSA / EC）と、
 * レガシー RC2-40/3DES の .p12（Web Crypto 非対応＝unsupported-encryption 検証用）。
 * いずれもパスワードは "test-password"、証明書は 100 年有効。
 *
 * 生成コマンド（再現用、再生成不要）:
 *   openssl req -x509 -newkey rsa:2048 -keyout k -out c -days 36500 -nodes -subj "/CN=pkcs12-test.example/O=DevtoolsTest"
 *   openssl pkcs12 -export -inkey k -in c -out rsa.p12 -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256 -passout pass:test-password
 */

export const PKCS12_PASSWORD = 'test-password';

/** RSA 2048 鍵 + 自己署名証明書（PBES2/AES-256-CBC, CN=pkcs12-test.example） */
export const PKCS12_RSA_BASE64 =
  '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';

/** EC P-256 鍵 + 自己署名証明書（PBES2/AES-256-CBC, CN=ec-pkcs12-test.example） */
export const PKCS12_EC_BASE64 =
  'MIIELAIBAzCCA+IGCSqGSIb3DQEHAaCCA9MEggPPMIIDyzCCAoIGCSqGSIb3DQEHBqCCAnMwggJvAgEAMIICaAYJKoZIhvcNAQcBMFcGCSqGSIb3DQEFDTBKMCkGCSqGSIb3DQEFDDAcBAjIb9igi7l3cQICCAAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEEN1wmRL4KWld1qPvHtsIQr2AggIA5CB5gfjxyL124VXYU9Gl0quYiTti9RZxLpJAAAELrvw7OqmcKo0wFO85LIJIx9wHsqzLO2VIxuaDB2Lfjl1uvBwcFcjeH4hSH2p+ai4b2VJPUB/ZUOOumWd4jjzHltU+KLM4ooLd1lAcgmXplu9PMuHK1SNzbhzqC6Oxx3+P45rAMzRVoThgOkCn2Ml+5DDcc+0bFI3YrVPU9P+eeV/17abgCoBo9dsCFBKbWfqMgA1E8W4RhhHPn4o6ryK0dFdbUjKa36I92ZV0NDCXcsUyVw8HmFq4KW8txaOcI1QyalJT3CkR5Jaa+DeLkbo1ZLCgwp8JFRm2cBDNbU5RTbP8r/FV4/cFbxZC75bRf3GBe0Mtw+k65AWrYfXTjWAj5KfBrdrK5ZZgPJer93Cpw8Td8K5ZBOKmDAHvRaIIkDjFIcx0Sy6TiiJd88+lg6w7p684CdD012yFZXiQZA9jxwiydZd0NO7pgHw6G0/T8cIdmFMmF9AVcHTlQzRaesvhbhPRLoztBTER9tIZ9gZxEsXtw3bxt2+DIlegtCXj1g+BeaXSOjn9rlq35ijKAufxFyFtVZjj5NBWhu1P3t5KUuJeVcTmoAm3JT0Rf6YN3gAhC7/ItNxiGw70H4NBMxy2mu4gibLoKgtU/c2hxjOX0P6rraw9Pz8aRdYX0c8OmGQSO4kwggFBBgkqhkiG9w0BBwGgggEyBIIBLjCCASowggEmBgsqhkiG9w0BDAoBAqCB7zCB7DBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQImuaZ8Z6cqNUCAggAMAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBAF77zOoycmldrRQ4yKLdAaBIGQ3FXf5unFI/okxmaR+T2GK2khZSGRF6CiV8quUk7LgTU8IVBWAxcMphkEv3dJpgRJgYVFIw20Yz0KWNL5G8Epdge4xRtew3KMyJCdYC2HvtxbIwQku7QD9RqfbNYH/IjfCR9aazUOMoDK7iXHzAI/Fb8Jcj9szi0vGVWUEVsuyxVZ/2yFpemltLBkPJbEhNmMMSUwIwYJKoZIhvcNAQkVMRYEFMNXwZ+Gb78QUsy9NGpof0PgQxaUMEEwMTANBglghkgBZQMEAgEFAAQgWiB8FvbRUXVqZtjJQu72qtLIYZ0V65Sl1E2x0WpEMNkECC39rfPXIjiIAgIIAA==';

/** レガシー RC2-40/3DES（Web Crypto 復号不可。unsupported-encryption 検証用） */
export const PKCS12_LEGACY_BASE64 =
  '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';

/** base64 文字列を Uint8Array に変換する */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

- [ ] **Step 2: コミット**

```bash
git add src/utils/__tests__/cert-pkcs12-fixtures.ts
git commit -m "test: PKCS#12 テスト用フィクスチャ（RSA/EC/legacy）を追加 (#644)"
```

---

### Task 4: parsePkcs12 のテスト（先に失敗させる / TDD）

**Files:**
- Create: `src/utils/__tests__/cert-pkcs12.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/cert-pkcs12.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePkcs12 } from '@/utils/cert/pkcs12';
import { parseDerCertificates } from '@/utils/cert/parse';
import {
  PKCS12_PASSWORD,
  PKCS12_RSA_BASE64,
  PKCS12_EC_BASE64,
  PKCS12_LEGACY_BASE64,
  base64ToBytes,
} from './cert-pkcs12-fixtures';

// ── 陰性対照（正常系: 正しいパスワードで抽出できる）──────────────────
describe('parsePkcs12 — 正常系', () => {
  it('RSA の .p12 から証明書と秘密鍵を抽出する', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_RSA_BASE64), PKCS12_PASSWORD);
    expect(result.error).toBeUndefined();
    expect(result.certs.length).toBeGreaterThanOrEqual(1);
    expect(result.privateKeys.length).toBeGreaterThanOrEqual(1);
    expect(result.privateKeys[0].algorithm).toBe('RSA');
    expect(result.privateKeys[0].keySizeBits).toBe(2048);
    expect(result.privateKeys[0].pkcs8Pem).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('抽出した証明書を parseDerCertificates で解析できる', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_RSA_BASE64), PKCS12_PASSWORD);
    const parsed = await parseDerCertificates(result.certs);
    expect(parsed.certs[0].error).toBeUndefined();
    expect(parsed.certs[0].subject.full).toContain('pkcs12-test.example');
  });

  it('EC の .p12 から EC 秘密鍵を抽出する', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_EC_BASE64), PKCS12_PASSWORD);
    expect(result.error).toBeUndefined();
    expect(result.privateKeys[0].algorithm).toBe('EC');
    expect(result.privateKeys[0].namedCurve).toBe('P-256');
  });
});

// ── 陽性対照（検知能力: 不正入力を throw せず errorKind で返す）──────
describe('parsePkcs12 — 陽性対照（不正入力の検知）', () => {
  it('誤ったパスワードは errorKind="wrong-password" を返す（throw しない）', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_RSA_BASE64), 'wrong-password-xxx');
    expect(result.errorKind).toBe('wrong-password');
    expect(result.error).toBeTruthy();
    expect(result.certs).toEqual([]);
  });

  it('PKCS#12 でないバイト列は errorKind="parse-error" を返す', async () => {
    const result = await parsePkcs12(new Uint8Array([1, 2, 3, 4, 5]), PKCS12_PASSWORD);
    expect(result.errorKind).toBe('parse-error');
    expect(result.certs).toEqual([]);
  });

  it('レガシー暗号（RC2/3DES）は errorKind="unsupported-encryption" を返す', async () => {
    const result = await parsePkcs12(base64ToBytes(PKCS12_LEGACY_BASE64), PKCS12_PASSWORD);
    expect(result.errorKind).toBe('unsupported-encryption');
    expect(result.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- cert-pkcs12`
Expected: FAIL（`parsePkcs12` 未実装で import エラー）

---

### Task 5: parsePkcs12 / looksLikePkcs12 の実装

**Files:**
- Create: `src/utils/cert/pkcs12.ts`

- [ ] **Step 1: pkcs12.ts を実装**

`src/utils/cert/pkcs12.ts`:

```ts
/**
 * cert/pkcs12.ts
 *
 * PKCS#12（.pfx/.p12）の復号・抽出。
 *
 * pkijs の PFX → AuthenticatedSafe → SafeContents → SafeBag を辿り、
 * 証明書 DER と PKCS#8 秘密鍵を取り出す。
 *
 * ブラウザの Web Crypto は PBES2（AES-CBC + PBKDF2）のみ復号可能。
 * レガシー RC2-40/3DES（OpenSSL 1.x 既定）は復号できず errorKind='unsupported-encryption' を返す。
 *
 * 全処理はブラウザ内で完結し、外部送信しない。
 */
import * as asn1js from 'asn1js';
import { PFX, RSAPrivateKey } from 'pkijs';
import type { Certificate, PrivateKeyInfo } from 'pkijs';
import { ensureCryptoEngine } from './engine';
import type { Pkcs12Result, Pkcs12KeyInfo } from './types';

const CERT_BAG_OID = '1.2.840.113549.1.12.10.1.3';
const SHROUDED_KEY_BAG_OID = '1.2.840.113549.1.12.10.1.2';
const KEY_BAG_OID = '1.2.840.113549.1.12.10.1.1';

const PUBKEY_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10040.4.1': 'DSA',
};

const EC_NAMED_CURVE_OID: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

/** Uint8Array → 専用 ArrayBuffer */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** DER → PEM（PRIVATE KEY） */
function derToPem(der: Uint8Array, label: string): string {
  let binary = '';
  for (let i = 0; i < der.length; i++) binary += String.fromCharCode(der[i]);
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** PrivateKeyInfo から Pkcs12KeyInfo を構築する */
function buildKeyInfo(pki: PrivateKeyInfo): Pkcs12KeyInfo {
  const der = new Uint8Array(pki.toSchema().toBER(false));
  const pkcs8Pem = derToPem(der, 'PRIVATE KEY');

  const algOid = pki.privateKeyAlgorithm.algorithmId;
  const algorithm = PUBKEY_ALG_OID[algOid] ?? algOid;
  const info: Pkcs12KeyInfo = { algorithm, pkcs8Pem };

  if (algorithm === 'EC') {
    try {
      const params = pki.privateKeyAlgorithm.algorithmParams as
        | { valueBlock?: { toString?: () => string } }
        | undefined;
      if (params?.valueBlock?.toString) {
        const curveOid = params.valueBlock.toString();
        info.namedCurve = EC_NAMED_CURVE_OID[curveOid] ?? curveOid;
      }
    } catch {
      // best-effort
    }
  } else if (algorithm === 'RSA') {
    try {
      // privateKey OCTET STRING の中身が RSAPrivateKey ::= SEQUENCE { version, modulus, ... }
      const inner = (pki.privateKey as unknown as { valueBlock: { valueHexView: Uint8Array } })
        .valueBlock.valueHexView;
      const asn1 = asn1js.fromBER(toArrayBuffer(inner));
      if (asn1.offset !== -1) {
        const rsa = new RSAPrivateKey({ schema: asn1.result });
        const modulus = rsa.modulus.valueBlock.valueHexView;
        const modulusBytes =
          modulus.length > 0 && modulus[0] === 0x00 ? modulus.length - 1 : modulus.length;
        if (modulusBytes > 0) info.keySizeBits = modulusBytes * 8;
      }
    } catch {
      // best-effort
    }
  }

  return info;
}

/**
 * バイト列が PKCS#12（PFX）構造に見えるかを安価に判定する（復号なし）。
 * 貼り付け Base64 が p12 か証明書 DER かを区別するのに使う。
 */
export function looksLikePkcs12(bytes: Uint8Array): boolean {
  try {
    const asn1 = asn1js.fromBER(toArrayBuffer(bytes));
    if (asn1.offset === -1) return false;
    const pfx = new PFX({ schema: asn1.result });
    // PFX version は v3。authSafe.contentType が data / signedData。
    return pfx.version === 3 && typeof pfx.authSafe?.contentType === 'string';
  } catch {
    return false;
  }
}

/**
 * PKCS#12 バイト列をパスワードで復号し、証明書 DER と秘密鍵を抽出する。
 * 不正入力（誤パスワード・非 p12・レガシー暗号）は throw せず errorKind で返す。
 */
export async function parsePkcs12(bytes: Uint8Array, password: string): Promise<Pkcs12Result> {
  ensureCryptoEngine();

  const pwd = toArrayBuffer(new TextEncoder().encode(password));

  // 1. 構造パース
  let pfx: PFX;
  try {
    const asn1 = asn1js.fromBER(toArrayBuffer(bytes));
    if (asn1.offset === -1) throw new Error('ASN.1 デコードに失敗しました');
    pfx = new PFX({ schema: asn1.result });
  } catch {
    return {
      certs: [],
      privateKeys: [],
      error: 'PKCS#12（.pfx/.p12）として解析できませんでした。ファイルが破損している可能性があります。',
      errorKind: 'parse-error',
    };
  }

  // 2. MAC 整合性検証（誤パスワード検出）
  try {
    await pfx.parseInternalValues({ password: pwd, checkIntegrity: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/integrity/i.test(msg)) {
      return {
        certs: [],
        privateKeys: [],
        error: 'パスワードが正しくありません（または MAC 整合性が壊れています）。',
        errorKind: 'wrong-password',
      };
    }
    return {
      certs: [],
      privateKeys: [],
      error: `PKCS#12 の解析に失敗しました: ${msg}`,
      errorKind: 'parse-error',
    };
  }

  // 3. AuthenticatedSafe 復号（レガシー暗号検出）
  const authSafe = pfx.parsedValue?.authenticatedSafe;
  if (!authSafe) {
    return { certs: [], privateKeys: [], error: 'AuthenticatedSafe が見つかりません。', errorKind: 'parse-error' };
  }
  try {
    await authSafe.parseInternalValues({
      safeContents: authSafe.safeContents.map(() => ({ password: pwd })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unknown|unsupported|contentEncryptionAlgorithm/i.test(msg)) {
      return {
        certs: [],
        privateKeys: [],
        error:
          'この PKCS#12 はレガシー暗号（RC2/3DES 等）で保護されており、ブラウザでは復号できません。' +
          '「openssl pkcs12 -keypbe AES-256-CBC -certpbe AES-256-CBC -export ...」で再エクスポートしてください。',
        errorKind: 'unsupported-encryption',
      };
    }
    if (/integrity/i.test(msg)) {
      return { certs: [], privateKeys: [], error: 'パスワードが正しくありません。', errorKind: 'wrong-password' };
    }
    return { certs: [], privateKeys: [], error: `復号に失敗しました: ${msg}`, errorKind: 'parse-error' };
  }

  // 4. SafeBag 走査
  const certs: Uint8Array[] = [];
  const privateKeys: Pkcs12KeyInfo[] = [];

  for (const sc of authSafe.parsedValue.safeContents) {
    const safeBags = (sc as { value: { safeBags: Array<{ bagId: string; bagValue: unknown }> } })
      .value.safeBags;
    for (const bag of safeBags) {
      try {
        if (bag.bagId === CERT_BAG_OID) {
          const certBag = bag.bagValue as { parsedValue?: Certificate };
          if (certBag.parsedValue && 'toSchema' in certBag.parsedValue) {
            certs.push(new Uint8Array(certBag.parsedValue.toSchema().toBER(false)));
          }
        } else if (bag.bagId === SHROUDED_KEY_BAG_OID) {
          const keyBag = bag.bagValue as {
            parseInternalValues: (p: { password: ArrayBuffer }) => Promise<void>;
            parsedValue?: PrivateKeyInfo;
          };
          await keyBag.parseInternalValues({ password: pwd });
          if (keyBag.parsedValue) privateKeys.push(buildKeyInfo(keyBag.parsedValue));
        } else if (bag.bagId === KEY_BAG_OID) {
          privateKeys.push(buildKeyInfo(bag.bagValue as PrivateKeyInfo));
        }
      } catch {
        // 1 バッグの失敗は無視して継続（best-effort）
      }
    }
  }

  return { certs, privateKeys };
}
```

- [ ] **Step 2: テストが通ることを確認**

Run: `npm run test -- cert-pkcs12`
Expected: 全 PASS（正常系 3 件＋陽性対照 3 件）

- [ ] **Step 3: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

> もし `PrivateKeyInfo` / `Certificate` の型 import や `safeBags` の型アサーションで `astro check` が型エラーを出す場合、`as unknown as { ... }` で局所的に narrowing する（既存 `parse.ts` も同様の手法を採用済み）。`eslint-disable` は使わない。

- [ ] **Step 4: コミット**

```bash
git add src/utils/cert/pkcs12.ts
git commit -m "feat: PKCS#12 復号・証明書/秘密鍵抽出の parsePkcs12 を実装 (#644)"
```

---

### Task 6: index.ts に re-export を追加

**Files:**
- Modify: `src/utils/cert/index.ts`

- [ ] **Step 1: export を追記**

`src/utils/cert/index.ts` を以下にする:

```ts
export * from './types';
export { detectInput } from './detect';
export { parseCertificates, parseDerCertificates } from './parse';
export { parsePkcs12, looksLikePkcs12 } from './pkcs12';
export { decodeSct } from './sct';
export { buildChain } from './chain';
```

- [ ] **Step 2: 型チェック＋全テスト**

Run: `node_modules/.bin/astro check && npm run test -- cert`
Expected: エラーなし／cert 関連テスト全 PASS

- [ ] **Step 3: コミット**

```bash
git add src/utils/cert/index.ts
git commit -m "feat: cert index に parsePkcs12 / parseDerCertificates を re-export (#644)"
```

---

### Task 7: CertDecoder.tsx に PKCS#12 モードを追加

UI を追加する。既存の text 経路（PEM/DER/PKCS#7）は不変。

**Files:**
- Modify: `src/components/tools/CertDecoder.tsx`

実装方針（既存コードに追記する形。共通 UI コンポーネントを再利用）:

- [ ] **Step 1: import と状態型を拡張**

先頭の import に追加:
```ts
import { OutputField } from '@/components/ui/OutputField';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { parseCertificates, parseDerCertificates, parsePkcs12, looksLikePkcs12, buildChain } from '@/utils/cert';
import type { ParsedCert, ChainResult, ParseResult, Pkcs12KeyInfo } from '@/utils/cert';
```
（`ActionButton` / `OutputField` / `DownloadButton` / `StatusBadge` の props は `src/components/ui/` の各定義を確認して合わせる。`ActionButton` が無い場合は既存ボタン class `btn-action btn-action--primary` を用いる）

`DecodeState` を拡張:
```ts
type DecodeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'awaiting-password'; bytes: Uint8Array }
  | { status: 'decrypting' }
  | { status: 'unsupported'; reason: string }   // レガシー暗号案内
  | { status: 'error'; message: string }
  | {
      status: 'done';
      parseResult: ParseResult;
      chainResult: ChainResult;
      privateKeys?: Pkcs12KeyInfo[];
    };
```

- [ ] **Step 2: PKCS#12 検出フックの分岐を追加**

既存の text デバウンス `useEffect` 内、`parseCertificates(trimmed)` 後の `if (parseResult.unsupported === 'pkcs12')` 分岐を「パスワード入力 UI への遷移」に変更する。さらに base64 貼り付け対応として、`parseResult` が証明書 0 件かつ `looksLikePkcs12` の場合も awaiting-password に遷移:

```ts
const parseResult = await parseCertificates(trimmed);
if (cancelled) return;

// PKCS#12（PEM ラベル検出 or Base64 貼り付け）
const stripped = trimmed.replace(/\s/g, '');
const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(stripped);
if (parseResult.unsupported === 'pkcs12') {
  setDecodeState({ status: 'awaiting-password', bytes: pemPkcs12ToBytes(trimmed) });
  return;
}
if (parseResult.certs.length === 0 && isBase64) {
  const bytes = base64ToBytesSafe(stripped);
  if (bytes && looksLikePkcs12(bytes)) {
    setDecodeState({ status: 'awaiting-password', bytes });
    return;
  }
}
```
（`pemPkcs12ToBytes` = PEM `-----BEGIN PKCS12-----` 本文を base64 デコードするヘルパー、`base64ToBytesSafe` = try/catch 付き atob ヘルパー。コンポーネント内に小関数として定義）

- [ ] **Step 3: ファイル選択で .p12/.pfx を分岐**

`handleFileChange` に拡張子分岐を追加:
```ts
const isPkcs12 = ['.p12', '.pfx'].some((ext) => file.name.toLowerCase().endsWith(ext));
if (isPkcs12) {
  const buf = await file.arrayBuffer();
  setInput(''); // text 経路の解析を止める
  setDecodeState({ status: 'awaiting-password', bytes: new Uint8Array(buf) });
  e.target.value = '';
  return;
}
```
`accept` 属性に `.p12,.pfx` を追加、ヒント文言も更新。

- [ ] **Step 4: パスワード入力 UI と解析ハンドラ**

`awaiting-password` 状態のとき、パスワード入力欄（`type="password"`、`InputField` または素の input）＋「解析」`ActionButton` を表示。ハンドラ:
```ts
const handleDecryptPkcs12 = useCallback(async (bytes: Uint8Array, password: string) => {
  setDecodeState({ status: 'decrypting' });
  const result = await parsePkcs12(bytes, password);
  if (result.errorKind === 'wrong-password') {
    setDecodeState({ status: 'awaiting-password', bytes }); // 再入力（エラーメッセージ表示は別 state で）
    // → 直近のエラーメッセージを保持する補助 state を用意するか、awaiting-password に error?: string を持たせる
    return;
  }
  if (result.errorKind === 'unsupported-encryption') {
    setDecodeState({ status: 'unsupported', reason: result.error! });
    return;
  }
  if (result.error) {
    setDecodeState({ status: 'error', message: result.error });
    return;
  }
  const parseResult = await parseDerCertificates(result.certs);
  const chainResult = await buildChain(parseResult.certs);
  setDecodeState({ status: 'done', parseResult, chainResult, privateKeys: result.privateKeys });
}, []);
```
> 誤パスワード時の再入力エラー表示のため、`awaiting-password` state に `error?: string` フィールドを追加してよい（型定義も合わせて更新）。

- [ ] **Step 5: 秘密鍵セクションの描画**

`status === 'done'` の結果表示に、`privateKeys` があれば以下を証明書カード群の後（または前）に描画する。秘密鍵は既定で折りたたみ:
```tsx
{decodeState.privateKeys && decodeState.privateKeys.length > 0 && (
  <div className="space-y-3">
    <NotificationBanner variant="info" title="秘密鍵はブラウザ外に送信されません">
      このツールの全処理はブラウザ内で完結します。入力した PKCS#12 と抽出した秘密鍵は外部サーバーに送信されません。
    </NotificationBanner>
    {decodeState.privateKeys.map((key, i) => (
      <div key={i} className="rounded-xl border border-default overflow-hidden">
        <div className="bg-subtle px-4 py-3 border-b border-default flex flex-wrap items-center gap-2">
          <span className="body-emphasis text-default">秘密鍵 #{i + 1}</span>
          <ChipLabel tone="error">秘密鍵</ChipLabel>
          <ChipLabel tone="neutral">{key.algorithm}</ChipLabel>
          {key.keySizeBits && <ChipLabel tone="neutral">{key.keySizeBits} bit</ChipLabel>}
          {key.namedCurve && <ChipLabel tone="neutral">{key.namedCurve}</ChipLabel>}
        </div>
        <div className="bg-default p-4">
          <details>
            <summary className="cursor-pointer body-emphasis text-default">
              秘密鍵（PKCS#8 PEM）を表示
            </summary>
            <div className="mt-3">
              <OutputField
                id={`pkcs12-key-${i}`}
                label="PKCS#8 PEM"
                value={key.pkcs8Pem}
                rows={8}
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="秘密鍵 PEM をダウンロード"
                    onClick={() => downloadText(`private_key_${i + 1}.pem`, key.pkcs8Pem)}
                  />
                }
              />
            </div>
          </details>
        </div>
      </div>
    ))}
  </div>
)}
```
`downloadText` ヘルパーは KeyConverter.tsx と同形（Blob + a.click）をコンポーネント内に定義。

- [ ] **Step 6: レガシー暗号バナー**

`status === 'unsupported'` のとき:
```tsx
{decodeState.status === 'unsupported' && (
  <NotificationBanner variant="warning" title="この PKCS#12 はブラウザで復号できません（レガシー暗号）">
    {decodeState.reason}
  </NotificationBanner>
)}
```
既存の `decodeState.status === 'pkcs12'` バナーブロックは削除する（パスワード UI に置換済みのため）。

- [ ] **Step 7: 型チェック＋ビルド**

Run: `node_modules/.bin/astro check && npm run build`
Expected: 型エラー・ビルドエラーなし

- [ ] **Step 8: 目視確認（PC/スマホ）**

`npm run dev` で `/tools/cert-decoder` を開き、.p12 ファイル選択 → パスワード入力 → 証明書チェーン＋秘密鍵セクション表示を PC(1280x800)/スマホ(390x844) で確認。フォーカスリング・タップ領域・縦並び切替を点検（`.agents/rules/ui-conventions.md` 3.1）。

- [ ] **Step 9: コミット**

```bash
git add src/components/tools/CertDecoder.tsx
git commit -m "feat: cert-decoder に PKCS#12 パスワード入力・秘密鍵表示 UI を追加 (#644)"
```

---

### Task 8: E2E テストの追加

**Files:**
- 確認/Modify: `tests/e2e/` 配下の cert-decoder 関連 spec（存在すれば追記、なければ最小限の新規 spec）

- [ ] **Step 1: 既存 cert-decoder E2E を確認**

Run: `ls tests/e2e | grep -i cert`
既存があれば、PKCS#12 用に「パスワード欄が表示される」「誤パスワードでエラー」「正パスワードで証明書＋秘密鍵セクション表示」の最小ケースを追記する。fixture .p12 はテスト内で base64（`PKCS12_RSA_BASE64`）から Blob 化してファイル input に `setInputFiles` する（Playwright の `setInputFiles({ name, mimeType, buffer })`）。ロケーターは `getByRole`/`getByLabel` を使う（`.agents/rules/ui-conventions.md` 3.3）。

- [ ] **Step 2: E2E 実行**

Run: `npm run test:e2e -- cert`
Expected: 追加ケース PASS

- [ ] **Step 3: コミット**

```bash
git add tests/e2e
git commit -m "test: cert-decoder PKCS#12 の E2E ケースを追加 (#644)"
```

> 既存 E2E に cert-decoder spec が無く、新規作成のコストが高い場合は、本タスクをスキップせず「E2E 基盤の有無を確認した結果」を完了報告に明記する。ユニット（Task 4/5）が検知ロジックの主担保。

---

### Task 9: ドキュメント更新

**Files:**
- Modify: `docs/decisions.md` / `docs/tools.md` / `README.md` / `SPEC.md`

- [ ] **Step 1: decisions.md に追記**

新 decision（例: `[113]`、番号は末尾の最新+1 を確認）を追記:「cert-decoder PKCS#12 対応 — PBES2/AES 限定、秘密鍵はトグル開示、node-forge 不採用継続」。`[111]` の「PKCS#12 はスコープ外」記述に「#644 で対応（PBES2/AES 限定）」の相互参照を 1 行追記。

- [ ] **Step 2: tools.md / README.md / SPEC.md**

- `docs/tools.md` cert-decoder 節に PKCS#12 対応・暗号方式制限（PBES2/AES のみ）・秘密鍵の扱い（トグル開示・browser-only）を追記。
- `README.md` と `SPEC.md` の cert-decoder の対応形式表記に「PKCS#12（.pfx/.p12）」を追加。description にも反映するか検討（slug/name は不変）。

- [ ] **Step 3: 整合性メタテスト**

Run: `npm run test`
Expected: `tests/meta/` のドキュメント整合性テストを含め全 PASS

- [ ] **Step 4: コミット**

```bash
git add docs/decisions.md docs/tools.md README.md SPEC.md
git commit -m "docs: cert-decoder PKCS#12 対応をドキュメントに反映 (#644)"
```

---

### Task 10: 最終検証

- [ ] **Step 1: 全チェック（push 前必須）**

Run:
```bash
npm run test && node_modules/.bin/astro check && npm run test:e2e
```
Expected: ユニット・型・E2E すべて PASS

- [ ] **Step 2: 差分確認**

Run: `git diff origin/develop --stat`
`package.json` を変更していないこと（新規依存なし＝lock 同期不要）を確認。

- [ ] **Step 3: push & PR**（subagent ではなく親が実行）

develop 起点・squash マージ前提で PR を作成（`docs/playbooks/pr-creation.md` 準拠）。

---

## Self-Review

- **spec 1（パスワード UI）** → Task 7 Step 4。
- **spec 2（証明書抽出・既存パイプライン再利用）** → Task 2（parseDerCertificates）＋ Task 5（certs 抽出）＋ Task 7 Step 4（parseDerCertificates→buildChain）。
- **spec 3（秘密鍵メタ常時／PEM トグル開示／browser-only バナー）** → Task 5（buildKeyInfo）＋ Task 7 Step 5。
- **spec 4（PBES2/AES 限定・レガシー案内）** → Task 5（unsupported-encryption 分岐）＋ Task 7 Step 6。
- **spec 5（入力: ファイル主＋base64 貼付）** → Task 7 Step 2/3 ＋ `looksLikePkcs12`（Task 5）。
- **test-gates（陽性対照）** → Task 4 の「陽性対照」describe（wrong-password / parse-error / unsupported-encryption）。
- **ドキュメント** → Task 9。
- 型整合: `Pkcs12Result.errorKind` の値（`wrong-password`/`unsupported-encryption`/`parse-error`）は Task 1 定義・Task 4 テスト・Task 5 実装・Task 7 UI 分岐で一致。`parseDerCertificates` の呼び名は Task 2/6/7 で一致。
- プレースホルダなし。pkijs API は実機スパイクで検証済み。
