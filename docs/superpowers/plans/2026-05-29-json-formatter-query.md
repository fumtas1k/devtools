# JSON整形・ビューア PR2: JMESPath クエリ抽出 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** json-formatter に JMESPath クエリ欄を追加し、入力 JSON から値を抽出して既存のテキスト/ツリーで表示する。

**Architecture:** クエリエンジンは eval 非使用で CSP 安全な `jmespath`。入力検証・全体整形・ツリーは v1 の lossless 経路を維持し、クエリ評価は codec の外（`useMemo` + 軽い debounce）で行う。抽出結果は `JSON.stringify(result)` を既存 `processJson` に通して表示経路を再利用する。エラーは入力 JSON 用（既存）とクエリ式用（新）の 2 系統に分離する。

**Tech Stack:** TypeScript / React 19 / Astro / Vitest / Playwright / jmespath

設計書: `docs/superpowers/specs/2026-05-29-json-formatter-query-design.md`

---

## File Structure

- Create: `src/utils/json-formatter/query.ts` — `runQuery(value, expr)`（jmespath ラッパ、不正式を日本語化）
- Create: `src/utils/json-formatter/__tests__/query.test.ts`
- Modify: `src/utils/json-formatter/index.ts` — `ProcessResult` に `value`（パース済み JS 値）を追加、query を re-export
- Modify: `src/components/tools/JsonFormatter.tsx` — クエリ欄・2 系統エラー・`useMemo` 評価・debounce
- Modify: `tests/e2e/json-formatter.spec.ts` — CSP 陽性対照 + クエリ E2E
- Modify: `package.json` / `package-lock.json` — `jmespath` + `@types/jmespath`
- Modify: `README.md` / `SPEC.md` / `docs/decisions.md`

ブランチ: `feat/json-formatter-query`（作成済み、origin/develop 起点）。

---

## Task 1: 依存追加（jmespath / @types/jmespath）

**Files:** Modify `package.json`, `package-lock.json`

- [ ] **Step 1: jmespath を install（CSP 安全確認のため eval/Function 不在も確認）**

Run:

```bash
npm install jmespath --cache "$TMPDIR/npm-cache" --no-audit --no-fund
npm install -D @types/jmespath --cache "$TMPDIR/npm-cache" --no-audit --no-fund
```

Expected: `package.json` の dependencies に `"jmespath": "0.16.0"`（save-exact で固定）、devDependencies に `"@types/jmespath": "0.15.2"`。

- [ ] **Step 2: eval/Function 不使用を確認（CSP 安全の静的根拠）**

Run:

```bash
grep -rnE "new Function|[^.]\beval\(" node_modules/jmespath/jmespath.js | head
```

Expected: マッチなし（出力空）。jmespath は独自インタプリタで eval 非使用。

- [ ] **Step 3: lock 同期と型チェック**

Run:

```bash
git diff package.json | grep jmespath
node_modules/.bin/astro check
```

Expected: jmespath / @types/jmespath が追加、型エラー 0。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: JMESPath クエリ用に jmespath を追加（eval 非使用・CSP 安全）"
```

---

## Task 2: query.ts（runQuery）

**Files:**

- Create: `src/utils/json-formatter/query.ts`
- Test: `src/utils/json-formatter/__tests__/query.test.ts`

- [ ] **Step 1: 失敗するテストを書く（陰性対照 + 陽性対照を別 it に分離）**

`src/utils/json-formatter/__tests__/query.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runQuery } from '../query';

// 陰性対照: 正しい式は ok:true で期待値を返す。
describe('runQuery 陰性対照（正常系）', () => {
  it('ナビゲーションで値を取り出す', () => {
    const r = runQuery({ location: { lat: 35.6 } }, 'location.lat');
    expect(r).toEqual({ ok: true, result: 35.6 });
  });

  it('ワイルドカードで配列要素を射影する', () => {
    const r = runQuery({ items: [{ id: 1 }, { id: 2 }] }, 'items[*].id');
    expect(r.ok && r.result).toEqual([1, 2]);
  });

  it('フィルタ条件で抽出する（バッククォートはリテラル）', () => {
    const data = { items: [{ price: 5 }, { price: 20 }] };
    const r = runQuery(data, 'items[?price > `10`].price');
    expect(r.ok && r.result).toEqual([20]);
  });

  it('該当なしは null を返す（throw しない）', () => {
    const r = runQuery({ a: 1 }, 'nope');
    expect(r).toEqual({ ok: true, result: null });
  });
});

