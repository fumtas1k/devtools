# JSON整形・ビューア PR3: 機密データマスキング 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** json-formatter に「マスク」表示モードを追加し、PII/シークレットを検出して種別ラベルプレースホルダーで一括マスクし、コピー/DL できるようにする。

**Architecture:** 純関数 `maskValue(value, options)` がパース済み JS 値を再帰走査し、キー名規則＋値正規表現でマスク済み値と種別別 count を返す。マスク結果は `JSON.stringify` → 既存 `processJson` に通して表示経路を再利用（PR2 のクエリと同方式）。クエリ有効時は抽出結果をマスク対象にする。依存追加なし・CSP 影響なし。

**Tech Stack:** TypeScript / React 19 / Astro / Vitest / Playwright（正規表現のみ、新規ライブラリなし）

設計書: `docs/superpowers/specs/2026-05-29-json-formatter-mask-design.md`

---

## File Structure

- Create: `src/utils/json-formatter/mask.ts` — `maskValue` / 型 / 検出ルール
- Create: `src/utils/json-formatter/__tests__/mask.test.ts`
- Modify: `src/utils/json-formatter/index.ts` — `export * from './mask';`
- Modify: `src/components/tools/JsonFormatter.tsx` — マスクモード・種別トグル・内訳バッジ・クエリ結果値の公開
- Modify: `tests/e2e/json-formatter.spec.ts` — マスク E2E（原値が DOM に出ないこと・CSP 無違反）
- Modify: `README.md` / `SPEC.md` / `docs/decisions.md`

ブランチ: `feat/json-formatter-mask`（作成済み、origin/develop 起点）。

---

## Task 1: mask.ts（検出＋マスク・純関数）

**Files:**

- Create: `src/utils/json-formatter/mask.ts`
- Test: `src/utils/json-formatter/__tests__/mask.test.ts`

これは検知機構（detection）のため **test-gates 準拠**。最重要の陽性対照は「元の機密値が出力に一切残らない」こと。

- [ ] **Step 1: 失敗するテストを書く（陰性対照 / 陽性対照を別 describe に分離）**

`src/utils/json-formatter/__tests__/mask.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maskValue, type MaskCategory } from '../mask';

const ALL_ON: Record<MaskCategory, boolean> = {
  SECRET: true,
  EMAIL: true,
  JWT: true,
  IP: true,
  CREDIT_CARD: true,
  PHONE_JP: true,
};

// 陰性対照: 非機密はそのまま・counts 0。
describe('maskValue 陰性対照（非機密は不変）', () => {
  it('普通の文字列・数値・boolean はそのまま', () => {
    const { masked, counts } = maskValue(
      { name: '東京タワー', n: 333, ok: true },
      { enabled: ALL_ON }
    );
    expect(masked).toEqual({ name: '東京タワー', n: 333, ok: true });
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
  });

  it('Luhn 不通過の 16 桁は CREDIT_CARD として検出しない', () => {
    const { masked, counts } = maskValue({ x: '1234567812345678' }, { enabled: ALL_ON });
    expect(masked).toEqual({ x: '1234567812345678' });
    expect(counts.CREDIT_CARD).toBe(0);
  });
});

// 陽性対照（別 describe・最重要）: 原値が出力に一切残らない。
describe('maskValue 陽性対照（機密を検出してマスク）', () => {
  it('値パターン（email/JWT/IP）をプレースホルダーに置換し原値を残さない', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-_123';
    const input = { mail: 'taro@example.com', t: jwt, host: '192.168.0.1' };
    const { masked, counts } = maskValue(input, { enabled: ALL_ON });
    const text = JSON.stringify(masked);
    expect(text).toContain('[REDACTED:EMAIL]');
    expect(text).toContain('[REDACTED:JWT]');
    expect(text).toContain('[REDACTED:IP]');
    // 原値が一切含まれない（検知が空回りなら fail）
    expect(text).not.toContain('taro@example.com');
    expect(text).not.toContain(jwt);
    expect(text).not.toContain('192.168.0.1');
    expect(counts.EMAIL).toBe(1);
    expect(counts.JWT).toBe(1);
    expect(counts.IP).toBe(1);
  });

  it('キー名規則（password 等）は値全体をマスクし非文字列値も隠す', () => {
    const { masked, counts } = maskValue(
      { password: 'hunter2', api_key: 12345, nested: { client_secret: { a: 1 } } },
      { enabled: ALL_ON }
    );
    expect(masked).toEqual({
      password: '[REDACTED:SECRET]',
      api_key: '[REDACTED:SECRET]',
      nested: { client_secret: '[REDACTED:SECRET]' },
    });
    expect(JSON.stringify(masked)).not.toContain('hunter2');
    expect(counts.SECRET).toBe(3);
  });

  it('Luhn 通過のカード番号を検出する', () => {
    // 4111 1111 1111 1111 は Luhn 通過の代表的テスト番号
    const { masked, counts } = maskValue({ card: '4111111111111111' }, { enabled: ALL_ON });
    expect(masked).toEqual({ card: '[REDACTED:CREDIT_CARD]' });
    expect(counts.CREDIT_CARD).toBe(1);
  });

  it('文字列の部分一致も置換し前後を保持する', () => {
    const { masked } = maskValue({ note: '連絡は taro@example.com まで' }, { enabled: ALL_ON });
    expect(masked).toEqual({ note: '連絡は [REDACTED:EMAIL] まで' });
  });

  it('種別 off にすると素通りする（原値保持・count 0）', () => {
    const enabled = { ...ALL_ON, EMAIL: false };
    const { masked, counts } = maskValue({ mail: 'taro@example.com' }, { enabled });
    expect(masked).toEqual({ mail: 'taro@example.com' });
    expect(counts.EMAIL).toBe(0);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/mask.test.ts`
