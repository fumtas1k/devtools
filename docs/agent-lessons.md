# AI エージェント教訓バッファ

このファイルは AI エージェントがセッションで得た教訓を **一時的に蓄積** する場所である。

- 共通ルール化すべき内容は `docs/shared-agent-rules.md` に昇格させ、本ファイルから削除する。
- セッション開始時に必ず読む必要はない（PR 作成前や定期整理時に見直す）。
- 詳細な運用ルールは `docs/shared-agent-rules.md` 11 章（教訓の運用）を参照。
- 「（規約昇格候補）」と注記した項目は、次回 `agent-lessons.md` の整理タイミングで `shared-agent-rules.md` への昇格 / issue 化 / 削除のいずれかを判断する。

---

## [2026-04-28] QRチケット 160px 表示と等倍デコードによる読み取り失敗リスク

### 現象

`MAX_QR_BYTE_SIZE = 300` 未満のデータでも「画像からQRコードを読み取れませんでした」が発生した。

### 根本原因

- QRコードは `scalable: true` の SVG で生成され、160px の div に縮小表示される
- 300B 付近では QR バージョンが v10（65 modules）になり、1 モジュール ≈ 2.46px
- 画像アップロード検証（`handleImageUpload`）は元画像を等倍で Canvas に描画してから jsQR に渡す → 解像度不足
- E2E テストは SVG を 768×768 にリスケールしてから jsQR に渡しており、本番 UI と異なる条件のためバグを見逃す

### 対処（今回）

`MAX_QR_BYTE_SIZE` を 300→250 に引き下げ、QR バージョンを v9（61 modules、2.62px/module）以下に抑えた（対症療法）。

### 残存リスクと根本対策（将来タスク）

改善幅は約 6% と限定的。実機で依然として読み取り失敗が起きる場合は以下を検討すること：

1. **表示サイズ拡大** (160px → 256px): グリッドの `minmax` も合わせて変更
2. **アップロード時アップスケール**: `handleImageUpload` で短辺 < 512px なら 768px に拡大してから jsQR へ渡す

---

## [2026-05-01] サブエージェントは `isolation: "worktree"` 必須（Bash 権限の罠）

### 現象

PR #181 / #182 のレビュー対応で、既存 worktree を再利用させるため `Agent` ツールを `isolation` オプションなしでディスパッチしたところ、サブエージェントの `Bash` / `mcp__serena__execute_shell_command` / `mcp__serena__list_dir` / `EnterWorktree` がすべて権限拒否され、ファイル編集 (Read/Write/Edit) しかできない状態になった。git 操作・テスト実行・コミットが詰まり作業未完で停止。

### 根本原因

`.claude/settings.json` の権限設定が `isolation: "worktree"` 付きディスパッチを前提にしており、isolation なしでは shell 系ツールがデフォルト deny される。

### 対処方針

- Agent ディスパッチ時は **常に `isolation: "worktree"` を付ける**。
- 既存 PR ブランチを引き継ぎたい場合は、新しい worktree 内で `git fetch origin && git checkout -b <branch> origin/<branch>` で **origin から再 checkout** させる（既存 worktree を共有しない）。
- Read のみのドラフト調査でも詰まる瞬間が来るので、例外なしに isolation を付ける運用に統一。

---

## [2026-05-01] devDependency 追加時は `package-lock.json` を必ず同期コミット

### 現象

PR #181 のレビュー対応で、サブエージェントが `@testing-library/react` と `jsdom` を `package.json` の `devDependencies` に追加してテスト追加・push まで実行したが、`package-lock.json` の更新コミットが漏れていた。CI の `npm ci` は lock との不整合を検出して失敗する状態だった（手動コミット前に検出して回避）。

### 根本原因

サブエージェントが `npm install <pkg>` ではなく package.json を直接編集してから `npm install --no-save` 等で deps を入れたか、あるいは個別 install を回避してテストだけ走らせたため、lock ファイルが diff から漏れた。

### 対処方針

- 親はサブエージェント完了報告を受けたら **`git diff origin/develop --name-only` に `package.json` が含まれる場合は必ず `package-lock.json` も含まれているか確認**する。
- 漏れていれば親で `npm install --package-lock-only --cache "$TMPDIR/npm-cache" --no-audit --no-fund` を実行し、別コミットで lock 同期を push する。
- サブエージェント側のプロンプトでも「`package.json` を変更したら `package-lock.json` の同期コミットも作ること」と明記する余地あり（規約昇格候補）。

> **補足**: `~/.npm` の所有権で `npm install` がエラーになる環境では `--cache "$TMPDIR/npm-cache"` で逃げる。

---

## [2026-05-01] worktree 内部 branch (`worktree-agent-<id>`) と PR ブランチの取り違え

### 現象

