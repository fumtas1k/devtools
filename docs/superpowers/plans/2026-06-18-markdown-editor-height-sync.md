# markdownエディタ 入力／プレビュー高さ揃え Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** markdownエディタの入力欄とプレビューの縦幅を常に一致させ、json/csv・設定ファイル変換ツールと同じ「左右が同じ高さの箱・はみ出したら内部スクロール」の見た目に揃える。

**Architecture:** 既存の高さ同期プリミティブ（`OutputField` の `fill` 機構 = 親行 `items-stretch` + 片側が高さを決め、もう片側が `flex-1 min-h-0` で埋めて内部スクロール）をプレビュー div に適用する。入力 textarea が高さドライバ（`resize-y` 維持）、プレビューが追従。flexbox の stretch で実現するため CSS のみ・インライン style 不使用（CSP / 規約準拠）で、手動リサイズにも自動追従する。

**Tech Stack:** React (TSX) / Astro / Tailwind v4（`@layer components` 意味クラス）/ Playwright (E2E) / Vitest。

設計書: `docs/superpowers/specs/2026-06-18-markdown-editor-height-sync-design.md`

> **実装時の方針修正（重要）**: 本計画の Task 2 は当初 `items-stretch` + `fill` 機構を採用していたが、
> 実装・E2E 検証でプレビュー（コンテンツ依存 `div`）の高さが青天井に伸びて機能しないことが判明し、
> **固定高 28rem + 内部スクロール方式**（`.md-preview-box` クラス、`JsonFormatter` の `.json-tree-box` と同方式、
> 入力は `InputField rows={18}`）へ変更した。最終コードと根拠は設計書 §2 と実装コミットを参照。

---

## File Structure

- Modify: `src/components/tools/MarkdownEditor.tsx` — 2 ペインのレイアウトを `items-stretch` + fill 機構に変更。入力を共通 `InputField` に統一、プレビューを `OutputField` ラベル行構造にミラー、`.md`ダウンロードを下部アクション行に移設。
- Modify: `tests/e2e/markdown-editor.spec.ts` — 高さ一致のリグレッション防止テスト（陽性ガード）を追加。既存テストはラベル／ボタン名が不変のため原則そのまま。

共通 UI（`InputField` / `OutputField` / `CopyButton` / `DownloadButton`）は既存実装を参照のみ（変更しない）。

---

## Task 1: 高さ一致 E2E ガードを追加（先に失敗させる）

**Files:**

- Test: `tests/e2e/markdown-editor.spec.ts`（既存ファイル末尾の `test.describe` 内に追加）

