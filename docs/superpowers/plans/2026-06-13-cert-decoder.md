# SSL/TLS証明書デコーダ（cert-decoder）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PEM/DER/PKCS#7 の証明書を貼り付け／ファイル選択で解析し、Subject/SAN/有効期限/署名アルゴリズム/SCT を表示し、複数証明書のチェーン署名検証を行う閲覧専用ツール `cert-decoder` を追加する。

**Architecture:** パースロジックを `src/utils/cert/`（detect / parse / sct / chain）に純関数として分離し、React コンポーネント `CertDecoder.tsx` から呼ぶ。証明書パースは pkijs + asn1js、チェーン署名検証は pkijs 経由の Web Crypto（`crypto.subtle`）。全処理ブラウザ内完結。

**Tech Stack:** TypeScript / React 19 / Astro 6 / pkijs 3.4 / asn1js 3.0 / Web Crypto API / Vitest / Playwright

**設計正本:** `docs/superpowers/specs/2026-06-13-cert-decoder-design.md`

> ⚠️ pkijs / asn1js の API は ASN.1 構造を直接辿るため込み入っている。各 parse 系タスク着手時に **context7 MCP で pkijs の最新ドキュメント**（`Certificate` / `ContentInfo` / `SignedData` / `Certificate.verify` / extension 取得）を確認してから実装すること。本プランのコードは構造の指針であり、正確な API 名は context7 で裏取りする。

---

## ブランチ前提

- 作業ブランチ: `claude/clever-lamport-6jkv60`（既に設計コミット済み）
- ベースは `origin/develop`

## ファイル構成

新規作成:

- `src/utils/cert/types.ts` — `ParsedCert` / `ChainLink` / `ChainResult` / `DetectResult` 等の型
- `src/utils/cert/detect.ts` — 入力種別判定（PEM / DER / PKCS#7）
- `src/utils/cert/parse.ts` — `parseCertificates(input) → ParsedCert[]`
- `src/utils/cert/sct.ts` — SCT 拡張デコード
- `src/utils/cert/chain.ts` — チェーン並べ替え + 署名検証
- `src/utils/cert/index.ts` — re-export
- `src/utils/__tests__/cert-detect.test.ts`
- `src/utils/__tests__/cert-parse.test.ts`
- `src/utils/__tests__/cert-sct.test.ts`
- `src/utils/__tests__/cert-chain.test.ts`
- `src/utils/__tests__/cert-fixtures.ts` — テスト用証明書チェーン生成ヘルパー
- `src/components/tools/CertDecoder.tsx`
- `src/components/tools/__tests__/CertDecoder.test.tsx`
- `src/pages/tools/cert-decoder.astro`

修正:

- `package.json` / `package-lock.json` — pkijs / asn1js 追加
- `src/data/tools.ts` — `toolEntries` にエントリ追加
- `tests/e2e/visual-regression-pages.ts` — `/tools/cert-decoder` 追加
- `README.md` / `SPEC.md` / `docs/decisions.md` / `docs/tools.md` / `docs/tool-candidates.md`

---

## Task 1: 依存ライブラリ追加

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: 依存を追加（lock 同期込み）**

Run:

```bash
npm install pkijs@^3.4.0 asn1js@^3.0.10 --cache "$TMPDIR/npm-cache" --no-audit --no-fund
```

Expected: `package.json` の dependencies に `pkijs` / `asn1js` が追加され、`package-lock.json` も更新される。

- [ ] **Step 2: lock 同期を確認**

Run: `git diff --name-only`
Expected: `package.json` と `package-lock.json` の両方が出力される（片方のみは NG）。

- [ ] **Step 3: ビルドが壊れないことを確認**

