# markdownエディタ 設計書

- 日付: 2026-06-17
- slug: `markdown-editor`
- カテゴリ: `convert`（変換・解析）
- 方針: 全処理ブラウザ内完結・外部送信なし

## 1. 目的

markdown を入力すると、リアルタイムに整形済み HTML プレビューを表示するエディタツール。
左に入力エディタ、右にプレビューの 2 ペイン構成。GFM（表・チェックボックス記法・取り消し線・コードブロック）に対応する。

## 2. 機能スコープ（ブレストで確定）

- ライブプレビュー中心（2 ペイン）。GFM 対応。
- 出力: 生成 HTML のクリップボードコピー、入力 markdown の `.md` ダウンロード。
- 入力サンプル投入ボタン。
- スコープ外（YAGNI）: 書式ツールバー、コードのシンタックスハイライト、目次生成、`.html` ダウンロード、localStorage 自動保存。

## 3. アーキテクチャ

### 3.1 ユニット分割

| ユニット                                  | 役割                                                                                                                       | 依存                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `src/utils/markdown.ts`                   | `renderMarkdown(md: string): string`。`marked` で HTML 化 → 既存 `sanitizeHtml()` に通して安全な HTML 文字列を返す純粋関数 | `marked`（新規）, `@/utils/sanitizeHtml` |
| `src/components/tools/MarkdownEditor.tsx` | 2 ペイン UI。入力 state 管理、`renderMarkdown` の memo 化、コピー / ダウンロード / サンプル                                | `@/utils/markdown`, 共通 UI              |
| `src/pages/tools/markdown-editor.astro`   | `client:load` でコンポーネントをマウント                                                                                   | BaseLayout                               |

### 3.2 データフロー

```
textarea 入力 (state)
  → useMemo(renderMarkdown(input))   // 入力単位で memo 化（毎レンダー再パース回避）
     → marked.parse(md)              // GFM → HTML 文字列
     → sanitizeHtml(html)            // 許可リストで script/危険属性除去
  → <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: sanitized }} />
```

HTML コピーは `sanitized`（プレビューと同一文字列）を対象にする。
`.md` ダウンロードは入力 markdown 原文をそのまま保存する。

## 4. プレビュー描画方式の決定

**採用: インライン描画 + 要素スコープ CSS**（`dangerouslySetInnerHTML` に `sanitizeHtml` 済み文字列を渡す）。

- `src/styles/global.css` の `@layer components` に `.markdown-preview` を定義し、子要素を**要素セレクタ**で整形する（`.markdown-preview h1 { … }` / `table` / `pre code` / `blockquote` 等）。
  - `sanitizeHtml` は `class` 属性を除去するため、生成要素にクラスは付けられない。ラッパ div のクラス + 子孫要素セレクタで整形する。
  - 色は CSS 変数 / semantic token のみ（primitive scale 直書き禁止、`.agents/rules/common.md` 7 章）。
- 安全性: `sanitizeHtml` の許可リスト方式（`<script>`・style・危険属性・javascript: URL を除去）でガード。出力 HTML も常にサニタイズ後のものをコピーさせる。
- 代替案として sandbox iframe（ClipboardInspector 方式）も検討したが、本番 CSP 下でインラインスタイル / class が無効化され**素の UA スタイル表示**になり、整形プレビューというツールの主目的を損なうため不採用。入力は基本ユーザ自身の文章であり、許可リスト 1 層で実用上十分と判断。

## 5. marked 出力タグと既存サニタイザの整合

`marked` の標準出力タグ（`h1`-`h6`, `p`, `ul`/`ol`/`li`, `blockquote`, `pre`, `code`, `em`, `strong`, `del`, `a`, `img`, `hr`, `br`, `table`/`thead`/`tbody`/`tr`/`th`/`td`）は**すべて既存 `ALLOWED_TAGS` 内**。サニタイザ拡張は不要。

既知の制限（プレビューに反映されない）:

- GFM タスクリストの `<input type=checkbox>`: `sanitizeHtml` の `DROP_WITH_CHILDREN` で除去される（チェックボックスは消えるがテキストは残る）。
- コードブロックの `class="language-xxx"`: `class` 属性は除去される（ハイライトはスコープ外なので影響なし）。
- 見出しの `id` アンカー: `id` 属性は許可外で除去される。

これらは「ライブプレビュー中心」スコープでは許容。docs/tools.md の制限節に明記する。

### marked 設定

- `gfm: true`, `breaks: true`（改行を `<br>` に。一般的なエディタ体験に寄せる）。
- HTML 生入力は marked のデフォルトでパススルーされるが、最終的に `sanitizeHtml` が除去するため XSS にはならない。

## 6. UI 構成（既存規約準拠）

- レイアウト: PC 横並び / スマホ縦積み（`flex flex-col md:flex-row gap-* `, 各ペイン `w-full md:flex-1 min-w-0`）。
- 入力: `textarea`（`InputField` で扱えない大型入力のため直接配置 or 既存ツールの textarea パターンに合わせる）。ラベルは `htmlFor` で紐付け。
- ボタン: `CopyButton`（HTML コピー）、`DownloadButton`（`.md`）、サンプル投入。共通 UI を流用（`src/components/ui/`）。
- 色・スタイル: Tailwind primitive scale 直書き禁止、`@layer components` 意味クラス / semantic token のみ。`outline-none` 禁止。

## 7. テスト

- 単体（`src/utils/__tests__/markdown.test.ts`）— **陽性対照を含む**:
  - 見出し / 段落 / リスト / 強調が期待 HTML になる。
  - GFM 表が `<table>` に変換される。
  - `<script>alert(1)</script>` や `<img onerror=...>` 等が除去される（陰性対照だけにしない＝検出能力ゼロで green を防ぐ）。
  - `[link](javascript:alert(1))` の危険 href が除去される。
- E2E（`tests/e2e/`）— 入力 → プレビュー反映、コピー / ダウンロードの導線。
- VRT — `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/markdown-editor` を追加。baseline は CI Linux runner の `Update Visual Regression Baseline` を手動 `workflow_dispatch`（web セッションでは `actions: write` 不可のため手動トリガー必須）。
  - `tests/meta/vrt-pages-coverage.test.ts` が未登録を `npm run test` で fail させる。

## 8. ドキュメント更新（`.agents/rules/common.md` 4 章）

- `README.md`: ツール一覧に追加。
- `SPEC.md`: 2.3（ライブラリに `marked`）, 2.4, 4, 5, 9 章。
- `docs/tools.md`: 仕組み・準拠（GFM / CommonMark）・制限（タスクリスト等）の節を追加。
- `docs/decisions.md`: `marked` 採用理由（GFM 対応・軽量・メンテ状況）、プレビューをインライン + 既存サニタイザにした判断。

## 9. 完了条件

- `npm run test` / `node_modules/.bin/astro check` / `npm run lint` / `npm run build` がローカルで通る。
- E2E 追加分 green。VRT は baseline 手動再生成が必要な旨を PR に明記。
- 上記ドキュメントが更新済み。
