# プロジェクト共通開発規約 (AIエージェント用)

このリポジトリで作業するすべての AI エージェント（Claude Code, Codex 等）が遵守する共通規約。一般的なコーディング作法は書かず、このリポジトリ固有の約束事と過去の事故から得たルールだけを置く。

**プロダクトの原則**: ブラウザ内で完結する開発者ツール集であり、ユーザー入力データを外部送信する処理を追加しない。

## 1. 言語・出力規約

- コミットメッセージ・PR 説明文・ユーザー向けテキストは**日本語**。コード内コメントも日本語を基本とする。
- コミットは **Conventional Commits 形式**（`feat:` `fix:` `docs:` `chore:` `refactor:` `test:` `style:` `perf:` `build:` `ci:` `revert:` の 11 種のみ）。`.githooks/commit-msg` が検証する。
- **squash マージの件名（= PR タイトル）も同じ規約に従う**。GitHub 上の squash には hook が効かず、prefix なしの件名が develop に素通りする → `docs/playbooks/pr-creation.md` 6 章

### 1.1 出力量の規律

現行世代のモデルは既定で応答もドキュメントも長くなり、effort / thinking 設定では可視出力の長さは縮まない。

- **PR 本文**: 変更点・検証結果・スコープ外を簡潔に。同じ内容を二度書かず、定型見出しを埋めるための水増しをしない
- **plan / spec / `docs/agent-lessons.md`**: 次の行動を変える情報だけを残す（lessons は「現象 / 根本原因 / 対処 / 関連」に収める）
- **会話応答**: 結論を最初の 1 文に置く。短さより読みやすさを優先し、削るなら情報の選別で削る（矢印連結や断片文への圧縮はしない）

出典 → [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5)

---

## 2. コマンドリファレンス