Run: `node_modules/.bin/astro check`
Expected: 既存エラーなし（新規ファイル未追加なので証明書関連エラーは出ない）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: cert-decoder 用に pkijs / asn1js を追加"
```

---

## Task 2: 型定義と入力種別判定（detect）

**Files:**

- Create: `src/utils/cert/types.ts`, `src/utils/cert/detect.ts`
- Test: `src/utils/__tests__/cert-detect.test.ts`

`detect` は「貼り付けテキスト or バイナリ」を受け取り、PEM ブロック群 / 生 DER / PKCS#7 を判別し、各証明書の DER バイト列（`Uint8Array`）の配列に正規化する。PKCS#7 の SignedData からの証明書抽出は parse 側に委ねるため、ここでは「形式タグ + 取り出した DER 候補」を返す。

- [ ] **Step 1: 型を定義**

`src/utils/cert/types.ts`:

```ts
/** 入力から検出した1件分の DER エンコード済み証明書候補 */
export interface DerCandidate {
  /** DER バイト列 */
  der: Uint8Array;
  /** 由来形式（表示・デバッグ用） */
  source: 'pem' | 'der' | 'pkcs7';
}

export interface DetectResult {
  kind: 'pem' | 'der' | 'pkcs7' | 'pkcs12' | 'empty' | 'unknown';
  candidates: DerCandidate[];
  /** PKCS#12 等の未対応形式を検出したときの理由（UI で別issue誘導に使う） */
  unsupported?: 'pkcs12';
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/utils/__tests__/cert-detect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectInput } from '@/utils/cert/detect';

const PEM_CERT = `-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----`;