// 陽性対照（別 describe）: 不正式を必ず検知する。
// 「常に ok:true」の空回り実装に当てると fail する。
describe('runQuery 陽性対照（不正式を検知）', () => {
  it('構文エラーの式は ok:false とエラー詳細を返す', () => {
    const r = runQuery({ a: 1 }, 'items[?(');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('クエリ式が不正です');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/query.test.ts`
Expected: FAIL（`Cannot find module '../query'`）。

- [ ] **Step 3: 最小実装**

`src/utils/json-formatter/query.ts`:

```ts
import { search } from 'jmespath';

export type QueryResult = { ok: true; result: unknown } | { ok: false; error: string };

/**
 * JMESPath 式で value から値を抽出する。該当なしは jmespath が null を返す。
 * 不正式は jmespath が throw するため捕捉し、日本語メッセージに変換する。
 */
export function runQuery(value: unknown, expr: string): QueryResult {
  try {
    return { ok: true, result: search(value, expr) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `クエリ式が不正です: ${detail}` };
  }
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/query.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/json-formatter/query.ts src/utils/json-formatter/__tests__/query.test.ts
git commit -m "feat: JMESPath クエリ評価 runQuery を追加（不正式は日本語化・陽性対照付き）"
```

---

## Task 3: index.ts に value を追加

**Files:** Modify `src/utils/json-formatter/index.ts`, Test `src/utils/json-formatter/__tests__/index.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

`src/utils/json-formatter/__tests__/index.test.ts` の `describe('processJson', ...)` 内に追加:

```ts
it('パース済み JS 値（value）も返す（クエリ入力用）', () => {
  const r = processJson('{"a":[1,2]}', { mode: 'format', indent: '2' });
  expect(r.value).toEqual({ a: [1, 2] });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/index.test.ts`
Expected: FAIL（`r.value` が undefined）。

- [ ] **Step 3: 実装（getNodeValue で JS 値を取得）**

`src/utils/json-formatter/index.ts` を編集:

- import に `getNodeValue` を追加: `import { parseTree, ... }` ではなく、本ファイルは `parseJson` 経由。`getNodeValue` は `jsonc-parser` から import する。

```ts
// 既存 import 群に追加
import { getNodeValue } from 'jsonc-parser';
```

- `ProcessResult` に `value` を追加:

```ts
export interface ProcessResult {
  output: string;
  tree: TreeNode;
  value: unknown;
}
```

- `processJson` の return を変更（try ブロック内）:

```ts
return { output, tree: buildTree(result.root, text), value: getNodeValue(result.root) };
```

（RangeError 捕捉の try/catch は既存のまま。`getNodeValue` も再帰だが同 try 内で保護される。）

`export * from './query';` も末尾の re-export 群に追加する。

- [ ] **Step 4: 成功を確認（既存テスト含む）**

Run: `npx vitest run src/utils/json-formatter/`
Expected: PASS（全 json-formatter 単体）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/json-formatter/index.ts src/utils/json-formatter/__tests__/index.test.ts
git commit -m "feat: processJson がパース済み JS 値を返すよう拡張（クエリ入力用）"
```

---

## Task 4: コンポーネントにクエリ欄を追加

**Files:** Modify `src/components/tools/JsonFormatter.tsx`

UI はユニットテストせず、Task 5 の E2E + 実機目視で検証する。

- [ ] **Step 1: import と state を追加**

`src/components/tools/JsonFormatter.tsx`:

- import 追加:

```ts
import { useMemo } from 'react'; // 既存 useState と同じ行にまとめても可
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { processJson, runQuery, type IndentStyle, type TreeNode } from '@/utils/json-formatter';
```

- `Meta` と `INITIAL_META` を変更:

```ts
interface Meta {
  tree: TreeNode | null;
  value: unknown;
}
const INITIAL_META: Meta = { tree: null, value: undefined };
```

- codec の transform を変更:

```ts
const { input, setInput, output, error, isPending, reset, meta } = useCodecWithMeta<Meta>(
  (text) => {
    const result = processJson(text, { mode, indent });
    return { output: result.output, meta: { tree: result.tree, value: result.value } };
  },
  INITIAL_META,
  [mode, indent]
);
```

- [ ] **Step 2: クエリ state と評価ロジック（debounce + useMemo）**

`reset` 直後あたりに追加:

```ts
const [query, setQuery] = useState('');
const debouncedQuery = useDebouncedValue(query, 200);
const queryActive = debouncedQuery.trim() !== '';

// クエリは codec の外で評価（入力の debounce とは独立）。
// 結果は JSON 文字列化して既存 processJson に通し、整形/ツリー経路を再利用する。
const queryEval = useMemo(() => {
  if (!queryActive || meta.value === undefined) return null;
  const qr = runQuery(meta.value, debouncedQuery);
  if (!qr.ok) return { error: qr.error, output: '', tree: null as TreeNode | null };
  try {
    const resultText = JSON.stringify(qr.result) ?? 'null';
    const processed = processJson(resultText, { mode, indent });
    return { error: null as string | null, output: processed.output, tree: processed.tree };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'クエリ結果の整形に失敗しました',
      output: '',
      tree: null as TreeNode | null,
    };
  }
}, [queryActive, meta.value, debouncedQuery, mode, indent]);

const queryError = queryEval?.error ?? null;
const displayOutput = queryActive ? (queryEval?.output ?? '') : output;
const displayTree = queryActive ? (queryEval?.tree ?? null) : meta.tree;
```

- [ ] **Step 3: `hasResult` と clear を displayOutput ベースに、クエリ欄を描画**

- `const hasResult = output !== '';` を `const hasResult = displayOutput !== '';` に変更。
- `handleClear` を変更してクエリもクリア:

```ts
const handleClear = () => {
  reset();
  setQuery('');
  setView('text');
};
```

- オプション行 `</div>`（インデント/モード/表示の wrap div の閉じ）の直後、入力・結果の `flex md:flex-row` div の前に、クエリ欄を追加:

```tsx
{
  /* クエリ欄（JMESPath） */
}
<InputField
  id="json-formatter-query"
  label="クエリ (JMESPath)"
  value={query}
  onChange={setQuery}
  placeholder="例: location.lat ／ items[?price > `1000`].name"
  error={queryError || undefined}
  hint="空にすると全体を表示。JMESPath 構文（フィルタ・射影対応）。"
  onSampleClick={() => setQuery('items[?price > `1000`].name')}
  mono
/>;
```

- 結果カラムの出力参照を差し替える:
  - text ビュー: `<OutputField ... value={output} ... />` → `value={displayOutput}`
  - tree ビュー: `<JsonTreeView ... node={meta.tree} ... />` → `node={displayTree}`、その分岐条件 `meta.tree ?` → `displayTree ?`
  - tree ビューのヘッダ `{hasResult && (...)}` はそのまま（hasResult が displayOutput ベースになる）
  - CopyButton / DownloadButton の `text`/`disabled` も `output` → `displayOutput` に揃える（handleDownload も displayOutput を使う）:

```ts
const handleDownload = () => {
  if (!displayOutput) return;
  downloadText(displayOutput, 'data.json', 'application/json');
};
```

DownloadButton の `disabled={isPending || !output}` → `disabled={isPending || !displayOutput}`。

- [ ] **Step 4: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors。

- [ ] **Step 5: Commit**

```bash
git add src/components/tools/JsonFormatter.tsx
git commit -m "feat: json-formatter に JMESPath クエリ欄を追加（2系統エラー・既存表示経路を再利用）"
```

---

## Task 5: E2E（CSP 陽性対照 + クエリ）

**Files:** Modify `tests/e2e/json-formatter.spec.ts`

実装時に **`Skill` tool で `test-gates`** を呼び、陽性対照（CSP 無違反 / 不正式検知）を確認する。

- [ ] **Step 1: テストを追記**

`tests/e2e/json-formatter.spec.ts` の `test.describe` 内に追加:

```ts
test('クエリ抽出: ナビゲーションで値を取り出す（CSP 違反なし）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.getByLabel('クエリ (JMESPath)').fill('location.lat');
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('35.6586');
  });
});

// 陽性対照（CSP）: フィルタ式（式評価を伴う）を実行しても CSP 違反が出ないこと。
// eval/Function を使うエンジンに差し替えると withProductionCsp の guard が違反を検知して fail する。
test('クエリ抽出: フィルタ式が production CSP 下で動く（eval 非使用の証明）', async ({
  browser,
}) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page
      .getByLabel('入力')
      .fill('{"items":[{"name":"A","price":5},{"name":"B","price":20}]}');
    await page.getByLabel('クエリ (JMESPath)').fill('items[?price > `10`].name');
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(/"B"/);
    // withProductionCsp が fn 終了後に guard.assertNoViolations() を実行する。
  });
});

