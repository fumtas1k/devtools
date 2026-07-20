# SAMLデコーダ 共有用マスク出力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SAML デコーダのデコード結果 XML から社員 PII（NameID・属性値）と機密文字列を除去した「共有用マスク XML」を生成し、既存の整形 XML 表示ブロック内でトグル切替・コピーできるようにする。

**Architecture:** 2 フェーズのマスク。フェーズ1 は DOM を再パースして `saml:NameID` / `saml:AttributeValue` のテキストを値ベース一貫トークン `[REDACTED:PII_n]` に置換（構造ベース）。フェーズ2 は再シリアライズ後の XML 文字列に既存 `scrubText` を `HIGH_ENTROPY` 除外で適用し、URL 埋め込みメール等を救済。UI は既存 `details` 内に `ToggleGroup` を追加して表示・コピー対象を切替。

**Tech Stack:** TypeScript / Astro / React island / Vitest（jsdom）/ Playwright。既存 `src/utils/saml/*` と `src/utils/secret-scrubber` を再利用。

---

## File Structure

- `src/utils/saml/ns.ts`（新規）— SAML 名前空間定数（`NS_P` / `NS_A` / `NS_DS`）の単一の真実源。parse.ts と mask.ts が import。
- `src/utils/saml/parse.ts`（変更）— ローカル定義の名前空間定数を `ns.ts` from の import に置換。
- `src/utils/saml/mask.ts`（新規）— `maskSamlXml(xml): SamlMaskResult` を実装。
- `src/utils/saml/index.ts`（変更）— `maskSamlXml` / `SamlMaskResult` を re-export。
- `src/utils/__tests__/saml-mask.test.ts`（新規）— マスクのユニットテスト（陽性対照・陰性対照・不変条件）。
- `src/components/tools/SamlDecoder.tsx`（変更）— ToggleGroup 追加・マスク結果 useMemo・表示切替。
- `tests/e2e/saml-decoder.spec.ts`（変更）— トグル切替の E2E を追記。
- `docs/tools.md` / `docs/decisions.md` / `SPEC.md`（変更）— ドキュメント更新。

---

### Task 1: 名前空間定数を ns.ts へ切り出す（リファクタ）

**Files:**

- Create: `src/utils/saml/ns.ts`
- Modify: `src/utils/saml/parse.ts:11-13`

- [ ] **Step 1: ns.ts を作成**

```ts
/** SAML 2.0 の名前空間 URI（parse.ts / mask.ts の単一の真実源） */
export const NS_P = 'urn:oasis:names:tc:SAML:2.0:protocol';
export const NS_A = 'urn:oasis:names:tc:SAML:2.0:assertion';
export const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
```

- [ ] **Step 2: parse.ts の定数定義を import に置換**

`src/utils/saml/parse.ts` の 11〜13 行目

```ts
const NS_P = 'urn:oasis:names:tc:SAML:2.0:protocol';
const NS_A = 'urn:oasis:names:tc:SAML:2.0:assertion';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
```

を次に置き換える（import 文はファイル冒頭の既存 import 群の直後に置く）:

```ts
import { NS_P, NS_A, NS_DS } from './ns';
```

- [ ] **Step 3: 型チェックと既存テストを実行**

Run: `node_modules/.bin/astro check && npm run test -- saml`
Expected: PASS（parse/decode/checks/format の既存テストが全て緑。挙動は不変）

- [ ] **Step 4: Commit**

```bash
git add src/utils/saml/ns.ts src/utils/saml/parse.ts
git commit -m "refactor: SAML 名前空間定数を ns.ts へ切り出し parse/mask で共有"
```

---

### Task 2: maskSamlXml を実装（構造ベース＋scrubber 併用）

**Files:**

- Create: `src/utils/saml/mask.ts`
- Test: `src/utils/__tests__/saml-mask.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/saml-mask.test.ts` を新規作成:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { maskSamlXml } from '@/utils/saml';
import { SAMPLE_RESPONSE_XML, LOGOUT_REQUEST_XML } from './saml-fixtures';

/** 署名付き Response。X509Certificate / SignatureValue の base64 が over-mask されないことの陰性対照用。 */
const SIGNED_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ID="_rs" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <ds:Signature>
    <ds:SignatureValue>Qm9ndXNTaWduYXR1cmVWYWx1ZUJhc2U2NEhpZ2hFbnRyb3B5QUJDREVGMTIzNDU2Nzg5MA==</ds:SignatureValue>
    <ds:KeyInfo><ds:X509Data><ds:X509Certificate>Rml4dHVyZUNlcnRpZmljYXRlQmFzZTY0SGlnaEVudHJvcHlaWVhXVlUwOTg3NjU0MzIxUVJTVA==</ds:X509Certificate></ds:X509Data></ds:KeyInfo>
  </ds:Signature>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
