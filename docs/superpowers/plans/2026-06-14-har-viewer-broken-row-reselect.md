# har-viewer 壊れた行の再選択対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `HarEntryList` の壊れた entry 行（URL 欠落）をクリック可能にし、auto-select 後に再選択できない非対称（issue #701）を解消する。

**Architecture:** 非クリッカブルな `<span>（壊れたエントリ）</span>` を `onSelect(i)` を呼ぶ `<button>` に置き換える。クリックすると `HarEntryDetail` の既存プレースホルダが描画され、auto-select の挙動と一貫する。styling は URL リンク（`text-primary`）と区別するため `text-muted` を維持。

**Tech Stack:** React (TSX) / Astro / Vitest (jsdom) / Playwright / Tailwind v4

---

## File Structure

- `src/components/tools/HarEntryList.tsx` — 壊れた行を button 化（本体、1 箇所の JSX 分岐のみ変更）
- `src/components/tools/__tests__/HarEntryList.test.tsx` — 既存 assert 更新 + 陽性対照追加
- `tests/e2e/har-viewer.spec.ts` — 再現シナリオの回帰 E2E 追加

ドキュメント影響: ツール追加・挙動変更ではあるが UI 内部の微修正でツール一覧・SPEC に影響なし。`docs/tools.md` の har-viewer 記述に「壊れた行も選択可能」と補足する必要があるか確認（後述 Task 4）。

---

### Task 1: ユニットテストを新挙動に更新（失敗させる）

**Files:**

- Test: `src/components/tools/__tests__/HarEntryList.test.tsx`

既存ファイルの内容を以下に置き換える。変更点は (a) 「button を持たない」assert を新挙動（壊れ行も button）に更新、(b) 壊れ行クリックで `onSelect` がその index で呼ばれる陽性対照を追加。

- [ ] **Step 1: テストを新挙動に書き換える**

`src/components/tools/__tests__/HarEntryList.test.tsx` を以下で全置換:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { HarEntryList } from '@/components/tools/HarEntryList';
import type { HarEntry } from '@/utils/har';

beforeEach(() => {
  document.adoptedStyleSheets = [];
});
afterEach(() => {
  cleanup();
  document.adoptedStyleSheets = [];
});

// 正常 1 件 + 壊れた entry 3 種（{}, null, response 欠落）を混在させる。
// 型は実データ（手編集 HAR）を模すため unknown 経由でキャストする。
const entries = [
  {
    time: 12,
    request: {
      method: 'GET',
      url: 'https://example.com/api/ok',
      headers: [],
      queryString: [],
      cookies: [],
    },
    response: { status: 200, headers: [], cookies: [], content: { size: 2 } },
  },
  {}, // request/response 欠落
  null, // entry 自体が null
  {
    request: {
      method: 'POST',
      url: 'https://example.com/api/noresp',
      headers: [],
      queryString: [],
      cookies: [],
    },
  }, // response 欠落
] as unknown as HarEntry[];

describe('HarEntryList 壊れた entry のガード', () => {
  it('壊れた entry を含んでも throw せず描画できる', () => {
    expect(() =>
      render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />)
    ).not.toThrow();
  });

  it('正常 entry の method と URL を描画する', () => {
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />);
    expect(screen.getByText('GET')).toBeTruthy();
    // shortUrl は host + pathname
    expect(screen.getByRole('button', { name: 'example.com/api/ok' })).toBeTruthy();
  });

  it('壊れた entry 行はプレースホルダ文言の button を描画する', () => {
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />);
    // 「（壊れたエントリ）」プレースホルダが request 欠落行に出る（{} と null の 2 行）
    expect(screen.getAllByText('（壊れたエントリ）').length).toBeGreaterThanOrEqual(2);
    // url を持つ行（ok / noresp）と壊れ行（{} / null）すべてが button（計 4 つ）
    expect(screen.getAllByRole('button')).toHaveLength(4);
    // 壊れ行「（壊れたエントリ）」も accessible name を持つ button として取得できる
    expect(screen.getAllByRole('button', { name: '（壊れたエントリ）' })).toHaveLength(2);
  });

  it('壊れた entry 行クリックでその index の onSelect が呼ばれる（再選択可能）', () => {
    const onSelect = vi.fn();
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={onSelect} />);
    // 壊れ行は {} (index 1) と null (index 2)。先頭の壊れ行をクリック。
    const brokenButtons = screen.getAllByRole('button', { name: '（壊れたエントリ）' });
    brokenButtons[0].click();
    expect(onSelect).toHaveBeenCalledWith(1);
    brokenButtons[1].click();
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- HarEntryList`
Expected: FAIL（壊れ行がまだ `<span>` なので button 数が 2 になり `toHaveLength(4)` / `（壊れたエントリ）` button 取得 / onSelect 呼び出しが失敗）

- [ ] **Step 3: コミット（red 状態のテストはまだコミットしない）**

このステップではコミットしない。Task 2 の実装と合わせてコミットする。

---

### Task 2: HarEntryList の壊れた行を button 化

**Files:**

- Modify: `src/components/tools/HarEntryList.tsx`（`url == null` 分岐の `<span>` を `<button>` に）

- [ ] **Step 1: 壊れた行の span を button に置き換える**

`src/components/tools/HarEntryList.tsx` の以下の箇所:

```tsx
                  ) : (
                    <span className="text-muted">（壊れたエントリ）</span>
                  )}
