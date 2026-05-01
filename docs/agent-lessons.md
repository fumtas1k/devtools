# AI エージェント教訓バッファ

このファイルは AI エージェントがセッションで得た教訓を **一時的に蓄積** する場所である。

- 共通ルール化すべき内容は `docs/shared-agent-rules.md` に昇格させ、本ファイルから削除する。
- セッション開始時に必ず読む必要はない（PR 作成前や定期整理時に見直す）。
- 詳細な運用ルールは `docs/shared-agent-rules.md` 11章を参照。

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

### 対処方針

- 親は `git status` で **現在のブランチ名**を確認してから push する。
- 内部 branch にコミットが乗っていた場合は ref マッピング push で PR ブランチに上げる:
  ```bash
  git push origin worktree-agent-<id>:<pr-branch>
  ```
- 完了報告で「最終コミット SHA」と並べて「コミットが乗っているブランチ名」もサブエージェントに報告させる規約にすると検出が早まる（規約昇格候補）。