このテストは「長文を入力したとき入力欄 textarea とプレビュー箱の高さがほぼ一致する」ことを検証する。
現状はプレビューが青天井に伸びて入力欄より高くなるため **fail する**（= 真のリグレッションガード）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/e2e/markdown-editor.spec.ts` の `test.describe('markdownエディタ（production CSP 適用）', () => { ... })` ブロック内（既存テスト群の後ろ、閉じ `});` の直前）に以下を追加する。先頭の import 行 `import { test, expect } from '@playwright/test';` は既存のまま流用する。

```ts
// ─── 高さ一致ガード: 入力欄とプレビューの縦幅が揃うことを担保 ──────────
// プレビューが青天井に伸びる（items-stretch / fill 欠落）と高さ差が広がり fail する。
test('高さガード: 長文入力時に入力欄とプレビューの高さがほぼ一致する（PC 幅）', async ({
  browser,
}) => {
  await withProductionCsp(browser, '/tools/markdown-editor', async (page) => {
    // 左右 2 カラムが横並びになる PC 幅で検証する（md ブレークポイント >= 768px）
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitForReactHydration(page);

    // プレビューが入力欄より明確に高くなるよう、十分に長い markdown を入力する
    const longMarkdown = Array.from(
      { length: 40 },
      (_, i) => `## 見出し${i + 1}\n\n本文テキスト${i + 1}`
    ).join('\n\n');
    await page.getByLabel('markdown入力').fill(longMarkdown);

    const input = page.getByLabel('markdown入力');
    const preview = page.locator('.markdown-preview');
    await expect(preview).toBeVisible();

    const inputBox = await input.boundingBox();
    const previewBox = await preview.boundingBox();
    if (!inputBox || !previewBox) throw new Error('boundingBox が取得できませんでした');

    // flexbox stretch で両者の高さは一致する。border/padding 差の許容差は数 px。
    expect(Math.abs(inputBox.height - previewBox.height)).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: テストを実行して fail を確認**

Run: `npm run test:e2e -- markdown-editor.spec.ts -g "高さガード"`
Expected: FAIL（プレビュー高さが入力欄より大きく、`Math.abs(...) <= 5` を満たさない）。

> 補足: E2E は preview ビルド経由。`npm run test:e2e` が内部で build/preview を立ち上げる。差分が確認できれば十分。

- [ ] **Step 3: コミット（red を記録）**

```bash
git add tests/e2e/markdown-editor.spec.ts
git commit -m "test: markdownエディタの入力／プレビュー高さ一致ガードを追加"
```

---

## Task 2: MarkdownEditor を fill 高さ同期 + 変換系ツールの見た目に統一

**Files:**

- Modify: `src/components/tools/MarkdownEditor.tsx`（全面書き換え）

import 追加を伴うため、規約 §9.3 に従いファイル全体を書き直す。

- [ ] **Step 1: コンポーネントを書き換える**

`src/components/tools/MarkdownEditor.tsx` を以下の内容で**全置換**する。`SAMPLE` 定数の中身は既存のまま維持する（変更しない）。

```tsx
import { useMemo, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { renderMarkdown } from '@/utils/markdown';
import { downloadText } from '@/utils/download';

const SAMPLE = `# markdownエディタへようこそ

**GFM（GitHub Flavored Markdown）** に対応したリアルタイムプレビューエディタです。

## 主な機能

- ライブプレビュー（入力と同時に右ペインに反映）
- GFM 表・取り消し線・コードブロック対応
- HTMLコピー・.mdダウンロード

## 表の例

| 名前     | 説明          |
| -------- | ------------- |
| marked   | Markdownパーサ |
| React    | UIフレームワーク |

## コードブロック

\`\`\`typescript
function hello(name: string): string {
  return \`こんにちは、\${name}！\`;
}
\`\`\`

> 引用テキストはこのように表示されます。

~~取り消し線~~ もGFMで使えます。
`;

/**
 * markdownエディタ — 2ペインのライブプレビューツール。
 * 左ペイン: textarea 入力 / 右ペイン: sanitizeHtml済みHTMLプレビュー。
 *
 * 高さ揃え: 親行を items-stretch にし、入力 textarea を高さドライバ、プレビュー列を
 * OutputField の fill 機構（md:flex md:h-full md:flex-col + 箱を md:flex-1 md:min-h-0
 * overflow-auto）でミラーして追従させる。flexbox stretch のみで実現し、手動リサイズにも
 * 追従する（インライン style 不使用・CSP / 規約準拠）。
 */
export function MarkdownEditor() {
  const [input, setInput] = useState('');

  // 入力が空の場合は renderMarkdown を呼ばない。
  // renderMarkdown → sanitizeHtml が DOMParser を使うため SSR（Node.js）環境では実行できない。
  // client:load で CSR 専用だが、空入力では不要な処理を避けることで SSR プリレンダでも安全。
  const html = useMemo(() => (input.length === 0 ? '' : renderMarkdown(input)), [input]);

  const handleDownload = () => {
    downloadText(input, 'markdown.md', 'text/markdown');
  };

  return (
    <div className="space-y-4">
      {/* 2ペインレイアウト（PC横並び・スマホ縦積み）。items-stretch で左右の高さを揃える */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* 左ペイン: 入力（高さドライバ） */}
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="md-input"
            label="markdown入力"
            value={input}
            onChange={setInput}
            multiline
            mono
            resize
            rows={16}
            placeholder={`# 見出し\n\n**太字** や *斜体*、\`コード\` が使えます。`}
            onSampleClick={() => setInput(SAMPLE)}
          />
        </div>

        {/* 右ペイン: プレビュー（OutputField の fill 機構をミラーして高さ追従） */}
        <div className="w-full md:flex-1 min-w-0 md:flex md:self-stretch">
          <div className="w-full md:flex md:h-full md:flex-col">
            {/* ラベル行（OutputField と同一構造で上端と高さを揃える） */}
            <div className="flex items-center justify-between mb-3 min-h-8">
              <span className="body-emphasis text-default">プレビュー</span>
              {input.length > 0 && (
                <CopyButton text={html} label="HTMLをコピー" ariaLabel="プレビューのHTMLをコピー" />
              )}
            </div>
            {input.length === 0 ? (
              <div
                className="w-full rounded-lg border border-input p-3 min-h-96 md:min-h-0 md:flex-1 caption text-muted flex items-center justify-center"
                aria-label="プレビューエリア（入力待ち）"
              >
                markdown を入力するとプレビューが表示されます
              </div>
            ) : (
              <div
                className="markdown-preview w-full rounded-lg border border-input p-4 min-h-96 md:min-h-0 md:flex-1 overflow-auto"
                // sanitizeHtml 済みの HTML を dangerouslySetInnerHTML で描画する。
                // renderMarkdown が必ず sanitizeHtml に通してから返すため XSS は発生しない。
                dangerouslySetInnerHTML={{ __html: html }}
                aria-label="markdownプレビュー"
              />
            )}
          </div>
        </div>
      </div>

      {/* 下部アクション行（変換系ツールと同じ配置） */}
      <div className="flex justify-end gap-2">
        <DownloadButton
          onClick={handleDownload}
          label=".mdダウンロード"
          variant="secondary"
          disabled={input.length === 0}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx astro check --filter src/components/tools/MarkdownEditor.tsx`（不可なら `node_modules/.bin/astro check`）
Expected: エラー 0。

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: PASS（button type 漏れ等なし。`InputField` / `DownloadButton` が type を内包）。

- [ ] **Step 4: 高さガード E2E を再実行して green を確認**

Run: `npm run test:e2e -- markdown-editor.spec.ts -g "高さガード"`
Expected: PASS（`Math.abs(inputBox.height - previewBox.height) <= 5`）。

- [ ] **Step 5: 既存 E2E（全ケース）を実行**

Run: `npm run test:e2e -- markdown-editor.spec.ts`
Expected: 全 PASS。ラベル「markdown入力」・ボタン名「サンプルを入力」「HTMLをコピー」「.mdダウンロード」は不変のため既存ロケータは有効。万一ロケータ不一致が出たら、当該テストの取得名を上記の不変名に合わせて修正する。

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/MarkdownEditor.tsx
git commit -m "fix: markdownエディタの入力とプレビューの高さを揃える"
```

---

## Task 3: 最終検証（ユニット・型・ビルド・目視）と VRT 注記

**Files:**

- 変更なし（検証のみ）

- [ ] **Step 1: ユニットテスト**

Run: `npm run test`
Expected: 全 PASS。`tests/meta/vrt-pages-coverage.test.ts` は既に `/tools/markdown-editor` 登録済みのため fail しない。

- [ ] **Step 2: 型チェック（全体）**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 3: ビルド**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: 目視確認（PC / スマホ）**

`npm run preview` を起動し `/tools/markdown-editor` を開く。`.agents/rules/ui-conventions.md` §3.2 手順で:

- PC 1280x800: 入力欄とプレビューの上端・下端が揃い、長文入力でプレビューが内部スクロールする。入力欄を手動リサイズするとプレビューも追従する。
- スマホ 390x844: 縦積みで崩れない。サンプル／コピー／ダウンロードの導線が見える。

- [ ] **Step 5: VRT baseline 再生成は手動トリガーである旨を控える**

レイアウト・ボタン配置変更により `markdown-editor` の VRT baseline 再生成が必要。
web セッションは `actions: write` 不可のため、PR 本文に「`Update Visual Regression Baseline` を
当該ブランチで手動 `workflow_dispatch` する必要がある」と明記する（PR 作成時に親が実施）。

---

## Self-Review

- **Spec coverage:**
  - 高さ同期（items-stretch + fill）→ Task 2 Step 1。
  - 変換系の見た目統一（InputField / OutputField ラベル行 / 下部ダウンロード）→ Task 2 Step 1。
  - E2E 高さガード → Task 1。既存陰性／陽性対照維持 → Task 2 Step 5。
  - VRT 再生成注記 → Task 3 Step 5。
  - 型 / lint / build / 目視 → Task 2・Task 3。
- **Placeholder scan:** code ステップは全て実コードを記載。TBD/TODO なし。
- **Type consistency:** `CopyButton`（`text` / `label` / `ariaLabel`）、`DownloadButton`（`onClick` / `label` / `variant` / `disabled`）、`InputField`（`multiline` / `mono` / `resize` / `rows` / `onSampleClick`）はいずれも既存シグネチャと一致。

```

```