Expected: FAIL（`Cannot find module '../mask'`）。

- [ ] **Step 3: 実装**

`src/utils/json-formatter/mask.ts`:

```ts
export type MaskCategory = 'SECRET' | 'EMAIL' | 'JWT' | 'IP' | 'CREDIT_CARD' | 'PHONE_JP';

export interface MaskOptions {
  enabled: Record<MaskCategory, boolean>;
}

export interface MaskResult {
  masked: unknown;
  counts: Record<MaskCategory, number>;
}

export const MASK_CATEGORIES: MaskCategory[] = [
  'SECRET',
  'EMAIL',
  'JWT',
  'IP',
  'CREDIT_CARD',
  'PHONE_JP',
];

// キー名に部分一致したら値全体を [REDACTED:SECRET] にする。
const SECRET_KEY_PARTS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'private_key',
  'access_key',
  'client_secret',
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_PARTS.some((p) => k.includes(p));
}

// 値パターン（g フラグで部分一致を全置換）
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
// カード: 13–16 桁（区切り - / 空白許容）。Luhn は callback で検証。
const CARD_RE = /\b\d(?:[ -]?\d){12,15}\b/g;
// 日本の電話番号（0 始まり、桁数で絞る）。誤検出するため toggle 可。
const PHONE_RE = /\b0\d{1,3}[-\s]?\d{1,4}[-\s]?\d{3,4}\b/g;

function isValidIpv4(s: string): boolean {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => Number(p) <= 255);
}

function luhnOk(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 16) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function maskString(s: string, options: MaskOptions, counts: Record<MaskCategory, number>): string {
  let out = s;
  if (options.enabled.EMAIL) {
    out = out.replace(EMAIL_RE, () => {
      counts.EMAIL++;
      return '[REDACTED:EMAIL]';
    });
  }
  if (options.enabled.JWT) {
    out = out.replace(JWT_RE, () => {
      counts.JWT++;
      return '[REDACTED:JWT]';
    });
  }
  if (options.enabled.IP) {
    out = out.replace(IP_RE, (m) => {
      if (!isValidIpv4(m)) return m;
      counts.IP++;
      return '[REDACTED:IP]';
    });
  }
  // カードを電話より先に（数字列の取り合いを避ける）
  if (options.enabled.CREDIT_CARD) {
    out = out.replace(CARD_RE, (m) => {
      if (!luhnOk(m)) return m;
      counts.CREDIT_CARD++;
      return '[REDACTED:CREDIT_CARD]';
    });
  }
  if (options.enabled.PHONE_JP) {
    out = out.replace(PHONE_RE, () => {
      counts.PHONE_JP++;
      return '[REDACTED:PHONE_JP]';
    });
  }
  return out;
}

function walk(value: unknown, options: MaskOptions, counts: Record<MaskCategory, number>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, options, counts));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (options.enabled.SECRET && isSecretKey(k)) {
        counts.SECRET++;
        out[k] = '[REDACTED:SECRET]';
      } else {
        out[k] = walk(v, options, counts);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    return maskString(value, options, counts);
  }
  return value;
}

/**
 * パース済み JS 値を走査し、キー名規則＋値パターンで機密を [REDACTED:<種別>] に置換する。
 * counts に種別別の置換件数を積算する。純関数（入力は破壊しない）。
 */
export function maskValue(value: unknown, options: MaskOptions): MaskResult {
  const counts: Record<MaskCategory, number> = {
    SECRET: 0,
    EMAIL: 0,
    JWT: 0,
    IP: 0,
    CREDIT_CARD: 0,
    PHONE_JP: 0,
  };
  const masked = walk(value, options, counts);
  return { masked, counts };
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/mask.test.ts`
Expected: PASS（8 tests）。失敗時は実装を修正（テストは変えない）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/json-formatter/mask.ts src/utils/json-formatter/__tests__/mask.test.ts
git commit -m "feat: 機密データ検出＋マスク maskValue を追加（原値非残存の陽性対照付き）"
```

---

## Task 2: index.ts で mask を re-export

**Files:** Modify `src/utils/json-formatter/index.ts`

- [ ] **Step 1: re-export を追加**

`src/utils/json-formatter/index.ts` の先頭付近、既存の `export * from './query';` の隣に追加:

```ts
export * from './mask';
```

- [ ] **Step 2: 型チェック + 既存テスト**

Run: `node_modules/.bin/astro check && npx vitest run src/utils/json-formatter/`
Expected: 型 0 errors / 全 json-formatter 単体 PASS。

- [ ] **Step 3: Commit**

```bash
git add src/utils/json-formatter/index.ts
git commit -m "feat: maskValue を json-formatter の公開 API に追加"
```

---

## Task 3: コンポーネントにマスクモードを追加

**Files:** Modify `src/components/tools/JsonFormatter.tsx`

UI はユニットテストせず Task 4 の E2E + 実機目視で検証する。現状のファイルは PR2 でクエリ機能（`queryEval` / `displayOutput` / `displayTree`）が入っている。以下を**順に**適用する。

- [ ] **Step 1: import と型を更新**

- import 行を変更（`maskValue`, `MASK_CATEGORIES`, 型 `MaskCategory` を追加）:

```ts
import {
  processJson,
  runQuery,
  maskValue,
  MASK_CATEGORIES,
  type IndentStyle,
  type TreeNode,
  type MaskCategory,
} from '@/utils/json-formatter';
```

- `View` 型に `'mask'` を追加:

```ts
type View = 'text' | 'tree' | 'mask';
```

- 種別の日本語ラベルと初期 enabled をファイル上部（`SAMPLE` 定数の下）に追加:

```ts
const CATEGORY_LABEL: Record<MaskCategory, string> = {
  SECRET: 'キー名',
  EMAIL: 'メール',
  JWT: 'JWT',
  IP: 'IP',
  CREDIT_CARD: 'カード番号',
  PHONE_JP: '電話番号',
};

