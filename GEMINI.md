# GEMINI.md — プロジェクト開発規約 & コマンドリファレンス

このファイルは Gemini CLI 用のプロジェクト指示書です。
**作業を開始する前に必ずこの内容を確認し、遵守してください。**

## 1. プロジェクト概要
ブラウザ完結型の開発者ツール集「DevTools」です。
- **Framework**: Astro 6.1.5 (SSG)
- **UI**: React 19 (Islands Architecture)
- **Styling**: Tailwind CSS 4.0.0
- **Language**: TypeScript

## 2. コマンドリファレンス

### 🛠️ 基本コマンド
- `npm ci`: 依存関係のインストール
- `npm run dev`: 開発サーバー起動 (http://localhost:4321)
- `npm run build`: 本番ビルド
- `npm run preview`: ビルド結果のプレビュー

### 🧪 テスト実行 (重要)
**テストコマンドを間違えないように注意してください。**
- **ユニットテスト (Vitest)**: `npm run test`
- **ユニットテスト (Watchモード)**: `npm run test:watch`
- **E2Eテスト (Playwright)**: `npm run test:e2e`
  - ❌ `npm run e2e` は存在しません。
  - 特定のファイルのみ実行する場合: `npm run test:e2e tests/e2e/xxx.spec.ts`

### 🧹 フォーマット
- `npm run format`: Prettier による一括整形
- `npm run format:check`: フォーマットが正しいかチェック

## 3. 開発規約

### 🇯🇵 言語設定
- **コミットメッセージ**: **必ず日本語**で書くこと（`.githooks/commit-msg` で英語はブロックされます）。
- **PR・説明・コメント**: すべて日本語を基本とします。

### 🎨 スタイリング規約 (重要)
Tailwind のカラークラス（例: `text-blue-500`）は**絶対に使用しないでください**。
- **React (.tsx)**: `src/utils/styles.ts` の `colors` オブジェクトをインラインスタイルで使用。
- **Astro (.astro)**: `var(--color-*)` 形式の CSS 変数を使用。
- レイアウト用クラス（`flex`, `p-4` 等）は Tailwind を使用して構いません。

### 📁 ディレクトリ構成
- `src/components/tools/`: ツール本体（Reactコンポーネント）
- `src/components/ui/`: 共通UIコンポーネント（`InputField`, `CopyButton` 等）
- `src/pages/tools/`: Astro ページ（各ツールへのルーティング）
- `src/utils/`: ロジック・ヘルパー関数
- `src/utils/__tests__/`: ユニットテストコード

### 📋 ドキュメント更新
実装変更時は、必ず以下のファイルへの影響を確認・更新してください：
- `SPEC.md`: プロジェクト仕様
- `README.md`: ツール一覧
- `docs/decisions.md`: 設計上の意思決定

## 4. ユーザーからのヒント・教訓
- UI変更時は、Playwright を使用して **PCサイズ (1280x800)** と **スマホサイズ (390x844)** の両方でスクリーンショットを確認してください。
- ファイルを読み書きする際、末尾の空白（trailing whitespace）が含まれないよう注意してください。
- `conductor/` ディレクトリは無視（.gitignore 済み）されていますが、これは内部ツール用です。
