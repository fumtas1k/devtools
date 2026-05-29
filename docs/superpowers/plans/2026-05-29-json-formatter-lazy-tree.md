# json-formatter ツリー遅延構築 + 大入力ガード 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `processJson` のツリー構築を遅延化し（view==='tree' のときだけ構築）、巨大入力ではツリーを保留→明示ボタンで描画するガードを追加する（#507 + #512 一部）。

**Architecture:** `processJson` の即時 `tree` を `makeTree: () => TreeNode` サンクに置換。コンポーネントは `view==='tree'` の `useMemo` でのみ `makeTree()` を呼ぶ（codec deps に view を入れず debounce ラグ回避）。整形済みテキスト長が閾値超のときはガード状態にして自動構築を抑止する。

**Tech Stack:** TypeScript / React 19 / Astro / Vitest / Playwright

設計書: `docs/superpowers/specs/2026-05-29-json-formatter-lazy-tree-design.md`

---

## File Structure

- Modify: `src/utils/json-formatter/index.ts` — `ProcessResult.tree` → `makeTree`
- Modify: `src/utils/json-formatter/__tests__/index.test.ts` — `.tree` → `.makeTree()`
- Modify: `src/components/tools/JsonTreeResult.tsx` — `tooLarge` / `onForceRender` props + 通知 UI
- Modify: `src/components/tools/JsonFormatter.tsx` — makeTree 化・displayTree useMemo・ガード状態
- Modify: `tests/e2e/json-formatter.spec.ts` — 遅延構築・ガード E2E
- Modify: `docs/decisions.md` — [096]

ブランチ: `feat/json-formatter-lazy-tree`（作成済み、origin/develop 起点）。

---

## Task 1: processJson の tree を makeTree サンク化

**Files:** Modify `src/utils/json-formatter/index.ts`, `src/utils/json-formatter/__tests__/index.test.ts`

- [ ] **Step 1: テストを makeTree に更新（失敗させる）**

`src/utils/json-formatter/__tests__/index.test.ts` の最初の it を次に置換:

```ts
it('整形モードで出力と makeTree（遅延ツリー）を返す', () => {
  const r = processJson('{"a":1}', { mode: 'format', indent: '2' });
  expect(r.output).toBe('{\n  "a": 1\n}');
  const tree = r.makeTree();
  expect(tree.type).toBe('object');
  expect(tree.children?.[0].key).toBe('a');
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/index.test.ts`
Expected: FAIL（`r.makeTree is not a function` / 型エラー）。

- [ ] **Step 3: index.ts を変更**

`src/utils/json-formatter/index.ts` の `ProcessResult` と `processJson` の return を変更:

```ts
export interface ProcessResult {
  output: string;
  value: unknown;
  makeTree: () => TreeNode;
}
```

processJson の try 内 return を:

```ts
return {
  output,
  value: getNodeValue(result.root),
  makeTree: () => buildTree(result.root, text),
};
```

（`buildTree` の即時呼び出しを削除。import は据え置き。RangeError 捕捉の try/catch はそのまま。`buildTree` は makeTree 呼び出し時に実行され、その時点の RangeError は呼び出し側で処理する。）

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/index.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: 型チェック（consumer の破綻を検知）**

Run: `node_modules/.bin/astro check`
Expected: `JsonFormatter.tsx` で `result.tree` / `meta.tree` / `processed.tree` が無くなった型エラーが出る（Task 3 で解消）。**この時点ではエラーが残ってよい**。index.ts 単体の整合のみ確認。

- [ ] **Step 6: Commit**

```bash
git add src/utils/json-formatter/index.ts src/utils/json-formatter/__tests__/index.test.ts
git commit -m "refactor: processJson のツリーを makeTree サンク化（遅延構築・#507）"
```

---

## Task 2: JsonTreeResult に大入力ガード UI を追加

**Files:** Modify `src/components/tools/JsonTreeResult.tsx`