const ALL_CATEGORIES_ON: Record<MaskCategory, boolean> = {
  SECRET: true,
  EMAIL: true,
  JWT: true,
  IP: true,
  CREDIT_CARD: true,
  PHONE_JP: true,
};
```

- [ ] **Step 2: queryEval に抽出結果の生値を公開**

`queryEval` の成功 return（`return { error: null as string | null, output: processed.output, tree: processed.tree };`）を、生値も返すよう変更:

```ts
return {
  error: null as string | null,
  output: processed.output,
  tree: processed.tree,
  resultValue: qr.result as unknown,
};
```

エラー/不正の 2 つの return（`{ error: ..., output: '', tree: null }`）にも `resultValue: undefined as unknown` を追加して型を揃える:

```ts
if (!qr.ok)
  return {
    error: qr.error,
    output: '',
    tree: null as TreeNode | null,
    resultValue: undefined as unknown,
  };
```

```ts
return {
  error: e instanceof Error ? e.message : 'クエリ結果の整形に失敗しました',
  output: '',
  tree: null as TreeNode | null,
  resultValue: undefined as unknown,
};
```

- [ ] **Step 3: マスク state と評価を追加**

`queryHint` の定義の後に追加:

```ts
const [maskEnabled, setMaskEnabled] = useState<Record<MaskCategory, boolean>>(ALL_CATEGORIES_ON);

