# #176 B 案 PR 3: `JwtDecoder` + `UuidV7Generator` inline style 撤去 設計書

**作成日**: 2026-05-07
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 3
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) + PR 1.5 ([#261](https://github.com/fumtas1k/devtools/pull/261)) + PR 2 ([#272](https://github.com/fumtas1k/devtools/pull/272)) 完了済み
**参照**: バッチ計画全体は repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)。PR 1 / 1.5 / 2 spec の命名規約・既存 `@layer components` 定義を継承。

---

## ゴール

`src/components/tools/JwtDecoder.tsx` (21 件の `style={{`) と `src/components/tools/UuidV7Generator.tsx` (20 件) から JSX inline style を完全撤去し、`@layer components` の class + Tailwind utility に置換する。同時に、PR 1.5 由来 follow-up [#262](https://github.com/fumtas1k/devtools/issues/262)（applyProductionCsp E2E gate / **PR 6 前段必須**）の **uuid-v7 部分** を `tests/e2e/uuid-v7.spec.ts` に挿入する。

完了基準:

1. 対象 2 ファイルから `style={{` ヒット数 0、`element.style.X = Y` 形式の inline mutation 0
2. `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 2 件を追加（合計 18 件）して migration test pass
3. `src/styles/global.css` の `@layer components` に **本 PR で必要な class のみ** 追加（YAGNI 厳守、§4 参照）
4. **同梱 issue [#262](https://github.com/fumtas1k/devtools/issues/262) 部分対応**:
   - `tests/e2e/uuid-v7.spec.ts` の全 test に `applyProductionCsp(page)` を `goto` 前に挿入
   - 陽性対照 1 件追加（gate 自体の動作確認）
   - ulid-generator 部分は **PR 5 で対応して #262 close**。PR 3 description には「#262 partial」明記
5. **VRT 検証**: `visual-regression.yml` で baseline 比較。意図的差分があれば PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger
6. ローカル必須ゲート: push 前に `npm run test`（vitest）/ `npx astro check` / `npm run test:e2e` 全 green（親 Opus 直接実行）
7. `src/utils/styles.ts` 自体は **削除しない**（PR 6 で削除）。本 PR では `caption` / `bodyEmphasis` / `colors` の **import 削除** のみ
8. `.agents/rules/ui-conventions.md` 追加更新は不要（PR 1 で出揃い）

非ゴール:

- `Gs1Databar` / `EncodingConverter` / `DummyText` (PR 4)、`QrReader` / `ConfigConverter` / `JanCode` / `QrCode` / `UlidGenerator` (PR 5)、`flip + cleanup` (PR 6)
- `ulid-generator.spec.ts` への applyProductionCsp gate 追加（PR 5 スコープ）
- `src/utils/styles.ts` 削除（PR 6）
- `_headers` の `style-src 'unsafe-inline'` 撤去（PR 6）
- `docs/decisions.md` 新規エントリ（PR 6 [067] で B 案完了として一括記録）
- ハードコード hex (`#9333ea` / `#7c3aed` / `#059669` / `#d97706` / `#0891b2` / `#6e4f0e`) の `--color-*` token 化（D2、PR 6 cleanup 候補）

---

## なぜ独立 PR か

| 観点                      | 説明                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PR サイズ規律**         | JwtDecoder + UuidV7Generator で 41 件の inline style + #262 部分対応 + 新規 class 追加。PR 4-5 と bundle すると review unit 肥大化（memory `feedback_pr_size.md`）。                                                                                                                                               |
| **VRT 影響面の独立性**    | jwt-decoder.astro / uuid-v7.astro は独立 page で baseline に乗る。Gs1Databar (PR 4) や QrReader (PR 5) と差分原因を切り分けやすい。                                                                                                                                                                                |
| **#262 同梱の自然性**     | UuidV7Generator は PR 1.5 で導入された `setProperty('--var', value)` を踏む ResultTable を経由する数少ない page。PR 3 で migration したタイミングで CSP gate を入れるのが最も自然（PR 6 まで間が空くと記憶コスト増）。                                                                                             |
| **新規 class の責務範囲** | 本 PR で新規追加するのは `text-warning` / `bg-warning-tint` / `accent-link` の 3 汎用 + `section-jwt-*` (3) / `jwt-json-*` (2) / `jwt-pre` / `uuid-field-*` (5) / `uuid-field-key` / `uuid-field-bits` の固有 12 件。汎用 3 件は PR 4-5 で再利用見込、固有 12 件は本 PR で導入し後続で類似要件があれば再利用する。 |

memory 参照:

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_pr_size.md`
- `feedback_infra_feature_separation.md`
- `feedback_subagent_verification_trust.md`
- `feedback_commander_checklist.md`
- `feedback_e2e_before_pr.md`
- `feedback_subagent_model.md`
- `feedback_prod_parity_csp.md`
- `feedback_positive_control_for_gates.md`

---

## 採用する設計（ファイル別）

### 1. `JwtDecoder.tsx` (21 件)

#### 1.1 `Section` component の variant 化（line 162-203）

**現状**:

```jsx
function Section({ title, accentColor, data, renderValue, 'data-testid': testId }: SectionProps) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: colors.bgSubtle, borderLeft: `4px solid ${accentColor}` }}
      data-testid={testId}
    >
      ...
    </div>
  );
}
```

**移行先**:

```jsx
type SectionVariant = 'header' | 'payload' | 'signature';

