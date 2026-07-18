# プロジェクト共通開発規約 (AIエージェント用)

このドキュメントは、このリポジトリで作業するすべての AI エージェント（Claude Code, Gemini CLI 等）が遵守すべき共通の規約を定めたものです。

## 1. 言語・出力規約

- **コミットメッセージ・PR 説明文・ユーザー向けテキスト**: **必ず日本語**で書くこと。
- **コミットメッセージ形式**: **Conventional Commits 形式** 必須。`.githooks/commit-msg` で形式と日本語が検証されます。使用可能なプレフィックスは以下の 11 種に限定:
  - `feat:` 新機能 / `fix:` バグ修正 / `docs:` ドキュメント / `chore:` 雑務
  - `refactor:` リファクタリング / `test:` テスト / `style:` スタイル整形
  - `perf:` 性能改善 / `build:` ビルド設定 / `ci:` CI 設定 / `revert:` 取り消し
  - 例: ✅ `feat: 新しいツールを追加` / ❌ `feat: Add new tool`（英語） / ❌ `update: ...`（プレフィックス不正）
  - `Merge`, `Revert`, `fixup!`, `squash!` で始まるコミットはチェックをスキップ
  - **squash マージで develop に乗るコミット件名も同じ規約に従う**。GitHub の squash は件名のデフォルトが PR タイトルで、`.githooks/commit-msg` は GitHub 上の squash には効かない（prefix なしコミットが素通りする事故あり）。手順・対策 → `docs/playbooks/pr-creation.md` 6 章

- **コード内コメント**: 日本語を基本とする。

---

## 2. コマンドリファレンス