PR #181 で `isolation: "worktree"` 付きで再ディスパッチしたサブエージェントに、既存 PR ブランチ `fix/issue-149-debounce-download-disable` を引き継がせる指示を出した。worktree 作成時に `git checkout -b <pr-branch> origin/<pr-branch>` を実行させたが、worktree のデフォルト checkout が内部生成の `worktree-agent-<id>` branch のままになり、コミットがそちらに乗った。親が `git push origin <branch>` を素直に実行すると "Everything up-to-date"（PR ブランチには反映されない）。

### 根本原因

`Agent` ツールの `isolation: "worktree"` で作成される worktree は、内部生成された `worktree-agent-<id>` branch を HEAD として checkout した状態で起動する。サブエージェントが `git checkout -b <pr-branch> origin/<pr-branch>` を実行しても、worktree の HEAD はそのまま `worktree-agent-<id>` を指し続け、後続のコミットが意図したブランチに乗らない。

### 対処方針

- 親は `git status` で **現在のブランチ名**を確認してから push する。
- 内部 branch にコミットが乗っていた場合は refspec push で PR ブランチに上げる:
  ```bash
  git push origin worktree-agent-<id>:<pr-branch>
  ```
- 完了報告で「最終コミット SHA」と並べて「コミットが乗っているブランチ名」もサブエージェントに報告させる規約にすると検出が早まる（規約昇格候補）。

---

## [2026-05-01] worktree の node_modules が古いと E2E が hydration timeout で大量失敗する

### 現象

PR #168 で利用していた worktree（ID: `agent-a5a9da066d1149d19`）で `npm run test:e2e` を実行すると、QR 系を中心に多数のテストが `page.waitForFunction: Test timeout of 30000ms exceeded` (waitForReactHydration) で失敗。develop の最新コミット上では同じテストが pass する。コード差分は問題なく見え、`npm run test`（unit）は全 pass、`npm run build` も成功。

### 根本原因

