# har-viewer null entry 詳細パネル一貫化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先頭 entry が `null` で自動選択された際、詳細パネルが `{}` ケースと同じプレースホルダを表示するよう一貫化する（issue #684）。

**Architecture:** `HarEntryDetail` は既に `entry?.request` の optional chaining で null/undefined entry をガードしプレースホルダへ落ちる。よって `HarEntryDetail.Props.entry` の型を `HarEntry | null | undefined` に拡張し、`HarViewer` の描画ゲートを `selectedEntry &&`（truthy 判定）から `result && selectedIndex != null &&`（選択存在判定）に変更するだけで非対称が解消する。

**Tech Stack:** React + TypeScript, Astro, Vitest (jsdom), Playwright (E2E)。

参照 spec: `docs/superpowers/specs/2026-06-14-har-viewer-null-entry-placeholder-design.md`

---

### Task 1: ユニットテスト追加（型拡張の陽性対照）と HarEntryDetail 型拡張

**Files:**
- Test: `src/components/tools/__tests__/HarEntryDetail.test.tsx`
- Modify: `src/components/tools/HarEntryDetail.tsx:3-5`（Props 型）

- [ ] **Step 1: 失敗するユニットテストを書く**

`src/components/tools/__tests__/HarEntryDetail.test.tsx` の `describe('HarEntryDetail 壊れた entry のガード', ...)` ブロック内、「空 entry でも throw せず…」の `it` の直後に以下を追加する:

```tsx
  it('null entry でも throw せずプレースホルダを表示する', () => {
    expect(() =>
      render(<HarEntryDetail entry={null as unknown as HarEntry} />)
    ).not.toThrow();
    expect(screen.getByText(/詳細を表示できません/)).toBeTruthy();
  });
```

- [ ] **Step 2: テストを実行して fail（または型エラー）を確認**

Run: `npm run test -- HarEntryDetail`
Expected: 既存ロジックは null を吸収するため実行は pass するが、`entry={null}` は現状の `Props.entry: HarEntry` 型では本来不正。次の Step で型を正す（テストの `as unknown as HarEntry` キャストは型拡張後に外す）。

- [ ] **Step 3: HarEntryDetail の Props 型を拡張**

`src/components/tools/HarEntryDetail.tsx` の Props を以下に変更する（内部ロジックは変更しない。既存の `if (!request || typeof request !== 'object' || !response || typeof response !== 'object')` ガードが null/undefined を吸収する）:

```tsx
interface Props {
  entry: HarEntry | null | undefined;
}
```

- [ ] **Step 4: テストのキャストを外す**

Step 1 で追加したテストの `entry={null as unknown as HarEntry}` を `entry={null}` に簡素化する:

```tsx
  it('null entry でも throw せずプレースホルダを表示する', () => {
    expect(() => render(<HarEntryDetail entry={null} />)).not.toThrow();
    expect(screen.getByText(/詳細を表示できません/)).toBeTruthy();
  });
```

- [ ] **Step 5: テストと型チェックを実行して pass を確認**

Run: `npm run test -- HarEntryDetail && node_modules/.bin/astro check`
Expected: ユニット全 pass、型エラー 0。

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/HarEntryDetail.tsx src/components/tools/__tests__/HarEntryDetail.test.tsx
git commit -m "fix: HarEntryDetail が null entry でもプレースホルダを表示できるよう型拡張 (#684)"
```

---

### Task 2: HarViewer の描画ゲートを selectedIndex 基準に変更

**Files:**
- Modify: `src/components/tools/HarViewer.tsx:161`

- [ ] **Step 1: 描画ゲートを変更**

`src/components/tools/HarViewer.tsx` の詳細パネル描画箇所（コメント `{/* 詳細パネル */}` の直下）を以下に変更する:

```tsx
          {/* 詳細パネル */}
          {/* selectedIndex があれば（entry が null/壊れていても）プレースホルダを描画し、
              {} ケースとの UX 非対称を解消する（issue #684） */}
          {selectedIndex != null && <HarEntryDetail entry={selectedEntry} />}
