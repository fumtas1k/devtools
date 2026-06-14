# SSL/TLS 証明書デコーダ 堅牢化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 証明書デコーダのパース／チェーン構築ロジックを、敵対入力・DN 重複・表示品質の観点で堅牢化する（外部 I/F は不変）。

**Architecture:** `src/utils/cert/` の 3 ファイル（`detect.ts`/`parse.ts`/`chain.ts`）のみを変更。PEM regex の線形化・入力長ガード・親解決ロジックの一本化・DN 値整形・IPv6 圧縮を、いずれも既存の公開関数シグネチャと型を保ったまま行う。テストは陽性/陰性対照を併設（test-gates 準拠）。

**Tech Stack:** TypeScript / pkijs / asn1js / Vitest。テスト証明書は `cert-fixtures.ts` が pkijs + Web Crypto で動的生成する既存パターンに従う。

**設計の正本:** `docs/superpowers/specs/2026-06-14-cert-decoder-hardening-design.md`

**重要:** 本プランはガード/バリデータ（#1 の regex 線形化・入力長ガード）を含む。実装時は `Skill` tool で `test-gates` skill を参照し、各ガードに陽性対照（検知する）と陰性対照（正常を通す）を必ず併設すること。

---

### Task 1: PEM 正規表現の catastrophic backtracking を解消（#1a）

**Files:**
- Modify: `src/utils/cert/detect.ts:56`
- Test: `src/utils/__tests__/cert-detect.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/cert-detect.test.ts` の `describe('detectInput', ...)` ブロック内に以下 2 ケースを追加する:

```ts
  it('END マーカーの無い大量の BEGIN は候補ゼロを返す（ReDoS 回帰防止）', () => {
    // 旧 regex（lazy [\s\S]*?）では O(n^2) バックトラックで遅延しうる。
    // 本文クラスを base64 限定にした修正で線形化される。
    const adversarial = '-----BEGIN CERTIFICATE-----\n'.repeat(50000);
    const r = detectInput(adversarial);
    expect(r.candidates).toHaveLength(0);
  });

  it('改行入りの base64 本文を持つ正常な PEM を抽出する（修正後も機能維持）', () => {
    const pem = `-----BEGIN CERTIFICATE-----\nMIIBAgMBAAE=\nAQID\n-----END CERTIFICATE-----`;
    const r = detectInput(pem);
    expect(r.kind).toBe('pem');
    expect(r.candidates).toHaveLength(1);
  });
```

- [ ] **Step 2: テストを実行して陰性対照が通り敵対ケースの意図を確認**

Run: `npx vitest run src/utils/__tests__/cert-detect.test.ts`
Expected: 既存実装でも「改行入り base64」ケースは PASS する。「大量 BEGIN」ケースは PASS するが旧実装では時間がかかる可能性がある（修正で線形化されることを次ステップで担保）。

- [ ] **Step 3: regex の本文文字クラスを base64 限定にする**

`src/utils/cert/detect.ts:56` を変更:

```ts
  // PEM ブロック抽出
  // 本文クラスを base64 + 空白に限定（`-` を含まない）ことで、`-----END` 位置での
  // バックトラックを構造的に排除し catastrophic backtracking を防ぐ。
  const pemRegex = /-----BEGIN ([A-Z0-9 ]+)-----([A-Za-z0-9+/=\s]*)-----END \1-----/g;
```

（変更前は `([\s\S]*?)`。ラベルクラス `([A-Z0-9 ]+)` と `\1` 後方参照は不変。）

- [ ] **Step 4: テストを実行して通す**

Run: `npx vitest run src/utils/__tests__/cert-detect.test.ts`
Expected: 全ケース PASS（敵対ケースも即座に完了）。

- [ ] **Step 5: コミット**

```bash
git add src/utils/cert/detect.ts src/utils/__tests__/cert-detect.test.ts
git commit -m "fix: 証明書デコーダのPEM正規表現を線形化しReDoSを防止"
```

---

### Task 2: 入力長ガードを追加（#1b）

**Files:**
- Modify: `src/utils/cert/parse.ts`（`parseCertificates` 冒頭・モジュール先頭に定数）
- Test: `src/utils/__tests__/cert-parse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/cert-parse.test.ts` の `describe('parseCertificates', ...)` ブロック内に追加:

```ts
  it('1 MiB を超える入力は topLevelError を返す（#1b 入力長ガード・陽性対照）', async () => {
    const tooLarge = 'a'.repeat(1024 * 1024 + 1);
    const r = await parseCertificates(tooLarge);
    expect(r.certs).toHaveLength(0);
    expect(r.topLevelError).toBeTruthy();
  });

  it('上限直下の正常な PEM は通常どおりパースできる（陰性対照）', async () => {
    const r = await parseCertificates(chain.leafPem);
    expect(r.certs).toHaveLength(1);
    expect(r.certs[0].error).toBeUndefined();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts -t '入力長ガード'`
Expected: 陽性対照が FAIL（現状は巨大入力でも topLevelError を返さず、detect→unknown 等になる可能性）。

- [ ] **Step 3: ガードを実装する**

`src/utils/cert/parse.ts` のモジュール先頭付近（import 群の直後、`OID_TO_SHORT` の前）に定数を追加:

```ts
// テキスト入力の最大長（1 MiB）。これを超える入力は早期に拒否する（防御多重化）。
const MAX_INPUT_LENGTH = 1024 * 1024;
```

`parseCertificates` の冒頭（`ensureCryptoEngine();` の直前）に追加:

```ts
export async function parseCertificates(input: string | Uint8Array): Promise<ParseResult> {
  if (typeof input === 'string' && input.length > MAX_INPUT_LENGTH) {
    return { certs: [], topLevelError: '入力が大きすぎます（最大 1 MiB）。' };
  }

  ensureCryptoEngine();
  // ...既存処理（変更なし）
```

