# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## 🚀 最重要ルール（要約）

詳細については必ず `docs/shared-agent-rules.md` を参照すること：

- **言語**: コミットメッセージ・PR説明文は**必ず日本語**で記述する。
- **スタイリング**: Tailwind のカラークラスは使用禁止。必ず **`colors.*` (React)** または **`var(--color-*)` (Astro)** を使用する。
- **検証**: 変更後は必ず **`npm run test`** および **`npm run test:e2e`** で動作確認を行う。
- **ATC運用の徹底**: 実装中の脱線やスコープ外修正を防ぐため、セッション開始時に必ず `tasks/active_context.md` を作成・更新し、目的とスコープを確認すること（詳細は `docs/shared-agent-rules.md` 参照）。

---

## パッケージマネージャー

- このプロジェクトでは **`npm`** を使う（`pnpm` / `yarn` は使わない）。
- スクリプト実行は `npm run <script>` 形式を使う（例: `npm run dev`）。

---

## コード品質・TypeScript

- JSX / TSX ファイルでは `class` ではなく **`className`** を使う。
- `<label>` の `for` 属性は **`htmlFor`** を使う。
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
| `DownloadButton`      | 統一デザインのダウンロードボタン（アイコン内蔵）                           |
| `DownloadButtonGroup` | SVG/PNGダウンロードボタンペア                                              |
| `CopyButton`          | クリップボードコピーボタン                                                 |
| `ToggleGroup<T>`      | 排他選択トグル（モード切替等）                                             |

---

## 学びの記録

ユーザーから修正を受けたら `tasks/lessons.md` に記録する。次のセッション開始時に確認する。
