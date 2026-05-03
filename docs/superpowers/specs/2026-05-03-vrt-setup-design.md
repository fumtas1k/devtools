# VRT (Visual Regression Test) 専用 PR 導入 設計書

**作成日**: 2026-05-03
**前提**: 旧 PR #253（B 案 PR 1 で VRT を ui migration と bundle した試み）が architectural 問題で close。本 PR で VRT のみを proper sequencing で先行導入する。
**位置付け**: `#176` B 案 (`style-src 'unsafe-inline'` 削減) のための infra 整備 PR (= 「PR 0」)。VRT を独立 PR で先行導入することで、後続 ui migration PR（B1〜B6）が proper VRT 監視下で進められるようにする。

---

## ゴール

`#176` B 案の ui migration（class 化による visual change の可能性）を CI で検出できる Visual Regression Test (VRT) 基盤を、**deterministic + non-blocking + 後続 PR で機能する正しい sequencing で**導入する。

完了状態:

- `tests/e2e/visual-regression.spec.ts` が存在し、`addInitScript` で `Math.random` / `crypto.randomUUID` / `Date.now` を deterministic に固定した状態で全 18 ページ × 2 viewport = 36 screenshot を baseline 比較する
- baseline 画像（CI Linux 由来）が `tests/e2e/visual-regression.spec.ts-snapshots/` に commit 済み（連続 2 回以上の CI 実行で 36/36 安定 pass を確認済み）
- VRT 専用 workflow（`.github/workflows/visual-regression.yml`）が PR trigger で走り、結果を **PR comment + artifact** で報告
- VRT は **branch protection の required check に含まれない**（PR description に明記、user が GitHub Settings UI で確認）
- `update-visual-baseline.yml` workflow が `workflow_dispatch` で baseline 再生成を可能にし、default branch 上では guard で no-op
- `playwright.config.ts` が `e2e` / `visual-regression` 2 project に分離、通常 `npm run test:e2e` は VRT を実行しない
- `docs/playbooks/e2e-validation.md` に VRT の運用記述追加、`docs/decisions.md` [066] に採用根拠 + 失敗事例 (PR #253) を記録

---

## なぜ独立 PR で先行導入するのか

旧 PR #253 を close した経緯から得た 3 つの構造的教訓 (詳細はメモリ `feedback_vrt_setup_sequencing.md` / `feedback_subagent_verification_trust.md` / `feedback_infra_feature_separation.md`):

1. **VRT setup を feature work と bundle すると infra 設計が後回しになる** — sequencing / mock / branch protection を妥協する圧力がかかる
2. **deterministic mock は最初から組まないと baseline が信頼できない** — 後付けは構造的に困難（baseline 撮影タイミングが migration 後にずれる）
3. **VRT を required check に入れると意図的 visual 変更ごとに merge friction** — VRT の本質は「diff を見せる」ことで「block する」ことではない

→ 本 PR は **infra のみ**、production code 変更ゼロ。後続 ui migration PR は本 PR がもたらす VRT 監視下で進める。

---

## 採用する設計

### 1. Architecture: 専用 Playwright project + 専用 workflow + 非 required check

| 観点                    | 設計                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright project 分離 | `playwright.config.ts` で `e2e` (通常テスト) と `visual-regression` (VRT のみ) に分離。spec は `tests/e2e/visual-regression.spec.ts` に集約 |
| 通常 e2e の挙動         | `test.yml` の `e2e` job が `--project=e2e` で起動 → VRT を skip。所要時間も従来通り                                                         |
| VRT 実行経路            | 専用 workflow `visual-regression.yml` が PR trigger で `--project=visual-regression` を起動                                                 |
| baseline 更新経路       | `update-visual-baseline.yml` が `workflow_dispatch` 専用で `--update-snapshots` を実行、bot が同 branch に commit back                      |
| branch protection       | VRT は required check に**含めない**。意図的 visual 変更が merge を block しない設計                                                        |

### 2. Deterministic mock 注入 (production code 無変更)

`tests/e2e/visual-regression.spec.ts` の各 test で `page.addInitScript()` を navigation 前に呼び、page context に以下を inject:

```ts
await page.addInitScript(() => {
  // Seeded LCG: Math.random を固定 seed (42) から再現可能な乱数列に
  let seed = 42;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Incremental UUID counter: crypto.randomUUID を 00000000-0000-0000-0000-NNNNNNNNNNNN 形式に
  let uuidCounter = 0;
  if (window.crypto) {
    const fixedUuid = (): `${string}-${string}-${string}-${string}-${string}` => {
      uuidCounter++;
      const n = uuidCounter.toString().padStart(12, '0');
      return `00000000-0000-0000-0000-${n}` as `${string}-${string}-${string}-${string}-${string}`;
    };
    window.crypto.randomUUID = fixedUuid;
  }

  // Fixed Date.now: 2026-01-01T00:00:00Z で固定 (qr-ticket の有効期限デフォルト等を deterministic に)
  const FIXED_NOW = 1767225600000;
  Date.now = () => FIXED_NOW;
});
```

これにより:

- DummyText の Lorem ipsum 生成 (`Math.random`) が固定
- Gs1Databar の card id (`crypto.randomUUID`) が固定
- qr-ticket の有効期限デフォルト値 (Date.now 派生) が固定

検証済み: 旧 PR #253 worktree でこれら 3 mock 適用後の連続 3 回実行で 36/36 全件 pass を local mac で確認 (1.4-1.5m / run)。

### 3. PR comment + artifact による結果報告

`visual-regression.yml` workflow の最終 step で:

1. 結果（pass/fail count、失敗 test 名）を一覧化
2. `peter-evans/create-or-update-comment` または `actions/github-script` で PR に comment 投稿（既存 comment があれば更新）
3. `actions/upload-artifact` で `playwright-report/` を artifact upload (失敗の有無に関わらず)
4. comment 内に artifact link を含める（reviewer がワンクリックで diff 画像を確認可）

comment 雛形:

```markdown
## 🖼️ Visual Regression Test 結果

- **Status**: ✅ 36/36 pass / ❌ N/36 fail
- **失敗 test**:
  - /tools/dummy-text の screenshot が baseline と一致 (mobile)
  - /tools/qr-ticket の screenshot が baseline と一致 (desktop)
- **Artifact (diff 画像)**: [playwright-report](link)

> diff が **意図的な visual 変更**の場合: `Update Visual Regression Baseline` workflow を本 PR ブランチで `workflow_dispatch` trigger して baseline を更新。
> diff が **意図しない regression** の場合: 該当変更を fix。
> 本 check は required ではないため fail のままでも merge は可能（reviewer 判断）。
```

### 4. `update-visual-baseline.yml` の default branch guard

```yaml
on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update-baseline:
    if: github.ref != 'refs/heads/develop' && github.ref != 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      # ... build, playwright --update-snapshots, commit & push back ...
```

`if:` guard により default branch 上で誤って trigger された場合は no-op（branch protection 違反を回避）。「baseline 更新は必ず PR ブランチで」のルールを workflow レベルで強制。

### 5. `playwright.config.ts` の project 分離

```ts
projects: [
  {
    name: 'e2e',
    use: { ...devices['Desktop Chrome'] },
    testIgnore: ['**/visual-regression.spec.ts'],
  },
  {
    name: 'visual-regression',
    use: { ...devices['Desktop Chrome'] },
    testMatch: ['**/visual-regression.spec.ts'],
  },
],
```

`package.json` script 追加:

```json
{
  "test:vrt": "playwright test --project=visual-regression"
}
```

`pretest:vrt` で port kill する場合は `pretest:e2e` と同様の lsof パターン。

---

## ファイル構成

| 種別   | パス                                                        | 役割                                                                             |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create | `tests/e2e/visual-regression.spec.ts`                       | 18 ページ × 2 viewport の VRT spec、`addInitScript` mock 含む                    |
| Create | `tests/e2e/visual-regression.spec.ts-snapshots/*-linux.png` | CI Linux runner で生成した baseline (36 件)                                      |
| Modify | `playwright.config.ts`                                      | `projects:` を `e2e` / `visual-regression` に分離                                |
| Modify | `package.json`                                              | `test:vrt` script + 必要に応じて `pretest:vrt` 追加                              |
| Modify | `.github/workflows/test.yml`                                | e2e job の playwright 起動コマンドを `--project=e2e` 限定                        |
| Create | `.github/workflows/visual-regression.yml`                   | PR trigger、build → VRT 実行 → PR comment + artifact upload                      |
| Create | `.github/workflows/update-visual-baseline.yml`              | `workflow_dispatch` 専用、default branch guard、bot が baseline 更新 commit back |
| Modify | `docs/playbooks/e2e-validation.md`                          | VRT 運用記述追加（diff 出たら reviewer がどう判断するか / baseline 更新方法）    |
| Modify | `docs/decisions.md`                                         | 新規 [066] エントリ追加（VRT architecture 採用根拠 + 失敗事例 PR #253 記録）     |
| Modify | `README.md`（任意）                                         | testing セクションに VRT の概要追記（簡潔）                                      |

---

## 初回 baseline 生成の sequencing（PR 0 の手順）

1. PR 0 ブランチ (`feature/vrt-setup`) で本設計のコード変更を順次 commit
2. local mac で `--update-snapshots` で darwin baseline を一旦生成 → commit
3. `update-visual-baseline.yml` を **PR 0 ブランチで** `workflow_dispatch` trigger（GitHub Actions UI または `gh workflow run`）
   - **問題**: `workflow_dispatch` は default branch 上の workflow definition からしか trigger できない GitHub の制約 → 本 PR の workflow yml はまだ develop に存在しないため不可
   - **解決**: `update-visual-baseline.yml` に **PR 0 ブランチ専用の一時 push trigger** を追加して self-bootstrap、初回 baseline 生成完了後に push trigger を別 commit で削除する（PR #247 で確立した運用パターン）
4. CI Linux runner で baseline 生成 → bot が PR 0 ブランチに commit back
5. ローカル `git pull` で linux baseline を受領、push trigger 削除 commit を追加 push
6. PR 0 を develop に merge 後は、`workflow_dispatch` が default branch から正常に trigger 可能になる

---

## 検証戦略

### 本 PR 内で確認

- `npx playwright test --project=visual-regression --workers=1`（local + CI 両方）で 36/36 pass、連続 2 回以上 stable
- `npx playwright test --project=e2e --workers=1`（既存 e2e 144 + 1 skip + 0 failed）が VRT 含まないことを確認
- `update-visual-baseline.yml` を default branch 上で trigger した場合 (mock 試験) → guard で no-op
- visual-regression workflow が PR comment と artifact を正しく投稿することを CI で確認
- 必須テスト（test, e2e）の所要時間が VRT 分離前後で変わらないこと

### 本 PR マージ後の運用検証（後続 ui migration PR で実機確認）

- B 案 PR 1 で意図的 visual 変更（gs1-databar BareInput の mono prop 由来 font 変化等）が VRT で検出されること
- reviewer が `update-visual-baseline.yml` を trigger して baseline 更新できること
- VRT が required check に含まれないため意図的変更があっても merge ブロックされないこと

---

## スコープ外

- **BareInput の `mono` prop 由来 font 変化 fix**: B 案 ui migration PR の reviewer 判断
- **ui migration（B 案 PR 1〜PR 6）**: 本 PR merge 後に B 案 PR 1 を新ブランチで再着手
- **Branch protection 設定の自動化**: ユーザーが GitHub Settings UI で手動操作（PR description に必須手順として明記、推奨設定例も記載）
- **VRT page スコープの拡大**: 18 ページ × 2 viewport で固定。新 tool 追加時に PAGES 配列追記する運用は後続 issue で
- **Playwright cross-browser**: chromium 1 種のみ。firefox / webkit 追加は別 issue

---

## リスクと緩和

### R1: addInitScript mock が網羅できない non-determinism

**緩和**: PR 0 内で connectivity testing として local 連続 3 回実行 + CI 連続 2 回 (`feature/vrt-setup` ブランチで通常 push 経由) で 36/36 pass を確認してから merge。網羅できない pages があれば追加調査の上、(a) mock を拡張、(b) `mask:` で動的領域除外、(c) 該当 spec を `test.skip` 化、いずれかで対処。

### R2: PR comment が rate limit や権限エラーで投稿失敗

**緩和**: `peter-evans/create-or-update-comment` action を SHA pinning で採用、`permissions:` ブロックで `pull-requests: write` を明示。失敗時は workflow を warning 扱いで継続させ artifact upload は必ず行う（diff 画像へのアクセスは確保）。

### R3: `update-visual-baseline.yml` の bot push が GITHUB_TOKEN の権限不足で失敗

**緩和**: `permissions: contents: write` を job レベルで明示。bot 識別 (`github-actions[bot]`) で commit。failure 時は workflow log に明確なエラーが残る。

### R4: PR 0 ブランチで workflow_dispatch を bootstrap する push trigger 経路の運用ミス

**緩和**: `paths:` フィルタで workflow yml と spec の変更時のみ trigger（migration commit では走らない）。merge 前に push trigger 削除 commit を必ず入れる。

### R5: 後続 ui migration PR で diff が大量発生しても reviewer が放置

**緩和**: PR comment が「意図的なら baseline 更新、意図しないなら fix」と明記。non-required なので merge は可能だが、運用ルールとして「VRT diff comment があれば必ず判断する」を `e2e-validation.md` に明記。

---

## 完了基準（PR 0 マージ時）

- [ ] `tests/e2e/visual-regression.spec.ts` が `addInitScript` mock を含み、CI 上で連続 2 回 36/36 pass
- [ ] `tests/e2e/visual-regression.spec.ts-snapshots/` に CI Linux baseline が commit 済み
- [ ] `playwright.config.ts` が `e2e` / `visual-regression` の 2 project に分離
- [ ] `package.json` に `test:vrt` script
- [ ] `.github/workflows/visual-regression.yml`（PR trigger、PR comment + artifact）が存在
- [ ] `.github/workflows/update-visual-baseline.yml`（workflow_dispatch、default branch guard）が存在
- [ ] `.github/workflows/test.yml` の e2e job が `--project=e2e` で VRT を除外
- [ ] `docs/playbooks/e2e-validation.md` に VRT 運用記述
- [ ] `docs/decisions.md` [066] 追加
- [ ] PR description に「branch protection の required checks に visual-regression を含めない」を明記
- [ ] PR が `--base develop` で作成され、test + e2e check が green
- [ ] visual-regression check は green or non-blocking（fail でも merge 可）

## 関連

- 起源: `#176` B 案（`style-src 'unsafe-inline'` 削減）の前提整備
- 失敗事例: PR #253 (closed) — VRT を ui migration と bundle した結果の architectural 失敗
- メモリ: `feedback_vrt_setup_sequencing.md` / `feedback_subagent_verification_trust.md` / `feedback_infra_feature_separation.md` / `project_b_plan_progress.md`
- 過去 decisions: [063] (preview 切替), [064] (CSP A-1), [065] (webServer CI 分岐)
- 後続: B 案 PR 1（基礎工事 + ui/\* simple 11 ファイル migration）から再着手