// マスク対象の元値: クエリ有効なら抽出結果、無効なら入力全体。
const maskBaseValue = queryActive ? queryEval?.resultValue : meta.value;

const maskEval = useMemo(() => {
  if (view !== 'mask' || maskBaseValue === undefined) return null;
  const { masked, counts } = maskValue(maskBaseValue, { enabled: maskEnabled });
  try {
    const processed = processJson(JSON.stringify(masked) ?? 'null', { mode, indent });
    return { output: processed.output, counts };
  } catch (e) {
    return {
      output: e instanceof Error ? '' : '',
      counts,
    };
  }
}, [view, maskBaseValue, maskEnabled, mode, indent]);

const toggleCategory = (cat: MaskCategory) =>
  setMaskEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));
```

- [ ] **Step 4: 表示トグルに「マスク」を追加し、出力分岐を更新**

- 表示 ToggleGroup の options に `{ value: 'mask', label: 'マスク' }` を追加:

```tsx
<ToggleGroup
  options={[
    { value: 'text', label: 'テキスト' },
    { value: 'tree', label: 'ツリー' },
    { value: 'mask', label: 'マスク' },
  ]}
  value={view}
  onChange={setView}
  ariaLabel="表示形式"
  size="sm"
  layout="wrap"
/>
```

- `hasResult` の定義を、マスクモードも考慮する形に変更:

```ts
const maskOutput = maskEval?.output ?? '';
const effectiveOutput = view === 'mask' ? maskOutput : displayOutput;
const hasResult = effectiveOutput !== '';
```

（既存の `const hasResult = displayOutput !== '';` を置き換える。`maskOutput`/`effectiveOutput` は `displayOutput`/`displayTree` 定義の直後に置く。）

- `handleDownload` を `effectiveOutput` ベースに:

```ts
const handleDownload = () => {
  if (!effectiveOutput) return;
  downloadText(effectiveOutput, 'data.json', 'application/json');
};
```

- `downloadButton` の `disabled` を `effectiveOutput` に:

```tsx
      disabled={isPending || !effectiveOutput}
```

- [ ] **Step 5: 結果カラムにマスクモード描画を追加**

結果カラム（`view === 'text' ? (...) : (...)` の三項）を、マスクモードを含む分岐に変更する。`view === 'text'` ブロックはそのまま、`view === 'tree'` ブロックもそのまま残し、`view === 'mask'` を加える。実装は次の形（既存の text/tree JSX を活かしつつ mask を追加）:

```tsx
<div className="w-full md:flex-1 min-w-0">
  {view === 'mask' ? (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 min-h-8 gap-2 flex-wrap">
        <span className="body-emphasis text-default">結果（マスク済み）</span>
        {hasResult && (
          <div className="flex items-center gap-2">
            {downloadButton}
            <CopyButton text={effectiveOutput} ariaLabel="マスク済み結果をコピー" />
          </div>
        )}
      </div>

      {/* 種別トグル */}
      <fieldset className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <legend className="caption text-muted">マスク対象</legend>
        {MASK_CATEGORIES.map((cat) => (
          <label key={cat} className="caption inline-flex items-center gap-1">
            <input
              type="checkbox"
              className="accent-link"
              checked={maskEnabled[cat]}
              onChange={() => toggleCategory(cat)}
            />
            {CATEGORY_LABEL[cat]}
          </label>
        ))}
      </fieldset>

      {/* 検出内訳バッジ */}
      {maskEval && (
        <p className="caption text-muted mb-2" role="status" aria-live="polite">
          {MASK_CATEGORIES.filter((c) => maskEval.counts[c] > 0).length === 0
            ? '検出された機密データはありません。'
            : '検出: ' +
              MASK_CATEGORIES.filter((c) => maskEval.counts[c] > 0)
                .map((c) => `${CATEGORY_LABEL[c]} ${maskEval.counts[c]}`)
                .join(' ・ ')}
        </p>
      )}

      <textarea
        id="json-formatter-mask-output"
        readOnly
        value={effectiveOutput}
        rows={16}
        aria-label="マスク済み結果"
        className="caption font-mono resize-y w-full rounded-lg border border-default bg-subtle text-default px-3 py-2 tracking-wide"
      />
    </div>
  ) : view === 'text' ? (
    <OutputField
      id="json-formatter-output"
      label="結果"
      value={displayOutput}
      rows={18}
      ariaLabel="整形結果"
      rightSlot={downloadButton}
    />
  ) : (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 min-h-8 gap-2">
        <span className="body-emphasis text-default">結果</span>
        {hasResult && (
          <div className="flex items-center gap-2">
            {downloadButton}
            <CopyButton text={displayOutput} ariaLabel="整形結果をコピー" />
          </div>
        )}
      </div>
      <div className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2">
        {displayTree ? (
          <JsonTreeView key={treeKey} node={displayTree} defaultOpen={treeOpen} />
        ) : (
          <p className="caption text-muted">有効な JSON を入力するとツリーが表示されます。</p>
        )}
      </div>
    </div>
  )}
