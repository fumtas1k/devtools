# GEMINI.md — プロジェクト開発規約 & コマンドリファレンス

このファイルは Gemini CLI 用のプロジェクト指示書です。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

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
  - 特定のファイルのみ実行する場合: `npm run test:e2e tests/e2e/xxx.spec.ts`

### 🧹 フォーマット

- `npm run format`: Prettier による一括整形
- `npm run format:check`: フォーマットが正しいかチェック

## 3. ユーザーからのヒント・教訓

- **GitHub操作 (重要)**: コメントやPR説明文を投稿する際は、バックティック（`）や絵文字によるシェルエラーを防ぐため、必ず `write_file` で一時ファイルを作成し、`gh`コマンドの`-F` オプションを使用して投稿すること。また、コマンドが失敗した場合は必ず投稿状況を確認し、重複した場合は放置せず、削除や修正を行って整合性を保つこと。
- UI変更時は、`docs/shared-agent-rules.md` の規定に従い、Playwright を使用して **PCサイズ (1280x800)** と **スマホサイズ (390x844)** の両方でスクリーンショットを確認してください。
- ファイルを読み書きする際、末尾の空白（trailing whitespace）が含まれないよう注意してください。
- `conductor/` ディレクトリは無視（.gitignore 済み）されていますが、これは内部ツール用です。