interface SectionProps {
  title: string;
  variant: SectionVariant;
  data: Record<string, unknown>;
  renderValue?: (k: string, v: unknown) => React.ReactNode;
  'data-testid'?: string;
}

function Section({ title, variant, data, renderValue, 'data-testid': testId }: SectionProps) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className={`rounded-lg p-4 bg-subtle section-jwt-${variant}`} data-testid={testId}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="body-emphasis text-default">{title}</h3>
        <CopyButton text={json} label="コピー" />
      </div>
      <pre className="overflow-x-auto font-mono text-default jwt-pre">
        <span className="text-muted">{'{'}</span>
        {'\n'}
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="block pl-4">
            {renderValue ? (
              renderValue(k, v)
            ) : (
              <>
                <span className="jwt-json-key">"{k}"</span>
                <span className="text-default">: </span>
                <span className="jwt-json-value">{JSON.stringify(v)}</span>
              </>
            )}
          </span>
        ))}
        <span className="text-muted">{'}'}</span>
      </pre>
    </div>
  );
}
```

呼出側:

```jsx
<Section variant="header"  title="Header (JOSE)"     data={parsed.header}  data-testid="jwt-header" />
<Section variant="payload" title="Payload (Claims)"  data={parsed.payload} renderValue={...} data-testid="jwt-payload" />
```

Signature ボックス（line 367-383、`Section` 不使用の inline 構造）:

```jsx
<div className="rounded-lg p-4 bg-subtle section-jwt-signature">
  <div className="mb-2 flex items-center justify-between">
    <h3 className="body-emphasis text-default">Signature</h3>
    <CopyButton text={parsed.signature} label="コピー" />
  </div>
  <p className="break-all font-mono caption text-default">{parsed.signature}</p>
  <p className="mt-2 caption text-muted">
    {secretKey.trim() ? '上記のキーで署名を検証しています' : 'キーを入力すると署名を検証します'}
  </p>
</div>
```

#### 1.2 `PayloadValue` component（line 139-152）

```jsx
function PayloadValue({ k, v }: { k: string; v: unknown }) {
  const isTs = TIMESTAMP_KEYS.includes(k) && typeof v === 'number';
  return (
    <span>
      <span className="jwt-json-key">"{k}"</span>
      <span className="text-default">: </span>
      <span className="jwt-json-value">{JSON.stringify(v)}</span>
      {isTs && (
        <span className="ml-2 text-xs text-muted">→ {formatTimestamp(v as number)}</span>
      )}
    </span>
  );
}
```

#### 1.3 status badges（line 243-265）

`expBadge` / `sigBadge` の `style: CSSProperties` を `badgeClass: string` に変更:

```ts
const expBadge: Record<ExpStatus, { label: string; badgeClass: string }> = {
  valid: { label: '有効', badgeClass: 'bg-success-tint text-success' },
  expired: { label: '期限切れ', badgeClass: 'bg-error-tint text-error-text' },
  'no-exp': { label: 'exp なし', badgeClass: 'bg-warning-tint text-warning' },
};

const sigBadge: Record<SigStatus, { label: string; badgeClass: string } | null> = {
  unchecked: null,
  verifying: { label: '検証中…', badgeClass: 'bg-subtle text-muted' },
  valid: { label: '署名: 有効', badgeClass: 'bg-success-tint text-success' },
  invalid: { label: '署名: 無効', badgeClass: 'bg-error-tint text-error-text' },
  unsupported: { label: '署名: 未対応アルゴリズム', badgeClass: 'bg-subtle text-muted' },
  error: {
    label: '署名: 検証エラー（キー形式を確認）',
    badgeClass: 'bg-error-tint text-error-text',
  },
};
```

呼出側:

```jsx
<span className={`rounded-full px-3 py-0.5 caption font-medium ${expBadge[parsed.expStatus].badgeClass}`}>
  {expBadge[parsed.expStatus].label}
  {parsed.expStatus === 'valid' && parsed.remainingMs !== undefined && (
    <span className="ml-1 opacity-75">（{formatRemaining(parsed.remainingMs)}）</span>
  )}
