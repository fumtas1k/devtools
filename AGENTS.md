# Repository Guidelines

## プロジェクト構成

このリポジトリは、ブラウザ内で完結する開発者ツール集を提供する Astro 6 サイトです。主要コードは `src/` 配下にあります。ページは `src/pages`、共通レイアウトは `src/layouts`、React UI は `src/components`、hooks は `src/hooks`、ツール定義は `src/data`、純粋関数系の処理は `src/utils` に配置します。グローバル CSS は `src/styles/global.css`、静的アセットと配信ヘッダーは `public/` にあります。テストは Playwright のブラウザテストを `tests/e2e`、リポジトリ整合性チェックを `tests/meta` に置きます。設計判断や運用メモは `docs/`、Codex 設定は `.codex/`、agent skill 本体は `.agents/skills` に置き、`.claude/skills` は互換用 symlink として扱います。

## ビルド・テスト・開発コマンド

Node.js は `>=22.12.0` を使います。

- `npm ci`: lockfile に従って依存関係をインストールします。
- `npm run dev`: Astro 開発サーバーを `http://localhost:4321` で起動します。
- `npm run build`: 本番ビルドを `dist/` に生成します。
- `npm run preview`: ビルド済みサイトをローカル確認します。
- `npm test`: Vitest の単体・meta テストを実行します。
- `npm run test:e2e`: Playwright E2E テストを実行します。
- `npm run test:vrt`: visual regression テストを実行します。
- `npm run format` / `npm run format:check`: Prettier で整形・確認します。

初回 clone 後は `git config core.hooksPath .githooks` を 1 回実行して hook を有効化してください。

Codex で作業する場合、`.codex/hooks.json` の SessionStart / PreToolUse hook は初回起動時に trust するかどうかの確認が表示されます。trust しないと依存インストールやテスト編集時のガード注入が働かないため、内容を確認のうえ承認してください。

## コーディング規約

TypeScript、Astro、React 19、Tailwind CSS v4 を前提にします。整形は Prettier を正とし、Markdown と Astro も対象です。小さな純粋関数は `src/utils`、再利用 UI は `src/components` に分けます。ファイル名は既存に合わせて kebab-case または領域名ベースにします。例: `json-csv.ts`, `uuid-v7.ts`。このサイトはクライアントサイド完結が原則なので、ユーザー入力データを外部送信する処理を追加しないでください。

## テスト方針

ユーザー操作に関わる変更は `tests/e2e/*.spec.ts` に Playwright テストを追加します。リポジトリ構造やドキュメント整合性の検証は `tests/meta/*.test.ts` に置きます。ガード、validator、CSP チェック、lint 的検出器、リグレッション防止テストを追加・修正する場合は、意図的に違反を起こして検知できることを証明する陽性対照テストを同じ PR に含めます。

## Commit と Pull Request

履歴では `feat: ...`、`fix: ...`、`test: ...` などの短い subject と、日本語の説明的な件名が使われています。commit は目的ごとに小さく保ってください。PR には日本語の概要、検証コマンド、関連 issue、UI 変更時のスクリーンショットを含めます。レビュー依頼前に CI が通っていることを確認します。

## セキュリティと設定

`public/_headers` の strict CSP を尊重し、HTML inline `style` は避けて `global.css` の semantic class を使います。UI 変更では `.agents/skills/dads-design-system`、共通ルールでは `docs/shared-agent-rules.md` を参照してください。
