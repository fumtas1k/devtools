# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## パッケージマネージャー

- このプロジェクトでは **`npm`** を使う（`pnpm` / `yarn` は使わない）。
- スクリプト実行は `npm run <script>` 形式を使う（例: `npm run dev`）。

---

## コード品質・TypeScript

- JSX / TSX ファイルでは `class` ではなく **`className`** を使う。
- `<label>` の `for` 属性は **`htmlFor`** を使う。
- コミット前に `node_modules/.bin/astro check` を実行し、型エラーがゼロであることを確認する。
- TypeScript の警告は自分で発見・修正する。ユーザーに指摘させない。
- セキュリティ関連の設定（`.npmrc`・`npm audit` 設定・CI 設定など）は、**ユーザーの明示的な承認なしに変更・無効化してはならない**。

---

## ツール追加時の手順

1. `src/components/tools/ToolName.tsx` を作成
2. `src/pages/tools/tool-slug.astro` を作成（`client:load` で React コンポーネントをマウント）
3. `src/pages/index.astro` のツール一覧に追加
4. `docs/shared-agent-rules.md` のドキュメント更新ルールに従って各ファイルを更新

---

## 共通UIコンポーネント

新しい入力欄・ダウンロードボタン・エラー表示を実装する前に、`src/components/ui/` の既存コンポーネントを確認する：

| コンポーネント        | 用途                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `InputField`          | ラベル・入力欄・エラー・ヒント・サンプルボタンをまとめたフォームフィールド |
| `ErrorMessage`        | エラーテキスト表示（`role="alert"` 付き）                                  |
| `DownloadButtonGroup` | SVG/PNGダウンロードボタンペア                                              |
| `CopyButton`          | クリップボードコピーボタン                                                 |
| `ToggleGroup<T>`      | 排他選択トグル（モード切替等）                                             |

---

## 学びの記録

ユーザーから修正を受けたら `tasks/lessons.md` に記録する。次のセッション開始時に確認する。
