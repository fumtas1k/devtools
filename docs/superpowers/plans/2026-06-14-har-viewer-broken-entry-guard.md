# har-viewer 壊れた entry 描画ガード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 壊れた entry（`request`/`response` 欠落）を含む HAR を読み込んでも `HarEntryList` / `HarEntryDetail` がクラッシュせず、プレースホルダで透過的に表示する。

**Architecture:** 描画側（list / detail）で entry のフィールドを直接参照せず optional chaining + フォールバックでガードする。entry は配列にそのまま残し行はスキップしない（サマリ件数とインデックスの整合を維持）。壊れた行は非クリックのプレースホルダにし、詳細パネルは欠落時にプレースホルダ文言を出す。

**Tech Stack:** React + TypeScript (Astro island), Vitest + @testing-library/react (jsdom), Playwright (E2E)。

設計の正本: `docs/superpowers/specs/2026-06-14-har-viewer-broken-entry-guard-design.md`

---

## File Structure

- `src/components/tools/HarEntryList.tsx` — 一覧テーブル。各セルをガード。
- `src/components/tools/HarEntryDetail.tsx` — 詳細パネル。request/response 欠落時にプレースホルダ。
- `src/components/tools/__tests__/HarEntryList.test.tsx` — 新規 component test。
- `src/components/tools/__tests__/HarEntryDetail.test.tsx` — 新規 component test。
- `tests/e2e/har-viewer.spec.ts` — 壊れた entry の E2E ケース追加。

注意（プロジェクト規約）:
- コミットは Conventional Commits 形式 + **日本語**（`.githooks/commit-msg` が検証）。
- 色は primitive scale 直書き禁止。既存意味クラス（`text-muted` 等）を使う。本変更で新規の色は使わない。
- 既存 component test は先頭に `// @vitest-environment jsdom` を付ける（global env は node）。
- import は `@/` エイリアス可（component / test は worker 依存グラフ外なので問題ない）。

---

### Task 1: HarEntryList のガード（プレースホルダ行）

