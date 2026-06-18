# markdownエディタ 実装計画

設計書: `docs/superpowers/specs/2026-06-17-markdown-editor-design.md`
ブランチ: `claude/amazing-euler-gochb9`（`origin/develop` 起点・作成済み）

## 目的 / スコープ

markdown を 2 ペインでライブプレビューするツール `markdown-editor` を追加する。
GFM 対応・HTML コピー・`.md` ダウンロード・サンプル投入。全処理ブラウザ内完結。

### スコープ外（実装しない）

書式ツールバー / シンタックスハイライト / 目次 / `.html` ダウンロード / localStorage 自動保存。

## 前提・既存資産

- 既存 `src/utils/sanitizeHtml.ts` の `sanitizeHtml(html: string): string` を再利用（許可リスト方式）。**新規サニタイザを書かない**。
- `marked` を新規依存として追加（`npm install marked`）。`package.json` と `package-lock.json` を必ず両方コミット。
- 共通 UI: `src/components/ui/` の `CopyButton` / `DownloadButton` / `Section` 等。`src/utils/download.ts` の `downloadBlob`。
- ページは `ToolLayout` + `ToolInfoSection`（`json-formatter.astro` を雛形にする）。

## タスク（順に実施）

### 1. 依存追加

```
npm install marked
```

`package.json` / `package-lock.json` の差分を確認。

### 2. `src/utils/markdown.ts`

```ts
import { marked } from 'marked';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

// GFM・改行→<br>。出力は必ず sanitizeHtml に通して返す純粋関数。
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { gfm: true, breaks: true, async: false }) as string;
  return sanitizeHtml(html);
}
```

- `marked.parse` の戻り型が `string | Promise<string>` のため `async: false` を明示し `as string`。型チェックを通すこと。

### 3. `src/utils/__tests__/markdown.test.ts`（陽性対照必須）

- 見出し `# H1` → `<h1>`、`**bold**` → `<strong>`、リスト → `<ul><li>`。
- GFM 表（`| a | b |` 行）→ `<table>` を含む。
- **陽性対照（除去されることの検証）**: `<script>alert(1)</script>` がプレビュー HTML に**残らない**、`[x](javascript:alert(1))` の `href="javascript:..."` が**除去**される。陰性対照（正常入力）だけにしない。
- `test-gates` skill の趣旨（検出能力ゼロで green を防ぐ）に従う。

### 4. `src/components/tools/MarkdownEditor.tsx`

- `export function MarkdownEditor()`（json-formatter と同じ named export 形式に合わせる）。
- state: `input`（markdown 文字列）。初期値は空 or サンプル無しの空。
- `const html = useMemo(() => renderMarkdown(input), [input]);`
- レイアウト: `flex flex-col md:flex-row gap-4`、各ペイン `w-full md:flex-1 min-w-0`。
  - 左: `<label htmlFor="md-input">` + `<textarea id="md-input">`（既存ツールの textarea スタイルに合わせる。`outline-none` は付けない）。
  - 右: `<div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />`。
- ボタン群: サンプル投入（定数 markdown を input にセット）/ `CopyButton`（`html` をコピー、ラベル「HTMLをコピー」）/ `DownloadButton`（`downloadBlob` で input を `markdown.md` として保存）。
- 色は CSS 変数 / semantic token / `@layer components` 意味クラスのみ。primitive scale 直書き禁止。
- 既存ツールの aria 属性パターン（ラベル紐付け等）を踏襲。

### 5. `src/styles/global.css` の `@layer components` に `.markdown-preview`

- ラッパに付与し、**子要素を要素セレクタで整形**（`class` は sanitize で消えるため）。
  - 例: `.markdown-preview h1`, `.markdown-preview h2`, `.markdown-preview p`, `.markdown-preview ul`, `.markdown-preview ol`, `.markdown-preview blockquote`, `.markdown-preview pre`, `.markdown-preview code`, `.markdown-preview table`/`th`/`td`, `.markdown-preview a`, `.markdown-preview img`。
- 色は `var(--color-*)` / semantic token。border・余白・角丸は既存スケールに合わせる。
- variant prefix（`hover:` 等）を `@layer components` 手書きクラスに付けない（Tailwind v4 制約）。必要な hover は擬似クラスで直接書く。

### 6. `src/pages/tools/markdown-editor.astro`

- `json-formatter.astro` を雛形に。`ToolLayout` + `client:load` + `ToolInfoSection`（特長・ユースケースを日本語で記述）。

### 7. `src/data/tools.ts`

- `toolEntries` に追加:

```ts
{
  slug: 'markdown-editor',
  name: 'markdownエディタ',
  description: 'markdownをリアルタイムにHTMLプレビューします。GFM（表・取り消し線・コードブロック）対応。HTMLコピー・.mdダウンロード対応',
  category: 'convert',
  yomi: 'まーくだうんえでぃた',
},
```

### 8. VRT 登録

- `tests/e2e/visual-regression-pages.ts` の `PAGES` に `'/tools/markdown-editor'` を追加。

### 9. E2E テスト

- `tests/e2e/` の既存ツール spec を雛形に、`getByRole`/`getByLabel`/`getByText` で:
  - textarea に `# 見出し` を入力 → プレビューに `<h1>見出し</h1>` 相当（`getByRole('heading')`）が出る。
  - コピー / ダウンロードボタンが存在し操作できる。
- 属性セレクタ（`locator('[role=…]')`）禁止。`expect` のオートリトライを使う。

### 10. ドキュメント更新

- `README.md`: ツール一覧に追加。
- `SPEC.md`: 2.3（`marked` 追加）/ 2.4 / 4 / 5 / 9 章。
- `docs/tools.md`: 「変換・解析」セクションに節追加（仕組み・準拠 GFM/CommonMark・制限: タスクリスト input 除去 / コード class 除去 / 見出し id 除去）。目次にも追加。
- `docs/decisions.md`: `marked` 採用理由・インライン描画 + 既存サニタイザ採用の判断を記録。

## 検証（push 前に全て実行・結果を報告）

```
npm run test                  # 単体（markdown.test.ts 含む）+ meta（vrt-pages-coverage）
node_modules/.bin/astro check # 型
npm run lint
npm run build
npm run test:e2e              # 追加した E2E
```

- VRT baseline は CI でしか生成できない（mac/Linux font 差）。ローカル VRT は実行不要、**PR 本文に「baseline 手動再生成が必要」と明記**する旨を完了報告に含める。

## 完了報告フォーマット（必須）

各タスク（1〜10）ごとに **実装 / 既存で十分 / スキップ理由** を明記。検証コマンドの結果（pass/fail）を貼る。`package.json` 変更時は `package-lock.json` も差分に含まれているか明記。