worktree が作られた時点の `package.json` と、その後 develop に merge された PR (#181 で `@testing-library/react` / `jsdom` 追加など) のあいだで deps 構成が変わっていたが、worktree の `node_modules` は古いまま。playwright dev server の起動経路で必要なバイナリ/依存が不一致になり、ブラウザ側の React hydration が完了しない状態に。さらに、過去の sandbox 経由インストールで一部ファイルの権限がねじれており、単純な `npm ci` も EPERM で失敗する状態だった。

### 対処方針

worktree で E2E を回す前に、deps を **必ずクリーンインストール**する:

```bash
# sandbox で permission denied になるファイルがあるため、エラーを抑制する
chmod -R u+w node_modules 2>/dev/null
rm -rf node_modules
npm ci --cache "$TMPDIR/npm-cache"
lsof -ti:4321 | xargs kill -9 2>/dev/null || true
npm run test:e2e
```

ポイント:

- `chmod -R u+w` で sandbox 由来の read-only ファイルを書き込み可能にしてから削除する。
- `npm ci --cache "$TMPDIR/npm-cache"` で `~/.npm` の root 所有問題を回避（`sudo chown` できない sandbox 環境で有効）。
- E2E 実行前に既存の dev server を kill しておく（worktree 並列実行時の port 4321 衝突対策）。
- 上記でも `waitForReactHydration` timeout が続く場合は **env 由来失敗**と判断し、push して CI を最終ゲートにする（`docs/playbooks/e2e-validation.md` 4 章「失敗パターンの判定」の方針）。

### 関連 PR / 観点

- PR #181 / #188 で実害あり
- 関連 issue: #194（worktree 環境で E2E timeout を早期検出して無駄待ちを削減）
- 2026-05-02 に **本手順を `docs/playbooks/e2e-validation.md` 2.1 章 push 前必須チェックリスト ステップ 0 として昇格済み**（issue #212 / `scripts/agent-worktree-setup.sh` で自動化）。

---

## [2026-05-01] PR 本文の同期はサブエージェントではなく親セッションで行う

### 現象

PR レビューで「PR 本文の diff 抜粋が実差分と乖離している」指摘を受けたが、サブエージェントから `gh pr edit <n> --body-file` を呼んでも `permissions.ask` に置かれているため非対話で deny に変換され、自動更新できない。

### 対処方針

PR 本文の追加・更新は **親（司令塔）セッションが手動で `gh pr edit` する**運用とする。サブエージェント側は完了報告に「PR 本文更新が必要」と明記し、親が引き取る。

### 関連

- PR #189 のレビュー (2026-05-01) で指摘
- `.claude/settings.json` の `Bash(gh pr edit*)` を ask に置く設計と整合（PR の公開状態変更は親の判断で）

---

## [2026-05-02] サブエージェントへの「effect 依存配列を一次入力ベースに切り替え」指示が `eslint-disable` を生む

### 現象

PR #217 (refactor #167-A EncodingConverter) で、親が subagent に「`activeBytes` を `useMemo` 化したうえで、effect の依存配列を `[textInput, fileBytes, inputMethod, ...]` のように **一次入力ベースに切り替えて** debounce を文字列に対して掛ける構造へ」と指示した結果、subagent は素直に依存配列を一次入力に展開し、`react-hooks/exhaustive-deps` 違反を `// eslint-disable-line` で 2 箇所抑制した。レビューで「`useMemo` で参照を安定化したのだから依存配列は `[activeBytes, ...]` に保つべき。`eslint-disable` も lint 保護も両方失う書き方は React 慣用に反する」と指摘され、追加 commit で `[activeBytes, ...]` ベースに戻した。

### 根本原因

「依存配列を一次入力ベースにする」と「`useMemo` で派生値を作る」は本来反対方向の設計判断。`useMemo` で参照を安定化したなら依存にはその memo 値を入れ、`react-hooks/exhaustive-deps` の保護を活かすのが慣用。親プロンプトでこの 2 つを混ぜて指示してしまったため、subagent が両方実装して破綻した。

### 対処方針

- **親プロンプトの設計判断の整合性が最優先で、subagent は素直に解釈する前提で書く**。指示が矛盾を内包していたら subagent はそのまま矛盾を実装する。subagent の判断力に期待してプロンプトの曖昧さを残さない
- React の effect / memo を扱う subagent プロンプトでは、**依存配列の方針を片方に寄せる**。「memo 化した派生値を依存に保つ」と「一次入力に展開する」を併記しない
- どうしても両論併記したい場合は「`eslint-disable` は使わない、それで済まない設計なら知らせる」と明記して subagent に判断材料を渡す
- レビューで「素直に書けばよい」指摘を受けたら、それは指示の文言が誘導した可能性があると疑う

### 関連 PR / 観点

- PR #217 review (2026-05-02)、commit `03a89a1` (初期実装) → `fb82961` (依存配列を `[activeBytes, ...]` に戻し eslint-disable 撤去) → `76bcbd4` (回帰テスト追加) → `c5cf49b` (button 取得を `getByRole` に置換)
- React `react-hooks/exhaustive-deps` の慣用と `useMemo` の組み合わせ

---

## [2026-05-02] サブエージェント isolation worktree から Edit する際は worktree 配下の絶対パスが必須

### 現象

`Agent({ isolation: "worktree" })` で起動した subagent が `/Users/fumta/projects/devtools/tests/e2e/a11y-live-region.spec.ts` のような **親 repo 直下の絶対パス** を Edit に渡したところ、Edit / Write / Serena `replace_content` がすべて deny された。subagent は完了報告で「permission を grant してほしい」と要求して停止。

### 根本原因

subagent の write sandbox は `/Users/.../devtools/.claude/worktrees/agent-<id>/` 配下のみ許可されており、親 repo 直下 (`/Users/.../devtools/tests/...`) は別 checkout なので write 不可。Edit ツールは絶対パス必須なので、相対パス感覚で「ファイル名から逆引き」した結果、worktree 外のパスを生成してしまう。

### 対処方針

- subagent プロンプトに **「Edit/Write は worktree 配下の絶対パスで指定する。`pwd` で worktree 内に居ることを確認し、`$(pwd)/<相対パス>` で組み立てる」** と明記する
- 起動手順で `pwd` の出力を完了報告に含めさせる
- Edit が deny で止まったら、subagent が誤った絶対パスを使った可能性が第一候補

### 関連 PR / 観点

- PR #219 (flake-shortterm) で発生、SendMessage で worktree 配下絶対パスを明示して再開で解消
- 既存教訓「[2026-05-01] サブエージェントは `isolation: "worktree"` 必須」と並ぶパス指定の運用
- （規約昇格候補）`docs/shared-agent-rules.md` のサブエージェント指示テンプレに「Edit/Write の絶対パスは worktree 配下に限定」を追加検討

---

## [2026-05-02] サブエージェントはスコープ箇条書きの一部のみで「完了」報告することがある

### 現象

PR #218 (refactor #169) で subagent に項目 1c として `useCodec.test.tsx` / `useClampedInput.test.tsx` / `useQrCamera.test.tsx` の 3 hook テスト新規作成を指示したが、subagent は `useClampedInput.test.tsx` のみ作成して完了報告した。`useCodec` / `useQrCamera` のテストが未実装のまま「全項目完了」として返ってきた。

### 根本原因

スコープを箇条書きで列挙すると、subagent は内部で「一部やれば全体方針は伝わる」と省略判断することがある。完了報告に「項目 1c の 3 ファイル中 1 ファイル作成」と書かず、暗黙に他 2 件を「カバー不要 / 既存で足りる」のような judgement で切り落とすケース。

### 対処方針

- subagent プロンプトの完了報告フォーマットに **「項目ごとに 実装 / 既存で十分 / スキップ理由 を明示する」** チェックリスト形式を要求する
- 親 (司令塔) の完了確認チェックリストに「**依頼項目数 vs 実装項目数の機械的突き合わせ**」を入れる
- スコープが広い項目は **複数 subagent に分割** するのが手堅い

### 関連 PR / 観点

- PR #218 (#169) で発生、SendMessage で漏れ 2 件を再依頼して解消
- （規約昇格候補）`docs/shared-agent-rules.md` のサブエージェント指示テンプレに「項目別実装ステータス必須」を追加検討
