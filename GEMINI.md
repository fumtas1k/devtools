# GEMINI.md — プロジェクト開発規約 & コマンドリファレンス

このファイルは Gemini CLI 用のプロジェクト指示書です。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

## 1. プロジェクト概要

ブラウザ完結型の開発者ツール集「DevTools」です。

- **Framework**: Astro 6.1.5 (SSG)
- **UI**: React 19 (Islands Architecture)
- **Styling**: Tailwind CSS 4.0.0
- **Language**: TypeScript

## 2. コマンドリファレンス (重要)

開発・ビルド・フォーマット・テスト実行等のコマンドについては、`docs/shared-agent-rules.md` の「2. コマンドリファレンス」を参照し、正しく実行してください。
特に **`npm run test:e2e`** を使用し、存在しない `npm run e2e` を呼び出さないよう注意してください。

## 3. Gemini CLI 固有の注意事項

- **`conductor/` ディレクトリ**: `.gitignore` 対象の内部ツール用ディレクトリです。変更・削除しないよう注意してください。
- **コード編集・型チェック・trailing whitespace**: `docs/shared-agent-rules.md` の「9. コード編集時の安全規則」に従ってください。