test('クエリ抽出: 不正式はクエリ欄下にエラー表示（入力エラーと分離・CSP 違反なし）', async ({
  browser,
}) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByLabel('入力').fill('{"a":1}');
    await page.getByLabel('クエリ (JMESPath)').fill('items[?(');
    await expect(page.getByRole('alert')).toContainText('クエリ式が不正です');
  });
});

test('クエリ抽出: クエリを空にすると全体表示に戻る（CSP 違反なし）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    const query = page.getByLabel('クエリ (JMESPath)');
    await query.fill('location.lat');
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue('35.6586');
    await query.fill('');
    await expect(page.getByRole('textbox', { name: '整形結果' })).toHaveValue(
      /"name": "東京タワー"/
    );
  });
});
```

- [ ] **Step 2: ビルド + E2E 実行**

Run: `npm run pretest:e2e && npx playwright test --project=e2e json-formatter`
Expected: 既存 5 + 新規 4 = 9 passed（CSP 違反なし）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/json-formatter.spec.ts
git commit -m "test(e2e): JMESPath クエリの抽出・CSP 無違反陽性対照・エラー分離を追加"
```

---

## Task 6: ドキュメント更新

**Files:** Modify `README.md`, `SPEC.md`, `docs/decisions.md`

- [ ] **Step 1: SPEC.md 2.3 ライブラリ表に追記**

