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

開発・ビルド・フォーマット等の基本コマンドについては、`docs/shared-agent-rules.md` の「2. コマンドリファレンス」を参照してください。

### 🧪 テスト実行 (重要)

**テストコマンドを間違えないように注意してください。**

- **ユニットテスト (Vitest)**: `npm run test`
- **ユニットテスト (Watchモード)**: `npm run test:watch`
- **E2Eテスト (Playwright)**: `npm run test:e2e`
  - ❌ **`npm run e2e` は存在しません。**
  - 特定のファイルのみ実行する場合: `npm run test:e2e tests/e2e/xxx.spec.ts`

## 3. ユーザーからのヒント・教訓

- **エージェント共通規約**: GitHub 操作時の注意点や UI 目視確認の規定など、AI エージェント向けの共通規約については必ず `docs/shared-agent-rules.md` を参照し、遵守してください。
- ファイルを読み書きする際、末尾の空白（trailing whitespace）が含まれないよう注意してください。
- `conductor/` ディレクトリは無視（.gitignore 済み）されていますが、これは内部ツール用です。
