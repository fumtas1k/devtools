# har-viewer entries 型 null 対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `HarLog.entries` を `(HarEntry | null)[]` に正し、runtime の null ガードと型を一致させる（issue #702）。

**Architecture:** 中核型（`HarLog.entries`）と境界 prop 型（`HarEntryList.Props.entries`）を null 要素対応に変更。コンポーネント内部・worker・parse は既に防御済みでロジック変更なし。型変更で発生するテストの非 null アクセスエラーを `!`（non-null assertion）で機械的に吸収する。

**Tech Stack:** TypeScript, Astro, React, Vitest。型チェックは `node_modules/.bin/astro check`、テストは `npm run test`。

---

## File Structure

- Modify: `src/utils/har/types.ts` — `HarLog.entries` の型
- Modify: `src/components/tools/HarEntryList.tsx` — `Props.entries` の型
- Modify: `src/utils/har/__tests__/sanitize.test.ts` — 非 null アクセスに `!` 付与
- Modify: `src/utils/har/__tests__/parse.test.ts` — 非 null アクセスに `!` 付与

`HarViewer.tsx` / `harSanitizer.worker.ts` / `parse.ts` / `HarEntryDetail.tsx` は変更不要（spec の「消費側の追従」参照）。

---

### Task 1: 中核型と境界 prop 型を null 要素対応に変更

**Files:**
- Modify: `src/utils/har/types.ts:69`
- Modify: `src/components/tools/HarEntryList.tsx:4`

- [ ] **Step 1: `HarLog.entries` の型を変更**

`src/utils/har/types.ts` の `HarLog` インターフェース内の該当行:

```ts
// 変更前
  entries: HarEntry[];
// 変更後
  entries: (HarEntry | null)[];
```

- [ ] **Step 2: `HarEntryList.Props.entries` の型を変更**

`src/components/tools/HarEntryList.tsx` の `Props` インターフェース内の該当行:

```ts
// 変更前
  entries: HarEntry[];
// 変更後
  entries: (HarEntry | null)[];
```

内部ロジック（`entries.map((e, i) => { const request = e?.request; ... })`）は既に optional chaining で防御済みのため変更しない。

- [ ] **Step 3: 型チェックを実行し、テスト側のエラーのみが残ることを確認**

Run: `node_modules/.bin/astro check`
Expected: `src/utils/har/__tests__/sanitize.test.ts` と `src/utils/har/__tests__/parse.test.ts` で「Object is possibly 'null'」系のエラーが出る（src 本体・HarViewer・worker ではエラーが出ない）。本体側でエラーが出た場合は spec の想定外なので停止して報告する。

---

### Task 2: テストの非 null アクセスに `!` を付与

**Files:**
- Modify: `src/utils/har/__tests__/sanitize.test.ts`
- Modify: `src/utils/har/__tests__/parse.test.ts`

- [ ] **Step 1: `astro check` の出力からエラー箇所を列挙**

Run: `node_modules/.bin/astro check 2>&1 | grep -E "sanitize.test|parse.test"`

各エラー行の `…entries[N].xxx` を `…entries[N]!.xxx` に修正する（`N` はそのテストが構築した fixture のインデックス）。

例:

```ts
// 変更前
const auth = har.log.entries[0].request.headers.find((h) => h.name === 'Authorization');
// 変更後
const auth = har.log.entries[0]!.request.headers.find((h) => h.name === 'Authorization');
```

```ts
// 変更前
expect(har.log.entries[0].request.postData!.text)...
// 変更後（既存の postData! はそのまま、entries[0] にのみ ! を追加）
expect(har.log.entries[0]!.request.postData!.text)...
```

注意:
- `entries[0]` 直後にのみ `!` を挿入する。`.request` / `.response` 以降の既存 `!`（`postData!` / `redirectURL!` 等）は維持する。
- `entries[0]` を経由しないアクセス（例: `out.log.entries.length` のような配列メソッド）は変更しない。
- これは挙動不変の機械的変更。fixture は必ず該当インデックスの entry を持つため `!` は安全。

- [ ] **Step 2: 型チェックを再実行しエラーがゼロになることを確認**

Run: `node_modules/.bin/astro check`
Expected: エラー 0 件。

- [ ] **Step 3: ユニットテストを実行し全 green を確認**

Run: `npm run test`
Expected: 全テスト PASS（挙動不変）。

- [ ] **Step 4: コミット**

```bash
git add src/utils/har/types.ts src/components/tools/HarEntryList.tsx src/utils/har/__tests__/sanitize.test.ts src/utils/har/__tests__/parse.test.ts
git commit -m "fix: HarLog.entries を null 要素対応の型に正す (#702)"
```

---

## 検証（最終）

- `node_modules/.bin/astro check`: 型エラーゼロ。
- `npm run test`: 全 green。
- UI 変更なしのため `npm run test:e2e` / VRT・目視確認は対象外（型のみの変更）。

## 注意

- ドキュメント（`README.md` / `SPEC.md`）更新は不要（ツール追加・挙動変更ではない）。
- spec: `docs/superpowers/specs/2026-06-14-har-entries-null-type-design.md`