UI のためユニットテストはせず、Task 4 の E2E + 実機目視で検証する。

- [ ] **Step 1: props と通知 UI を追加**

`src/components/tools/JsonTreeResult.tsx` を編集。`Props` に追加:

```ts
  /** 大入力ガード発動中（ツリーを自動構築せず案内を出す）。 */
  tooLarge?: boolean;
  /** 「ツリーを表示」押下時（ガードを解除して構築させる）。 */
  onForceRender?: () => void;
```

関数引数に `tooLarge` / `onForceRender` を追加し、tree box の中身を次の優先順で分岐（`tooLarge` を最優先）:

```tsx
<div className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2">
  {tooLarge ? (
    <div className="space-y-2">
      <p className="caption text-muted">
        JSON が大きいため、ツリー描画を保留しています（重い処理を避けるため）。
      </p>
      <button
        type="button"
        className="caption text-link-color btn-link-plain"
        onClick={onForceRender}
      >
        ツリーを表示
      </button>
    </div>
  ) : tree ? (
    <JsonTreeView key={treeKey} node={tree} defaultOpen={defaultOpen} />
  ) : (
    <p className="caption text-muted">有効な JSON を入力するとツリーが表示されます。</p>
  )}
</div>
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: JsonTreeResult 自体は型エラーなし（JsonFormatter 側の `result.tree` 等のエラーは Task 3 まで残る）。

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/JsonTreeResult.tsx
git commit -m "feat: JsonTreeResult に大入力ガード（保留→表示ボタン）UI を追加"
```

---

## Task 3: JsonFormatter で遅延ツリー＋ガードを配線

**Files:** Modify `src/components/tools/JsonFormatter.tsx`

- [ ] **Step 1: import と定数を追加**

- 1 行目の React import を `import { useState, useMemo, useEffect } from 'react';` に変更。
- `ALL_CATEGORIES_ON` 定数の下に閾値を追加:

```ts
// 整形済みテキストがこの長さ（バイトではなく文字数）を超えたら、ツリーの自動構築を保留する。
const TREE_GUARD_THRESHOLD = 500_000;
```

- [ ] **Step 2: Meta / INITIAL_META を makeTree に変更**

`interface Meta` と `INITIAL_META`:

```ts
interface Meta {
  makeTree: (() => TreeNode) | null;
  value: unknown;
}

const INITIAL_META: Meta = { makeTree: null, value: undefined };
```

- [ ] **Step 3: codec transform を makeTree に変更**

codec の transform return を:

```ts
return { output: result.output, meta: { makeTree: result.makeTree, value: result.value } };
```

- [ ] **Step 4: queryEval の tree を makeTree に変更**

`queryEval` 内の 3 つの return を変更:

- 不正式 branch:

```ts
if (!qr.ok)
  return {
    error: qr.error,
    output: '',
    makeTree: null as (() => TreeNode) | null,
    resultValue: undefined as unknown,
  };
```

- 成功 branch:

```ts
return {
  error: null as string | null,
  output: processed.output,
  makeTree: processed.makeTree as (() => TreeNode) | null,
  resultValue: qr.result as unknown,
};
```

- catch branch:

```ts
return {
  error: e instanceof Error ? e.message : 'クエリ結果の整形に失敗しました',
  output: '',
  makeTree: null as (() => TreeNode) | null,
  resultValue: undefined as unknown,
};
```

- [ ] **Step 5: displayTree を遅延 useMemo + ガードに置換**

現状の `const displayTree = queryActive ? (queryEval?.tree ?? null) : meta.tree;`（1 行）を、次のブロックに置換:

```ts
const displayMakeTree = queryActive ? (queryEval?.makeTree ?? null) : meta.makeTree;

// 大入力ガード: 整形済みテキストが閾値超のときは自動構築せず保留する。
const [treeForced, setTreeForced] = useState(false);
useEffect(() => {
  setTreeForced(false); // 入力が変わったら force を持ち越さない
}, [displayOutput]);
const treeTooLarge = displayOutput.length > TREE_GUARD_THRESHOLD && !treeForced;

// ツリーは view==='tree' のときだけ構築（遅延）。深いネスト等は null フォールバック。
const displayTree = useMemo<TreeNode | null>(() => {
  if (view !== 'tree' || treeTooLarge || !displayMakeTree) return null;
  try {
    return displayMakeTree();
  } catch {
    return null;
  }
}, [view, treeTooLarge, displayMakeTree]);
```

（`displayOutput` は直前の行で定義済みなのでこの位置で参照可。）

- [ ] **Step 6: JsonTreeResult 呼び出しにガード props を渡す**

結果カラムの tree branch（`<JsonTreeResult ... />`）に props を追加:

```tsx
<JsonTreeResult
  tree={displayTree}
  output={effectiveOutput}
  treeKey={treeKey}
  defaultOpen={treeOpen}
  rightSlot={downloadButton}
  tooLarge={treeTooLarge}
  onForceRender={() => setTreeForced(true)}
/>
```

- [ ] **Step 7: 型チェック + 全ユニット**

Run: `node_modules/.bin/astro check && npm run test 2>&1 | tail -5`
Expected: 型 0 errors / 単体集計行 all passed。

- [ ] **Step 8: Commit**

```bash
git add src/components/tools/JsonFormatter.tsx
git commit -m "feat: json-formatter でツリーを遅延構築し大入力ガードを配線（#507/#512一部）"
```

---

## Task 4: E2E（遅延構築の回帰 + ガード）

**Files:** Modify `tests/e2e/json-formatter.spec.ts`

- [ ] **Step 1: テストを追記**

`tests/e2e/json-formatter.spec.ts` の `test.describe` 内の末尾（最後の `});` の直前）に追加:

```ts
test('ツリー: テキスト→ツリー切替で遅延構築されたツリーが表示される（CSP 違反なし）', async ({
  browser,
}) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    // テキスト表示の時点ではツリー group は無い
    await expect(page.getByRole('group', { name: 'JSON ツリー' })).toHaveCount(0);
    await page.getByRole('button', { name: 'ツリー' }).click();
    const tree = page.getByRole('group', { name: 'JSON ツリー' });
    await expect(tree).toBeVisible();
    await expect(tree.getByText('"name"')).toBeVisible();
  });
});

test('ツリー: 大入力はツリーを保留し、明示ボタンで表示する（CSP 違反なし）', async ({
  browser,
}) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    // 整形済み長 > 500KB になる大きな（しかし構造は単純な）JSON
    const big = '{"x":"' + 'a'.repeat(520000) + '"}';
    await page.getByLabel('入力').fill(big);
    await page.getByRole('button', { name: 'ツリー' }).click();

    // 自動構築は保留され、案内＋ボタンが出る
    await expect(page.getByText('ツリー描画を保留しています', { exact: false })).toBeVisible();
    await expect(page.getByRole('group', { name: 'JSON ツリー' })).toHaveCount(0);

    // 「ツリーを表示」で構築される
    await page.getByRole('button', { name: 'ツリーを表示' }).click();
    const tree = page.getByRole('group', { name: 'JSON ツリー' });
    await expect(tree).toBeVisible();
    await expect(tree.getByText('"x"')).toBeVisible();
  });
});
```

- [ ] **Step 2: ビルド + E2E 実行**

Run: `npm run pretest:e2e && npx playwright test --project=e2e json-formatter`
Expected: 既存 + 新規 2 = 全 pass（CSP 違反なし）。fill の大入力で時間がかかる場合があるが許容。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/json-formatter.spec.ts
git commit -m "test(e2e): ツリー遅延構築と大入力ガードを検証"
```

---

## Task 5: ドキュメント（decisions [096]）

**Files:** Modify `docs/decisions.md`

- [ ] **Step 1: エントリ追加**

`docs/decisions.md` の末尾に追加:

```markdown
---