</samlp:Response>`;

/** Destination の URL クエリにメールを埋め込み、フェーズ2 の scrubber 救済を実証する。 */
const RECIPIENT_EMAIL_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_re" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/acs?login=leaked@corp.example">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
</samlp:Response>`;

describe('maskSamlXml: フェーズ1 構造ベースマスク（陽性対照）', () => {
  it('NameID のメールがマスクされる', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(xml).not.toContain('taro.yamada@example.com');
    expect(xml).toContain('[REDACTED:PII_');
  });

  it('パターンでは拾えない日本語氏名（displayName）がマスクされる', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(xml).not.toContain('山田 太郎');
  });

  it('複数 AttributeValue（groups の dev / admin）がすべてマスクされる', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    // Attribute 値として単独出現する dev / admin が消える（要素名 groups は残る）
    expect(xml).not.toMatch(/>dev</);
    expect(xml).not.toMatch(/>admin</);
    expect(xml).toContain('Name="groups"');
  });

  it('同一値（NameID メール = mail 属性値）は同一トークンになる（相関）', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    const tokens = xml.match(/\[REDACTED:PII_\d+\]/g) ?? [];
    // NameID と mail 属性が同じメールを持つため、同一トークンが 2 回以上出現する
    const counts = tokens.reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.values(counts).some((c) => c >= 2)).toBe(true);
  });

  it('piiCount は occurrence 数（NameID 1 + mail 1 + displayName 1 + groups 2 = 5）', () => {
    const { piiCount } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(piiCount).toBe(5);
  });

  it('LogoutRequest の NameID もマスクされる', () => {
    const { xml, piiCount } = maskSamlXml(LOGOUT_REQUEST_XML);
    expect(xml).not.toContain('taro@example.com');
    expect(piiCount).toBeGreaterThanOrEqual(1);
  });
});

describe('maskSamlXml: フェーズ2 scrubber 併用（陽性対照）', () => {
  it('Destination URL に埋め込まれたメールが scrubber でマスクされる', () => {
    const { xml, secretCount } = maskSamlXml(RECIPIENT_EMAIL_RESPONSE_XML);
    expect(xml).not.toContain('leaked@corp.example');
    expect(xml).toContain('[REDACTED:EMAIL_');
    expect(secretCount).toBeGreaterThanOrEqual(1);
  });
});

describe('maskSamlXml: over-mask していないこと（陰性対照）', () => {
  it('X509Certificate / SignatureValue の base64（HIGH_ENTROPY）は残る', () => {
    const { xml } = maskSamlXml(SIGNED_RESPONSE_XML);
    expect(xml).toContain(
      'Qm9ndXNTaWduYXR1cmVWYWx1ZUJhc2U2NEhpZ2hFbnRyb3B5QUJDREVGMTIzNDU2Nzg5MA=='
    );
    expect(xml).toContain(
      'Rml4dHVyZUNlcnRpZmljYXRlQmFzZTY0SGlnaEVudHJvcHlaWVhXVlUwOTg3NjU0MzIxUVJTVA=='
    );
  });

  it('タイムスタンプ・要素名・属性名・ID が保持される', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    expect(xml).toContain('2026-07-17T00:00:00Z');
    expect(xml).toContain('Name="mail"');
    expect(xml).toContain('ID="_resp1"');
    expect(xml).toContain('SessionIndex="_s1"');
  });
});

