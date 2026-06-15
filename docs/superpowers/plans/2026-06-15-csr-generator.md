# csr-generator（CSR・鍵ペアジェネレータ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザ内で RSA/ECDSA 鍵ペアを生成し PKCS#10 CSR を出力（秘密鍵は非送信）、加えて既存 CSR を解析するツール `csr-generator` を追加する。

**Architecture:** ロジックを `src/utils/csr/`（types / generate / parse / index）に分離し、UI を `src/components/tools/CsrGenerator.tsx` に置く。pkijs の Web Crypto エンジンは既存 `src/utils/cert/engine.ts` の `ensureCryptoEngine()` を再利用する。`cert-decoder` / `key-converter` と同一の実装パターンに従う。

**Tech Stack:** TypeScript / React 19 / Astro 6 / pkijs 3.4.0 / asn1js 3.0.10 / Web Crypto API / Vitest / Playwright

---

## 設計参照

正本仕様: `docs/superpowers/specs/2026-06-15-csr-generator-design.md`

## 事前ルール（実装前に必ず読む）

- `.agents/rules/common.md`（コミット規約=Conventional Commits 日本語 / ドキュメント更新 / test-gates）
- `.agents/rules/ui-conventions.md`（共通 UI コンポーネント / primitive Tailwind カラー禁止）
- test-gates skill（解析モードの署名検証は validator のため陽性対照必須）

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/utils/csr/types.ts`（新規） | 型定義（KeyAlgorithm / SubjectDn / SanEntry / GenerateParams / GenerateResult / CsrParseResult） |
| `src/utils/csr/generate.ts`（新規） | 鍵生成 + CSR 構築 + PEM 出力 |
| `src/utils/csr/parse.ts`（新規） | 既存 CSR の解析 + 署名検証 |
| `src/utils/csr/index.ts`（新規） | re-export |
| `src/components/tools/csrGeneratorSample.ts`（新規） | 解析モード用サンプル CSR |
| `src/components/tools/CsrGenerator.tsx`（新規） | UI（生成/解析モード切替） |
| `src/pages/tools/csr-generator.astro`（新規） | ルーティング |
| `src/utils/__tests__/csr-generate.test.ts`（新規） | generate ユニットテスト |
| `src/utils/__tests__/csr-parse.test.ts`（新規） | parse ユニットテスト（陽性対照含む） |
| `tests/e2e/csr-generator.spec.ts`（新規） | E2E |
| `src/data/tools.ts`（変更） | toolEntries にエントリ追加 |
| `tests/e2e/visual-regression-pages.ts`（変更） | PAGES に `/tools/csr-generator` 追加 |
| `README.md` / `SPEC.md` / `docs/decisions.md` / `docs/tools.md` / `docs/tool-candidates.md`（変更） | ドキュメント更新 |

---

## Task 1: 型定義（`src/utils/csr/types.ts`）

**Files:**
- Create: `src/utils/csr/types.ts`

- [ ] **Step 1: 型を定義する**

```typescript
// src/utils/csr/types.ts

/** 鍵アルゴリズム種別 */
export type KeyAlgorithm = 'RSA' | 'ECDSA';

/** RSA 鍵長（bit） */
export type RsaModulusLength = 2048 | 3072 | 4096;

/** ECDSA 曲線 */
export type EcCurve = 'P-256' | 'P-384' | 'P-521';

/** Subject DN（識別名）。各フィールドは空文字なら CSR に含めない。 */
export interface SubjectDn {
  /** commonName (CN) */
  commonName: string;
  /** organizationName (O) */
  organization: string;
  /** organizationalUnitName (OU) */
  organizationalUnit: string;
  /** countryName (C) — 2 文字の国コード */
  country: string;
  /** stateOrProvinceName (ST) */
  state: string;
  /** localityName (L) */
  locality: string;
  /** emailAddress */
  email: string;
}

/** SAN（Subject Alternative Name）1 件 */
export interface SanEntry {
  type: 'dns' | 'ip' | 'email';
  value: string;
}

/** CSR 生成パラメータ */
export interface GenerateParams {
  algorithm: KeyAlgorithm;
  /** algorithm==='RSA' のとき有効 */
  rsaModulusLength: RsaModulusLength;
  /** algorithm==='ECDSA' のとき有効 */
  ecCurve: EcCurve;
  subject: SubjectDn;
  san: SanEntry[];
}

/** CSR 生成結果 */
export interface GenerateResult {
  /** CSR の PEM（-----BEGIN CERTIFICATE REQUEST-----） */
  csrPem: string;
  /** 秘密鍵の PKCS#8 PEM（-----BEGIN PRIVATE KEY-----） */
  privateKeyPem: string;
}

/** 解析した CSR の公開鍵情報 */
export interface CsrPublicKeyInfo {
  algorithm: string; // 'RSA' | 'EC' | OID
  keySizeBits?: number;
  namedCurve?: string;
}

/** 既存 CSR の解析結果 */
export interface CsrParseResult {
  /** RFC4514 風の Subject 文字列（例: "CN=example.test, O=Test"） */
  subjectFull: string;
  /** 主要 RDN を個別に */
  subjectAttributes: { type: string; value: string }[];
  /** SAN（例: ['DNS:example.test', 'IP:10.0.0.1']） */
  san: string[];
  publicKey: CsrPublicKeyInfo;
  /** 署名アルゴリズム（人間可読名 or OID） */
  signatureAlgorithm: string;
  /** 署名自己検証の結果（true=整合 / false=不整合 / null=検証不能） */
  signatureValid: boolean | null;
  /** パース失敗時の理由（成功時は undefined） */
  error?: string;
}
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check --filter src/utils/csr/types.ts` （または全体 `node_modules/.bin/astro check`）
Expected: csr/types.ts に型エラーなし（他ファイル未作成による参照エラーはこの時点では無視）

- [ ] **Step 3: コミット**

```bash
git add src/utils/csr/types.ts
git commit -m "feat: csr-generator の型定義を追加"
```

---

## Task 2: CSR 生成ロジック（`src/utils/csr/generate.ts`）

**Files:**
- Create: `src/utils/csr/generate.ts`
- Test: `src/utils/__tests__/csr-generate.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// src/utils/__tests__/csr-generate.test.ts
/**
 * csr-generate.test.ts
 *
 * generateCsr のユニットテスト（陰性対照=正常系の round-trip）。
 * 生成した CSR が pkijs で再パースでき、Subject/SAN がラウンドトリップすること、
 * 秘密鍵 PEM が Web Crypto で再 import できることを検証する。
 */