</span>

{sigBadge[sigStatus] && (
  <span className={`rounded-full px-3 py-0.5 caption font-medium ${sigBadge[sigStatus]!.badgeClass}`}>
    {sigBadge[sigStatus]!.label}
  </span>
)}
```

`fontWeight: 500` → `font-medium`（Tailwind 500 ✓）。

#### 1.4 checkbox accent-color（line 316-321）

```jsx
<input
  type="checkbox"
  checked={verifyExp}
  onChange={(e) => setVerifyExp(e.target.checked)}
  className="w-4 h-4 accent-link"
/>
```

`w-4 h-4` = 1rem ✓。`.accent-link` は §4 で追加。

#### 1.5 caption / label / hint 系（line 287-324）

```jsx
// 鍵入力ラベル末尾 caption (line 290-298)
<>
  {keyLabel}
  <span className="caption text-muted ml-2">（任意）</span>
</>

// 有効期限ラベル (line 311-315)
<label className="flex items-center gap-2 cursor-pointer caption text-default">
```

`...caption + fontWeight: 400 + marginLeft: '0.5rem'` → caption は既に fontWeight 400、`ml-2` = 0.5rem ✓。

#### 1.6 import 整理

```ts
// Before
import { bodyEmphasis, caption, colors } from '@/utils/styles';
// After (削除のみ — 残す import なし)
```

局所定数 `jsonKeyColor` / `jsonValueColor` も削除（class に隠蔽されたため）。

#### 1.7 件数集計

| 移行先                                                                                 | 件数   |
| -------------------------------------------------------------------------------------- | ------ |
| 既存 class（text-default / bg-subtle 等）                                              | 約 11  |
| 新 class（§4: section-jwt-\* / jwt-\* / accent-link / text-warning / bg-warning-tint） | 約 7   |
| Tailwind 標準 utility のみ（w-4 h-4 等）                                               | 約 3   |
| **合計**                                                                               | **21** |

---

### 2. `UuidV7Generator.tsx` (20 件)

#### 2.1 `FIELD_COLORS` の named class 化

**現状**:

```ts
const FIELD_COLORS = {
  unixTsMs: colors.primary,
  ver: '#7C3AED',
  randA: '#059669',
  varNibble: '#D97706',
  randB: '#0891B2',
} as const;
```

**移行先**:

```ts
const FIELD_CLASSES = {
  unixTsMs: 'uuid-field-ts',
  ver: 'uuid-field-ver',
  randA: 'uuid-field-rand-a',
  varNibble: 'uuid-field-var',
  randB: 'uuid-field-rand-b',
} as const;
```

5 class は §4 で `global.css` に定義。

#### 2.2 `ColoredUuid` component（line 36-63）

```jsx
function ColoredUuid({ uuid, quoteStyle }: { uuid: string; quoteStyle: QuoteStyle }) {
  const parts = uuid.split('-');
  const quote = quoteStyle === 'double' ? '"' : quoteStyle === 'single' ? "'" : '';
  const fullText = `${quote}${uuid}${quote}`;

  return (
    <span
      className="font-mono caption whitespace-nowrap"
      aria-label={fullText}
      title={fullText}
    >
      {quote && <span className="text-muted">{quote}</span>}
      <span className={FIELD_CLASSES.unixTsMs}>{parts[0]}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.unixTsMs}>{parts[1]}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.ver}>{parts[2][0]}</span>
      <span className={FIELD_CLASSES.randA}>{parts[2].substring(1)}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.varNibble}>{parts[3][0]}</span>
      <span className={FIELD_CLASSES.randB}>{parts[3].substring(1)}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.randB}>{parts[4]}</span>
      {quote && <span className="text-muted">{quote}</span>}
    </span>
  );
}
```

注意: 元 inline は `{ ...caption, letterSpacing: '0.02em', whiteSpace: 'nowrap' }`。`.caption` が既に `letter-spacing: 0.02em` を持つため redundancy 解消。

#### 2.3 `FieldBreakdownPanel` component（line 66-107）

```jsx
function FieldBreakdownPanel({ uuid }: { uuid: string }) {
  const fields = parseUuidV7Fields(uuid);

  const fieldDefs = [
    { key: 'unix_ts_ms', bits: '48bit', value: fields.unixTsMs,  className: FIELD_CLASSES.unixTsMs },
    { key: 'ver',        bits: '4bit',  value: fields.ver,       className: FIELD_CLASSES.ver },
    { key: 'rand_a',     bits: '12bit', value: fields.randA,     className: FIELD_CLASSES.randA },
    { key: 'var',        bits: '2bit',  value: fields.varNibble, className: FIELD_CLASSES.varNibble },
    { key: 'rand_b',     bits: '62bit', value: fields.randB,     className: FIELD_CLASSES.randB },
  ] as const;

  return (
    <div className="rounded-lg p-3 bg-subtle border border-default">
      <p className="caption text-muted mb-2">フィールド分解</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {fieldDefs.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5">
            <span className="text-muted uuid-field-key">
              {f.key} <span className="uuid-field-bits">({f.bits})</span>
            </span>
            <code
              className={`font-mono whitespace-nowrap rounded px-1.5 py-0.5 bg-default border border-default caption ${f.className}`}
            >
              {f.value}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**設計判断**: `<code>` の inline は `{ ...caption, fontFamily: 'monospace', color: f.color, background: colors.bg, border: '1px solid ${colors.border}', whiteSpace: 'nowrap' }`。`caption` + `font-mono` で fontFamily を override する形（caption は font-family 未指定）。`.uuid-field-{name}` で color のみ override。実装中に subagent が `.uuid-field-code` 統合 class が読みやすいと判断したら追加可（D3、subagent 判断）。

#### 2.4 ResultTable header の bodyEmphasis（line 180）

```jsx
<span className="body-emphasis text-default">{rows.length} 件生成</span>
```

#### 2.5 import 整理

```ts
// Before
import { bodyEmphasis, caption, colors } from '@/utils/styles';
// After (削除のみ — 残す import なし)
```

#### 2.6 件数集計

| 移行先                                         | 件数   |
| ---------------------------------------------- | ------ |
| FIELD_CLASSES (5 種) を ColoredUuid 内 11 ヶ所 | 11     |
| FieldBreakdownPanel 内（外枠/p/spans/code）    | 5      |
| ColoredUuid 外枠 caption + muted quote (3)     | 3      |
| ResultTable header の bodyEmphasis             | 1      |
| **合計**                                       | **20** |

---

## 3. `tests/e2e/uuid-v7.spec.ts` への #262 部分対応

### 3.1 採用パターン

`tests/e2e/config-converter.spec.ts` line 206-262 を踏襲。`applyProductionCsp(page)` を `goto` 前に挿入し、test 末尾で `guard.assertNoViolations()` を呼ぶ。

### 3.2 実装テンプレート

**重要な制約** (`tests/e2e/helpers.ts` line 40-60 のドキュメントコメント参照):

- default の `page` fixture では `page.route` 介入が **空回り** する。**必ず `browser.newContext()` で新規 context を作る** こと（config-converter.spec.ts の既存 pattern）
- guard の API は `assertNoViolations()` / `violations` getter / `dispose()` の 3 種。`getViolations()` メソッドは存在しない
- 陽性対照は **`script-src` 違反** で起こす（`style-src 'unsafe-inline'` は PR 6 まで残存するため inline style 違反は捕捉できない）。`config-converter.spec.ts` line 242-275 と同じ「外部 origin の `<script src>` を `document.head` に append」pattern を踏襲

```ts
import { test, expect } from '@playwright/test';
import { applyProductionCsp, waitForReactHydration } from './helpers';

test.describe('uuid-v7 generator (with production CSP)', () => {
  test('uuid-v7 を生成できる（CSP 違反なし）', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      await page.goto('/tools/uuid-v7');
      await waitForReactHydration(page);

      // 既存 test ロジック...

      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  // 既存の他 test も同パターンで wrap...

  // 陽性対照（gate 自体の動作確認）
  test('applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/tools/uuid-v7');
      // 前提検証: route 注入によって本番 CSP がレスポンスヘッダに乗っていること
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://example.com/violates-csp.js';
        document.head.appendChild(script);
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
```

実際の挿入位置・assert 形式・既存 test の保持/再構成は subagent が `tests/e2e/config-converter.spec.ts` line 200-275 と既存 `tests/e2e/uuid-v7.spec.ts` の構造を読んで決定。

**migration 工程との整合**: PR 3 では `_headers` の CSP は変更しない（PR 6 まで `style-src 'unsafe-inline'` 残存）。そのため本 PR 時点では gate が「将来的な strict 化に備えた骨組み」として機能する。陽性対照が `script-src` 違反で動作確認できれば gate 自体は機能していることが保証される。

memory `feedback_positive_control_for_gates.md` 準拠（gate には陽性対照を必ず併設）。

### 3.3 #262 close の判定

PR 3 で uuid-v7 部分のみ完了 → **#262 は close せず**、PR 5 (UlidGenerator) で `tests/e2e/ulid-generator.spec.ts` も追加してから close。PR 3 description には「#262 partial」を明記。PR 6 前段必須なので PR 5 で確実に close されれば PR 6 blocking 解消 ✓。

---

## 4. `src/styles/global.css` への追記（PR 3 で**新規追加**する分のみ）

PR 1 / 1.5 / 2 で既に追加済みの class（`.caption` / `.body-emphasis` / `.text-default` / `.text-muted` / `.bg-default` / `.bg-subtle` / `.bg-surface` / `.border-default` / `.border-input` / `.bg-error-tint` / `.bg-success-tint` / `.text-error` / `.text-error-text` / `.text-success` / `.text-primary` / `.alert-success` / `.alert-error` / `.btn-link-plain` 等）は再定義しない。本 PR 追加分:

```css
@layer components {
  /* === PR 3: JwtDecoder + UuidV7Generator migration helpers === */

  /* JwtDecoder: Section accent borders */
  .section-jwt-header {
    border-left: 4px solid var(--color-error);
  }
  .section-jwt-payload {
    border-left: 4px solid #9333ea;
  }
  .section-jwt-signature {
    border-left: 4px solid var(--color-primary);
  }

  /* JwtDecoder: JSON syntax colors (not UI tokens, kept local) */
  .jwt-json-key {
    color: var(--color-link);
  }
  .jwt-json-value {
    color: #6e4f0e;
  }

  /* JwtDecoder: <pre> (decoded JSON) typography */
  .jwt-pre {
    font-size: 0.75rem;
    line-height: 1.33;
    letter-spacing: -0.12px;
  }

  /* Checkbox accent (link color) */
  .accent-link {
    accent-color: var(--color-link);
  }

  /* Warning semantic palette (expBadge no-exp 用) */
  .text-warning {
    color: var(--color-warning);
  }
  .bg-warning-tint {
    background: var(--color-warning-bg);
  }

  /* UuidV7Generator: 5 field colors (UUID hex parts) */
  .uuid-field-ts {
    color: var(--color-primary);
  }
  .uuid-field-ver {
    color: #7c3aed;
  }
  .uuid-field-rand-a {
    color: #059669;
  }
  .uuid-field-var {
    color: #d97706;
  }
  .uuid-field-rand-b {
    color: #0891b2;
  }

  /* UuidV7Generator: field key label typography (caption の font-size override) */
  .uuid-field-key {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.7;
    letter-spacing: 0.02em;
  }
  .uuid-field-bits {
    font-size: 0.7rem;
    opacity: 0.7;
  }
}
```

**衝突確認**:

- `.section-jwt-*` / `.jwt-*` / `.uuid-field-*` は BEM 風命名で唯一性確保
- `.accent-link` は Tailwind の `accent-{color}` ファミリと衝突しない（独立 class）
- `.text-warning` / `.bg-warning-tint` は `--color-warning`（amber-800）/ `--color-warning-bg` の `:root` 既存 token を class 化。Tailwind auto-utility 不在のため衝突なし
- ハードコード hex（`#9333ea` / `#7c3aed` / `#059669` / `#d97706` / `#0891b2` / `#6e4f0e`）はオリジナル一致を優先（VRT 差分回避）

**新 class の将来性**:

- `.text-warning` / `.bg-warning-tint`: PR 4-5 で再利用見込（中〜高）
- `.section-jwt-*` / `.jwt-*` / `.accent-link`: JwtDecoder 固有（低）
- `.uuid-field-*`: UuidV7Generator 固有（低）

PR 6 cleanup でハードコード hex を `--color-*` token 化する選択肢は残せる（`docs/decisions.md` [067] 候補）。本 PR では YAGNI で行わない（D2）。

---

## 5. `inline-style-migration.test.ts` への追加

```ts
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加済み (11 件、省略)
  // PR 1.5 で追加済み
  'src/components/ui/ResultTable.tsx',
  'src/components/ui/InputField.tsx',
  // PR 2 で追加 (qr-ticket)
  'src/components/tools/qr-ticket/GenerateTab.tsx',
  'src/components/tools/qr-ticket/VerifyTab.tsx',
  'src/components/tools/qr-ticket/TicketDetail.tsx',
  // PR 3 で追加
  'src/components/tools/JwtDecoder.tsx',
  'src/components/tools/UuidV7Generator.tsx',
];
```

陽性対照テストブロックは PR 1 で導入済 → 変更不要。

---

## 6. consumer 変更範囲（**PR 3 で touch するファイル**）

| File                                                 | 変更内容                                                   | 備考                        |
| ---------------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| `src/components/tools/JwtDecoder.tsx`                | inline style 全除去 + Section variant 化 + import 整理     | MIGRATED_FILES 登録         |
| `src/components/tools/UuidV7Generator.tsx`           | inline style 全除去 + FIELD_CLASSES 化 + import 整理       | MIGRATED_FILES 登録         |
| `src/styles/global.css`                              | §4 の `@layer components` 追記                             | PR 1/1.5/2 既存ブロック末尾 |
| `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array に 2 件追加                         | -                           |
| `tests/e2e/uuid-v7.spec.ts`                          | applyProductionCsp gate 全 test に挿入 + 陽性対照 1 件追加 | #262 partial 対応           |

`src/components/tools/__tests__/JwtDecoder.test.ts` は **触らない**（`verifySignature` / `ALG_MAP` のロジック test のみで Section の DOM レンダリングを test していないため、Section variant 化の影響なし。astro check で型互換確認）。

---

## 7. 検証戦略

### 7.1 ローカル必須ゲート（push 前、PR 1 / 1.5 / 2 と同じ）

| 順  | コマンド           | 目的                                                                                                      | 失敗時                                         |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `npm run test`     | unit + migration test の MIGRATED_FILES 範囲拡大（16 → 18 件、4 spec 追加） + uuid-v7 関連 unit test pass | 該当ファイルの `style={{` を実コードで除去確認 |
| 2   | `npx astro check`  | TypeScript 型チェック（Section の `accentColor` → `variant` prop 変更に伴う既存 caller 互換）             | type 修正                                      |
| 3   | `npm run test:e2e` | functional E2E（JwtDecoder / UuidV7Generator）+ uuid-v7 CSP gate + 陽性対照                               | regression を fix、陽性対照 pass 確認          |

memory `feedback_subagent_verification_trust.md`: **親 Opus が直接実行**（subagent の "pass" 報告は信頼しない）。

### 7.2 CI

| workflow                | 実行内容                           | required?       |
| ----------------------- | ---------------------------------- | --------------- |
| `test.yml`              | vitest + e2e                       | ✅ required     |
| `visual-regression.yml` | `npm run test:vrt` (baseline 比較) | ❌ non-required |

memory `feedback_vrt_ci_only.md`: ローカル `npm run test:vrt` は走らせない。

### 7.3 VRT 差分の判断フロー（PR 1 / 1.5 / 2 と同じ）

PR comment に diff があった場合:

- 意図しない regression（Section border 太さ違い / badge 色違い / UUID 色分け違い等）→ class 定義 / consumer className 修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和（事前合意必要）
- 意図的変化 → PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back

### 7.4 a11y 退化検知 (memory `feedback_commander_checklist.md` 準拠)

本 PR で特に注意:

- JwtDecoder の `data-testid` 維持（"jwt-header" / "jwt-payload" — 既存 test が依存）
- JwtDecoder の `role="status"` / `aria-live="polite"`（line 353）維持
- UuidV7Generator の `role="status"` / `aria-live="polite"`（line 170）維持
- UuidV7Generator の ColoredUuid の `aria-label` / `title`（screen reader 用 fullText）維持
- `<input type="checkbox">` の checked / onChange / accent-color 機能維持

親 Opus が PR 作成時に下記を実行:

```bash
git diff origin/develop -- src/components/tools/JwtDecoder.tsx src/components/tools/UuidV7Generator.tsx | grep -E '^-.*aria-' | grep -vE '^---|^\+\+\+'
# 出力 0 行であること
```

---

## 8. バッチ計画における本 PR の位置付け

repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md) のテーブル参照。

| #        | スコープ                                                                                | 状態           |
| -------- | --------------------------------------------------------------------------------------- | -------------- |
| PR 0     | VRT 導入                                                                                | ✅ #254 merged |
| PR 1     | 基礎工事 + ui/\* simple 11                                                              | ✅ #256 merged |
| PR 1.5   | ui/\* complex (ResultTable + InputField)                                                | ✅ #261 merged |
| PR 2     | qr-ticket/\*                                                                            | ✅ #272 merged |
| **PR 3** | **JwtDecoder + UuidV7Generator (本 PR)**                                                | **本 PR**      |
| PR 4     | Gs1Databar + EncodingConverter + DummyText                                              | 未着手         |
| PR 5     | QrReader + ConfigConverter + JanCode + QrCode + UlidGenerator + 残り tools + #262 close | 未着手         |
| PR 6     | flip + cleanup                                                                          | 未着手         |

PR は **直列**（前 PR がマージされてから次 PR 着手）。

---

## 9. ブランチ命名 / コミット粒度 / 並列 subagent 分担

### 9.1 ブランチ命名

- `feature/issue-176-b3-jwt-uuid`
- worktree 経由の場合は memory `feedback_worktree_base_branch.md` に従い `git worktree add ... origin/develop -b feature/issue-176-b3-jwt-uuid` を **明示**
- worktree の置き場所は memory `feedback_worktree_location.md` に従い `.claude/worktrees/<name>` または `$TMPDIR/<name>`

### 9.2 コミット粒度

```
1. global.css に PR 3 用 @layer components 追記（section-jwt-*, jwt-json-*, jwt-pre, accent-link, text-warning, bg-warning-tint, uuid-field-*, uuid-field-key, uuid-field-bits）
2. JwtDecoder.tsx: inline style 撤去 + Section variant 化 + import 整理
3. UuidV7Generator.tsx: inline style 撤去 + FIELD_CLASSES 化 + import 整理
4. tests/e2e/uuid-v7.spec.ts: applyProductionCsp gate 全 test 適用 + 陽性対照 1 件 (#262 partial)
5. inline-style-migration.test.ts: MIGRATED_FILES に 2 件追加
6. (VRT 差分が出た場合のみ) update-visual-baseline.yml trigger 結果の baseline commit (bot 自動 push)
```

各 commit で migration test を「追加した範囲だけ pass」する状態に保つ（コミット 5 は最後）。

### 9.3 並列 subagent 分担（sonnet）

memory `feedback_subagent_model.md` に従い `model: "sonnet"` を明示:

| Track | 担当ファイル                                                           | コミット番号 |
| ----- | ---------------------------------------------------------------------- | ------------ |
| **A** | `JwtDecoder.tsx` (21 styles)                                           | 2            |
| **B** | `UuidV7Generator.tsx` (20 styles) + `tests/e2e/uuid-v7.spec.ts` (#262) | 3, 4         |

**順序**:

1. **Phase 0** (親 Opus): worktree 作成 → spec / plan 確定 → コミット 1（global.css foundation）を直接実行
2. **Phase 1** (sonnet 並列): Track A / Track B を並列 dispatch
3. **Phase 2** (親 Opus): コミット 5 (`MIGRATED_FILES` 追加) → ローカル必須ゲート 3 件直接実行 → aria diff 確認 → push → develop ベース PR 作成

### 9.4 PR ベース

`gh pr create --base develop` で必ず明示（memory `feedback_branch_workflow.md` / `feedback_pr_language.md` / `CLAUDE.md` 最重要ルール）。タイトル例:

> `refactor(ui,tools): #176 B 案 PR 3 — JwtDecoder + UuidV7Generator inline style 撤去 + #262 partial`

PR 本文は `--body-file /tmp/claude/pr_body.md` 経由（memory `feedback_heredoc_no_escape.md` / `CLAUDE.md` 6.1）。

---

## 10. リスクと緩和

| ID  | リスク                                                                                                                                | 緩和                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `Section` の `accentColor` prop → `variant` リファクタで `JwtDecoder.test.ts` が壊れる                                                | `JwtDecoder.test.ts` は `verifySignature` / `ALG_MAP` のロジックのみ assert。Section の DOM レンダリングは test していない。astro check で型互換確認のみで OK |
| R2  | `.uuid-field-key` の `font-size: 0.75rem` が `.caption` の 0.875rem を override しない                                                | `.uuid-field-key` を `.caption` の **後** に定義。同 `@layer components` 内で source 順位が後の方が優先（specificity 同等のため）。実装時に subagent が確認   |
| R3  | `applyProductionCsp` を全 test に適用すると既存 e2e が CSP 違反で fail する                                                           | UuidV7Generator は PR 3 内で migration → CSP gate 順序を保つ（コミット 3 → 4）。先に gate を入れて後から migration するのは禁止。subagent への指示で明示      |
| R4  | ハードコード hex（`#9333ea` 等）が将来 design token に統合されるべきか議論                                                            | 本 PR では YAGNI で hex リテラル維持。PR 6 cleanup で `--color-*` token 化検討余地（decisions [067] 候補）                                                    |
| R5  | `accent-color` の Safari/iOS 互換                                                                                                     | Safari 13.1+ / iOS 13.4+ で対応済（caniuse 確認）。元コードも `accentColor` inline style を使っていたため互換維持                                             |
| R6  | `<pre>` の `.jwt-pre` で `letter-spacing: -0.12px` が Tailwind 標準 utility に存在しないため新 class 必須                             | 本 PR で `.jwt-pre` を新 class として追加（§4）。原値厳密一致で VRT diff 回避                                                                                 |
| R7  | UuidV7Generator の ColoredUuid 11 spans が複数ヶ所で同 class を re-use（`unixTsMs` が 2 ヶ所、`randB` が 2 ヶ所）                     | class re-use は CSS 上問題なし。同 class が同じ color を当てる挙動を維持                                                                                      |
| R8  | `tests/e2e/uuid-v7.spec.ts` で `applyProductionCsp` を全 test に適用する変更が既存 test の race condition / timing 依存を顕在化させる | applyProductionCsp は route 注入で初回ナビゲーションから効く。timing 影響は config-converter で検証済み pattern。陽性対照 1 件で gate 自体の動作確認          |

---

## 11. 議論ポイント（spec 確定前に user 判断を要する項目）

実装着手前に user レビュー推奨。本 spec で既に user 承認済みの項目を再記録:

### D1. `Section` の variant 型

- **採用**: `variant: 'header' | 'payload' | 'signature'` の discriminated string union（Section が JwtDecoder 内部の閉じた component なので閉集合 OK）
- **代替**: `accentClass: string` 自由文字列（type 安全性低下）
- **判断**: 採用案（user 承認済 2026-05-07）

### D2. ハードコード hex の token 化タイミング

- **採用**: 本 PR は class 内に hex 直接記述（`#9333ea` / `#7c3aed` / `#059669` / `#d97706` / `#0891b2` / `#6e4f0e` の 6 値）。PR 6 cleanup で `--color-*` token 化を検討
- **代替**: 本 PR で `:root` に token 追加 (`--color-jwt-payload`, `--color-uuid-field-ver` 等)
- **判断**: 採用案（user 承認済 2026-05-07、YAGNI + PR スコープ最小化）

### D3. `.uuid-field-code` の追加可否

- **採用**: 追加しない。`<code>` には `caption font-mono whitespace-nowrap rounded ... uuid-field-{name}` の utility 並べで対応
- **代替**: 統合 class 追加で利用側 className 簡素化
- **判断**: 採用案（user 承認済 2026-05-07、subagent 判断に委ねる余地あり）

### D4. uuid-v7.spec.ts の gate 範囲

- **採用**: 全 test を gate（config-converter 既存 pattern と整合）+ 陽性対照 1 件
- **代替**: ResultTable を踏むテスト 1 件のみ gate
- **判断**: 採用案（user 承認済 2026-05-07、coverage 増 = 同コスト）

### D5. #262 close タイミング

- **採用**: PR 3 では partial 完了、ulid-generator 部分は PR 5 で対応して #262 close
- **代替**: PR 3 で ulid-generator も同時対応して #262 完全 close（scope 拡大）
- **判断**: 採用案（user 承認済 2026-05-07、PR スコープ最小化）

### D6. subagent 分担

- **採用**: Track A (JwtDecoder) / Track B (UuidV7Generator + uuid-v7 E2E) の 2 並列、各 sonnet
- **代替**: 3 並列（E2E 独立 Track）or 1 直列（subagent 1 件で全実装）
- **判断**: 採用案（user 承認済 2026-05-07、E2E は UuidV7Generator と同 file トリーで context 連続）

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 同梱 issue: [#262](https://github.com/fumtas1k/devtools/issues/262) (applyProductionCsp E2E gate, partial 対応)
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1) / [#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp) / [#254](https://github.com/fumtas1k/devtools/pull/254) (VRT) / [#256](https://github.com/fumtas1k/devtools/pull/256) (PR 1) / [#261](https://github.com/fumtas1k/devtools/pull/261) (PR 1.5) / [#272](https://github.com/fumtas1k/devtools/pull/272) (PR 2)
- 過去 decisions: [054]（CSP 初導入）/ [064]（A-1 採用）/ [066]（VRT 採用）
- repo SoT: [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)
- memory: `feedback_pr_size.md` / `feedback_infra_feature_separation.md` / `feedback_subagent_model.md` / `feedback_subagent_verification_trust.md` / `feedback_commander_checklist.md` / `feedback_vrt_ci_only.md` / `feedback_e2e_before_pr.md` / `feedback_branch_workflow.md` / `feedback_pr_language.md` / `feedback_heredoc_no_escape.md` / `feedback_worktree_base_branch.md` / `feedback_worktree_location.md` / `feedback_prod_parity_csp.md` / `feedback_positive_control_for_gates.md`
- PR 1 spec: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
- PR 1.5 spec: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
- PR 2 spec: `docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`