**Files:**
- Test: `src/components/tools/__tests__/HarEntryList.test.tsx`（新規）
- Modify: `src/components/tools/HarEntryList.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tools/__tests__/HarEntryList.test.tsx` を新規作成:

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
    request: { method: 'GET', url: 'https://example.com/api/ok', headers: [], queryString: [], cookies: [] },
    response: { status: 200, headers: [], cookies: [], content: { size: 2 } },
  },
  {}, // request/response 欠落
  null, // entry 自体が null
  { request: { method: 'POST', url: 'https://example.com/api/noresp', headers: [], queryString: [], cookies: [] } }, // response 欠落
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

  it('壊れた entry 行はプレースホルダを表示し URL ボタンを描画しない', () => {
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />);
    // 「壊れたエントリ」プレースホルダが request 欠落行に出る（{} と null の 2 行）
    expect(screen.getAllByText('（壊れたエントリ）').length).toBeGreaterThanOrEqual(2);
    // request はあるが response 欠落の行は URL ボタンを描画する（クリック可能）
    expect(screen.getByRole('button', { name: 'example.com/api/noresp' })).toBeTruthy();
  });

  it('壊れた entry の URL セルは選択 button を持たない', () => {
    const onSelect = vi.fn();
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={onSelect} />);
    // URL ボタンは正常 entry(ok) と response欠落(noresp) の 2 つだけ（{}/null は非ボタン）
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- HarEntryList`
Expected: FAIL（現状 `e.request.method` で `Cannot read properties of undefined`、または「壊れたエントリ」が見つからず throw）。

- [ ] **Step 3: HarEntryList を実装**

`src/components/tools/HarEntryList.tsx` の `<tbody>` の map 部分（現 56-75 行）を以下に置換する。`shortUrl` / `formatSize` / `formatTime` ヘルパ・テーブル構造はそのまま:

```tsx
        <tbody>
          {entries.map((e, i) => {
            const request = e?.request;
            const response = e?.response;
            const url = typeof request?.url === 'string' ? request.url : null;
            return (
              <tr key={i} className={selectedIndex === i ? 'bg-active' : undefined}>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {request?.method ?? '—'}
                </td>
                <td className="px-3 py-1.5">
                  {url != null ? (
                    <button
                      type="button"
                      aria-current={selectedIndex === i ? 'true' : undefined}
                      className="text-left text-primary underline-offset-2 hover:underline"
                      onClick={() => onSelect(i)}
                    >
                      {shortUrl(url)}
                    </button>
                  ) : (
                    <span className="text-muted">（壊れたエントリ）</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {response?.status ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {formatSize(response?.content?.size ?? response?.bodySize)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">{formatTime(e?.time)}</td>
              </tr>
            );
          })}
        </tbody>
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- HarEntryList`
Expected: PASS（4 ケース）。

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（`e?.request` 等のガードで undefined 参照が解消）。

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/HarEntryList.tsx src/components/tools/__tests__/HarEntryList.test.tsx
git commit -m "fix: har-viewer 一覧で壊れた entry をガードしプレースホルダ表示 (#681)"
```

---

### Task 2: HarEntryDetail のガード（プレースホルダ表示）

**Files:**
- Test: `src/components/tools/__tests__/HarEntryDetail.test.tsx`（新規）
- Modify: `src/components/tools/HarEntryDetail.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tools/__tests__/HarEntryDetail.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { HarEntryDetail } from '@/components/tools/HarEntryDetail';
import type { HarEntry } from '@/utils/har';

beforeEach(() => {
  document.adoptedStyleSheets = [];
});
afterEach(() => {
  cleanup();
  document.adoptedStyleSheets = [];
});

const validEntry = {
  time: 5,
  request: { method: 'GET', url: 'https://example.com/x', headers: [], queryString: [], cookies: [] },
  response: { status: 200, statusText: 'OK', headers: [], cookies: [], content: {} },
} as unknown as HarEntry;

describe('HarEntryDetail 壊れた entry のガード', () => {
  it('response 欠落 entry でも throw せずプレースホルダを表示する', () => {
    const broken = { request: { method: 'GET', url: 'https://example.com/y', headers: [], queryString: [], cookies: [] } } as unknown as HarEntry;
    expect(() => render(<HarEntryDetail entry={broken} />)).not.toThrow();
    expect(screen.getByText(/詳細を表示できません/)).toBeTruthy();
  });

  it('空 entry でも throw せずプレースホルダを表示する', () => {
    const empty = {} as unknown as HarEntry;
    expect(() => render(<HarEntryDetail entry={empty} />)).not.toThrow();
    expect(screen.getByText(/詳細を表示できません/)).toBeTruthy();
  });

  it('正常 entry では method/url/status を表示する', () => {
    render(<HarEntryDetail entry={validEntry} />);
    expect(screen.getByText(/GET https:\/\/example.com\/x/)).toBeTruthy();
    expect(screen.getByText(/200/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- HarEntryDetail`
Expected: FAIL（`const { request, response } = entry` 後 `response.status` で throw、またはプレースホルダ文言が無い）。

- [ ] **Step 3: HarEntryDetail を実装**

`src/components/tools/HarEntryDetail.tsx` の `export function HarEntryDetail` 冒頭（現 26-28 行 `const { request, response } = entry;` 周辺）にガードを追加する。`NameValueTable` ヘルパはそのまま:

```tsx
export function HarEntryDetail({ entry }: Props) {
  const request = entry?.request;
  const response = entry?.response;

  // 手編集・切り詰めた HAR では request/response を欠く entry がありうる。
  // 直接参照すると TypeError でクラッシュするためプレースホルダでガードする（issue #681）。
  if (!request || typeof request !== 'object' || !response || typeof response !== 'object') {
    return (
      <div className="rounded border border-default p-4 text-muted">
        このエントリは request / response を欠くため詳細を表示できません。
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded border border-default p-4">
```

（以降の JSX 本体は変更なし。`const { request, response } = entry;` の行は削除し、上記 2 行の宣言に置き換える。）

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- HarEntryDetail`
Expected: PASS（3 ケース）。

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/HarEntryDetail.tsx src/components/tools/__tests__/HarEntryDetail.test.tsx
git commit -m "fix: har-viewer 詳細パネルで壊れた entry をガード (#681)"
```

---

### Task 3: E2E（壊れた entry を含む HAR でクラッシュしない）

**Files:**
- Modify: `tests/e2e/har-viewer.spec.ts`

- [ ] **Step 1: E2E ケースを追加**

`tests/e2e/har-viewer.spec.ts` の `test.describe('HAR ビューア', ...)` ブロック内（最後の test の後）に以下を追加する。`uploadHar` ヘルパは既存:

```ts
  test('壊れた entry（request/response 欠落）を含んでもクラッシュせず描画する', async ({
    page,
  }) => {
    await page.goto('/tools/har-viewer');

    // 1 件目は正常、2 件目は request/response を欠く壊れた entry（issue #681 再現データ）
    const json = JSON.stringify({
      log: {
        version: '1.2',
        creator: { name: 'test', version: '1.0' },
        entries: [
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
          {}, // 壊れた entry
        ],
      },
    });
    await uploadHar(page, json);

    // 正常 entry が描画される（React island がクラッシュしていない陽性対照）
    await expect(page.getByRole('button', { name: /\/api\/ok$/ })).toBeVisible({
      timeout: 10000,
    });
    // 壊れた entry 行はプレースホルダで表示される
    await expect(page.getByText('（壊れたエントリ）')).toBeVisible();
    // サマリのリクエスト件数は 2 件（entry は配列に保持される）
    await expect(page.getByText(/リクエスト:/)).toBeVisible();
  });
```

- [ ] **Step 2: E2E を実行**

Run: `npm run test:e2e -- har-viewer`
Expected: PASS（既存ケース + 新規ケース）。preview ビルドが要る場合は `npm run test:e2e` が内部で preview を起動する。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/har-viewer.spec.ts
git commit -m "test: har-viewer 壊れた entry のクラッシュ防止 E2E を追加 (#681)"
```

---

### Task 4: 最終検証

- [ ] **Step 1: ユニットテスト全体**

Run: `npm run test`
Expected: 全 PASS（新規 component test 含む）。

- [ ] **Step 2: 型チェック全体**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 3: Lint / format チェック**

Run: `npm run lint && npm run format:check`
Expected: エラーなし（format で差分が出たら `npm run format` で整形して該当ファイルを再コミット）。

- [ ] **Step 4: E2E 全体（har-viewer）**

Run: `npm run test:e2e -- har-viewer`
Expected: 全 PASS。

---

## Self-Review メモ

- **Spec coverage**: 設計の 1（list ガード）→ Task 1、2（detail ガード）→ Task 2、テスト（unit/E2E 陽性対照）→ Task 1/2/3。漏れなし。
- **陽性対照**: ガードを外すと render が throw して fail する（Task 1/2 のテスト）。検知能力ゼロで green の状態を排除（`test-gates` 方針）。
- **インデックス整合**: 行をスキップせず絶対 index を維持するため `HarViewer` の `result.har.log.entries[selectedIndex]` 逆引きは不変。
- **VRT**: ツール追加・slug 変更なし、`PAGES` 配列は変更不要（har-viewer は既に登録済み）。描画ガードによる通常時の見た目は不変（壊れた entry が無い HAR では既存と同一 DOM）。