import { describe, it, expect } from 'vitest';
import * as asn1js from 'asn1js';
import { CertificationRequest } from 'pkijs';
import { generateCsr } from '@/utils/csr/generate';
import type { GenerateParams } from '@/utils/csr/types';

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const baseParams: GenerateParams = {
  algorithm: 'RSA',
  rsaModulusLength: 2048,
  ecCurve: 'P-256',
  subject: {
    commonName: 'example.test',
    organization: 'Test Org',
    organizationalUnit: '',
    country: 'JP',
    state: '',
    locality: '',
    email: '',
  },
  san: [{ type: 'dns', value: 'www.example.test' }],
};

describe('generateCsr（陰性対照: 正常系 round-trip）', () => {
  it('RSA-2048 で生成した CSR は pkijs で再パースでき Subject/SAN がラウンドトリップする', async () => {
    const result = await generateCsr(baseParams);
    expect(result.csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    expect(result.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');

    const asn1 = asn1js.fromBER(pemToDer(result.csrPem));
    const pkcs10 = new CertificationRequest({ schema: asn1.result });
    const cn = pkcs10.subject.typesAndValues.find((tv) => tv.type === '2.5.4.3');
    expect(cn?.value.valueBlock.value).toBe('example.test');
    // 署名が自己整合
    await expect(pkcs10.verify()).resolves.toBe(true);
  });

  it('ECDSA P-256 でも CSR を生成でき署名が自己整合する', async () => {
    const result = await generateCsr({ ...baseParams, algorithm: 'ECDSA' });
    const asn1 = asn1js.fromBER(pemToDer(result.csrPem));
    const pkcs10 = new CertificationRequest({ schema: asn1.result });
    await expect(pkcs10.verify()).resolves.toBe(true);
  });

  it('生成した秘密鍵 PEM は Web Crypto で再 import できる', async () => {
    const result = await generateCsr(baseParams);
    const der = pemToDer(result.privateKeyPem);
    await expect(
      crypto.subtle.importKey(
        'pkcs8',
        der,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['sign']
      )
    ).resolves.toBeDefined();
  });

  it('CN も SAN も空なら例外を投げる', async () => {
    await expect(
      generateCsr({
        ...baseParams,
        subject: { ...baseParams.subject, commonName: '' },
        san: [],
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `npm run test -- csr-generate`
Expected: FAIL（`generateCsr` 未定義 / モジュール解決エラー）

- [ ] **Step 3: 最小実装を書く**

```typescript
// src/utils/csr/generate.ts
/**
 * csr/generate.ts
 *
 * Web Crypto で鍵ペアを生成し、pkijs で PKCS#10 CSR を構築する。
 * 全処理がブラウザ内で完結する（秘密鍵を外部送信しない）。
 */
import * as asn1js from 'asn1js';
import {
  CertificationRequest,
  AttributeTypeAndValue,
  Attribute,
  Extension,
  Extensions,
  GeneralName,
  GeneralNames,
} from 'pkijs';
import { ensureCryptoEngine } from '@/utils/cert/engine';
import type { GenerateParams, GenerateResult, SubjectDn, SanEntry } from './types';

// Subject DN フィールド → OID（push 順は CN→O→OU→C→ST→L→email）
const DN_OID = {
  commonName: '2.5.4.3',
  organization: '2.5.4.10',
  organizationalUnit: '2.5.4.11',
  country: '2.5.4.6',
  state: '2.5.4.8',
  locality: '2.5.4.7',
  email: '1.2.840.113549.1.9.1',
} as const;

const DN_ORDER: (keyof SubjectDn)[] = [
  'commonName',
  'organization',
  'organizationalUnit',
  'country',
  'state',
  'locality',
  'email',
];

/** DN フィールドの ASN.1 文字種を返す（countryName=Printable, email=IA5, それ以外=UTF8） */
function dnAsn1Value(field: keyof SubjectDn, value: string): asn1js.BaseBlock {
  if (field === 'country') return new asn1js.PrintableString({ value });
  if (field === 'email') return new asn1js.IA5String({ value });
  return new asn1js.Utf8String({ value });
}

/** Uint8Array を 64 文字折返し PEM テキストに変換する */
function derToPem(der: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(der);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** ドット表記 IPv4 を 4 オクテットの Uint8Array に変換する（不正なら null） */
function ipv4ToOctets(value: string): Uint8Array | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;
  const octets = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets[i] = n;
  }
  return octets;
}

/** SAN エントリ群を pkijs GeneralNames に変換する */
function buildGeneralNames(san: SanEntry[]): GeneralNames {
  const names: GeneralName[] = [];
  for (const entry of san) {
    const v = entry.value.trim();
    if (!v) continue;
    if (entry.type === 'dns') {
      names.push(new GeneralName({ type: 2, value: v }));
    } else if (entry.type === 'email') {
      names.push(new GeneralName({ type: 1, value: v }));
    } else if (entry.type === 'ip') {
      const octets = ipv4ToOctets(v);
      if (octets) {
        names.push(
          new GeneralName({
            type: 7,
            value: new asn1js.OctetString({ valueHex: octets.buffer }),
          })
        );
      }
    }
  }
  return new GeneralNames({ names });
}

/** ECDSA 曲線に対応するハッシュアルゴリズム */
function ecHash(curve: GenerateParams['ecCurve']): string {
  if (curve === 'P-384') return 'SHA-384';
  if (curve === 'P-521') return 'SHA-512';
  return 'SHA-256';
}

/**
 * 鍵ペアを生成して PKCS#10 CSR を構築する。
 * CN も SAN も空の場合はエラーを投げる。
 */
export async function generateCsr(params: GenerateParams): Promise<GenerateResult> {
  ensureCryptoEngine();

  const hasSubject = DN_ORDER.some((f) => params.subject[f].trim() !== '');
  const hasSan = params.san.some((e) => e.value.trim() !== '');
  if (!params.subject.commonName.trim() && !hasSan) {
    throw new Error('CN（コモンネーム）または SAN を1つ以上入力してください。');
  }
  if (!hasSubject && !hasSan) {
    throw new Error('Subject または SAN を1つ以上入力してください。');
  }

  // 1. 鍵ペア生成
  const usages: KeyUsage[] = ['sign', 'verify'];
  let keyPair: CryptoKeyPair;
  let hashAlg: string;
  if (params.algorithm === 'RSA') {
    hashAlg = 'SHA-256';
    keyPair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: params.rsaModulusLength,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: hashAlg,
      },
      true,
      usages
    )) as CryptoKeyPair;
  } else {
    hashAlg = ecHash(params.ecCurve);
    keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: params.ecCurve },
      true,
      usages
    )) as CryptoKeyPair;
  }

  // 2. CSR 構築
  const pkcs10 = new CertificationRequest();
  pkcs10.version = 0;

  for (const field of DN_ORDER) {
    const value = params.subject[field].trim();
    if (!value) continue;
    pkcs10.subject.typesAndValues.push(
      new AttributeTypeAndValue({
        type: DN_OID[field],
        value: dnAsn1Value(field, value),
      })
    );
  }

  await pkcs10.subjectPublicKeyInfo.importKey(keyPair.publicKey);

  // 3. SAN を extensionRequest 属性として追加
  if (hasSan) {
    const altNames = buildGeneralNames(params.san);
    pkcs10.attributes = [
      new Attribute({
        type: '1.2.840.113549.1.9.14', // pkcs-9-at-extensionRequest
        values: [
          new Extensions({
            extensions: [
              new Extension({
                extnID: '2.5.29.17', // id-ce-subjectAltName
                critical: false,
                extnValue: altNames.toSchema().toBER(false),
              }),
            ],
          }).toSchema(),
        ],
      }),
    ];
  }

  // 4. 署名
  await pkcs10.sign(keyPair.privateKey, hashAlg);

  // 5. PEM 出力
  const csrDer = pkcs10.toSchema(true).toBER(false);
  const csrPem = derToPem(csrDer, 'CERTIFICATE REQUEST');

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyPem = derToPem(pkcs8, 'PRIVATE KEY');

  return { csrPem, privateKeyPem };
}
```

- [ ] **Step 4: テストを実行し PASS を確認**

Run: `npm run test -- csr-generate`
Expected: PASS（4 ケース）。万一 SAN IP/email の round-trip で問題が出たら GeneralName の type 値・OctetString の渡し方を見直す（DNS は最も確実なので最低限 DNS round-trip を担保する）。

- [ ] **Step 5: コミット**

```bash
git add src/utils/csr/generate.ts src/utils/__tests__/csr-generate.test.ts
git commit -m "feat: csr-generator の CSR 生成ロジックを追加"
```

---

## Task 3: CSR 解析ロジック（`src/utils/csr/parse.ts`）+ test-gates 陽性対照

**Files:**
- Create: `src/utils/csr/parse.ts`
- Test: `src/utils/__tests__/csr-parse.test.ts`

> **test-gates 必須**: 解析モードの署名検証は「改竄を検出する validator」。陰性対照（正常 CSR が verify=true）だけでは「常に true を返す空回り実装」と区別不能。**陽性対照（署名を改竄した CSR は verify=false）を別 describe で必ず併設**する。

- [ ] **Step 1: 失敗するテストを書く（陰性対照 + 陽性対照）**

```typescript
// src/utils/__tests__/csr-parse.test.ts
/**
 * csr-parse.test.ts
 *
 * parseCsr のユニットテスト。
 *   - 陰性対照: 正常 CSR から Subject/SAN/公開鍵/署名アルゴリズムを抽出、verify=true
 *   - 陽性対照（test-gates）: 署名を改竄した CSR は signatureValid=false を返す
 *     ※「常に true を返す空回り検証」だとこのテストが fail する設計
 */
import { describe, it, expect } from 'vitest';
import { generateCsr } from '@/utils/csr/generate';
import { parseCsr } from '@/utils/csr/parse';

async function makeValidCsrPem(): Promise<string> {
  const r = await generateCsr({
    algorithm: 'RSA',
    rsaModulusLength: 2048,
    ecCurve: 'P-256',
    subject: {
      commonName: 'parse.example.test',
      organization: 'ParseOrg',
      organizationalUnit: '',
      country: 'JP',
      state: '',
      locality: '',
      email: '',
    },
    san: [{ type: 'dns', value: 'alt.example.test' }],
  });
  return r.csrPem;
}

describe('parseCsr（陰性対照: 正常系）', () => {
  it('正常 CSR から Subject/SAN/公開鍵を抽出し署名検証が true', async () => {
    const pem = await makeValidCsrPem();
    const result = await parseCsr(pem);
    expect(result.error).toBeUndefined();
    expect(result.subjectAttributes.find((a) => a.type === 'CN')?.value).toBe(
      'parse.example.test'
    );
    expect(result.san).toContain('DNS:alt.example.test');
    expect(result.publicKey.algorithm).toBe('RSA');
    expect(result.publicKey.keySizeBits).toBe(2048);
    expect(result.signatureValid).toBe(true);
  });

  it('CSR でない入力は error を返す', async () => {
    const result = await parseCsr('not a csr');
    expect(result.error).toBeDefined();
  });
});

describe('parseCsr（陽性対照: 改竄検出 / test-gates）', () => {
  it('署名値を改竄した CSR は signatureValid=false を返す', async () => {
    const pem = await makeValidCsrPem();
    // PEM 本文の base64 を 1 文字書き換えて署名を破壊する。
    // 末尾付近（署名ビット列に当たりやすい）の英大文字を別の文字に変える。
    const lines = pem.split('\n');
    const bodyEnd = lines.length - 2; // 最終行（END 行の1つ前）
    const line = lines[bodyEnd];
    // base64 の途中文字を反転（A<->B 等）して確実に別バイトにする
    const idx = Math.floor(line.length / 2);
    const c = line[idx];
    const swapped = c === 'A' ? 'B' : 'A';
    lines[bodyEnd] = line.slice(0, idx) + swapped + line.slice(idx + 1);
    const tampered = lines.join('\n');

    const result = await parseCsr(tampered);
    // パース自体は通り得るが、署名検証は不整合になる
    expect(result.signatureValid).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `npm run test -- csr-parse`
Expected: FAIL（`parseCsr` 未定義）

- [ ] **Step 3: 最小実装を書く**

```typescript
// src/utils/csr/parse.ts
/**
 * csr/parse.ts
 *
 * 既存 CSR（PEM / DER）を解析し Subject/SAN/公開鍵/署名アルゴリズムを抽出する。
 * 署名自己整合性を verify() で検証する（改竄検出）。
 */
import * as asn1js from 'asn1js';
import { CertificationRequest, Extensions, GeneralNames, RSAPublicKey } from 'pkijs';
import { ensureCryptoEngine } from '@/utils/cert/engine';
import { formatIpAddress } from '@/utils/cert/parse';
import type { CsrParseResult, CsrPublicKeyInfo } from './types';

const MAX_INPUT_LENGTH = 1024 * 1024;

const OID_TO_SHORT: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '1.2.840.113549.1.9.1': 'emailAddress',
};

const SIG_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
};

const PUBKEY_ALG_OID: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.10045.2.1': 'EC',
};

const EC_NAMED_CURVE_OID: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

const GENERAL_NAME_PREFIX: Record<number, string> = {
  1: 'email',
  2: 'DNS',
  6: 'URI',
  7: 'IP',
};

/** PEM / Base64 / DER 入力を DER ArrayBuffer に正規化する */
function toDer(input: string): ArrayBuffer {
  const pemMatch = input.match(
    /-----BEGIN CERTIFICATE REQUEST-----([\s\S]+?)-----END CERTIFICATE REQUEST-----/
  );
  const b64 = (pemMatch ? pemMatch[1] : input).replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function parsePublicKeyInfo(pkcs10: CertificationRequest): CsrPublicKeyInfo {
  const algorithmId = pkcs10.subjectPublicKeyInfo.algorithm.algorithmId;
  const algName = PUBKEY_ALG_OID[algorithmId] ?? algorithmId;
  const info: CsrPublicKeyInfo = { algorithm: algName };

  if (algName === 'EC') {
    try {
      const params = pkcs10.subjectPublicKeyInfo.algorithm.algorithmParams as
        | { valueBlock?: { toString?: () => string } }
        | undefined;
      if (params?.valueBlock?.toString) {
        const curveOid = params.valueBlock.toString();
        info.namedCurve = EC_NAMED_CURVE_OID[curveOid] ?? curveOid;
      }
    } catch {
      /* パラメータなし */
    }
  } else if (algName === 'RSA') {
    try {
      const spkView = pkcs10.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
      const buf = spkView.buffer.slice(
        spkView.byteOffset,
        spkView.byteOffset + spkView.byteLength
      ) as ArrayBuffer;
      const asn1 = asn1js.fromBER(buf);
      if (asn1.offset !== -1) {
        const rsaPub = new RSAPublicKey({ schema: asn1.result });
        const modulus = rsaPub.modulus.valueBlock.valueHexView;
        const modulusBytes =
          modulus.length > 0 && modulus[0] === 0x00 ? modulus.length - 1 : modulus.length;
        if (modulusBytes > 0) info.keySizeBits = modulusBytes * 8;
      }
    } catch {
      /* best-effort */
    }
  }
  return info;
}

function parseSan(pkcs10: CertificationRequest): string[] {
  const san: string[] = [];
  const extAttr = pkcs10.attributes?.find((a) => a.type === '1.2.840.113549.1.9.14');
  if (!extAttr || extAttr.values.length === 0) return san;
  try {
    const extensions = new Extensions({ schema: extAttr.values[0] });
    const sanExt = extensions.extensions.find((e) => e.extnID === '2.5.29.17');
    if (!sanExt) return san;
    const asn1 = asn1js.fromBER(sanExt.extnValue.valueBlock.valueHexView.slice().buffer);
    const gns = new GeneralNames({ schema: asn1.result });
    for (const gn of gns.names) {
      const prefix = GENERAL_NAME_PREFIX[gn.type];
      if (!prefix) continue;
      let val = '';
      if (gn.type === 7 && gn.value instanceof asn1js.OctetString) {
        const ipBytes = (gn.value as unknown as { valueBlock: { valueHexView: Uint8Array } })
          .valueBlock.valueHexView;
        val = formatIpAddress(ipBytes);
      } else if (typeof gn.value === 'string') {
        val = gn.value;
      } else {
        val = String(gn.value);
      }
      san.push(`${prefix}:${val}`);
    }
  } catch {
    /* SAN 抽出失敗は無視 */
  }
  return san;
}

/** 既存 CSR を解析する。パース失敗時は error フィールド付きで返す（throw しない）。 */
export async function parseCsr(input: string): Promise<CsrParseResult> {
  const empty: CsrParseResult = {
    subjectFull: '',
    subjectAttributes: [],
    san: [],
    publicKey: { algorithm: '' },
    signatureAlgorithm: '',
    signatureValid: null,
  };

  if (!input.trim()) return { ...empty, error: 'CSR を入力してください。' };
  if (input.length > MAX_INPUT_LENGTH) {
    return { ...empty, error: '入力が大きすぎます（最大 1 MiB）。' };
  }

  ensureCryptoEngine();

  let pkcs10: CertificationRequest;
  try {
    const der = toDer(input);
    const asn1 = asn1js.fromBER(der);
    if (asn1.offset === -1) throw new Error('ASN.1 のデコードに失敗しました。');
    pkcs10 = new CertificationRequest({ schema: asn1.result });
  } catch {
    return {
      ...empty,
      error: 'CSR の解析に失敗しました。PEM（CERTIFICATE REQUEST）または DER の Base64 を入力してください。',
    };
  }

  const subjectAttributes = pkcs10.subject.typesAndValues.map((tv) => ({
    type: OID_TO_SHORT[tv.type] ?? tv.type,
    value: String(tv.value.valueBlock.value),
  }));
  const subjectFull = subjectAttributes.map((a) => `${a.type}=${a.value}`).join(', ');

  const sigOid = pkcs10.signatureAlgorithm.algorithmId;
  const signatureAlgorithm = SIG_ALG_OID[sigOid] ?? sigOid;

  let signatureValid: boolean | null;
  try {
    signatureValid = await pkcs10.verify();
  } catch {
    signatureValid = false;
  }

  return {
    subjectFull,
    subjectAttributes,
    san: parseSan(pkcs10),
    publicKey: parsePublicKeyInfo(pkcs10),
    signatureAlgorithm,
    signatureValid,
  };
}
```

- [ ] **Step 4: テストを実行し PASS を確認**

Run: `npm run test -- csr-parse`
Expected: PASS（陰性対照 2 + 陽性対照 1）。陽性対照が PASS することで「改竄を検出できる」ことが担保される。万一 verify が改竄で throw する場合は catch で false を返す実装になっているため signatureValid=false となる。

- [ ] **Step 5: test-gates 確認（陽性対照の有効性）**

陽性対照テストが「常に true を返す空回り実装」を fail させられることを一度だけ手動確認する: `parseCsr` の `signatureValid = await pkcs10.verify();` を一時的に `signatureValid = true;` に書き換えて `npm run test -- csr-parse` を実行 → 陽性対照が **FAIL** することを確認 → 元に戻す。確認後コミット。

- [ ] **Step 6: コミット**

```bash
git add src/utils/csr/parse.ts src/utils/__tests__/csr-parse.test.ts
git commit -m "test: csr-generator の CSR 解析ロジックと署名検証の陽性対照を追加"
```

---

## Task 4: re-export（`src/utils/csr/index.ts`）

**Files:**
- Create: `src/utils/csr/index.ts`

- [ ] **Step 1: index を書く**

```typescript
// src/utils/csr/index.ts
export { generateCsr } from './generate';
export { parseCsr } from './parse';
export type * from './types';
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: csr ディレクトリに型エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/utils/csr/index.ts
git commit -m "feat: csr-generator の utils re-export を追加"
```

---

## Task 5: サンプル CSR（`src/components/tools/csrGeneratorSample.ts`）

**Files:**
- Create: `src/components/tools/csrGeneratorSample.ts`

- [ ] **Step 1: サンプルを生成する**

実装後に `generateCsr` を一度実行して固定 PEM を埋め込む。手順:

```bash
node --input-type=module -e "
import('./src/utils/csr/generate.ts').then(async () => {});
" 2>/dev/null || true
```

> 上記の ad-hoc 実行が難しい場合は、テスト内で一時的に `console.log(result.csrPem)` を出して取得するか、`csr-generate.test.ts` に `it.only` で出力するケースを足して取得し、取得後に削除する。

取得した PEM を以下のファイルに固定値として埋め込む（例の構造）:

```typescript
// src/components/tools/csrGeneratorSample.ts
/** 解析モード用のサンプル CSR（CN=sample.example.jp, SAN=DNS:sample.example.jp）。 */
export const SAMPLE_CSR = `-----BEGIN CERTIFICATE REQUEST-----
（generateCsr で生成した実 PEM をここに貼る）
-----END CERTIFICATE REQUEST-----`;
```

- [ ] **Step 2: サンプルが解析できることをテストで確認（一時）**

`src/utils/__tests__/csr-parse.test.ts` に一時的に SAMPLE_CSR の parse が error なしになることを確認しても良い（恒久化は任意。サンプルが壊れていない保証になる）。

```typescript
import { SAMPLE_CSR } from '@/components/tools/csrGeneratorSample';
it('同梱サンプル CSR は error なく解析できる', async () => {
  const r = await parseCsr(SAMPLE_CSR);
  expect(r.error).toBeUndefined();
  expect(r.signatureValid).toBe(true);
});
```

Run: `npm run test -- csr-parse`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/csrGeneratorSample.ts src/utils/__tests__/csr-parse.test.ts
git commit -m "feat: csr-generator の解析モード用サンプル CSR を追加"
```

---

## Task 6: UI コンポーネント（`src/components/tools/CsrGenerator.tsx`）

**Files:**
- Create: `src/components/tools/CsrGenerator.tsx`

参照する共通コンポーネント: `ToggleGroup` / `InputField` / `OutputField` / `ActionButton` / `DownloadButton` / `FileInputButton` / `ErrorMessage` / `NotificationBanner` / `ChipLabel`。スタイルは primitive Tailwind カラー禁止・semantic class のみ（common.md 7章 / ui-conventions.md）。

- [ ] **Step 1: コンポーネントを実装する**

```tsx
// src/components/tools/CsrGenerator.tsx
import { useState, useCallback } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { generateCsr } from '@/utils/csr/generate';
import { parseCsr } from '@/utils/csr/parse';
import type {
  GenerateParams,
  GenerateResult,
  CsrParseResult,
  SubjectDn,
  SanEntry,
  KeyAlgorithm,
} from '@/utils/csr/types';
import { SAMPLE_CSR } from './csrGeneratorSample';

type Mode = 'generate' | 'parse';

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/x-pem-file' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_SUBJECT: SubjectDn = {
  commonName: '',
  organization: '',
  organizationalUnit: '',
  country: '',
  state: '',
  locality: '',
  email: '',
};

const SUBJECT_FIELDS: { key: keyof SubjectDn; label: string; placeholder?: string }[] = [
  { key: 'commonName', label: 'CN（コモンネーム）', placeholder: 'example.jp' },
  { key: 'organization', label: 'O（組織名）' },
  { key: 'organizationalUnit', label: 'OU（部門名）' },
  { key: 'country', label: 'C（国コード・2文字）', placeholder: 'JP' },
  { key: 'state', label: 'ST（都道府県）' },
  { key: 'locality', label: 'L（市区町村）' },
  { key: 'email', label: 'emailAddress' },
];

export function CsrGenerator() {
  const [mode, setMode] = useState<Mode>('generate');

  // --- 生成モードの状態 ---
  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('RSA');
  const [rsaBits, setRsaBits] = useState<GenerateParams['rsaModulusLength']>(2048);
  const [ecCurve, setEcCurve] = useState<GenerateParams['ecCurve']>('P-256');
  const [subject, setSubject] = useState<SubjectDn>(EMPTY_SUBJECT);
  const [san, setSan] = useState<SanEntry[]>([{ type: 'dns', value: '' }]);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // --- 解析モードの状態 ---
  const [parseInput, setParseInput] = useState('');
  const [parseResult, setParseResult] = useState<CsrParseResult | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    // モード切替で入力・結果をリセット（操作種別が変わるため。ui-conventions.md 2.4）
    setGenResult(null);
    setGenError(null);
    setParseResult(null);
    setParseInput('');
  };

  const canGenerate =
    subject.commonName.trim() !== '' || san.some((e) => e.value.trim() !== '');

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    setGenResult(null);
    try {
      const params: GenerateParams = {
        algorithm,
        rsaModulusLength: rsaBits,
        ecCurve,
        subject,
        san: san.filter((e) => e.value.trim() !== ''),
      };
      const result = await generateCsr(params);
      setGenResult(result);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '生成中にエラーが発生しました。');
    } finally {
      setGenerating(false);
    }
  }, [algorithm, rsaBits, ecCurve, subject, san]);

  const handleParse = useCallback(async (text: string) => {
    setParseInput(text);
    if (!text.trim()) {
      setParseResult(null);
      return;
    }
    const result = await parseCsr(text);
    setParseResult(result);
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await handleParse(text);
      e.target.value = '';
    },
    [handleParse]
  );

  const updateSan = (index: number, patch: Partial<SanEntry>) => {
    setSan((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  return (
    <div className="space-y-6">
      {/* モード切替 */}
      <ToggleGroup<Mode>
        ariaLabel="動作モード"
        options={[
          { value: 'generate', label: 'CSR を生成' },
          { value: 'parse', label: '既存 CSR を解析' },
        ]}
        value={mode}
        onChange={switchMode}
      />

      {mode === 'generate' && (
        <div className="space-y-5">
          {/* アルゴリズム選択 */}
          <div className="space-y-2">
            <span className="caption font-semibold">鍵アルゴリズム</span>
            <ToggleGroup<KeyAlgorithm>
              ariaLabel="鍵アルゴリズム"
              layout="wrap"
              options={[
                { value: 'RSA', label: 'RSA' },
                { value: 'ECDSA', label: 'ECDSA' },
              ]}
              value={algorithm}
              onChange={setAlgorithm}
            />
            {algorithm === 'RSA' ? (
              <ToggleGroup<string>
                ariaLabel="RSA 鍵長"
                layout="wrap"
                options={[
                  { value: '2048', label: '2048 bit' },
                  { value: '3072', label: '3072 bit' },
                  { value: '4096', label: '4096 bit' },
                ]}
                value={String(rsaBits)}
                onChange={(v) => setRsaBits(Number(v) as GenerateParams['rsaModulusLength'])}
              />
            ) : (
              <ToggleGroup<GenerateParams['ecCurve']>
                ariaLabel="ECDSA 曲線"
                layout="wrap"
                options={[
                  { value: 'P-256', label: 'P-256' },
                  { value: 'P-384', label: 'P-384' },
                  { value: 'P-521', label: 'P-521' },
                ]}
                value={ecCurve}
                onChange={setEcCurve}
              />
            )}
          </div>

          {/* Subject DN */}
          <div className="grid gap-3 md:grid-cols-2">
            {SUBJECT_FIELDS.map((f) => (
              <InputField
                key={f.key}
                id={`csr-subject-${f.key}`}
                label={f.label}
                value={subject[f.key]}
                onChange={(v) => setSubject((prev) => ({ ...prev, [f.key]: v }))}
                placeholder={f.placeholder}
                maxLength={f.key === 'country' ? 2 : undefined}
              />
            ))}
          </div>

          {/* SAN */}
          <fieldset className="space-y-2">
            <legend className="caption font-semibold">SAN（Subject Alternative Name）</legend>
            {san.map((entry, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <ToggleGroup<SanEntry['type']>
                  ariaLabel="SAN 種別"
                  size="sm"
                  layout="wrap"
                  options={[
                    { value: 'dns', label: 'DNS' },
                    { value: 'ip', label: 'IP' },
                    { value: 'email', label: 'email' },
                  ]}
                  value={entry.type}
                  onChange={(t) => updateSan(i, { type: t })}
                />
                <div className="w-full md:flex-1 min-w-0">
                  <InputField
                    id={`csr-san-${i}`}
                    label={`SAN ${i + 1}`}
                    value={entry.value}
                    onChange={(v) => updateSan(i, { value: v })}
                    placeholder={entry.type === 'ip' ? '10.0.0.1' : 'example.jp'}
                  />
                </div>
                {san.length > 1 && (
                  <button
                    type="button"
                    className="caption btn-remove-card leading-none"
                    aria-label={`SAN ${i + 1} を削除`}
                    onClick={() => setSan((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    削除
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="caption text-link-plain btn-link-plain"
              onClick={() => setSan((prev) => [...prev, { type: 'dns', value: '' }])}
            >
              ＋ SAN を追加
            </button>
          </fieldset>

          <ActionButton variant="primary" onClick={handleGenerate} disabled={!canGenerate} loading={generating}>
            CSR と鍵ペアを生成
          </ActionButton>
          {!canGenerate && (
            <p className="caption text-muted">CN または SAN を1つ以上入力してください。</p>
          )}

          {genError && <ErrorMessage message={genError} variant="block" />}

          {genResult && (
            <div className="space-y-4">
              <NotificationBanner variant="info" title="秘密鍵はブラウザ外に送信されません">
                このツールの全処理はブラウザ内で完結します。生成した秘密鍵データは外部サーバーに送信されません。
              </NotificationBanner>
              <OutputField
                id="csr-output"
                label="CSR（PKCS#10 / PEM）"
                value={genResult.csrPem}
                rows={8}
                mono
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="CSR をダウンロード"
                    onClick={() => downloadText('request.csr', genResult.csrPem)}
                  />
                }
              />
              <OutputField
                id="csr-key-output"
                label="秘密鍵（PKCS#8 / PEM）"
                value={genResult.privateKeyPem}
                rows={8}
                mono
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="秘密鍵をダウンロード"
                    onClick={() => downloadText('private.key', genResult.privateKeyPem)}
                  />
                }
              />
            </div>
          )}
        </div>
      )}

      {mode === 'parse' && (
        <div className="space-y-4">
          <InputField
            id="csr-parse-input"
            label="CSR を貼り付け"
            value={parseInput}
            onChange={handleParse}
            placeholder={'-----BEGIN CERTIFICATE REQUEST-----\nMIIC...\n-----END CERTIFICATE REQUEST-----'}
            hint="対応形式: PEM（CERTIFICATE REQUEST）/ DER の Base64"
            multiline
            rows={7}
            mono
            resize
            headerRight={
              <button
                type="button"
                className="caption text-link-plain btn-link-plain"
                onClick={() => handleParse(SAMPLE_CSR)}
              >
                サンプルを入力
              </button>
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <FileInputButton accept=".csr,.pem,.der" onChange={handleFile}>
              ファイルを選択
            </FileInputButton>
            <span className="caption text-muted">.csr / .pem / .der</span>
          </div>

          {parseResult?.error && <ErrorMessage message={parseResult.error} variant="block" />}

          {parseResult && !parseResult.error && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <ChipLabel tone="neutral">{parseResult.publicKey.algorithm}</ChipLabel>
                {parseResult.publicKey.keySizeBits && (
                  <ChipLabel tone="neutral">{parseResult.publicKey.keySizeBits} bit</ChipLabel>
                )}
                {parseResult.publicKey.namedCurve && (
                  <ChipLabel tone="neutral">{parseResult.publicKey.namedCurve}</ChipLabel>
                )}
                <ChipLabel tone="neutral">{parseResult.signatureAlgorithm}</ChipLabel>
                <ChipLabel tone={parseResult.signatureValid ? 'info' : 'error'}>
                  {parseResult.signatureValid === null
                    ? '署名検証: 不能'
                    : parseResult.signatureValid
                      ? '署名検証: OK'
                      : '署名検証: NG'}
                </ChipLabel>
              </div>
              <OutputField id="csr-parse-subject" label="Subject" value={parseResult.subjectFull} rows={2} mono />
              {parseResult.san.length > 0 && (
                <OutputField
                  id="csr-parse-san"
                  label="SAN"
                  value={parseResult.san.join('\n')}
                  rows={Math.min(parseResult.san.length + 1, 6)}
                  mono
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

> 注意:
> - `btn-remove-card` / `btn-link-plain` / `text-link-plain` は既存の `global.css @layer components` クラス。存在を `grep -n "btn-remove-card\|btn-link-plain\|text-link-plain" src/styles/global.css` で確認してから使う。無ければ既存ツール（KeyConverter は `btn-link-plain text-link-plain` を使用）で使われているクラスに合わせる。
> - `ChipLabel` の tone は `'error' | 'info' | 'neutral'`（ui-conventions.md）。署名 OK は `info`、NG は `error`。
> - `ActionButton` に `loading` prop がある前提（`src/components/ui/ActionButton.tsx` で確認）。無い場合は `disabled={generating || !canGenerate}` に変更。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（props 名・型の不一致があれば各 UI コンポーネントの実シグネチャに合わせて修正）

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: button type 漏れ等の指摘なし（全 `<button>` に `type="button"` を付与済みか確認）

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/CsrGenerator.tsx
git commit -m "feat: csr-generator の UI コンポーネントを追加"
```

---

## Task 7: Astro ページ（`src/pages/tools/csr-generator.astro`）

**Files:**
- Create: `src/pages/tools/csr-generator.astro`
- Modify: `src/pages/tools/key-converter.astro:57`（クロスリファレンス更新）

- [ ] **Step 1: ページを書く（key-converter.astro と同一構造）**

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { CsrGenerator } from '@/components/tools/CsrGenerator';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'csr-generator')!;
---

<ToolLayout tool={tool}>
  <CsrGenerator client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      ブラウザ内で RSA / ECDSA の鍵ペアを生成し、PKCS#10 CSR（証明書署名要求）を出力します。Subject（CN / O
      / OU / C / ST / L / emailAddress）と SAN（DNS / IP / email）を指定でき、秘密鍵は PKCS#8
      PEM で出力されます。全処理はブラウザ内で完結するため、生成した秘密鍵は外部サーバーに送信されません。既存
      CSR の貼り付け解析（Subject / SAN / 公開鍵 / 署名検証）にも対応します。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">対応アルゴリズム</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>RSA（2048 / 3072 / 4096 bit、SHA-256 署名）</li>
      <li>ECDSA（P-256 / P-384 / P-521、曲線に応じた SHA-256/384/512 署名）</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">準拠仕様</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>RFC 2986（PKCS#10 Certification Request）</li>
      <li>RFC 5280（X.509 SAN 拡張 id-ce-subjectAltName）</li>
      <li>PKCS#8（秘密鍵エクスポート）</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">制限事項（v1 非対応）</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>Ed25519 / Ed448（EdDSA）は非対応</li>
      <li>暗号化 PKCS#8（パスフレーズ付き秘密鍵）でのエクスポートは非対応（平文 PKCS#8 のみ）</li>
      <li>SAN の IP は IPv4 のみ対応</li>
      <li>challengePassword 属性・KeyUsage / ExtendedKeyUsage 等のカスタム拡張編集は非対応</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 2: key-converter.astro のクロスリファレンスを更新**

`src/pages/tools/key-converter.astro:57` の以下の行を、ツールが実装済みになったため更新する:

```diff
-      <li>鍵ペア生成（csr-generator 予定）は別ツールで対応予定</li>
+      <li>鍵ペア生成・CSR 作成は csr-generator（CSR・鍵ペアジェネレータ）で対応</li>
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build`
Expected: ビルド成功（`/tools/csr-generator` ページが生成される）

- [ ] **Step 4: コミット**

```bash
git add src/pages/tools/csr-generator.astro src/pages/tools/key-converter.astro
git commit -m "feat: csr-generator のページを追加"
```

---

## Task 8: tools.ts エントリ追加

**Files:**
- Modify: `src/data/tools.ts`（`toolEntries` 配列に追加）

- [ ] **Step 1: エントリを追加する**

`toolEntries` 配列（`har-viewer` エントリの後ろ等、任意の位置でよい。表示順は yomi で自動ソート）に追加:

```typescript
  {
    slug: 'csr-generator',
    name: 'CSR・鍵ペアジェネレータ',
    description:
      'RSA / ECDSA の鍵ペアを生成し PKCS#10 CSR（証明書署名要求）を出力します。既存 CSR の Subject/SAN/署名検証にも対応。秘密鍵はブラウザ外に送信しません',
    category: 'generate',
    yomi: 'しーえすあーるかぎぺあじぇねれーた',
  },
```

- [ ] **Step 2: 型チェック + テスト**

Run: `node_modules/.bin/astro check && npm run test -- tools`
Expected: エラーなし。tools 関連 meta テストが通る。

- [ ] **Step 3: コミット**

```bash
git add src/data/tools.ts
git commit -m "feat: csr-generator をツール一覧に登録"
```

---

## Task 9: VRT ページ登録

**Files:**
- Modify: `tests/e2e/visual-regression-pages.ts`（`PAGES` 配列に追加）

- [ ] **Step 1: PAGES に追加する**

`PAGES` 配列に `/tools/csr-generator` を追加（既存エントリの形式に合わせる。`grep -n "tools/" tests/e2e/visual-regression-pages.ts` で形式確認）。

- [ ] **Step 2: coverage meta テストを実行**

Run: `npm run test -- vrt-pages-coverage`
Expected: PASS（登録漏れ検知テストが通る）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/visual-regression-pages.ts
git commit -m "test: csr-generator を VRT 対象ページに登録"
```

---

## Task 10: E2E テスト

**Files:**
- Create: `tests/e2e/csr-generator.spec.ts`

- [ ] **Step 1: 既存 E2E の形式を確認する**

Run: `ls tests/e2e/ && sed -n '1,40p' tests/e2e/$(ls tests/e2e/ | grep -v visual-regression | grep spec | head -1)`
既存 spec の navigate / locator パターン（`getByRole` / `getByLabel`）に倣う。

- [ ] **Step 2: 最小 E2E を書く**

```typescript
// tests/e2e/csr-generator.spec.ts
import { test, expect } from '@playwright/test';

test.describe('csr-generator', () => {
  test('CN を入力して CSR と秘密鍵を生成できる', async ({ page }) => {
    await page.goto('/tools/csr-generator');
    await page.getByLabel('CN（コモンネーム）').fill('e2e.example.jp');
    await page.getByRole('button', { name: 'CSR と鍵ペアを生成' }).click();
    // CSR / 秘密鍵が出力される
    await expect(page.getByText('-----BEGIN CERTIFICATE REQUEST-----').first()).toBeVisible();
    await expect(page.getByText('-----BEGIN PRIVATE KEY-----').first()).toBeVisible();
  });

  test('既存 CSR を解析モードでサンプル投入して Subject を表示できる', async ({ page }) => {
    await page.goto('/tools/csr-generator');
    await page.getByRole('button', { name: '既存 CSR を解析' }).click();
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByText('署名検証: OK')).toBeVisible();
  });
});
```

> locator 名は実装した label / button テキストと完全一致させる。`getByText('-----BEGIN...')` が OutputField の textarea value にマッチしない場合は `expect(page.getByLabel('CSR（PKCS#10 / PEM）')).toHaveValue(/BEGIN CERTIFICATE REQUEST/)` に変更する。

- [ ] **Step 3: E2E 実行**

Run: `npm run test:e2e -- csr-generator`
Expected: PASS（2 ケース）

- [ ] **Step 4: コミット**

```bash
git add tests/e2e/csr-generator.spec.ts
git commit -m "test: csr-generator の E2E を追加"
```

---

## Task 11: ドキュメント更新

**Files:**
- Modify: `README.md`（ツール一覧）
- Modify: `SPEC.md`（2.3 / 2.4 / 4 / 5 / 9 章）
- Modify: `docs/decisions.md`（選定理由）
- Modify: `docs/tools.md`（仕組み・準拠仕様・制限）
- Modify: `docs/tool-candidates.md`（B2-7 状態列。PR 番号はマージ時なので一旦 ✅ と PR 作成後に追記）

- [ ] **Step 1: README.md にツールを追加**

既存のツール一覧表/リストの形式に合わせて `csr-generator`（CSR・鍵ペアジェネレータ）を追加。`grep -n "key-converter\|cert-decoder" README.md` で記載箇所と形式を確認。

- [ ] **Step 2: SPEC.md を更新**

- 2.3 ライブラリ: pkijs / asn1js は既存記載のはず（追記不要なら触らない）
- 2.4 ディレクトリ: `src/utils/csr/` を追記
- 4 / 5 章: ツール一覧・機能記述に `csr-generator` を追加
- 9 章チェックリスト: 該当項目を更新

`grep -n "key-converter\|cert-decoder\|src/utils/cert" SPEC.md` で記載箇所を確認してから同じ粒度で追記。

- [ ] **Step 3: docs/decisions.md に選定理由を追記**

cert-decoder（読む側）の対となる「作る側」ツールであること、秘密鍵を外部送信しない必然性、RSA+ECDSA/平文PKCS#8 に絞った v1 スコープと除外理由（Ed25519・暗号化PKCS#8）を 1 エントリで記録。

- [ ] **Step 4: docs/tools.md に技術解説を追記**

csr-generator の仕組み（Web Crypto で鍵生成 → pkijs CertificationRequest 構築 → 署名 → PEM）、準拠仕様（RFC 2986 PKCS#10 / RFC 5280 SAN / PKCS#8）、制限（Ed25519非対応・暗号化秘密鍵非対応・SAN IP は IPv4 のみ）を記述。

- [ ] **Step 5: docs/tool-candidates.md の B2-7 状態列を更新**

97 行目付近の B2-7 行の「状態」列（現在空）に `✅ #<PR番号>` を入れる。PR 番号は PR 作成後に確定するため、この時点では `✅`（実装済み）を入れ、PR 番号は親が PR 作成後に追記する。

- [ ] **Step 6: ドキュメント整合 meta テスト**

Run: `npm run test`
Expected: 全ユニット + meta テスト PASS（ツール一覧整合・VRT coverage 等）

- [ ] **Step 7: コミット**

```bash
git add README.md SPEC.md docs/decisions.md docs/tools.md docs/tool-candidates.md
git commit -m "docs: csr-generator の追加に伴うドキュメントを更新"
```

---

## 最終検証（push 前必須 / common.md 3章）

- [ ] `npm run test`（ユニット + meta）PASS
- [ ] `node_modules/.bin/astro check`（型）エラーなし
- [ ] `npm run lint` 指摘なし
- [ ] `npm run build` 成功
- [ ] `npm run test:e2e -- csr-generator` PASS
- [ ] PC(1280x800) / スマホ(390x844) 両サイズで生成モード・解析モードを目視確認（ui-conventions.md 3章）

VRT baseline は CI の `Update Visual Regression Baseline` workflow を `workflow_dispatch` で手動トリガーして生成する（web セッションのトークンでは `actions: write` 権限が無く起動不可。`.claude/rules/github-web-session.md`）。親が PR 作成後に手動トリガー手順を案内する。
