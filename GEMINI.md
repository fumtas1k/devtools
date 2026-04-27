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

## 3. ユーザーからのヒント・教訓

- **エージェント共通規約**: GitHub 操作時の注意点や UI 目視確認の規定など、AI エージェント向けの共通規約については必ず `docs/shared-agent-rules.md` を参照し、遵守してください。
- ファイルを読み書きする際、末尾の空白（trailing whitespace）が含まれないよう注意してください。
- `conductor/` ディレクトリは無視（.gitignore 済み）されていますが、これは内部ツール用です。