| 用途                                  | コマンド                                         |
| :------------------------------------ | :----------------------------------------------- |
| 開発サーバー (http://localhost:4321)  | `npm run dev`                                    |
| 本番ビルド / プレビュー               | `npm run build` / `npm run preview`              |
| 整形 / 整形チェック                   | `npm run format` / `npm run format:check`        |
| Lint（button type 漏れ検出）          | `npm run lint`                                   |
| 型チェック                            | `node_modules/.bin/astro check`                  |
| ユニット・meta テスト (Vitest)        | `npm run test`                                   |
| E2E テスト (Playwright, preview 経由) | `npm run test:e2e` ❌ `npm run e2e` は存在しない |

---

## 3. 実装後の検証義務（要点）

> **正本**: `docs/playbooks/e2e-validation.md`（手順を変える場合は playbook 側を先に編集する）

- **E2E は実装と同時に書く**: バグ修正・UI 挙動の変更ではコミット前に該当ケースの E2E を追加する。
- **push 前に必須**: `npm run format:check` / `npm run test` / `node_modules/.bin/astro check` / `npm run test:e2e`。`npm run lint` もコミット前に推奨（CI は `format:check` の直後に lint を走らせる）。
  - CI の `test` ジョブは `format:check` を最初に走らせる。`Write` / `Edit` で作った Markdown の整形崩れは `npm run test` では検出できない（PR #753）。
  - **`astro check` は CI で errors / warnings / hints すべて 0 件を強制**する。ローカルは hint があっても exit 0 なので、非推奨 API の hint も先送りしない（PR #764）。
- **ガード / バリデータ / 検知機構を追加・修正するときは `test-gates` skill を必ず呼ぶ**（陽性対照が必須。陰性対照だけでは検知能力ゼロでも green になる。PR #233）。

---

## 4. ドキュメント更新ルール

実装変更をコミットする前に、以下への影響を確認・更新する。

| 変更の種類                            | 更新が必要なファイル                                                                      |
| :------------------------------------ | :---------------------------------------------------------------------------------------- |
| ツール追加                            | `README.md` (ツール一覧), `SPEC.md` (2.3, 2.4, 4, 5, 9章), `docs/decisions.md` (選定理由) |
| ツール削除・slug変更                  | 上記すべて                                                                                |
| ツール追加・挙動変更 (技術解説に影響) | `docs/tools.md` (該当ツールの仕組み・準拠仕様・制限)                                      |
| ライブラリ追加・削除                  | `SPEC.md` (2.3節), `docs/decisions.md`                                                    |
| ディレクトリ構成変更                  | `SPEC.md` (2.4節)                                                                         |
| フェーズ・タスク完了                  | `SPEC.md` (9章チェックリスト)                                                             |
| 設計上の重要な決断                    | `docs/decisions.md`                                                                       |
| セキュリティ設定変更 (CI等)           | `docs/decisions.md` (変更理由と安全性の確認)                                              |

---

## 5. ツール追加・実装フロー

1. `src/components/tools/ToolName.tsx` を作成
2. `src/pages/tools/tool-slug.astro` を作成（`client:load` で React コンポーネントをマウント）
3. `src/data/tools.ts` の `toolEntries` にエントリを追加（slug / name / description / category / yomi）。表示順は `yomi`（ひらがな）の五十音順で自動ソートされる
4. `src/components/ui/ToolIcon.astro` にアイコン（SVG、`{...attrs}` 展開・`currentColor` 方式）を追加。漏れは `tests/meta/tool-icon-coverage.test.ts` が検出
5. `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/<slug>` を追加。漏れは `tests/meta/vrt-pages-coverage.test.ts` が検出
   - baseline は CI の `Update Visual Regression Baseline` workflow（`workflow_dispatch`）で生成する。mac とのフォント描画差があるためローカル生成は不可。エージェントが起動できるかはトークン権限次第（Claude Code on the web は不可 → `.claude/rules/github-web-session.md`）
   - この workflow は対象ブランチへ直接コミットを push するので、その後ローカルから push する前に `git pull --rebase origin <branch>` する
6. 4 章に従い `README.md` / `SPEC.md` / `docs/decisions.md` を更新
7. `docs/tool-candidates.md` 由来のツールは、マージ時に該当行の「状態」列へ ✅ と PR 番号を記載

入力欄・ボタン・エラー表示等を作る前に `src/components/ui/` の共通コンポーネントを確認する（一覧は `.agents/rules/ui-conventions.md`）。

---

## 6. Git / GitHub ワークフロー

### 6.1 GitHub への本文付き投稿は常にファイル経由

`gh pr create/comment/edit/review/merge`、`gh issue create/comment/close/edit`、`gh api` で Markdown 本文を渡すときは、本文をコマンドライン引数に埋め込まず `--body-file` / `-F` / `--input <file>` を使う。HEREDOC のエスケープで literal `\` が GitHub に流れる事故が頻発したため、条件付きではなく常時ルールにしている。

- `gh issue close --comment` はファイル指定できないので使わない（`gh issue comment --body-file` → `gh issue close --reason`）
- 本文ファイルは各エージェント専用の一時ディレクトリ（6.6 章）に置く
- 投稿失敗時は `gh pr view` / `gh issue view` で状況を確認し、重複があれば削除する

### 6.2 ブランチ運用

> **正本**: `docs/playbooks/pr-creation.md` 1〜2 章

- `develop` に直接コミットしない。ブランチ名は `<type>/<slug>`（issue があれば `<type>/issue-<n>-<slug>`）。
- **起点は `origin/develop` を明示する**。`git checkout -b <branch>` だけだと worktree が `main` 起点になる既知問題がある（PR #154, #181）。

### 6.2.1 worktree 作成直後のセットアップ

`git worktree add` 直後は `npm ci` を実行する（mid-session の作成では SessionStart hook が発火しない）。

### 6.3 PR のベースブランチとマージ方法

- PR は **`--base develop`**（`gh` のデフォルトは `main`）。`main` 向けは develop → main のリリース PR のみ。
- マージ: feature PR は `--squash`、リリース PR は `--merge`。
- PR 作成・編集・マージ時は**必ず** `docs/playbooks/pr-creation.md` を参照する。

### 6.4 先送りするなら必ず issue 化する

レビュー指摘や作業中の課題を「別 PR で対応」とするなら、その場で issue を起票し、PR の返信に `#<番号>` を貼る。issue 番号のない口頭の「後で」は禁止。本 PR で完結できる軽微な対応は先送りしない。

### 6.5 再利用候補スクリプトの提案

3 行以上の bash・繰り返し書く手順・覚えにくいフラグを伴う複合コマンドは、実行前に `scripts/` への切り出しをユーザーに提案する（同意を得てから作る）。使い分けは `scripts/README.md`。

### 6.6 一時ファイル・ステージング

- 一時ファイルは各エージェント専用の一時ディレクトリにのみ作り、credential / secret を置かない。具体パスと削除 helper は各エージェント固有ルール（Claude → `.claude/rules/git-and-fs.md`、Codex → `AGENTS.md`）に従う。
- stage は明示 pathspec のみ。`git add .` / `-A` / `--all` は使わない。
- レビュー取得は `gh pr view <PR> --comments` を優先する（`gh api` は多くの設定で ask 経路）。

### 6.7 branch protection の承認必須化を提案しない

solo dev 体制（作成者 = レビュアー = merger）では `Require approvals` を有効にすると self-approve 不可で自分の PR が永久にマージできなくなる。team 前提の review 強制設計を提案しない（`docs/decisions.md [069]`）。

### 6.8 VRT pixel diff の baseline 更新を勧めない

pixel diff が小さくても（例: 0.07%）「微小だから baseline 更新で OK」と勧めない。判断はユーザーの目視確認に委ねる。baseline 更新前には DOM 構造 diff / computed style diff の 2 段階検証が必須（PR #299）→ `docs/playbooks/e2e-validation.md` 7.7 章

### 6.9 サブエージェント運用

委譲には「context 再構築 → 作業 → 報告 → 親が再読」の往復コストが乗る。次のケースでは委譲しない:

- 親が数回の tool 呼び出しで完結できる作業
- 検証・ダブルチェック目的（検証は親のループ内で行う）
- 1 体で足りる作業への並列投入（並列は独立かつ相応の規模があるトラックに限る）

**reviewer subagent（`requesting-code-review` skill）は複数ファイルにまたがる機能追加 / セキュリティ関連の変更に限定する**（skill 側の「mandatory」記述より本規約が優先）。Claude Code は代わりに Codex レビューを必須とする（`CLAUDE.md`）。

委譲するとき:

- 目的・制約・完了条件・スコープ外を初回プロンプトで完結させ、矛盾する設計指示を混ぜない（PR #217 で「memo 化した派生値を依存配列に保つ」と「依存配列を一次入力に展開する」の併記が `eslint-disable` 2 箇所の実装になった）。両論併記が避けられないなら「`eslint-disable` は使わず、それで済まない設計なら知らせる」と明記する
- 完了報告は依頼項目ごとに「実装 / 既存で十分 / スキップ理由」を要求し、親が依頼数と突き合わせる（PR #218 で 3 件中 1 件のみ実装で「完了」報告）
- subagent が `package.json` を変えたら、`git diff origin/develop --name-only` に `package-lock.json` も含まれるか親が確認する。漏れていれば `npm install --package-lock-only --cache "$TMPDIR/npm-cache" --no-audit --no-fund` で同期し、別コミットで push する（PR #181）
- `gh pr edit` 等の ask 経路は subagent から非対話 deny されるので親が引き取る（PR #189）

---

## 7. スタイル・UI ルール（基本）

Tailwind の **primitive scale のカラークラス**（`text-blue-500` / `bg-red-50` / `text-neutral-700` 等）は使わない。

- `@theme` 登録の **semantic token** の auto-utility（`text-primary` / `text-success` 等）は使ってよい。判断基準は「token 名から用途が読み取れるか」。
- それ以外の色は `src/styles/global.css` の `@layer components` の意味クラス（`bg-subtle` / `alert-success` 等）を使う。無ければ先に意味クラスを追加する。
- Astro の既存 `style="var(--color-*)"` は [#289](https://github.com/fumtas1k/devtools/issues/289) で移行中。新規は React と同じ意味クラスを使う。

- **`style={{}}` / `element.style` の書き換えは用途を問わず禁止**（issue #176 で全廃済み。SSR される `style` 属性は、色以外でも本番 CSP（`style-src` に `'unsafe-inline'` なし）に違反する）。

UI 変更時は **PC (1280x800)** と **スマホ (390x844)** の両方でスクリーンショットを撮って目視確認する（手順 → `.agents/rules/ui-conventions.md` 3 章）。

### 7.1 `@layer components` の手書き class は variant 非対応

`global.css` の `@layer components` 内で手書き定義した class に `hover:` / `focus:` / `aria-pressed:` 等を付けても CSS rule が生成されず、silent regression する（PR #277）。`@theme` 由来の utility は variant 対応する。

hover 等が必要なら、専用 class を `:hover` 擬似クラスごと `@layer components` に定義する（`.btn-clear` / `.hover-bg-subtle` 等）。追加後は `npm run build` して `dist/_astro/BaseLayout.*.css` に rule が出ているか確認する。

### 7.2 `docs/` の Tailwind scan 除外を消さない

`src/styles/global.css` の `@source not "../../docs";` は docs の Markdown に書かれた class 名が CSS に混入するのを防いでいる。不要に見えても削除しない。

---

## 8. プロジェクト構造（固有の置き場所）

- `tests/meta/`: ドキュメント / 設定の整合性を検証する meta テスト（`src/**/__tests__/` とは分離）
- `docs/playbooks/`: タスク開始時に読む手順書（PR 作成 / E2E 検証 等）
- `docs/decisions.md`: 設計上の意思決定記録
- `docs/agent-lessons.md`: 教訓バッファ（11 章）
- `tasks/active_context.md`: セッション固有の作業コンテキスト（gitignore 対象、10 章）

---

## 9. 編集時の安全規則

### 9.1 セキュリティ設定を無断で変更しない

`.npmrc`・`npm audit` 設定・CI 設定・`.githooks/*` 等のセキュリティ関連設定は、ユーザーの明示的な承認なしに変更・無効化しない。

### 9.2 a11y 属性・role 属性を削除しない

`aria-*` 属性と `role=` 属性は、明示的に許可されていない限り削除しない。`git diff` に `aria-` の削除行が含まれていたら確認を取る。refactor で削除されて a11y E2E が CI で落ちた実例がある（PR #175 → #179）。

### 9.3 例外で検証する呼び出しは戻り値を捨てない

`decodeURIComponent` / `JSON.parse` / `new URL` / `new RegExp` 等を「例外が出るか」だけで検証に使うときは、必ず戻り値を使う形で書く（失敗時に `null` を返すヘルパーを作り `=== null` で判定する等）。戻り値を捨てた呼び出しは Vite 8 の minifier に削除され、本番ビルドでだけ検証が効かなくなる。ユニットテストでは検出できない（PR #769）。

### 9.4 `dangerouslySetInnerHTML` に入れる値はエスケープ / サニタイズする

外部入力を含む HTML / SVG を `dangerouslySetInnerHTML` に渡すときは、必ずエスケープかサニタイズを通す（外部 HTML は `src/utils/sanitizeHtml.ts` の許可リスト方式。MarkdownEditor のように iframe 層が無い箇所では唯一の防御になる）。可能なら React 要素として組み立てる。

---

## 10. 目的の維持とスコープ管理 (ATC)

脱線とスコープ外修正を防ぐため、`tasks/active_context.md`（テンプレート: `tasks/active_context_template.md`）に「目的・ステップ・スコープ外」を宣言して作業する。スコープ外の発見は直接直さず `## Pending` にメモし、レビュー指摘は `## 🟢 Review & Feedback` で管理する。PR マージ後に削除し、教訓は `docs/agent-lessons.md` へ転記する。

`docs/superpowers/plans/*.md` / `specs/*.md` 等が同じ情報を持っていれば ATC は作らなくてよい。

---

## 11. 教訓の運用 (`docs/agent-lessons.md`)

`docs/agent-lessons.md` は教訓の一時バッファで、本ドキュメントが共通ルールの正本。

- **記録**: 修正を受けた／気づきがあったときに日付付きで追記する。
- **昇格 → 削除**: 開発全体に適用される規約は本ドキュメントへ昇格させ、lessons から削除する。
- **削除対象**: 共通ルール化済み／コード・Hook・設定で強制済み／一度限りの TIP。
- **保持対象**: 特定ツール・コンポーネントに紐づく実装メモやリスク。