describe('detectInput', () => {
  it('空入力は empty を返す', () => {
    expect(detectInput('').kind).toBe('empty');
    expect(detectInput('   \n  ').kind).toBe('empty');
  });

  it('PEM の CERTIFICATE ブロックを複数抽出する', () => {
    const twoBlocks = `${PEM_CERT}\n${PEM_CERT}`;
    const r = detectInput(twoBlocks);
    expect(r.kind).toBe('pem');
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0].source).toBe('pem');
  });

  it('PKCS#12 の PEM ヘッダ（ENCRYPTED PRIVATE KEY を含む pfx 由来）ではなく、PRIVATE KEY のみは未対応扱いにしない', () => {
    // CERTIFICATE ブロックが1つも無ければ unknown
    const keyOnly = `-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----`;
    expect(detectInput(keyOnly).kind).toBe('unknown');
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm run test -- cert-detect`
Expected: FAIL（`detectInput` 未定義）

- [ ] **Step 4: detect を実装**

`src/utils/cert/detect.ts`:

- PEM 抽出: 正規表現 `/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g` で全ブロックを走査。`CERTIFICATE` ラベルのみ採用し、Base64 本文を `Uint8Array` にデコード（既存 `@/utils/base64` を利用）。`PKCS7` ラベルは PKCS#7 として後段に渡す
- `ENCRYPTED PRIVATE KEY` や入力がバイナリ pfx magic の場合は `kind: 'pkcs12', unsupported: 'pkcs12'`
- PEM ブロックが無くテキストが Base64 のみ → DER とみなしデコードを試みる
- バイナリ（`Uint8Array` 直渡し）: 先頭バイトが `0x30`（SEQUENCE）なら DER 候補。PKCS#7 か単一証明書かは parse 側で SignedData を試行して判別するため、ここでは DER candidate として返しつつ `kind` は呼び出し側がオーバーライド可能にする
- CERTIFICATE ブロックも DER も取れなければ `unknown`

実装方針（擬似）:

```ts
export function detectInput(input: string | Uint8Array): DetectResult {
  if (typeof input === 'string' && input.trim() === '') return { kind: 'empty', candidates: [] };
  // ... PEM 走査 → candidates
  // ... PKCS#12 検出 → unsupported
  // ... DER fallback
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm run test -- cert-detect`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/cert/types.ts src/utils/cert/detect.ts src/utils/__tests__/cert-detect.test.ts
git commit -m "feat: cert-decoder の入力種別判定（detect）を追加"
```

---

## Task 3: テスト用証明書チェーン生成ヘルパー

**Files:**

- Create: `src/utils/__tests__/cert-fixtures.ts`

実証明書 PEM をハードコードすると有効期限切れ・差し替えで脆くなる。pkijs + Web Crypto で root→intermediate→leaf の自己署名チェーンを **テスト実行時に生成** し、parse / chain の陽性・陰性対照に使う。

- [ ] **Step 1: フィクスチャ生成を実装**

`src/utils/__tests__/cert-fixtures.ts`:

- `makeTestChain()` を実装し、ECDSA P-256 鍵で 3 段のチェーンを生成して各証明書の DER（`Uint8Array`）と PEM を返す
- root は自己署名、intermediate は root 秘密鍵で署名、leaf は intermediate 秘密鍵で署名
- leaf に SAN（`example.test`）・BasicConstraints・KeyUsage を付与
- 有効期限は `notBefore = now-1日`, `notAfter = now+365日`
- 期限切れ証明書も生成する `makeExpiredCert()`（`notAfter = now-1日`）を用意

シグネチャ:

```ts
export interface TestChain {
  rootDer: Uint8Array;
  intermediateDer: Uint8Array;
  leafDer: Uint8Array;
  rootPem: string;
  intermediatePem: string;
  leafPem: string;
}
export async function makeTestChain(): Promise<TestChain>;
export async function makeExpiredCert(): Promise<Uint8Array>;
```

実装は pkijs の `Certificate`（`subject`/`issuer`/`notBefore`/`notAfter`/`extensions`/`subjectPublicKeyInfo`）を組み立て、`certificate.sign(privateKey, 'SHA-256')` で署名 → `certificate.toSchema().toBER()` で DER 化する。**正確な API は context7 で pkijs ドキュメントを確認すること。**

- [ ] **Step 2: フィクスチャ単体の sanity テストを追加（cert-parse.test 内で使うため別途テスト不要、ただし生成が throw しないことを次タスクで確認）**

- [ ] **Step 3: Commit**

```bash
git add src/utils/__tests__/cert-fixtures.ts
git commit -m "test: cert-decoder 用のテスト証明書チェーン生成ヘルパーを追加"
```

---

## Task 4: 証明書パース（parse）

**Files:**

- Create: `src/utils/cert/parse.ts`
- Modify: `src/utils/cert/types.ts`
- Test: `src/utils/__tests__/cert-parse.test.ts`

- [ ] **Step 1: ParsedCert 型を追加**

`src/utils/cert/types.ts` に追記:

```ts
export interface CertName {
  /** RFC4514 風の文字列（例: "CN=example.test, O=Test"） */
  full: string;
  /** 主要 RDN を個別に */
  attributes: { type: string; value: string }[];
}

export interface PublicKeyInfo {
  algorithm: string; // 'RSA' | 'EC' | その他 OID 名
  keySizeBits?: number;
  namedCurve?: string;
}

export interface SctEntry {
  version: number;
  logId: string; // hex
  timestamp: number; // ms
}

export interface ParsedCert {
  subject: CertName;
  issuer: CertName;
  serialNumberHex: string;
  notBefore: Date;
  notAfter: Date;
  signatureAlgorithm: string;
  publicKey: PublicKeyInfo;
  san: string[]; // 例: ['DNS:example.test', 'IP:10.0.0.1']
  keyUsage: string[];
  extKeyUsage: string[];
  isCa: boolean;
  pathLen?: number;
  subjectKeyId?: string; // hex
  authorityKeyId?: string; // hex
  fingerprintSha256: string; // hex, colon区切り
  sct: SctEntry[];
  /** 元 DER（チェーン検証で再利用） */
  der: Uint8Array;
  /** このカードのパースに失敗した場合の理由 */
  error?: string;
}

export interface ParseResult {
  certs: ParsedCert[];
  /** 入力全体に対するエラー（空・未対応形式など） */
  topLevelError?: string;
  unsupported?: 'pkcs12';
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/utils/__tests__/cert-parse.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { parseCertificates } from '@/utils/cert/parse';
import { makeTestChain, type TestChain } from './cert-fixtures';

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

describe('parseCertificates', () => {
  it('空入力は topLevelError を返す', async () => {
    const r = await parseCertificates('');
    expect(r.certs).toHaveLength(0);
    expect(r.topLevelError).toBeTruthy();
  });

  it('PEM の leaf 証明書から主要フィールドを抽出する', async () => {
    const r = await parseCertificates(chain.leafPem);
    expect(r.certs).toHaveLength(1);
    const c = r.certs[0];
    expect(c.error).toBeUndefined();
    expect(c.subject.full).toContain('CN=');
    expect(c.san).toContain('DNS:example.test');
    expect(c.notAfter.getTime()).toBeGreaterThan(Date.now());
    expect(c.fingerprintSha256).toMatch(/^[0-9A-F:]+$/i);
    expect(c.publicKey.algorithm).toBe('EC');
  });

  it('複数 PEM ブロックを全件パースする', async () => {
    const all = `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`;
    const r = await parseCertificates(all);
    expect(r.certs).toHaveLength(3);
  });

  it('壊れた1枚があっても他の証明書はパースを継続する', async () => {
    const broken = `-----BEGIN CERTIFICATE-----\nMIIBADGARBAGE\n-----END CERTIFICATE-----`;
    const r = await parseCertificates(`${chain.leafPem}\n${broken}`);
    expect(r.certs.length).toBeGreaterThanOrEqual(1);
    expect(r.certs.some((c) => c.error)).toBe(true);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm run test -- cert-parse`
Expected: FAIL（`parseCertificates` 未定義）

- [ ] **Step 4: parse を実装**

`src/utils/cert/parse.ts`:

- `detectInput` で DER 候補を得る。`unsupported === 'pkcs12'` なら `{ certs: [], unsupported: 'pkcs12', topLevelError: 'PKCS#12 は未対応です' }`
- DER 候補が PKCS#7 由来の場合は pkijs `ContentInfo` → `SignedData` から `certificates` を展開
- 各 DER を pkijs `Certificate` でパースし `ParsedCert` に正規化。1件の throw を catch して `error` 入り ParsedCert を push（他は継続）
- DN は `RelativeDistinguishedNames` を OID→短縮名（CN/O/OU/C/L/ST 等）にマップ
- SAN / KeyUsage / ExtKeyUsage / BasicConstraints / SKI / AKI は extension OID で取得
- フィンガープリント: `crypto.subtle.digest('SHA-256', der)` を hex 化（コロン区切り、大文字）
- SCT は Task 5 の `decodeSct` を呼ぶ（拡張 OID `1.3.6.1.4.1.11129.2.4.2` の octet string を渡す）。Task 5 完了まで `sct: []` 固定でも可、Task 5 で結線

**正確な pkijs API は context7 で確認。**

- [ ] **Step 5: テストが通ることを確認**

Run: `npm run test -- cert-parse`
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `npx astro check`
Expected: cert 関連エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/utils/cert/parse.ts src/utils/cert/types.ts src/utils/__tests__/cert-parse.test.ts
git commit -m "feat: cert-decoder の証明書パース（parse）を追加"
```

---

## Task 5: SCT デコード（sct）

**Files:**

- Create: `src/utils/cert/sct.ts`
- Modify: `src/utils/cert/parse.ts`（SCT 結線）
- Test: `src/utils/__tests__/cert-sct.test.ts`

SCT 拡張の中身は ASN.1 OCTET STRING の中に TLS シリアライズの `SignedCertificateTimestampList`（RFC 6962）。構造: 2バイト長の list、各 SCT は `version(1) + logId(32) + timestamp(8, ms) + extensions(2+...) + signature(...)`。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/cert-sct.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodeSct } from '@/utils/cert/sct';

describe('decodeSct', () => {
  it('1件の SCT を含む TLS リストをデコードする', () => {
    // 手組み: outer list length(2) + sct length(2) + version(1=0x00)
    //   + logId(32) + timestamp(8) + extLen(2=0x0000) + sigAlg(2) + sigLen(2)+sig
    const logId = new Uint8Array(32).fill(0xab);
    const ts = 1700000000000; // ms
    const sctBody: number[] = [0x00, ...logId];
    // timestamp 8 bytes big-endian
    for (let i = 7; i >= 0; i--) sctBody.push(Number((BigInt(ts) >> BigInt(i * 8)) & 0xffn));
    sctBody.push(0x00, 0x00); // extensions length 0
    sctBody.push(0x04, 0x03); // signature hash/alg (dummy)
    sctBody.push(0x00, 0x02, 0x30, 0x00); // sig len 2 + 2 bytes
    const sctLen = sctBody.length;
    const inner = [Math.floor(sctLen / 256), sctLen % 256, ...sctBody];
    const outer = [Math.floor(inner.length / 256), inner.length % 256, ...inner];
    const r = decodeSct(new Uint8Array(outer));
    expect(r).toHaveLength(1);
    expect(r[0].version).toBe(0);
    expect(r[0].timestamp).toBe(ts);
    expect(r[0].logId).toBe('ab'.repeat(32));
  });

  it('壊れた入力では空配列を返す（throw しない）', () => {
    expect(decodeSct(new Uint8Array([0xff]))).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- cert-sct`
Expected: FAIL

- [ ] **Step 3: decodeSct を実装**

`src/utils/cert/sct.ts`:

- 入力 octet string から outer 2バイト長を読み、各 SCT エントリ（2バイト長 prefix）を切り出す
- 各エントリで version(1) / logId(32, hex) / timestamp(8, ms, Number 化) を読む。残り（extensions/signature）はスキップ
- 範囲外アクセス・長さ不整合は try/catch でまとめて `[]` を返す（best-effort）

- [ ] **Step 4: テストが通ることを確認 + parse 結線**

`parse.ts` で SCT 拡張 OID を見つけたら `decodeSct` を呼んで `ParsedCert.sct` に格納。

Run: `npm run test -- cert-sct cert-parse`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/cert/sct.ts src/utils/cert/parse.ts src/utils/__tests__/cert-sct.test.ts
git commit -m "feat: cert-decoder の SCT 拡張デコードを追加"
```

---

## Task 6: チェーン並べ替え + 署名検証（chain）— test-gates 必須

**Files:**

- Create: `src/utils/cert/chain.ts`, `src/utils/cert/index.ts`
- Modify: `src/utils/cert/types.ts`
- Test: `src/utils/__tests__/cert-chain.test.ts`

> ⚠️ これは「検証機構」。**着手前に `Skill` tool で `test-gates` skill を呼び**、陽性対照（正しいチェーンが ✓）と陰性対照（改ざん/issuer不一致/期限切れが ✗）の両方を必ず実装する。陰性対照が無いと「検証が常に true を返す空回り」を検知できない。

- [ ] **Step 0: test-gates skill を呼ぶ**

`Skill` tool で `test-gates` を実行し、チェックリストに従う。

- [ ] **Step 1: 型を追加**

`src/utils/cert/types.ts` に追記:

```ts
export interface ChainLink {
  subjectIndex: number; // ParsedCert 配列内の index
  issuerIndex: number | null; // 親（null = 自己署名 or 親不明）
  signatureValid: boolean | null; // null = 検証不能（親不明・アルゴ未対応）
  expired: boolean;
}
export interface ChainResult {
  /** issuer→subject の表示順に並べ替えた ParsedCert の index 列 */
  order: number[];
  links: ChainLink[];
}
```

- [ ] **Step 2: 失敗するテスト（陽性＋陰性対照）を書く**

`src/utils/__tests__/cert-chain.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { parseCertificates } from '@/utils/cert/parse';
import { buildChain } from '@/utils/cert/chain';
import { makeTestChain, makeExpiredCert, type TestChain } from './cert-fixtures';

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

describe('buildChain', () => {
  // 陽性対照: 正しい root/intermediate/leaf は全リンク signatureValid=true
  it('正しいチェーンは全リンクの署名検証に成功する', async () => {
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`
    );
    const r = await buildChain(certs);
    const verifiable = r.links.filter((l) => l.signatureValid !== null);
    expect(verifiable.length).toBeGreaterThanOrEqual(2); // leaf→int, int→root
    expect(verifiable.every((l) => l.signatureValid === true)).toBe(true);
    expect(r.links.every((l) => l.expired === false)).toBe(true);
  });

  // 陰性対照1: issuer 不一致（無関係な leaf を別チェーンの root と混ぜる）
  it('issuer が一致しない証明書は親リンクを張らない（または検証 false）', async () => {
    const other = await makeTestChain();
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${other.rootPem}` // leaf の発行者は other.root ではない
    );
    const r = await buildChain(certs);
    // leaf に対する issuerIndex は null（親見つからず）になる
    const leafLink = r.links.find((l) => l.subjectIndex === r.order[r.order.length - 1]);
    expect(leafLink?.signatureValid === true).toBe(false);
  });

  // 陰性対照2: TBS 改ざん（DER の1バイトを書き換え）で署名検証が false
  it('改ざんされた中間証明書は署名検証に失敗する', async () => {
    const { certs } = await parseCertificates(
      `${chain.leafPem}\n${chain.intermediatePem}\n${chain.rootPem}`
    );
    // intermediate(=certs[1]) の DER を1バイト改ざん（subject付近のbyte）
    const idx = certs.findIndex((c) => c.subject.full === certs[1].subject.full);
    certs[idx].der = new Uint8Array(certs[idx].der);
    certs[idx].der[40] ^= 0xff;
    const r = await buildChain(certs);
    const tamperedLink = r.links.find((l) => l.subjectIndex === idx);
    expect(tamperedLink?.signatureValid).toBe(false);
  });

  // 陰性対照3: 期限切れ証明書は expired=true
  it('期限切れ証明書は expired=true になる', async () => {
    const expiredDer = await makeExpiredCert();
    const { certs } = await parseCertificates(
      // PEM 化はparse側がDERも受けるので、ここはDERをBase64 PEM化して渡す
      derToPem(expiredDer)
    );
    const r = await buildChain(certs);
    expect(r.links.some((l) => l.expired === true)).toBe(true);
  });
});

// テスト内ヘルパー: DER → PEM
function derToPem(der: Uint8Array): string {
  const b64 = Buffer.from(der)
    .toString('base64')
    .replace(/(.{64})/g, '$1\n');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
}
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm run test -- cert-chain`
Expected: FAIL（`buildChain` 未定義）

- [ ] **Step 4: buildChain を実装**

`src/utils/cert/chain.ts`:

- 各証明書の subject DN / issuer DN（正規化文字列）で親子関係を構築。`issuer == subject` の親を持つものを親候補に
- 並べ替え: root（自己署名 or 親が集合内に無い）を先頭に、子へ辿って `order` を作る。閉路や複数候補は素直に best-effort
- 署名検証: pkijs `Certificate.verify(issuerCert)`（内部で Web Crypto）を用いる。親が集合内に無ければ `signatureValid = null`、AKI/SKI も突き合わせて親を特定
- `expired`: `now < notBefore || now > notAfter`
- 検証で throw（未対応アルゴ等）したら `signatureValid = null`

`src/utils/cert/index.ts`:

```ts
export * from './types';
export { detectInput } from './detect';
export { parseCertificates } from './parse';
export { decodeSct } from './sct';
export { buildChain } from './chain';
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm run test -- cert-chain`
Expected: PASS（陽性 ✓ / 陰性 3 種が ✗ を検知）

- [ ] **Step 6: 型チェック**

Run: `npx astro check`
Expected: cert 関連エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/utils/cert/chain.ts src/utils/cert/index.ts src/utils/cert/types.ts src/utils/__tests__/cert-chain.test.ts
git commit -m "feat: cert-decoder のチェーン並べ替えと署名検証を追加"
```

---

## Task 7: React コンポーネント（CertDecoder.tsx）

**Files:**

- Create: `src/components/tools/CertDecoder.tsx`
- Test: `src/components/tools/__tests__/CertDecoder.test.tsx`

> 着手前に `Skill` tool で `dads-design-system` skill を参照し、配色・余白・コンポーネントを準拠させる。Tailwind primitive scale 直書き禁止、`@layer components` 意味クラス + `@theme` semantic token のみ。`style={{}}` / DOM mutation 禁止。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tools/__tests__/CertDecoder.test.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CertDecoder } from '@/components/tools/CertDecoder';
import { makeTestChain, type TestChain } from '@/utils/__tests__/cert-fixtures';

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

describe('CertDecoder', () => {
  it('入力欄が表示される', () => {
    render(<CertDecoder />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('PEM を貼り付けると Subject が表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: chain.leafPem } });
    await waitFor(() => {
      expect(screen.getByText(/CN=/)).toBeInTheDocument();
    });
  });

  it('不正な入力でエラーが表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not a cert' } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- CertDecoder`
Expected: FAIL（コンポーネント未定義）

- [ ] **Step 3: コンポーネントを実装**

`src/components/tools/CertDecoder.tsx`:

- `InputField`（textarea）でテキスト貼り付け + `FileInputButton`（`accept=".pem,.crt,.cer,.der,.p7b"`）でファイル読み込み（バイナリは `arrayBuffer()`、テキストは `text()`）
- 入力をデバウンス（150ms 程度、`useEffect` + `setTimeout`）→ `parseCertificates` → `buildChain`
- 結果: チェーンステータスバナー（`NotificationBanner` / `StatusBadge`：並び順・各リンク ✓/✗・期限切れ警告）+ 証明書カード列。各カードは折りたたみ `<details>`/`Section` で 基本情報 / SAN / 拡張 / 公開鍵 / 署名 / SCT を表示
- DN・SAN・フィンガープリントに `CopyButton`
- PKCS#12 検出時は `NotificationBanner variant="warning"` で「v1非対応」+ 別issue誘導
- パース失敗カードは `ErrorMessage`（`role="alert"`）

非同期処理は破棄フラグ（`let cancelled`）で stale 更新を防ぐ。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- CertDecoder`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `npx astro check`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/CertDecoder.tsx src/components/tools/__tests__/CertDecoder.test.tsx
git commit -m "feat: cert-decoder の UI コンポーネントを追加"
```

---

## Task 8: ページ・ツール登録・VRT 登録

**Files:**

- Create: `src/pages/tools/cert-decoder.astro`
- Modify: `src/data/tools.ts`, `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: tools.ts にエントリ追加**

`src/data/tools.ts` の `toolEntries` 末尾に追加:

```ts
  {
    slug: 'cert-decoder',
    name: 'SSL/TLS証明書デコーダ',
    description:
      'PEM/DER/PKCS#7 の証明書を解析し、Subject/SAN/有効期限/署名アルゴリズム/SCT を表示します。チェーンの署名検証にも対応。データはブラウザ外に送信しません',
    category: 'encode',
    yomi: 'えすえすえるてぃーえるえすしょうめいしょでこーだ',
  },
```

- [ ] **Step 2: Astro ページを作成**

`src/pages/tools/cert-decoder.astro`（`dsn-builder.astro` の構造に倣う。`ToolLayout` + `client:load` マウント + `ToolInfoSection` に概要/対応形式/ユースケース/制限事項）。制限事項に「PKCS#12 / 秘密鍵・鍵フォーマット変換は非対応（別ツール予定）」「失効確認（CRL/OCSP）は行わない」を明記。

- [ ] **Step 3: VRT に登録**

`tests/e2e/visual-regression-pages.ts` の `PAGES` 配列末尾（`/tools/dsn-builder` の後）に追加:

```ts
  '/tools/cert-decoder',
```

- [ ] **Step 4: meta テストと型チェック**

Run: `npm run test -- vrt-pages-coverage && npx astro check`
Expected: PASS / エラーなし（VRT 登録漏れ meta テストが green）

- [ ] **Step 5: ビルド確認**

Run: `npm run build`
Expected: 成功（`/tools/cert-decoder` が生成される）

- [ ] **Step 6: Commit**

```bash
git add src/pages/tools/cert-decoder.astro src/data/tools.ts tests/e2e/visual-regression-pages.ts
git commit -m "feat: cert-decoder のページとツール登録・VRT 登録を追加"
```

---

## Task 9: ドキュメント更新と分離 issue

**Files:**

- Modify: `README.md`, `SPEC.md`, `docs/decisions.md`, `docs/tools.md`, `docs/tool-candidates.md`

- [ ] **Step 1: README.md のツール一覧に追加**

既存の並びに合わせて `SSL/TLS証明書デコーダ`（slug `cert-decoder`）を追記。

- [ ] **Step 2: SPEC.md を更新**

  2.3（ライブラリ: pkijs / asn1js 追加と用途）、2.4（`src/utils/cert/` 構成）、4・5 章（ツール一覧/ルーティング）、9 章チェックリストに反映。

- [ ] **Step 3: docs/decisions.md に決定記録を追加**

- ライブラリに pkijs + asn1js を選定した理由（Web Crypto 親和・tree-shaking・拡張生バイト取得）
- v1 スコープから PKCS#12 / 鍵フォーマット変換を分離した判断
- 失効確認（CRL/OCSP）非対応の理由（ブラウザ単体・外部送信不可方針）

- [ ] **Step 4: docs/tools.md に技術解説を追加**

cert-decoder の仕組み（PEM/DER/PKCS#7 パース、チェーン署名検証 = Web Crypto、SCT デコードは RFC6962 TLS 構造、best-effort）・準拠仕様・制限（PKCS#12 非対応 / 失効確認なし）。

- [ ] **Step 5: 分離 issue を起票**

PKCS#12 対応 と 鍵フォーマット変換（PEM/DER/JWK）について GitHub issue を起票（MCP の `issue_write`）。本文はファイル経由原則だが MCP では body 引数で可。起票後、`docs/tool-candidates.md` のメモまたは PR 本文に issue 番号を記載。

- [ ] **Step 6: docs/tool-candidates.md の状態列更新（PR 番号は PR 作成後）**

S-2 行の状態列は PR 作成後に ✅ + PR 番号へ更新する（このタスクでは仮置きせず、PR 作成後に別途）。

- [ ] **Step 7: Commit**

```bash
git add README.md SPEC.md docs/decisions.md docs/tools.md
git commit -m "docs: cert-decoder の追加に伴うドキュメントを更新"
```

---

## Task 10: 最終検証

- [ ] **Step 1: ユニット + 型 + ビルド**

Run:

```bash
npm run test && node_modules/.bin/astro check && npm run build
```

Expected: 全 PASS / エラーなし

- [ ] **Step 2: E2E（preview 経由）**

Run: `npm run test:e2e`
Expected: PASS（VRT baseline は CI Linux runner で生成するため、ローカルで baseline 不在エラーが出る場合は CI 側 `Update Visual Regression Baseline` workflow_dispatch で生成する旨を PR に記載）

- [ ] **Step 3: 目視確認（PC 1280x800 / スマホ 390x844）**

`.agents/rules/ui-conventions.md` 3 章の手順でスクショ撮影し、上端揃え・折りたたみ・タップ領域・フォーカスリングを確認。

- [ ] **Step 4: verification-before-completion skill を呼び、検証出力を確認**

---

## Self-Review（spec 突き合わせ）

- spec §2 スコープ（PEM/DER/PKCS#7・チェーン検証・PKCS#12/鍵変換除外）→ Task 2/4/6 + Task 9 issue でカバー ✓
- spec §4 ライブラリ pkijs+asn1js → Task 1 ✓
- spec §5 モジュール分割（detect/parse/sct/chain）→ Task 2/4/5/6 ✓
- spec §6 UI → Task 7 ✓
- spec §7 エラーハンドリング → Task 4（部分失敗継続）/ Task 7（PKCS#12 誘導）✓
- spec §8 test-gates 陽性+陰性 → Task 6（陰性3種）✓
- spec §9 ドキュメント → Task 9 ✓
- 型整合: `ParsedCert.der` を Task 4 で定義 → Task 6 chain で利用、`buildChain`/`parseCertificates` 名称一貫 ✓
