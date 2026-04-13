# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。

---

## ドキュメント更新ルール

実装変更をコミットする前に、以下のファイルへの影響を必ず確認する：

| 変更の種類 | 更新が必要なファイル |
|-----------|-------------------|
| ツール追加 | `README.md`（ツール一覧）、`SPEC.md`（4章・5章・9章・ディレクトリ構成・ライブラリ表）、`docs/decisions.md`（採用ライブラリの理由） |
| ツール削除・slug変更 | 上記すべて |
| ライブラリ追加・削除 | `SPEC.md` 2.3節、`docs/decisions.md` |
| ディレクトリ構成変更 | `SPEC.md` 2.4節 |
| フェーズ完了・タスク完了 | `SPEC.md` 9章（チェックリスト） |
| 設計上の重要な決断 | `docs/decisions.md`（なぜその選択をしたか・却下した選択肢） |
| セキュリティ設定変更（`.npmrc`・CI設定等） | `docs/decisions.md` |

コミットメッセージに `feat:` / `fix:` が含まれる場合は、上記チェックを省略しない。

---

## 言語・出力規約

- PR説明文・コミットメッセージ・ユーザー向けテキストは、明示的に指示がない限り**すべて日本語**で書く。
- コード内のコメントも日本語を基本とする。

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

## スタイル・カラーシステム

Tailwind のカラークラス（`text-blue-500` 等）は**使わない**。色はすべて `src/utils/styles.ts` の `colors.*` をインラインスタイルで指定する。

```tsx
// ✅ 正しい
import { colors, caption, bodyEmphasis } from '../../utils/styles';
<p style={{ color: colors.muted, ...caption }}>テキスト</p>

// ❌ 誤り
<p className="text-gray-500 text-sm">テキスト</p>
```

レイアウト（`flex`, `gap`, `p-*`, `rounded` 等）は Tailwind クラスを使ってよい。

---

## プロジェクト構造

```
src/
  components/
    tools/        # ツール本体（React TSX）例: JanCode.tsx
    ui/           # 共通UIコンポーネント（InputField, DownloadButtonGroup 等）
  hooks/          # 共通フック（useClampedInput 等）
  pages/
    tools/        # Astroページ（slug対応）例: jan-code.astro
  utils/
    styles.ts     # カラー・タイポグラフィ定数
  styles/
    global.css    # CSS変数定義（@theme / :root）
docs/
  decisions.md    # 設計上の重要な決断記録
tasks/
  lessons.md      # セッションで得た教訓・修正パターン（随時更新）
```

### ツール追加時の手順

1. `src/components/tools/ToolName.tsx` を作成
2. `src/pages/tools/tool-slug.astro` を作成（`client:load` で React コンポーネントをマウント）
3. `src/pages/index.astro` のツール一覧に追加
4. ドキュメント更新ルールの表に従って各ファイルを更新

---

## 共通UIコンポーネント

新しい入力欄・ダウンロードボタン・エラー表示を実装する前に、`src/components/ui/` の既存コンポーネントを確認する：

| コンポーネント | 用途 |
|--------------|------|
| `InputField` | ラベル・入力欄・エラー・ヒント・サンプルボタンをまとめたフォームフィールド |
| `ErrorMessage` | エラーテキスト表示（`role="alert"` 付き） |
| `DownloadButtonGroup` | SVG/PNGダウンロードボタンペア |
| `CopyButton` | クリップボードコピーボタン |
| `ToggleGroup<T>` | 排他選択トグル（モード切替等） |

---

## 学びの記録

ユーザーから修正を受けたら `tasks/lessons.md` に記録する。次のセッション開始時に確認する。