```

を次に置き換える:

```tsx
                  ) : (
                    <button
                      type="button"
                      aria-current={selectedIndex === i ? 'true' : undefined}
                      className="text-left text-muted underline-offset-2 hover:underline"
                      onClick={() => onSelect(i)}
                    >
                      （壊れたエントリ）
                    </button>
                  )}
```

注意:

- `type="button"` 必須（lint の button type 漏れ検出に該当）。
- `text-muted` を維持し URL リンク（`text-primary`）と視覚的に区別する。`underline`/`hover:underline` は Tailwind コア utility なので variant が効く（`@layer components` 手書き class ではない）。
- a11y 属性 `aria-current` は正常行の URL button と同じパターン。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（0 errors）

- [ ] **Step 3: lint（button type 漏れ検出）**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: ユニットテストを実行して PASS を確認**

Run: `npm run test -- HarEntryList`
Expected: PASS（全 4 テスト green）

- [ ] **Step 5: コミット**

```bash
git add src/components/tools/HarEntryList.tsx src/components/tools/__tests__/HarEntryList.test.tsx
git commit -m "fix: har-viewer 壊れた entry 行をクリック可能にして再選択を許可 (#701)"
```

---

### Task 3: 再現シナリオの回帰 E2E を追加

**Files:**

- Modify: `tests/e2e/har-viewer.spec.ts`（`test.describe('HAR ビューア', ...)` 内の末尾に追加）

- [ ] **Step 1: E2E テストを追加**

`tests/e2e/har-viewer.spec.ts` の最後の `test('先頭 entry が null でも...')` ブロックの直後（`});` で describe が閉じる直前）に以下を挿入:

```ts
test('正常 entry 選択後も壊れた行を再クリックして詳細プレースホルダを再表示できる', async ({
  page,
}) => {
  await page.goto('/tools/har-viewer');

  // 先頭が壊れた entry（{}）+ 2 件目は正常（issue #701 再現データ）
  const json = JSON.stringify({
    log: {
      version: '1.2',
      creator: { name: 'test', version: '1.0' },
      entries: [
        {}, // 壊れた entry（先頭。auto-select で index=0 が選ばれる）
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
  const okButton = page.getByRole('button', { name: /\/api\/ok$/ });
  await expect(okButton).toBeVisible({ timeout: 10000 });

  // 前提: 先頭の壊れ entry が auto-select され詳細プレースホルダが出る
  await expect(page.getByText(/詳細を表示できません/)).toBeVisible();

  // 正常 entry をクリックして選択を移す → 詳細に正常 entry の URL が出る
  await okButton.click();
  await expect(page.getByText('https://example.com/api/ok')).toBeVisible();
  // プレースホルダは消える
  await expect(page.getByText(/詳細を表示できません/)).toHaveCount(0);

  // 壊れた行（「（壊れたエントリ）」button）を再クリック → 詳細プレースホルダが再表示される。
  // 修正前は壊れ行が button でなくクリックできないため、ここで fail する（陽性ガード）。
  await page.getByRole('button', { name: '（壊れたエントリ）' }).click();
  await expect(page.getByText(/詳細を表示できません/)).toBeVisible();
});
```

- [ ] **Step 2: E2E を実行して PASS を確認**

Run: `npm run test:e2e -- har-viewer`
Expected: PASS（追加テスト含め har-viewer の全 E2E green）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/har-viewer.spec.ts
git commit -m "test: har-viewer 壊れた行の再選択 E2E を追加 (#701)"
```

---

### Task 4: ドキュメント確認・更新

**Files:**

- Check: `docs/tools.md`（har-viewer の挙動記述）

- [ ] **Step 1: docs/tools.md の har-viewer 記述を確認**

Run: `grep -n "har-viewer\|HAR" docs/tools.md`
har-viewer の「壊れた entry」「クリック」に関する記述があれば、「壊れた行も選択可能（プレースホルダ表示）」と整合するよう 1 行追記。記述がなければ変更不要（本変更は UI 内部の微修正でツール仕様の本質は不変）。

- [ ] **Step 2: 変更があればコミット**

```bash
git add docs/tools.md
git commit -m "docs: har-viewer 壊れた行の選択挙動を追記 (#701)"
```

変更なしの場合はこの Task をスキップ。

---

## Self-Review

- **Spec coverage:** spec の「HarEntryList.tsx 変更」→ Task 2、「ユニットテスト更新 + 陽性対照」→ Task 1、「E2E 追加」→ Task 3、「ドキュメント」→ Task 4。全要件にタスク対応あり。
- **Placeholder scan:** 全 code step に実コードを記載。TBD/TODO なし。
- **Type consistency:** `onSelect(index: number)` は既存 `Props` シグネチャと一致。`selectedIndex` / `aria-current` も既存正常行と同名同型。テストの `getByRole('button', { name: '（壊れたエントリ）' })` は Task 2 で付与する button テキストと一致。