```

`selectedEntry` の導出（`HarViewer.tsx:80-81`）はそのまま残す。`result && selectedIndex != null` の `result` は `selectedEntry` 導出内で既に評価されるが、このゲートは `result &&` ブロック（`HarViewer.tsx:129`）の内側にあるため `result` 判定は冗長。`selectedIndex != null` のみで足りる。

- [ ] **Step 2: 型チェックを実行**

Run: `node_modules/.bin/astro check`
Expected: 型エラー 0。

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/HarViewer.tsx
git commit -m "fix: har-viewer の null 先頭 entry でも詳細プレースホルダを表示 (#684)"
```

---

### Task 3: E2E テスト追加（描画ゲート変更の陽性対照）

**Files:**
- Modify: `tests/e2e/har-viewer.spec.ts`（既存 `test.describe('HAR ビューア', ...)` ブロック末尾に追加）

- [ ] **Step 1: E2E テストを追加**

`tests/e2e/har-viewer.spec.ts` の `test.describe('HAR ビューア', ...)` 内、最後の `test(...)` の直後（describe の閉じ括弧 `});` の直前）に以下を追加する:

```ts
  test('先頭 entry が null でも自動選択で詳細プレースホルダが表示される', async ({ page }) => {
    await page.goto('/tools/har-viewer');

    // 先頭 entry が null（index=0 が自動選択される）+ 2 件目は正常
    const json = JSON.stringify({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [
          null,
          {
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.com/api/ok',
              headers: [],
              queryString: [],
              cookies: [],
            },
            response: { status: 200, headers: [], cookies: [], content: {} },
          },
        ],
      },
    });
    await uploadHar(page, json);

    // 正常 entry が一覧に描画される（React island がクラッシュしていない陽性対照）
    await expect(page.getByRole('button', { name: /\/api\/ok$/ })).toBeVisible({
      timeout: 10000,
    });
    // 先頭 null entry が自動選択され、詳細パネルにプレースホルダが出る。
    // 修正前は selectedEntry が falsy で詳細パネル自体が描画されず、この assert は fail する（陽性ガード）。
    await expect(page.getByText(/詳細を表示できません/)).toBeVisible();
  });
```

- [ ] **Step 2: E2E を実行して pass を確認**

Run: `npm run test:e2e -- har-viewer`
Expected: 追加テストを含め har-viewer の E2E が全 pass。

> 注: parse/sanitize 層が `null` entry を配列に保持し HarEntryList が「（壊れたエントリ）」行を描画することは issue #681 の既存テスト（`{}` ケース）と `HarEntryList` の `e?.request` ガードで担保済み。万一 worker の parse が先頭 null を別扱いし自動選択 index が 0 にならない場合は、`useHarSanitizer` / `parse` の挙動を確認し、テストデータを `null` ではなく `{}` 後続 + 先頭 null の構成に合わせて調整する（ただし HarEntryList は `entries.map` で null をそのまま保持するため通常は不要）。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/har-viewer.spec.ts
git commit -m "test: har-viewer の null 先頭 entry 詳細プレースホルダ表示の E2E を追加 (#684)"
```

---

### 完了時の検証義務（全 Task 後）

push 前に以下を実行し、全て green を確認する（`.agents/rules/common.md` 3 章）:

```bash
npm run test
node_modules/.bin/astro check
npm run test:e2e -- har-viewer
```

### スコープ外（変更しない）

- HAR パース・サニタイズロジック（`src/utils/har/`, `src/hooks/useHarSanitizer.ts`）。
- プレースホルダ文言の改訂。
- 自動選択ロジック（先頭 entry 選択）の挙動。
- ドキュメント（README/SPEC/decisions）— ツール追加・slug 変更・挙動の外部仕様変更ではないため更新不要。