## [096] 2026-05-29 — json-formatter のツリー遅延構築と大入力ガード（#507 / #512 一部）

**2026-05-29 | ステータス: 採用**

### 背景

`processJson` が表示モードに関係なく毎回 `buildTree` を実行し（#507）、巨大 JSON のツリー表示で全ノード DOM 化により凍結する（#512）。

### 決断

- **ツリー遅延構築**: `processJson` の即時 `tree` を `makeTree: () => TreeNode` サンクに置換。コンポーネントは `view==='tree'` の `useMemo` でのみ構築する。`view` を codec deps に入れないことで、#507 が懸念した表示切替時の debounce ラグを回避。
- **大入力ガード**: 整形済みテキスト長が 500_000 文字を超えるときはツリーを自動構築せず「保留→[ツリーを表示]ボタン」で明示構築させ、巨大ツリーの DOM 凍結を回避。`displayOutput` 変化で force をリセット。
- **measure-first で据え置き**: 重い処理の同一オリジン Worker オフロードとツリー仮想化（#512 本体）は、遅延＋ガードで主要な無駄・凍結が解消されるため、実測で必要性を確認してから別サイクルとする（YAGNI）。`getNodeValue`(value) の遅延化も同様に据え置き。

### 結果・トレードオフ

- ✅ テキスト/マスク/型表示中はツリーを構築しない。巨大入力でも自動凍結しない。
- ⚠️ 閾値超のツリーは明示操作後に構築するため、強制表示すると依然重い（仮想化は後続）。閾値は整形済み長の単純指標で、ノード数とは厳密一致しない。
- ツリー仮想化 / Worker オフロードは #512 残として follow-up。
```

- [ ] **Step 2: format + commit**

```bash
npm run format
git add docs/decisions.md
git commit -m "docs: ツリー遅延構築と大入力ガードを decisions [096] に記録"
```

---

## Task 6: 検証・PR

- [ ] **Step 1: 全体検証**

Run:

```bash
node_modules/.bin/astro check
npm run test 2>&1 | tail -5
npm run pretest:e2e && npx playwright test --project=e2e json-formatter
```

Expected: 型 0 errors / 単体 all passed / E2E 全 pass。

- [ ] **Step 2: 実機目視（Playwright MCP が使えれば）**

`npm run dev` 後、SW unregister + caches.delete + localStorage.clear → リロード。サンプルで テキスト↔ツリー 切替が従来どおり動くこと、巨大入力（`{"x":"a"×52万}`）で保留通知＋ボタン→表示を確認。push 前にユーザー承認を取る。MCP が使えない場合は E2E + temp スクショ spec で代替。

- [ ] **Step 3: PR 作成**

`gh pr create --base develop --body-file <file>`。本文に「#507 Closes、#512 は仮想化/Worker を残し一部対応」を明記。VRT は既定表示不変のため影響なし想定。fail 時のみ baseline 再生成（ユーザー承認）。

---

## Self-Review（記録）

- **Spec coverage**: 遅延構築（Task1+3）/ ガード UI（Task2）/ ガード配線（Task3）/ E2E 遅延・ガード（Task4）/ decisions（Task5）/ 検証・PR（Task6）。spec 全節を被覆。
- **Placeholder scan**: 各コードステップに実コードを記載。プレースホルダなし。
- **Type consistency**: `ProcessResult.makeTree`（index.ts）、`Meta.makeTree`（component）、`queryEval.makeTree`、`displayMakeTree`、`displayTree`、`treeForced`/`treeTooLarge`/`TREE_GUARD_THRESHOLD`、`JsonTreeResult` の `tooLarge`/`onForceRender` で一貫。E2E のラベル「ツリーを表示」「ツリー描画を保留しています」は Task2 UI と一致。