</div>
```

注: tree 用の「全展開/全折りたたみ」ボタンの表示条件 `view === 'tree' && hasResult` は変更不要（mask モードでは出ない）。

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors。エラーが出たら修正してから commit。

- [ ] **Step 7: Commit**

```bash
git add src/components/tools/JsonFormatter.tsx
git commit -m "feat: json-formatter にマスク表示モード（種別トグル・検出内訳）を追加"
```

---

## Task 4: E2E（原値非残存・CSP 無違反）

**Files:** Modify `tests/e2e/json-formatter.spec.ts`

実装時に **`Skill` tool で `test-gates`** を呼び、陽性対照（原値が DOM に残らない）を確認する。

- [ ] **Step 1: テストを追記**

`tests/e2e/json-formatter.spec.ts` の `test.describe` 内の末尾（最後の `});` の直前）に追加:

```ts
test('マスク: 機密値を伏字化し原値が画面に出ない（CSP 違反なし）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByLabel('入力').fill('{"mail":"taro@example.com","password":"hunter2"}');
    await page.getByRole('button', { name: 'マスク' }).click();

    const out = page.getByRole('textbox', { name: 'マスク済み結果' });
    await expect(out).toHaveValue(/\[REDACTED:EMAIL\]/);
    await expect(out).toHaveValue(/\[REDACTED:SECRET\]/);
    // 原値が出力に残っていない（検知が空回りなら fail）
    await expect(out).not.toHaveValue(/taro@example\.com/);
    await expect(out).not.toHaveValue(/hunter2/);
    // 検出内訳が出る
    await expect(page.getByText(/検出:/)).toBeVisible();
  });
});

test('マスク: 種別 off で該当種別が素通りする（CSP 違反なし）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByLabel('入力').fill('{"mail":"taro@example.com"}');
    await page.getByRole('button', { name: 'マスク' }).click();
    const out = page.getByRole('textbox', { name: 'マスク済み結果' });
    await expect(out).toHaveValue(/\[REDACTED:EMAIL\]/);
    // メール種別を外すと原値が戻る
    await page.getByRole('checkbox', { name: 'メール' }).uncheck();
    await expect(out).toHaveValue(/taro@example\.com/);
  });
});
```

- [ ] **Step 2: ビルド + E2E 実行**

Run: `npm run pretest:e2e && npx playwright test --project=e2e json-formatter`
Expected: 既存 10 + 新規 2 = 12 passed（CSP 違反なし）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/json-formatter.spec.ts
git commit -m "test(e2e): マスクモードの伏字化・原値非残存・種別offを検証（CSP陽性対照）"
```

---

## Task 5: ドキュメント更新

**Files:** Modify `README.md`, `SPEC.md`, `docs/decisions.md`

- [ ] **Step 1: README.md**

json-formatter の説明行（`JMESPath クエリ抽出対応` で終わる行）の末尾に追記: `。機密データ（PII/シークレット）のマスク対応`

- [ ] **Step 2: SPEC.md 4 章 row 20**

json-formatter の概要セル末尾（`JMESPath クエリで値を抽出可能` の後）に追記: `。PII/シークレットを検出してマスク`

- [ ] **Step 3: docs/decisions.md にエントリ追加**

ファイル末尾に新規エントリを追加:

```markdown
---

## [094] 2026-05-29 — json-formatter に機密データマスキングを追加（PR3）

**2026-05-29 | ステータス: 採用**

### 背景

json-formatter 段階リリース第 3 段。ブラウザ内完結を活かし、PII/シークレットを検出して伏字化した「共有用に安全な JSON」を作れるようにする。

### 決断

- **検出方式はキー名 + 値パターンの両方**。キー名規則（password/token/secret 等の部分一致）は値全体を `[REDACTED:SECRET]` に置換。値パターン（EMAIL/JWT/IP/CREDIT_CARD/PHONE_JP）は文字列内の部分一致も置換。
- **マスク表現は種別ラベルプレースホルダー**（`[REDACTED:EMAIL]` 等）。何があったか文脈を残しつつ原値を完全に隠す。
- **誤検出しやすい種別（CREDIT_CARD/PHONE_JP）は種別トグルで個別 off 可能**。CREDIT_CARD は Luhn 検証で誤検出を抑制。
- 実装は純関数 `maskValue`（`src/utils/json-formatter/mask.ts`）。マスク結果は `JSON.stringify` → 既存 `processJson` に通し表示経路を再利用（PR2 と同方式）。クエリ有効時は抽出結果をマスク対象にする。依存追加なし・CSP 影響なし。

### 却下した選択肢

- **完全伏字（`\***`）/ 部分マスク（`ab**\*@`）**: 前者は種別が分からず、後者は残部から原値が推測されるリスク。種別ラベル方式を採用。
- **大容量対応（Web Worker + 仮想スクロール）を同梱**: 独立 subsystem かつ CSP（blob worker 不可）で別途設計を要するため別 issue に分離。

### 結果・トレードオフ

- ✅ test-gates 陽性対照で「原値が出力に一切残らない」を単体・E2E（production CSP）で保証。
- ⚠️ 正規表現ベースのため検出は完全ではない（未知形式の PII は漏れうる）。マスク結果は計算値で lossless 非対象（JSON 数値準拠）。
- 検出種別の拡張・カスタム正規表現・大容量対応は後続課題。
```

- [ ] **Step 4: format + commit**

```bash
npm run format
git add README.md SPEC.md docs/decisions.md
git commit -m "docs: json-formatter の機密マスキングを README/SPEC/decisions に反映"
```

---

## Task 6: 検証・大容量 issue 化・PR・VRT 再生成

- [ ] **Step 1: 全体検証**

Run:

```bash
node_modules/.bin/astro check
npm run test 2>&1 | tail -5
npm run pretest:e2e && npx playwright test --project=e2e json-formatter
```

Expected: 型 0 errors / 単体集計行 all passed / E2E 12 passed。

- [ ] **Step 2: 実機目視（Playwright MCP）**

`npm run dev` 後、SW unregister + caches.delete + localStorage.clear → リロード。PC(1280x800)・スマホ(390x844) でマスクモード（種別トグル・内訳・伏字化出力）を確認。push 前にユーザー承認を取る。

- [ ] **Step 3: 大容量対応を issue 化**

`gh issue create` で「json-formatter: 大容量 JSON 対応（同一オリジン Worker + ツリー仮想化）」を P2 + enhancement で起票（CSP blob worker 不可の制約を本文に明記）。

- [ ] **Step 4: PR 作成 → VRT baseline 再生成**

- `gh pr create --base develop --body-file <file>` で PR 作成。
- マスクモード追加で `/tools/json-formatter` のスクショが変わるため、**ユーザー承認後**に `Update Visual Regression Baseline` workflow を本ブランチで workflow_dispatch して baseline（PC+mobile）再生成。bot コミットは後続 CI を起動しないため、必要なら close→reopen で head 上の CI を回す。

---

## Self-Review（記録）

- **Spec coverage**: マスク engine（Task1）/ 公開 API（Task2）/ マスクモード UI・種別トグル・内訳・クエリ併用（Task3）/ E2E 原値非残存・CSP・種別off（Task4）/ docs（Task5）/ 大容量 issue 化・PR・VRT（Task6）。spec 全節を被覆。
- **Placeholder scan**: 各コードステップに実コードを記載。プレースホルダなし。
- **Type consistency**: `MaskCategory`/`MaskOptions`/`MaskResult`/`maskValue`/`MASK_CATEGORIES`（mask.ts）、`maskEnabled`/`maskEval`/`effectiveOutput`/`CATEGORY_LABEL`/`ALL_CATEGORIES_ON`（component）、`queryEval.resultValue`（Task3 Step2 で追加）で一貫。