describe('maskSamlXml: 不変条件', () => {
  it('マスク後の出力は valid XML のまま（再パースできる）', () => {
    const { xml } = maskSamlXml(SAMPLE_RESPONSE_XML);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
  });

  it('パース不能な入力は件数 0 で元の文字列を返す', () => {
    const { xml, piiCount, secretCount } = maskSamlXml('<broken');
    expect(piiCount).toBe(0);
    expect(secretCount).toBe(0);
    expect(xml).toBe('<broken');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- saml-mask`
Expected: FAIL（`maskSamlXml` が `@/utils/saml` から export されておらず import エラー）

- [ ] **Step 3: mask.ts を実装**

`src/utils/saml/mask.ts` を新規作成:

```ts
import { scrubText, type ScrubCategory } from '@/utils/secret-scrubber';
import { NS_A } from './ns';

export interface SamlMaskResult {
  /** マスク済み XML（シリアライズ後の文字列。表示側で formatXml して整形表示する） */
  xml: string;
  /** 構造ベース（フェーズ1）でマスクした occurrence 数 */
  piiCount: number;
  /** secret-scrubber（フェーズ2）でマスクした occurrence 数 */
  secretCount: number;
}

/**
 * フェーズ2 で有効にする secret-scrubber カテゴリ。
 * HIGH_ENTROPY を除外して X509Certificate / SignatureValue / DigestValue の
 * base64（非 PII・公開情報）を over-mask しないようにする。
 */
const SCRUB_ENABLED: Record<ScrubCategory, boolean> = {
  API_KEY: true,
  PRIVATE_KEY: true,
  CREDENTIAL: true,
  JWT: true,
  EMAIL: true,
  IP: true,
  PHONE_JP: true,
  CREDIT_CARD: true,
  HIGH_ENTROPY: false,
};

/**
 * デコード済み SAML XML から PII / 機密文字列を除去した共有用 XML を生成する。
 *
 * フェーズ1（構造ベース）: saml:NameID / saml:AttributeValue のテキストを値ベース一貫
 * トークン [REDACTED:PII_n] に置換する（同一値 → 同一トークンで相関を保つ）。
 * フェーズ2（scrubber 併用）: 再シリアライズ後の文字列に scrubText を HIGH_ENTROPY 除外で
 * 適用し、URL 埋め込みメール等の構造で拾えない残余を救済する。
 *
 * 純関数。パース不能な入力は件数 0 で元の文字列を返す。
 */
export function maskSamlXml(xml: string): SamlMaskResult {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return { xml, piiCount: 0, secretCount: 0 };
    }

    // フェーズ1: 構造ベースマスク（値ベース一貫トークン化）
    const tokenMap = new Map<string, string>();
    let counter = 0;
    let piiCount = 0;
    const maskElement = (el: Element): void => {
      const value = el.textContent ?? '';
      if (!value.trim()) return;
      let token = tokenMap.get(value);
      if (!token) {
        counter += 1;
        token = `[REDACTED:PII_${counter}]`;
        tokenMap.set(value, token);
      }
      el.textContent = token;
      piiCount += 1;
    };
    const targets: Element[] = [
      ...Array.from(doc.getElementsByTagNameNS(NS_A, 'NameID')),
      ...Array.from(doc.getElementsByTagNameNS(NS_A, 'AttributeValue')),
    ];
    for (const el of targets) maskElement(el);

    const serialized = new XMLSerializer().serializeToString(doc);

    // フェーズ2: secret-scrubber 残余救済
    const scrubbed = scrubText(serialized, SCRUB_ENABLED);
    return { xml: scrubbed.output, piiCount, secretCount: scrubbed.findings.length };
  } catch {
    return { xml, piiCount: 0, secretCount: 0 };
  }
}
```

- [ ] **Step 4: index.ts に re-export を追加**

`src/utils/saml/index.ts` の末尾（`export { formatXml } from './format';` の次の行）に追加:

```ts
export { maskSamlXml, type SamlMaskResult } from './mask';
```

- [ ] **Step 5: テストと型チェックを実行して緑を確認**

Run: `npm run test -- saml-mask && node_modules/.bin/astro check`
Expected: PASS（全テスト緑・型エラーなし）

- [ ] **Step 6: Commit**

```bash
git add src/utils/saml/mask.ts src/utils/saml/index.ts src/utils/__tests__/saml-mask.test.ts
git commit -m "feat: SAML デコーダに共有用マスク出力ロジックを追加

構造ベース（NameID/AttributeValue）＋secret-scrubber 併用（HIGH_ENTROPY 除外）で
PII・機密を除去。値ベース一貫トークンで相関を保つ。陽性/陰性対照テスト付き。"
```

---

### Task 3: SamlDecoder UI にマスク表示トグルを追加

**Files:**

- Modify: `src/components/tools/SamlDecoder.tsx`

- [ ] **Step 1: import と型・state を追加**

`src/components/tools/SamlDecoder.tsx` 冒頭付近の import に `ToggleGroup` を追加し、`@/utils/saml` の import に `maskSamlXml` を追加する。

`import { ResultTable, type TableColumn } from '@/components/ui/ResultTable';` の次の行に:

```tsx
import { ToggleGroup } from '@/components/ui/ToggleGroup';
```

`@/utils/saml` の import 分割代入（`formatXml,` の行付近）に `maskSamlXml,` を追加する。

ファイル上部（`const BINDING_LABEL` の直前）に型エイリアスを追加:

```tsx
type XmlView = 'raw' | 'masked';
```

- [ ] **Step 2: コンポーネント内に state と useMemo を追加**

`export function SamlDecoderTool()` 内、`const [spEntityId, setSpEntityId] = useState('');` の次の行に:

```tsx
const [xmlView, setXmlView] = useState<XmlView>('raw');
```

`const prettyXml = useMemo(() => (ok ? formatXml(ok.decoded.xml) : ''), [ok]);` の次の行に:

```tsx
const masked = useMemo(() => (ok ? maskSamlXml(ok.decoded.xml) : null), [ok]);
const maskedXml = useMemo(() => (masked ? formatXml(masked.xml) : ''), [masked]);
const displayedXml = xmlView === 'masked' ? maskedXml : prettyXml;
```

- [ ] **Step 3: 生 XML details ブロックを差し替える**

既存の `{/* 生 XML */}` から `</details>` までのブロックを次に置き換える:

```tsx
{
  /* 生 XML / マスク XML */
}
<details className="rounded-lg bg-subtle">
  <summary className="cursor-pointer p-4 body-emphasis text-default">
    整形済み XML（簡易整形）
  </summary>
  <div className="px-4 pb-4 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ToggleGroup<XmlView>
        options={[
          { value: 'raw', label: '生 XML' },
          { value: 'masked', label: 'マスク XML（共有用）' },
        ]}
        value={xmlView}
        onChange={setXmlView}
        ariaLabel="XML 表示モード"
        size="sm"
        layout="wrap"
      />
      <CopyButton text={displayedXml} label="コピー" />
    </div>
    {xmlView === 'masked' && masked && (
      <div className="space-y-1">
        <StatusBadge tone="info">
          {masked.piiCount + masked.secretCount > 0
            ? `PII ${masked.piiCount} 件・機密 ${masked.secretCount} 件をマスク`
            : 'マスク対象なし'}
        </StatusBadge>
        <p className="hint-xs text-muted">
          共有前に必ず目視で確認してください。構造上の PII
          フィールドと既知パターンの除去であり、完全な匿名化を保証するものではありません。
        </p>
      </div>
    )}
    <pre className="overflow-x-auto font-mono caption text-default">{displayedXml}</pre>
    <p className="hint-xs text-muted">
      簡易整形のため、タグ間に混在するテキスト（mixed content）は表示されない場合があります。
    </p>
  </div>
</details>;
```

- [ ] **Step 4: Clear 時に xmlView をリセット**

`onClick={() => {` 内の `setSpEntityId('');` の次の行に:

```tsx
setXmlView('raw');
```

- [ ] **Step 5: 型チェック・lint・format を実行**

Run: `node_modules/.bin/astro check && npm run lint && npm run format:check`
Expected: PASS（型・button type・整形すべて緑）

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/SamlDecoder.tsx
git commit -m "feat: SAML デコーダに 生 XML / マスク XML の表示トグルを追加"
```

---

### Task 4: E2E テストを追記

**Files:**

- Modify: `tests/e2e/saml-decoder.spec.ts`

- [ ] **Step 1: テストを追記**

`tests/e2e/saml-decoder.spec.ts` の最後の `test(...)` の後ろ（`describe` の閉じ括弧の直前）に追加:

```ts
test('マスク XML トグルで PII がトークン化されコピー対象も切替わる', async ({ page }) => {
  await page.getByRole('button', { name: 'サンプル' }).click();
  await expect(page.getByText('Response サマリ')).toBeVisible();

  // 整形済み XML の details を開く
  await page.getByText('整形済み XML（簡易整形）').click();

  // 生 XML モードでは NameID のメールが表示される
  const xmlBlock = page.locator('pre').last();
  await expect(xmlBlock).toContainText('taro.yamada@example.com');

  // マスク XML に切替
  await page.getByRole('button', { name: 'マスク XML（共有用）' }).click();
  await expect(xmlBlock).not.toContainText('taro.yamada@example.com');
  await expect(xmlBlock).toContainText('[REDACTED:PII_');
  await expect(xmlBlock).not.toContainText('山田 太郎');

  // 件数バッジが表示される
  await expect(page.getByText(/PII \d+ 件・機密 \d+ 件をマスク/)).toBeVisible();
});
```

> 注: `pre` 要素の locator は属性セレクタではなく可視テキストで検証している。`getByRole('button', ...)` はトグルボタン（`btn-toggle`）に一致する。

- [ ] **Step 2: E2E を実行**

Run: `npm run test:e2e -- saml-decoder`
Expected: PASS（新規ケース含む全ケース緑）

> ローカル sandbox で loopback 接続が全面 deny される環境では in-session E2E 実行不能。接続 probe が 2〜3 回失敗したら打ち切り、PR 本文にローカル E2E 未実行の旨と理由を明示して CI を最終ゲートとする（`.claude/rules/git-and-fs.md`）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/saml-decoder.spec.ts
git commit -m "test: SAML デコーダのマスク XML トグルの E2E を追加"
```

---

### Task 5: ドキュメント更新

**Files:**

- Modify: `docs/tools.md`（SAML デコーダの節）
- Modify: `docs/decisions.md`（末尾に決定を追記）
- Modify: `SPEC.md`（SAML デコーダの機能記述に一文追記があれば）

- [ ] **Step 1: docs/tools.md に追記**

`docs/tools.md` の SAML デコーダの節に、マスク出力の仕組みと制限を追記する。追記内容の要点:

- 「共有用マスク XML」トグルで NameID・全 AttributeValue を値ベース一貫トークン `[REDACTED:PII_n]` に置換
- secret-scrubber を `HIGH_ENTROPY` 除外で併用し URL 埋め込みメール等を救済
- 署名値・証明書・タイムスタンプ・ID・要素名は構造情報として保持
- 完全な匿名化は保証せず共有前の目視確認が必要

（既存節の文体・見出しレベルに合わせる。該当節の場所は `grep -n "SAML" docs/tools.md` で特定する）

- [ ] **Step 2: docs/decisions.md に決定を追記**

`docs/decisions.md` の既存の最新エントリの採番形式（`[NNN]`）に合わせ、次の要旨で 1 エントリ追記:

- 決定: SAML マスク出力は構造ベース（NameID/AttributeValue）を主とし secret-scrubber を副で併用。scrubber は `HIGH_ENTROPY` を除外。
- 理由: パターンベースのみでは日本語氏名等を拾えず、逆に HIGH_ENTROPY を有効化すると X509Certificate/SignatureValue（非 PII・公開情報）を over-mask する。構造で意味的 PII を確実に除去しつつ、URL 埋め込み等の残余を scrubber で救済する二段構えが最も過不足が少ない。

- [ ] **Step 3: SPEC.md を確認・必要なら追記**

Run: `grep -n "saml\|SAML" SPEC.md`
該当ツールの機能記述に「共有用マスク出力」を一文追記する（記述が無ければスキップしてよい。ツール追加ではないため 9 章チェックリストは対象外）。

- [ ] **Step 4: format:check を実行**

Run: `npm run format:check`
Expected: PASS（Markdown 整形崩れなし。崩れていれば `npm run format` で修正）

- [ ] **Step 5: Commit**

```bash
git add docs/tools.md docs/decisions.md SPEC.md
git commit -m "docs: SAML デコーダ共有用マスク出力の仕組み・決定を追記"
```

---

### Task 6: 最終検証と VRT 確認

- [ ] **Step 1: push 前必須チェックをすべて実行**

Run: `npm run format:check && npm run test && node_modules/.bin/astro check`
Expected: すべて PASS

- [ ] **Step 2: ビルドして VRT 影響を確認**

Run: `npm run build`
Expected: ビルド成功。`details` は初期折りたたみのため `/tools/saml-decoder` の VRT baseline に影響しない見込み。実際に描画差が疑われる場合のみ、対象ブランチで `Update Visual Regression Baseline` workflow を手動トリガーする（web セッションは自動起動不可）。

- [ ] **Step 3: E2E（可能なら）**

Run: `npm run test:e2e -- saml-decoder`
Expected: PASS。loopback deny 環境では未実行として PR 本文に明記。

- [ ] **Step 4: push して PR 作成**

`git push -u origin claude/issue-745-m0e3kx` 後、`--base develop` で PR を作成する（本文は issue #745 を参照し、実装スコープ・テスト状況を記載）。

---

## Self-Review 結果

- **Spec coverage:** フェーズ1（Task 2）・フェーズ2（Task 2）・UI トグル（Task 3）・全メッセージ型対応（Task 2/4、LogoutRequest テスト含む）・テスト陽性/陰性対照（Task 2）・E2E（Task 4）・docs（Task 5）・VRT（Task 6）をカバー。
- **Placeholder scan:** コード無し記述は Task 5 の docs のみ（既存文体への追従が必要なため要点箇条書き＋位置特定コマンドを明示）。他は完全コード。
- **Type consistency:** `SamlMaskResult`（`xml` / `piiCount` / `secretCount`）と `XmlView`（`'raw' | 'masked'`）は全 Task で一貫。`maskSamlXml` シグネチャは Task 2 定義と Task 3 利用で一致。