| 用途                                          | コマンド                                         |
| :-------------------------------------------- | :----------------------------------------------- |
| 開発サーバー (http://localhost:4321)          | `npm run dev`                                    |
| 本番ビルド / プレビュー                       | `npm run build` / `npm run preview`              |
| 整形 / 整形チェック                           | `npm run format` / `npm run format:check`        |
| Lint（button type 漏れ検出 / コミット前推奨） | `npm run lint`                                   |
| 型チェック（コミット前必須）                  | `node_modules/.bin/astro check`                  |
| ユニットテスト (Vitest)                       | `npm run test` / `npm run test:watch`            |
| E2E テスト (Playwright, preview 経由)         | `npm run test:e2e` ❌ `npm run e2e` は存在しない |

---

## 3. 実装後の検証義務（要点）

> **正本**: `docs/playbooks/e2e-validation.md`（このセクションは要約。手順を変更する場合は playbook 側を先に編集すること）

**E2E テストは実装と同時に書く**: バグ修正・UI 挙動の変更時はコミット前に該当ケースの E2E を追加する。後回し禁止。

**push 前に必須**: `npm run test`（ユニット）／ `node_modules/.bin/astro check`（型）／ `npm run test:e2e`（E2E）。
post-PR 代行は不要、CI が最終ゲート。

**ガード / バリデータ / 検知機構には陽性対照を必須**: 検出する・拒否する・違反したら fail させる仕組み（CSP 違反検知 / 入力 validator / lint / セキュリティヘッダ assert / E2E ガード / regex マッチ系）を追加 / 修正する場合は **`Skill` tool で `test-gates` skill を必ず呼ぶ**。陰性対照のみでは「検知能力ゼロで green」と区別不能（PR #233 `applyProductionCsp` 空回り事故）。詳細・チェックリストは skill 本体に集約してこの doc では肥大化させない。

詳細手順（サブエージェント / 親別 push 前必須チェックリスト・worktree 整地・失敗パターン判定） → **`docs/playbooks/e2e-validation.md`**

---

## 4. ドキュメント更新ルール

実装変更をコミットする前に、以下のファイルへの影響を確認・更新すること。

| 変更の種類                            | 更新が必要なファイル                                                                      |
| :------------------------------------ | :---------------------------------------------------------------------------------------- |
| ツール追加                            | `README.md` (ツール一覧), `SPEC.md` (2.3, 2.4, 4, 5, 9章), `docs/decisions.md` (選定理由) |
| ツール削除・slug変更                  | 上記すべて                                                                                |
| ツール追加・挙動変更 (技術解説に影響) | `docs/tools.md` (該当ツールの仕組み・準拠仕様・制限を更新)                                |
| ライブラリ追加・削除                  | `SPEC.md` (2.3節), `docs/decisions.md`                                                    |
| ディレクトリ構成変更                  | `SPEC.md` (2.4節)                                                                         |
| フェーズ・タスク完了                  | `SPEC.md` (9章チェックリスト)                                                             |
| 設計上の重要な決断                    | `docs/decisions.md`                                                                       |
| セキュリティ設定変更 (CI等)           | `docs/decisions.md` (変更理由と安全性の確認)                                              |

---

## 5. ツール追加・実装フロー

新しいツールを追加する場合は以下の手順で実装する:

1. `src/components/tools/ToolName.tsx` を作成
2. `src/pages/tools/tool-slug.astro` を作成（`client:load` で React コンポーネントをマウント）
3. `src/data/tools.ts` の `toolEntries` 配列にエントリを追加（slug / name / description / category / yomi）。`yomi` は並び替え用の読み仮名（ひらがな）で、表示順はこの `yomi` の五十音順に自動ソートされる（手動で位置を決める必要はない）
4. `src/components/ui/ToolIcon.astro` にツールアイコン（SVG）を追加する。既存アイコンと同じ `{...attrs}` 展開・`currentColor` 方式に従う。**漏れた場合は `tests/meta/tool-icon-coverage.test.ts` が `npm run test` で fail させる**（PR #746 で漏れが発生し手戻りになった実例あり）
5. `tests/e2e/visual-regression-pages.ts` の `PAGES` 配列に `/tools/<slug>` を追加（VRT 対象に登録）。baseline は CI Linux runner で `Update Visual Regression Baseline` workflow を `workflow_dispatch` trigger して生成（mac との font 描画差を回避するためローカル生成は不可）。**漏れた場合は `tests/meta/vrt-pages-coverage.test.ts` が `npm run test` で fail させる**ため CI で必ず検知される（issue #355 で導入）。※ この `workflow_dispatch` をエージェント自身が起動できるかは実行環境のトークン権限に依存する（Claude Code on the web では `actions: write` が無く起動不可・手動トリガー必須 → `.claude/rules/github-web-session.md`。他エージェントは各固有ルール参照）。**baseline 生成 workflow は対象ブランチへ直接コミットを push する**ため、実行後にローカルから push する場合は先に `git pull --rebase origin <branch>` で取り込むこと（取り込まないと non-fast-forward で拒否される）
6. 4 章「ドキュメント更新ルール」に従い `README.md` / `SPEC.md` / `docs/decisions.md` を更新
7. 候補リスト（`docs/tool-candidates.md`）由来のツールの場合、PR マージ時に該当行の「状態」列へ ✅ と PR 番号を記載する

新しい入力欄・ボタン・エラー表示等を実装する前に、`src/components/ui/` の既存共通コンポーネント（`InputField`, `CopyButton`, `DownloadButton` 等）を確認すること。一覧と用途は `.agents/rules/ui-conventions.md` を参照。

---

## 6. AI エージェント操作・Git ワークフロー

### 6.1 GitHub への本文付き投稿・更新は常にファイル経由

GitHub に Markdown 本文を渡す `gh` コマンドでは、本文をコマンドライン引数に直接埋め込まない。対象は `gh pr create/comment/edit/review/merge`、`gh issue create/comment/close/edit`、および `gh api` で `body` 等の Markdown 本文を渡す操作を含む。

- `--body` / `--comment` / `-f body=...` / `--field body=...` への直接埋め込みは禁止
- `--body-file` / `-F` が使える場合は必ず使う
- `gh issue close --comment` はファイル指定できないため使わない。closing comment が必要な場合は `gh issue comment --body-file <file>` を先に実行し、その後 `gh issue close --reason <reason>` を実行する
- `gh api` 等で本文ファイル option がない場合は、JSON 等のリクエストファイルを各エージェント専用の一時ディレクトリ（§6.6 参照）に作成し、`--input <file>` で渡す
- 一時ファイルは credential / secret 類を含めない

**なぜ条件付きでなく常時か**: PR 本文はほぼ常にコードブロック（バックティック）や複数行を含み、HEREDOC でバックスラッシュ + バックティック（<code>\\&#96;</code>）にエスケープすると literal `\` が GitHub に流れる事故が頻発する。条件分岐ルールは判断負荷が高く形骸化するため、無条件 default にすれば事故クラス自体が消える。

#### 失敗時のリカバリ

投稿失敗時は `gh pr view` / `gh issue view` で投稿状況を必ず確認し、重複が出ていれば削除して整合性を保つ。

### 6.2 ブランチ運用（要点）

> **正本**: `docs/playbooks/pr-creation.md` 1〜2 章（このセクションは要約。手順を変更する場合は playbook 側を先に編集すること）

- **`develop` には直接コミットしない**: 必ず feature ブランチを切る。誤って始めた場合は `git stash` → ブランチ切替 → `git stash pop`。
- **新規作業の手順**: `git checkout develop` → `git pull origin develop` → `git checkout -b <type>/<slug>`（例: `feat/add-tool`, `fix/issue-123-crash`）。issue がある場合は `<type>/issue-<n>-<slug>` 形式を推奨。
- **必ず `origin/develop` 起点を明示**: `git checkout -b <branch>` だけでは worktree が `main` を起点にしてしまう既知問題があり（過去に PR #154, #181 で発生）、ベース確認ステップがないと発覚しない。完成形コマンドと自己検証手順は `docs/playbooks/pr-creation.md` 1.1 章。

ブランチ作成完成形コマンド・自己検証・rebase 後 push の親引き取り → **`docs/playbooks/pr-creation.md` 1〜2 章**

### 6.2.1 worktree 作成直後の必須セットアップ

`git worktree add` 直後は必ず `npm ci` を実行する（mid-session 作成では SessionStart hook が fire しないため）。詳細手順 → `docs/playbooks/e2e-validation.md`

### 6.3 PR 作成時のベースブランチ

`gh pr create` は **`--base develop`** を必ず指定する（デフォルトは `main`）:

```bash
gh pr create --base develop --title "..." --body-file <tmpdir>/pr_body.md   # <tmpdir> は各エージェント専用の一時ディレクトリ（§6.6）
```

**`main` 向けはリリース PR のみ**。通常の機能追加・バグ修正・refactor・docs は全て develop ベース。リリース時は別途 `develop → main` の release PR を切る運用 (release-only branch policy)。

PR 作成・親 push 前チェックリスト・親向けレビュー取得手順 → **`docs/playbooks/pr-creation.md` 3〜5 章**

### 6.3.1 マージ方法の使い分け

> ⚠️ **PR 作成・編集・マージ時は必ず `docs/playbooks/pr-creation.md` を参照すること。**

- **feature PR（→ develop）**: `--squash`
- **release PR（develop → main）**: `--merge`

### 6.4 先送り（deferral）時は必ず issue 化する

レビュー指摘や作業中に発見した課題を「別 PR で対応」「後で追記する」と判断する場合、**その場で GitHub issue を作成**し、PR コメントに issue 番号を明記する。

- ❌ 禁止: 「別 PR でメモ追記します（本 PR スコープ外）」だけで終わらせる
- ✅ 必須: `gh issue create` または MCP の `issue_write` で issue を起票し、`#<番号>` を PR の返信に貼る
- 1 行のドキュメント追記など本 PR で完結できる軽微な対応は、先送りせず本 PR に含めるのが優先。
- スコープ判断で本当に分離が必要な場合のみ issue 化する。issue 化しない口頭の「後で」は形骸化するため禁止。

### 6.5 再利用候補スクリプトの提案

3 行以上の bash・過去にも書いた覚えのある手順・覚えにくいフラグを伴う複合コマンドを書こうとしたら、その場で実行する前に `scripts/` への切り出しをユーザーに提案する（同意を得てからスクリプト化する。先回りして勝手に作らない）。

`scripts/` と `.claude/scripts/` の使い分けは `scripts/README.md` を参照。

### 6.6 一時ファイル・ステージング・権限経路（共通原則）

各エージェントは自分の設定で allow された経路を優先し、ask 該当経路を避けて権限プロンプトを減らす。**具体パス・helper・tool は各エージェント固有ルールに従う**（Claude → `.claude/rules/`、Codex → `.codex/rules/`、Gemini → `docs/setup/gemini-policy.md`）。

- **一時ファイル**: 各エージェント専用の一時ディレクトリ配下にのみ作成し、credential / secret は置かない。削除は専用 helper を使う。
- **ステージング**: 明示 pathspec のみを stage する。`git add .` / `-A` / `--all` 相当の広域 pathspec は使わない。
- **レビュー取得**: `gh pr view <PR> --comments`（必要なら `--json comments,reviews`）を優先する。`gh api` は多くの設定で ask 経路。

### 6.7 solo dev 体制での branch protection 提案禁止

solo dev 体制（PR 作成者 = レビュアー = merger が同一人物）では GitHub branch protection の `Require approvals` を有効化すると **self-approve 不可で自分の PR が永久 merge 不能** になる（GitHub policy）。`Require pull request before merging` 単体は他人 review を強制せず、`Restrict who can push` も PR 経由 self-merge を block しない。**team 体制前提の review 強制設計を solo dev に提案しないこと**。

詳細経緯: `docs/decisions.md [069]`

### 6.8 VRT pixel diff の baseline 更新は recommend しない

VRT が小さい pixel diff (例: 0.07%) を検出しても「微小だから baseline 更新で OK」と recommend してはいけない。**pixel 数 ≠ visual design 品質** (design token 由来の意図しない変更でも pixel ratio は小さく見える)。判断は user の目視確認に委ね、エージェントは数値根拠で baseline 更新を勧めない。

また、baseline 更新前には **DOM 構造 diff / computed style diff の 2 段階検証が必須**（真の regression を baseline に焼き込まないための判別 gate、PR #299 の事例を起点に明文化）。手順 → `docs/playbooks/e2e-validation.md` 7.7 章

### 6.9 サブエージェント運用の補足

- **完了報告は項目別ステータス必須**: 親プロンプトのスコープ箇条書きを subagent が一部のみで「完了」と返すケースがあるため、完了報告フォーマットに「項目ごとに 実装 / 既存で十分 / スキップ理由 を明示する」チェックリスト形式を要求する。親側でも依頼項目数 vs 実装項目数の機械的突き合わせを行う（過去事例: PR #218 で 3 件依頼中 1 件のみ実装で完了報告された）。
- **`package.json` 変更時は `package-lock.json` 同期確認**: subagent が deps を追加・更新した場合、`git diff origin/develop --name-only` に `package.json` が含まれる場合は必ず `package-lock.json` も含まれているか確認する。漏れていれば親で `npm install --package-lock-only --cache "$TMPDIR/npm-cache" --no-audit --no-fund` を実行し別コミットで lock 同期を push する（過去事例: PR #181 で lock 不整合のまま push される寸前で発覚）。
- **PR 本文の更新は親で実行**: `gh pr edit --body-file` は `permissions.ask` のため subagent から非対話 deny される。subagent は完了報告に「PR 本文更新が必要」と明記し、親 (司令塔) が `gh pr edit` で引き取る（過去事例: PR #189 で subagent から呼べず指摘事項対応が止まった）。
- **subagent プロンプトに矛盾する設計指示を混ぜない**: subagent は指示を素直に実装するため、矛盾を内包した指示はそのまま矛盾した実装になる。subagent の判断力に期待してプロンプトの曖昧さを残さない。特に React の effect / memo では「memo 化した派生値を依存配列に保つ」と「依存配列を一次入力に展開する」は反対方向の設計判断であり併記しない（片方に寄せる）。どうしても両論併記する場合は「`eslint-disable` は使わない、それで済まない設計なら知らせる」と判断材料を明記する（過去事例: PR #217 で矛盾指示により `react-hooks/exhaustive-deps` を 2 箇所 `eslint-disable` で抑制する実装になりレビューで差し戻し）。

---

## 7. スタイル・UI ルール（基本）

Tailwind のカラークラス（`text-blue-500`, `bg-red-50`, `hover:bg-red-50` 等の **primitive scale 直書き**）は **絶対に使用しない**。色は CSS 変数経由で指定する:

ただし `@theme` 登録された **semantic token** (`--color-primary` / `--color-tertiary` / `--color-success` 等) の auto-utility (`text-primary` / `text-tertiary` / `text-success` 等) は意味的命名のため使用可。primitive scale (`text-blue-500` / `text-neutral-700` 等) は引き続き禁止。判断基準: 「token 名から用途が読み取れる (semantic) か、palette 段階値に過ぎない (primitive) か」。

- React (`.tsx`): `src/styles/global.css` の `@layer components` で定義された意味クラス（`bg-subtle` / `alert-success` / `text-icon` 等）を `className` で使用。`@theme` 登録 semantic token は同名 auto-utility (`text-primary` 等) を直接使ってよい。新規 component で既存意味クラスに無い色組み合わせが必要な場合は、まず `@layer components` に意味クラスを追加してから使う（`#176` B 案で `style={{ color: colors.primary }}` 形式は全廃済、`@/utils/styles` import も無効）
- Astro (`.astro`): 現状 `var(--color-*)` を `style` 属性で書く箇所が残存（[#289](https://github.com/fumtas1k/devtools/issues/289) で CSS class 化を進行中）。新規追加は React と同じ `@layer components` 意味クラスを推奨

※ レイアウト用クラス（`flex`, `gap`, `p-*`, `rounded` 等）は使用可。

UI 変更時は **PC (1280x800)** と **スマホ (390x844)** 両方でスクリーンショットを撮影して目視確認すること。
共通コンポーネント・ホバー処理・ボタン高さ揃え・レスポンシブ・ToggleGroup リセット要否・Playwright 撮影手順・目視確認チェックリスト等の詳細 → **`.agents/rules/ui-conventions.md`**

### 7.1 Tailwind v4 `@layer components` の variant 非対応

`global.css` の `@layer components` 内で **手書き定義** した class (`bg-subtle` / `text-icon` / `alert-success` 等) は Tailwind v4 の variant prefix (`hover:` / `focus:` / `aria-pressed:` 等) に **対応しない**。`hover:bg-subtle` のように書いても CSS rule (`.hover\:bg-subtle:hover { ... }`) が生成されず silent regression する。

- ✅ `@theme` トークンから auto-generate される utility (`hover:bg-blue-50`, `hover:text-primary` 等) は variant 対応
- ❌ `@layer components` 内手書き class への variant prefix は CSS rule 不生成

専用の hover/focus 用 class を `@layer components` 内に `:hover` / `:focus` 擬似クラスごと定義する (`.btn-clear` / `.hover-bg-subtle` / `.btn-remove-card` 等が実例)。JSX 側は `className="caption btn-remove-card"` のように適用 (variant prefix を使わない)。

検証: `@layer components` 内手書き class に variant を新規追加した場合、`npm run build` 後に `dist/_astro/BaseLayout.*.css` で CSS rule が生成されているか必ず確認する。

過去事例: PR #277 (#176 B 案 PR 4) で `hover:bg-error-tint` / `hover:bg-subtle` の Tailwind hover utility 表記により hover フィードバックが完全消失する silent regression。専用 hover class (`.btn-remove-card` / `.hover-bg-subtle` / `.hover-bg-active`) で対応。

### 7.2 Tailwind v4 の `docs/` auto scan 除外

Tailwind v4 vite plugin は `docs/` 配下の markdown も content scan 対象にするため、`.md` ファイルに書かれた Tailwind class 名 (例: `bg-red-500`) が意図せず CSS に含まれることがある。`src/styles/global.css:11` に `@source not "../../docs";` で除外済み。**「不要に見える」として削除しないこと**。削除すると docs 記述起因の不要 CSS が混入する。

---

## 8. プロジェクト構造

- `src/components/tools/`: ツール本体 (React TSX)
- `src/components/ui/`: 共通UIコンポーネント (`InputField`, `CopyButton` 等)
- `src/hooks/`: 共通フック
- `src/pages/tools/`: Astro ページ (ルーティング)
- `src/utils/`: ロジック・ヘルパー・スタイル定義
- `.agents/rules/common.md`: 本ドキュメント（全エージェント共通規約・正本）
- `docs/decisions.md`: 設計上の意思決定記録
- `.agents/rules/ui-conventions.md`: UI 実装・E2E テストの詳細規約（UI 改修時に参照）
- `docs/agent-lessons.md`: 教訓バッファ（共通ルール化前の蓄積場所）
- `docs/playbooks/`: タスク開始時に読む手順書（PR 作成 / E2E 検証 等）
- `docs/setup/`: 環境セットアップ手順（プラグイン install / Gemini policy 等）
- `tests/meta/`: ドキュメント / 設定の整合性を検証する meta テスト（`src/**/__tests__/` colocation と分離）
- `tasks/active_context.md`: セッション固有の作業コンテキスト（gitignore 対象）

---

## 9. コード規約・編集時の安全規則

### 9.1 React / TypeScript 記法

- JSX / TSX では `class` ではなく **`className`** を使う。
- `<label>` の `for` 属性は **`htmlFor`** を使う。
- TypeScript の警告は自分で発見・修正する。ユーザーに指摘させない。

### 9.2 セキュリティ設定変更の禁止

セキュリティ関連の設定（`.npmrc`・`npm audit` 設定・CI 設定・`.githooks/*` 等）は、**ユーザーの明示的な承認なしに変更・無効化してはならない**。

### 9.3 部分置換時のインポート保護・末尾空白

- 部分編集前にファイル全体（特に import）を確認。3 箇所以上の変更や import 追加を伴う場合はファイル全体を書き直す。
- ファイル末尾の空白（trailing whitespace）を含めない。

### 9.4 変更直後の型チェック

コード（特に import / JSX）を編集した直後に必ず実行する:

```bash
node_modules/.bin/astro check       # 全体
npx astro check --filter <file>     # 特定ファイルのみ
```

### 9.5 SVG / `dangerouslySetInnerHTML` の XSS 対策

外部入力をそのまま挿入すると **反射型 XSS** になる。必ずエスケープ／サニタイズしてから挿入し、可能なら React 要素として組み立てる。

### 9.6 a11y 属性・role 属性の保護

`aria-*` 属性（`aria-live`, `aria-expanded`, `aria-controls`, `aria-label`, `aria-hidden` 等）および
`role=` 属性は、**明示的に許可されていない限り削除してはならない**。

- ❌ 禁止: refactor・cleanup 中に「不要に見える」として aria 属性を削除する
- ✅ 必須: `git diff` に `aria-` の削除行（`-` で始まる行）が含まれる場合は親に確認を取る
- 誤って削除した場合は即 `git restore <file>` してから push する

> **なぜ**: これらの属性は支援技術（スクリーンリーダー等）が依存する意味論的マーカー。見た目上は「余計な属性」に見えても削除すると a11y E2E テストが CI で落ちる（過去に PR #175 追加分が PR #179 の refactor で削除されて発生）。

---

## 10. 目的の維持とスコープ管理 (ATC運用)

実装中の脱線・スコープ外修正を防ぐため、すべての AI エージェントは **Active Task Context (ATC)** を運用する。

### 運用手順

1. **セッション開始**: `tasks/active_context.md`（gitignore 対象）を作成し「目的・ステップ・スコープ外」を宣言。
2. **作業中**: 節目ごとに参照し立ち位置を確認。完了したらチェックボックス更新。
3. **誘惑の管理**: スコープ外を見つけたら直接修正せず `## Pending` セクションにメモ。
4. **レビュー対応**: 指摘は `## 🟢 Review & Feedback` セクションで管理。
5. **完了時**: PR マージ／クローズ後にローカルから削除。教訓は `docs/agent-lessons.md` へ転記。

### ATC 不要と判断できるケース

他のスキル・ツールが「目的・ステップ・スコープ外」を **明示的に** 含むファイルを作成・更新しており、セッション中に参照可能であれば、ATC を重複作成しなくてよい。
該当例: `docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md`, `conductor/` 配下のタスクファイル。

### ATC のテンプレート

テンプレートファイル: `tasks/active_context_template.md`

---

## 11. 教訓の運用 (`docs/agent-lessons.md`)

`docs/agent-lessons.md` は教訓を一時蓄積する **バッファ**。本ドキュメントが共通ルールの単一の真実源（Single Source of Truth）であり、再発防止に値する内容は本ドキュメントへ昇格させる。

- **記録**: 修正を受けた／気づきがあった場合に日付付きで追記。
- **読み込み**: セッション開始時の必読ではない（PR 作成前や蓄積が増えた節目で見直す）。
- **昇格 → 削除**: 開発全体に適用される規約は本ドキュメントへ追記し、`agent-lessons.md` から削除（過去内容は git 履歴で遡れる）。
- **削除対象**: 共通ルール化済み／コード・Hook・設定で強制済み／一度限りの TIP。
- **保持対象**: 特定ツール・コンポーネントに紐づく実装メモやリスク。