- [ ] **Step 4: テストを実行して通す**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts`
Expected: 全ケース PASS。

- [ ] **Step 5: コミット**

```bash
git add src/utils/cert/parse.ts src/utils/__tests__/cert-parse.test.ts
git commit -m "fix: 証明書デコーダにテキスト入力長の上限ガードを追加"
```

---

### Task 3: DN 値抽出を共通ヘルパー化し hex フォールバックを追加（#4）

**Files:**
- Modify: `src/utils/cert/parse.ts`（`parseDn` と新規 export `extractAttributeValue`）
- Test: `src/utils/__tests__/cert-parse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/cert-parse.test.ts` の import に `extractAttributeValue` を追加:

```ts
import { parseCertificates, extractAttributeValue, formatIpAddress } from '@/utils/cert/parse';
```

（`formatIpAddress` は Task 4 で使用。先にまとめて import してよい。）

ファイル末尾に新しい describe を追加:

```ts
describe('extractAttributeValue（#4 DN 値の整形）', () => {
  it('valueBlock.value が文字列ならそのまま返す', () => {
    expect(extractAttributeValue({ valueBlock: { value: 'example.test' } })).toBe('example.test');
  });

  it('文字列でなく valueHexView を持つ場合は hex にフォールバックする', () => {
    expect(
      extractAttributeValue({
        valueBlock: { valueHexView: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
      })
    ).toBe('deadbeef');
  });

  it('値が取り出せない場合は空文字を返す（[object Object] にしない）', () => {
    expect(extractAttributeValue(null)).toBe('');
    expect(extractAttributeValue({})).toBe('');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts -t 'DN 値の整形'`
Expected: FAIL（`extractAttributeValue` が未 export）。

- [ ] **Step 3: ヘルパーを実装し parseDn を置き換える**

`src/utils/cert/parse.ts` の `parseDn` 関数（現状 `:128-153`）を以下で置き換える:

```ts
/**
 * asn1js の RDN 値オブジェクトから表示用文字列を取り出す。
 * 文字列型でない稀なエンコーディングは hex にフォールバックし、
 * String() による "[object Object]" 表示を避ける。
 */
export function extractAttributeValue(value: unknown): string {
  if (value == null) return '';
  const v = value as {
    valueBlock?: { value?: unknown; valueHexView?: Uint8Array };
    value?: unknown;
  };
  if (typeof v.valueBlock?.value === 'string') return v.valueBlock.value;
  if (typeof v.value === 'string') return v.value;
  const hexView = v.valueBlock?.valueHexView;
  if (hexView && hexView.length > 0) return bytesToHexPlain(hexView);
  return '';
}

/** AttributeTypeAndValue[] を CertName に変換する */
function parseDn(typesAndValues: AttributeTypeAndValue[]): CertName {
  const attributes: { type: string; value: string }[] = [];

  for (const atv of typesAndValues) {
    const shortName = OID_TO_SHORT[atv.type] ?? atv.type;
    attributes.push({ type: shortName, value: extractAttributeValue(atv.value) });
  }

  const full = attributes.map((a) => `${a.type}=${a.value}`).join(', ');
  return { full, attributes };
}
```

- [ ] **Step 4: テストを実行して通す**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts`
Expected: 全ケース PASS（既存の DN 抽出テストも維持）。

- [ ] **Step 5: コミット**

```bash
git add src/utils/cert/parse.ts src/utils/__tests__/cert-parse.test.ts
git commit -m "refactor: 証明書DN値抽出を共通化しhexフォールバックを追加"
```

---

### Task 4: IPv6 アドレスを RFC 5952 準拠で圧縮表示（#6）

**Files:**
- Modify: `src/utils/cert/parse.ts`（`formatIpAddress` を export + 圧縮、`compressIpv6` 追加）
- Test: `src/utils/__tests__/cert-parse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/cert-parse.test.ts` のファイル末尾に追加（import は Task 3 で済んでいる想定）:

```ts
describe('formatIpAddress（#6 IPv6 圧縮）', () => {
  it('IPv4（4 byte）はドット表記', () => {
    expect(formatIpAddress(new Uint8Array([192, 168, 0, 1]))).toBe('192.168.0.1');
  });

  it('IPv6 のゼロ連続を :: に圧縮する', () => {
    const bytes = new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(formatIpAddress(bytes)).toBe('2001:db8::1');
  });

  it('全ゼロは :: になる', () => {
    expect(formatIpAddress(new Uint8Array(16))).toBe('::');
  });

  it('ループバック ::1', () => {
    const bytes = new Uint8Array(16);
    bytes[15] = 1;
    expect(formatIpAddress(bytes)).toBe('::1');
  });

  it('長さ1のゼロ群は圧縮しない', () => {
    // 2001:0:1:0:1:1:1:1（各ゼロ群は長さ1）
    const bytes = new Uint8Array([0x20, 0x01, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(formatIpAddress(bytes)).toBe('2001:0:1:0:1:1:1:1');
  });

  it('複数のゼロ連続がある場合は最長を圧縮する', () => {
    // 0:0:1:0:0:0:0:1 → 後半の長さ4を圧縮 → 0:0:1::1
    const bytes = new Uint8Array([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(formatIpAddress(bytes)).toBe('0:0:1::1');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts -t 'IPv6 圧縮'`
Expected: FAIL（`formatIpAddress` 未 export、かつ圧縮未実装）。

- [ ] **Step 3: formatIpAddress を export し圧縮を実装する**

`src/utils/cert/parse.ts` の `formatIpAddress`（現状 `:110-125`）を以下で置き換える:

```ts
/** iPAddress オクテット列を IPv4（4 byte）/ IPv6（16 byte）表記に整形する */
export function formatIpAddress(bytes: Uint8Array): string {
  if (bytes.length === 4) {
    return Array.from(bytes).join('.');
  }
  if (bytes.length === 16) {
    const groups: number[] = [];
    for (let i = 0; i < 16; i += 2) {
      groups.push(((bytes[i] << 8) | bytes[i + 1]) >>> 0);
    }
    return compressIpv6(groups);
  }
  // 想定外長は hex で fallback
  return bytesToHexPlain(bytes);
}

/** IPv6 の 8 グループ（16bit 値）を RFC 5952 準拠（小文字・最長ゼロ連続を :: 圧縮）に整形する */
function compressIpv6(groups: number[]): string {
  // 最長のゼロ連続ラン（長さ 2 以上）を 1 箇所だけ :: に圧縮する
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === 0) {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');

  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}
```

- [ ] **Step 4: テストを実行して通す**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts`
Expected: 全ケース PASS。

- [ ] **Step 5: コミット**

```bash
git add src/utils/cert/parse.ts src/utils/__tests__/cert-parse.test.ts
git commit -m "feat: 証明書SANのIPv6表示をRFC5952準拠の圧縮表記に"
```

---

### Task 5: 親解決ロジックを一本化し DN 重複に対応（#3 + #5）

**Files:**
- Modify: `src/utils/cert/chain.ts`（`buildSubjectMap`/`resolveParentIndex` 新設、`buildOrder`/`buildChain` を置換）
- Modify: `src/utils/__tests__/cert-fixtures.ts`（`makeDuplicateDnChain` と SKI/AKI 拡張ビルダーを追加）
- Test: `src/utils/__tests__/cert-chain.test.ts`

- [ ] **Step 1: フィクスチャを追加する**

`src/utils/__tests__/cert-fixtures.ts` の import を更新（`AuthorityKeyIdentifier` を追加）:

```ts
import {
  Certificate,
  AttributeTypeAndValue,
  BasicConstraints,
  Extension,
  GeneralName,
  GeneralNames,
  AuthorityKeyIdentifier,
} from 'pkijs';
```

ファイル末尾に以下を追加:

```ts
/** SubjectKeyIdentifier 拡張（2.5.29.14）を構築する */
function buildSkiExtension(keyId: Uint8Array): Extension {
  // 拡張値の内側は OCTET STRING { keyId }。pkijs Extension が外側 OCTET STRING で包む。
  const inner = new asn1js.OctetString({ valueHex: keyId.buffer.slice(0) });
  return new Extension({
    extnID: '2.5.29.14',
    critical: false,
    extnValue: inner.toBER(false),
  });
}

/** AuthorityKeyIdentifier 拡張（2.5.29.35）を keyIdentifier だけ持たせて構築する */
function buildAkiExtension(keyId: Uint8Array): Extension {
  const aki = new AuthorityKeyIdentifier({
    keyIdentifier: new asn1js.OctetString({
      idBlock: { tagClass: 3, tagNumber: 0 }, // context [0] IMPLICIT
      valueHex: keyId.buffer.slice(0),
    }),
  });
  return new Extension({
    extnID: '2.5.29.35',
    critical: false,
    extnValue: aki.toSchema().toBER(false),
  });
}

export interface DuplicateDnChain {
  /** 同一 Subject DN "CN=Dup CA" を持つ自己署名 CA 2 枚（SKI 違い）。 */
  caAPem: string; // SKI = 0xAA×20
  caBPem: string; // SKI = 0xBB×20
  /** issuer=Dup CA、AKI=skiB、caB の鍵で署名された leaf。 */
  leafPem: string;
  /** caB の SubjectKeyIdentifier の期待値（lowercase hex）。 */
  skiBHex: string;
}

/**
 * 同一 Subject DN の CA が複数ある状況を再現するフィクスチャ。
 * leaf は caB の鍵で署名され AKI=skiB を持つため、AKI/SKI による親解決が
 * 正しく caB を選べるかを検証できる。
 */
export async function makeDuplicateDnChain(): Promise<DuplicateDnChain> {
  ensureCryptoEngine();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400_000);
  const nextYear = new Date(now.getTime() + 365 * 86400_000);

  const skiA = new Uint8Array(20).fill(0xaa);
  const skiB = new Uint8Array(20).fill(0xbb);

  const caAKeys = await generateEcKeyPair();
  const caBKeys = await generateEcKeyPair();
  const leafKeys = await generateEcKeyPair();

  const caA = await buildCert({
    subjectCN: 'Dup CA',
    issuerCN: 'Dup CA',
    subjectKeyPair: caAKeys,
    issuerPrivateKey: caAKeys.privateKey,
    serial: 11,
    isCa: true,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [buildSkiExtension(skiA)],
  });

  const caB = await buildCert({
    subjectCN: 'Dup CA',
    issuerCN: 'Dup CA',
    subjectKeyPair: caBKeys,
    issuerPrivateKey: caBKeys.privateKey,
    serial: 12,
    isCa: true,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [buildSkiExtension(skiB)],
  });

  const leaf = await buildCert({
    subjectCN: 'dup-leaf.test',
    issuerCN: 'Dup CA',
    subjectKeyPair: leafKeys,
    issuerPrivateKey: caBKeys.privateKey, // caB の鍵で署名
    serial: 13,
    isCa: false,
    notBefore: yesterday,
    notAfter: nextYear,
    extraExtensions: [buildAkiExtension(skiB)],
  });

  return {
    caAPem: derToPem(certToDer(caA)),
    caBPem: derToPem(certToDer(caB)),
    leafPem: derToPem(certToDer(leaf)),
    skiBHex: 'bb'.repeat(20),
  };
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/utils/__tests__/cert-chain.test.ts` の import に `makeDuplicateDnChain` を追加:

```ts
import { makeTestChain, makeExpiredCert, makeDuplicateDnChain, type TestChain } from './cert-fixtures';
```

ファイル末尾に追加:

```ts
// ────────────────────────────────────────────────────────────────────────────
// DN 重複時の AKI/SKI による親解決（#3）と order/links の整合（#5）
// ────────────────────────────────────────────────────────────────────────────

describe('buildChain — DN 重複時の親解決（#3 / #5）', () => {
  it('同一 Subject DN の CA が複数ある場合、leaf の AKI に一致する SKI を持つ CA を親に選ぶ', async () => {
    const dup = await makeDuplicateDnChain();
    // 入力順は AKI 一致の caB を「先」に、不一致の caA を「後」に置く。
    // 旧実装の subjectMap 後勝ち（最後の caA が勝つ）では親を取り違えるため、
    // この順序で修正の discriminating power を担保する。
    const { certs } = await parseCertificates(`${dup.caBPem}\n${dup.caAPem}\n${dup.leafPem}`);
    expect(certs).toHaveLength(3);

    const r = await buildChain(certs);

    const leafIdx = certs.findIndex((c) => c.subject.full.includes('dup-leaf.test'));
    const leafLink = r.links.find((l) => l.subjectIndex === leafIdx);
    expect(leafLink).toBeDefined();

    // 親が SKI=skiB を持つ CA（caB）であること
    expect(leafLink!.issuerIndex).not.toBeNull();
    expect(certs[leafLink!.issuerIndex!].subjectKeyId).toBe(dup.skiBHex);

    // 正しい親を選んだので署名検証が成功する
    expect(leafLink!.signatureValid).toBe(true);

    // #5: order と links の整合 — 親は order 上で leaf より前に並ぶ
    const posOf = (i: number) => r.order.indexOf(i);
    expect(posOf(leafLink!.issuerIndex!)).toBeLessThan(posOf(leafIdx));
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npx vitest run src/utils/__tests__/cert-chain.test.ts -t 'DN 重複時の親解決'`
Expected: FAIL（旧実装は caA を親候補にして AKI/SKI 不一致 → issuerIndex=null / signatureValid=null）。

- [ ] **Step 4: chain.ts を一本化する**

`src/utils/cert/chain.ts` の `buildOrder`（現状 `:66-133`）と `buildChain`（現状 `:141-213`）を、以下で置き換える。`buildSubjectMap`/`resolveParentIndex` を新設し、`buildOrder` と `buildChain` の双方がこれを使う。

```ts
/** subject.full → そのDNを持つ全 index のリスト */
function buildSubjectMap(certs: ParsedCert[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < certs.length; i++) {
    const key = certs[i].subject.full;
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  }
  return map;
}

/**
 * cert の親（issuer に該当する集合内 index）を解決する。
 *
 * - 自己署名（subject==issuer）→ null
 * - DN 一致候補なし（自分自身を除く）→ null
 * - AKI あり: SKI 一致候補を優先。一致が無く、かつ SKI を持つ候補が存在 → null（不一致確定）。
 *            SKI を持つ候補が皆無 → DN 先頭候補にフォールバック（比較不能・後方互換）。
 * - AKI なし: DN 先頭候補を採用。
 */
function resolveParentIndex(
  cert: ParsedCert,
  idx: number,
  certs: ParsedCert[],
  subjectMap: Map<string, number[]>
): number | null {
  if (cert.subject.full === cert.issuer.full) return null;

  const candidates = (subjectMap.get(cert.issuer.full) ?? []).filter((c) => c !== idx);
  if (candidates.length === 0) return null;

  if (cert.authorityKeyId !== undefined) {
    const matched = candidates.find((c) => certs[c].subjectKeyId === cert.authorityKeyId);
    if (matched !== undefined) return matched;
    const anyHasSki = candidates.some((c) => certs[c].subjectKeyId !== undefined);
    if (anyHasSki) return null;
  }

  return candidates[0];
}

/**
 * issuer→subject 順に並べ替えたインデックス列を構築する。
 * 親関係は resolveParentIndex を単一の真実源とする（buildChain と整合）。
 */
function buildOrder(certs: ParsedCert[], subjectMap: Map<string, number[]>): number[] {
  const n = certs.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const parentOf = new Map<number, number | null>();
  for (let i = 0; i < n; i++) {
    parentOf.set(i, resolveParentIndex(certs[i], i, certs, subjectMap));
  }

  // root = 親が null（自己署名 or 親不明 or AKI/SKI 不一致）
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    if (parentOf.get(i) === null) roots.push(i);
  }
  if (roots.length === 0) roots.push(0);

  const order: number[] = [];
  const visited = new Set<number>();

  function traverse(idx: number): void {
    if (visited.has(idx)) return;
    visited.add(idx);
    order.push(idx);
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && parentOf.get(j) === idx) {
        traverse(j);
      }
    }
  }

  for (const root of roots) {
    traverse(root);
  }

  // 未訪問（環状等）を末尾に追加
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) order.push(i);
  }

  return order;
}

/**
 * ParsedCert[] を受け取り、チェーン並べ替えと署名検証を行う。
 *
 * @param certs - `parseCertificates` が返した ParsedCert[]
 * @returns ChainResult
 */
export async function buildChain(certs: ParsedCert[]): Promise<ChainResult> {
  ensureCryptoEngine();

  const now = new Date();
  const n = certs.length;

  if (n === 0) {
    return { order: [], links: [] };
  }

  const subjectMap = buildSubjectMap(certs);
  const order = buildOrder(certs, subjectMap);

  const links: ChainLink[] = await Promise.all(
    certs.map(async (cert, idx): Promise<ChainLink> => {
      const expired = isExpired(cert, now);
      const isSelfSigned = cert.subject.full === cert.issuer.full;

      // エラー付き証明書は検証不能
      if (cert.error) {
        return { subjectIndex: idx, issuerIndex: null, signatureValid: null, expired };
      }

      if (isSelfSigned) {
        // 自己署名: 親は自分自身（issuerIndex = null）、署名検証は自己で実施
        let signatureValid: boolean | null = null;
        try {
          signatureValid = await verifySignature(cert.der, cert.der);
        } catch {
          signatureValid = null;
        }
        return { subjectIndex: idx, issuerIndex: null, signatureValid, expired };
      }

      const issuerIdx = resolveParentIndex(cert, idx, certs, subjectMap);
      if (issuerIdx === null) {
        return { subjectIndex: idx, issuerIndex: null, signatureValid: null, expired };
      }

      // 署名検証（改ざん検出含む）
      const signatureValid = await verifySignature(cert.der, certs[issuerIdx].der);

      return { subjectIndex: idx, issuerIndex: issuerIdx, signatureValid, expired };
    })
  );

  return { order, links };
}
```

注意: `buildChain` 内の旧 `subjectMap`（`Map<string, number>`）定義と旧 AKI/SKI 絞り込みブロックは削除する（`resolveParentIndex` に集約済み）。

- [ ] **Step 5: テストを実行して通す**

Run: `npx vitest run src/utils/__tests__/cert-chain.test.ts`
Expected: 新規ケース含め全 PASS（既存の陽性/陰性対照も維持）。

- [ ] **Step 6: コミット**

```bash
git add src/utils/cert/chain.ts src/utils/__tests__/cert-fixtures.ts src/utils/__tests__/cert-chain.test.ts
git commit -m "fix: 証明書チェーンの親解決を一本化しDN重複時のAKI/SKI照合に対応"
```

---

### Task 6: 全体検証（型チェック + 全ユニットテスト）

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。新規 export（`extractAttributeValue` / `formatIpAddress`）や型変更による警告が無いこと。

- [ ] **Step 2: cert 系ユニットテスト全実行**

Run: `npx vitest run src/utils/__tests__/cert-parse.test.ts src/utils/__tests__/cert-chain.test.ts src/utils/__tests__/cert-detect.test.ts src/utils/__tests__/cert-pkcs12.test.ts`
Expected: 全 PASS（既存 22 件 + 追加分）。

- [ ] **Step 3: 全ユニットテスト**

Run: `npm run test`
Expected: 全 PASS（他ツールへの影響が無いこと）。

- [ ] **Step 4: 問題があれば該当 Task に戻って修正**

型エラーやテスト失敗があれば、原因の Task のステップに戻して最小修正し、再度本 Task を実行する。

---

## 自己レビュー結果

- **Spec カバレッジ:** #1a=Task1 / #1b=Task2 / #4=Task3 / #6=Task4 / #3+#5=Task5。#2 と他形式変更は spec の通りスコープ外。全要件にタスク対応あり。
- **プレースホルダ:** なし（各ステップに完全なコード/コマンド/期待値を記載）。
- **型整合:** `extractAttributeValue(value: unknown): string` / `formatIpAddress(bytes: Uint8Array): string` / `resolveParentIndex(cert, idx, certs, subjectMap): number | null` / `buildSubjectMap(certs): Map<string, number[]>` / `buildOrder(certs, subjectMap)` をタスク間で一貫使用。`DuplicateDnChain` の `skiBHex` と `subjectKeyId`（lowercase hex）も整合。
- **ドキュメント:** 機能・対応形式・制限事項に変更が無いため README/SPEC/tools.md の更新は不要（spec 記載通り）。