`jsonc-parser` の行の下に:

```markdown
| `jmespath` | JMESPath クエリ評価（eval 非使用・CSP 安全）。フィルタ・射影対応 | JSON整形・ビューア |
```

- [ ] **Step 2: SPEC.md 4 章の json-formatter 概要にクエリを追記**

行 20 の概要末尾に「JMESPath クエリで値を抽出可能」を追加。

- [ ] **Step 3: README.md の json-formatter 行にクエリ追記**

`| JSON整形・ビューア ...` の説明に「JMESPath クエリ抽出」を加える。

- [ ] **Step 4: docs/decisions.md にエントリ追加**

末尾に `## [093] 2026-05-29 — json-formatter に JMESPath クエリ抽出を追加` を作成し、背景 / 決断（jmespath 採用、CSP unsafe-eval 無しで eval 非使用が必須）/ 却下（jsonpath-plus = 重さ + safe eval の CSP リスク、自作 = 式評価器コスト）/ 結果（クエリ結果は計算値で lossless 非対象、CSP 陽性対照で eval 非使用を実機証明）を記述。

- [ ] **Step 5: Commit**

```bash
git add README.md SPEC.md docs/decisions.md
git commit -m "docs: json-formatter の JMESPath クエリ抽出を README/SPEC/decisions に反映"
```

---

## Task 7: 検証と VRT baseline 再生成

- [ ] **Step 1: 全体検証**

Run:

```bash
node_modules/.bin/astro check
npm run test 2>&1 | tail -5
npm run pretest:e2e && npx playwright test --project=e2e json-formatter
```

Expected: 型 0 errors / 単体集計行 all passed / E2E 9 passed。

- [ ] **Step 2: 実機目視（Playwright MCP）**

`npm run dev` 後、SW unregister + caches.delete + localStorage.clear → リロード。PC(1280x800)・スマホ(390x844) でクエリ欄・抽出結果・クエリエラー表示を確認。push 前にユーザー承認を取る。

- [ ] **Step 3: PR 作成 → VRT baseline 再生成**

- `gh pr create --base develop --body-file <file>` で PR 作成。
- クエリ UI 追加で `/tools/json-formatter` のスクショが変わるため、**ユーザー承認後**に `Update Visual Regression Baseline` workflow を本ブランチで workflow_dispatch して baseline（PC+mobile）を再生成する。bot コミットは後続 CI を起動しないため、必要なら close→reopen で head 上の CI を回す。

---

## Self-Review（記録）

- **Spec coverage**: エンジン=jmespath（Task1）/ runQuery（Task2）/ value 公開（Task3）/ クエリ欄・2系統エラー・再利用表示（Task4）/ CSP 陽性対照・エラー分離・クリア復帰（Task5）/ ドキュメント（Task6）/ VRT 再生成（Task7）。spec 全節を被覆。
- **Placeholder scan**: 各コードステップに実コードを記載。プレースホルダなし。
- **Type consistency**: `QueryResult`（query.ts）/ `ProcessResult.value`（index.ts）/ `Meta { tree, value }`・`displayOutput`/`displayTree`/`queryError`（component）で一貫。
