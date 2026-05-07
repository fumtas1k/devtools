# `#176` B 案 (style-src 削減) progress tracker

`#176` B 案 = `style-src 'unsafe-inline'` 削減（A-1 [#249] 完了後の続編、`docs/decisions.md` [064] 参照）。

複数セッション・複数 PC を跨いで参照される本 batch の **SoT (Source of Truth)**。Claude Code session は本 doc を毎回読んで進捗・前提・PR 6 必須チェックリストを把握すること。

**Why**: `style="..."` HTML 属性は CSP3 で hash 適用対象外のため、`style-src` strict 化には全 `style={{}}` を CSS class 化する必要あり（部分削減ではセキュリティ goal 不達）。ユーザー承認済み（数ヶ月コミット）。

**How to apply**:

- **設計書**: `docs/superpowers/specs/` 配下に PR ごと自己完結 spec を作成（PR 1: `2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md` 済 / PR 1.5: `2026-05-04-issue-176-b1-5-ui-complex-design.md` / PR 2: `2026-05-04-issue-176-b2-qr-ticket-design.md`）
- **plan**: 各 PR の plan は `docs/superpowers/plans/` 配下に都度作成（writing-plans skill）
- **ブランチ命名**: `feature/issue-176-b{N}-{slug}` で N=1〜6（ex: `feature/issue-176-b1-foundation`、`feature/issue-176-b2-qr-ticket`）
- **target style system**: Tailwind utility + 意味クラス（`global.css` の `@layer components` に集約）。CSS Modules は不採用
- **進捗検知**: `src/utils/__tests__/inline-style-migration.test.ts`（PR 1 で導入）の `MIGRATED_FILES` array に各 PR で追加。PR 6 で glob 全件に置換
- **visual regression**: Playwright `toHaveScreenshot()`（PR 1 で baseline 撮影、CI Linux runner で生成）

## 進捗状況

| #        | スコープ                                                                                                                                         | 状態       | PR                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------- |
| **PR 0** | VRT 導入のみ（mock 注入版 spec、別 workflow、required check 外す、CI Linux baseline）                                                            | ✅ merged  | [#254 (merged 26f566b)](https://github.com/fumtas1k/devtools/pull/254) |
| **PR 1** | 基礎工事 + ui/\* simple (11 ファイル) — `@layer components` foundation + migration tracker + ClearButton CSSOM 撤去 + ToggleGroup setProperty 化 | ✅ merged  | [#256 (merged eb5e537)](https://github.com/fumtas1k/devtools/pull/256) |
| PR 1.5   | ui/\* complex (ResultTable + InputField) — API redesign 含む                                                                                     | ✅ merged  | [#261 (merged 8e58bd5)](https://github.com/fumtas1k/devtools/pull/261) |
| PR 2     | qr-ticket/\* — inline style 撤去 + #225 (useMemo/abort) 同梱                                                                                     | ✅ merged  | [#272 (merged 37adb60)](https://github.com/fumtas1k/devtools/pull/272) |
| PR 3     | JwtDecoder + UuidV7Generator + #262 partial (uuid-v7 CSP gate)                                                                                   | ✅ merged  | [#275 (merged 1150883)](https://github.com/fumtas1k/devtools/pull/275) |
| PR 4     | Gs1Databar + EncodingConverter + DummyText                                                                                                       | 🔄 PR open | [#277](https://github.com/fumtas1k/devtools/pull/277)                  |
| PR 5     | QrReader + ConfigConverter + JanCode + QrCode + 残り tools                                                                                       | 未着手     | -                                                                      |
| PR 6     | flip + cleanup（CSP strict 化）                                                                                                                  | 未着手     | -                                                                      |

**重要 — PR 0 の意義**: VRT を ui migration と bundle した PR #253 が architectural 問題で close になったため、VRT を独立 PR で proper sequencing（mock 注入 → CI Linux baseline → required check 外す）で先行導入する。詳細は Claude memory `feedback_vrt_setup_sequencing.md` / `feedback_infra_feature_separation.md` 参照（PC ローカル）。

## 着手済 PR の prerequisite / 同梱 issue 履歴

### PR 2 (#272)

- **prerequisite (close 済)**: [#258](https://github.com/fumtas1k/devtools/issues/258) ClearButton / CopyButton に `type="button"` 追加 — PR [#268](https://github.com/fumtas1k/devtools/pull/268) で対応 (✅ merged) / 同種パターン follow-up [#269](https://github.com/fumtas1k/devtools/issues/269) を PR [#270](https://github.com/fumtas1k/devtools/pull/270) で対応 (✅ merged)
- **PR 内同梱 (close 済)**: [#225](https://github.com/fumtas1k/devtools/issues/225) refactor(QrTicket): GenerateTab props の useMemo 安定化 + verify signal の camera 経路への伝播 — PR `#272` 内で対応

### PR 3 (#275)

- **PR 内同梱 (partial、close は PR 5 で)**: [#262](https://github.com/fumtas1k/devtools/issues/262) test(e2e): generator ページの applyProductionCsp E2E gate を追加（PR 6 前段必須） — PR `#275` で **uuid-v7 部分** に gate を挿入 (`tests/e2e/uuid-v7.spec.ts` の全 test を `browser.newContext()` pattern + `applyProductionCsp(page)` で gate、陽性対照 1 件追加)。**ulid-generator 部分は PR 5 で対応して #262 close 予定**
- **PR review 由来 follow-up**: [#276](https://github.com/fumtas1k/devtools/issues/276) test(e2e): applyProductionCsp の `browser.newContext` boilerplate を `withProductionCsp` ラッパで集約 — ✅ **closed (PR [#278](https://github.com/fumtas1k/devtools/pull/278) で対応)**。PR 5 前段の独立 infra PR として `feedback_infra_feature_separation.md` 準拠で先行投入し、PR 5 で `tests/e2e/ulid-generator.spec.ts` を新設する際に boilerplate 増殖を回避できる状態にした

### PR 4 (#277)

- **特殊事項**: Gs1Databar 内で `e.currentTarget.style.X = Y` 形式の CSSOM hover state mutation 9 件を Tailwind `hover:` modifier に refactor。inline style と同等の hover 挙動を CSS で表現
- **race 回避運用**: PR 3 の commit 結合 race 反省を踏まえ、subagent は commit せず親 Opus が Phase 1.5 で順次 commit する方式を初採用（3 commit が綺麗に分離、prettier 巻き込みも親が制御）
- **新規 class**: `.summary-no-marker` の 1 件のみ（Gs1Databar `<details>/<summary>` 専用、PR 1〜3 既存 class で 95% 以上カバー）

## PR 1 / PR 1.5 / PR 2 / PR 3 / PR 4 / PR #278 (infra) follow-up issue 処理タイミング表

各 issue の処理推奨タイミング (2026-05-07 時点):

| issue                                                   | 内容                                                                                       | 処理タイミング                                  | 備考                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#257](https://github.com/fumtas1k/devtools/issues/257) | ToggleGroup `--toggle-cols` removeProperty cleanup                                         | 独立 (低優先)                                   | ResultTable の ref callback パターンを参照可。実害なし                                                                                                  |
| [#258](https://github.com/fumtas1k/devtools/issues/258) | ClearButton/CopyButton `type="button"`                                                     | ✅ closed                                       | PR `#268` で対応                                                                                                                                        |
| [#259](https://github.com/fumtas1k/devtools/issues/259) | ActionButton danger+disabled border                                                        | 独立 (デザイン判断後)                           | A 案 vs B 案、blocking なし                                                                                                                             |
| [#260](https://github.com/fumtas1k/devtools/issues/260) | className 構築方式 clsx 統一                                                               | PR 2-5 で都度 `filter(Boolean)` 採用 or 一括 PR | PR 1.5 で先行採用済                                                                                                                                     |
| [#262](https://github.com/fumtas1k/devtools/issues/262) | applyProductionCsp generator gate                                                          | **PR 5 で close**                               | PR 3 (#275) で uuid-v7 部分対応済 (open のまま)、ulid-generator 部分は PR 5 で対応して close。下記 PR 6 チェックリスト参照                              |
| [#263](https://github.com/fumtas1k/devtools/issues/263) | aria-selected ARIA spec 違反                                                               | **#264 と同 PR**                                | 同 `<tr>` 編集、統合修正候補                                                                                                                            |
| [#264](https://github.com/fumtas1k/devtools/issues/264) | クリック行キーボード操作 (WCAG)                                                            | **#263 と同 PR**                                | 同上                                                                                                                                                    |
| [#265](https://github.com/fumtas1k/devtools/issues/265) | useEffect deps anti-pattern                                                                | ✅ closed                                       | PR 1.5 (#261) で対応済                                                                                                                                  |
| [#266](https://github.com/fumtas1k/devtools/issues/266) | width JSDoc origin discipline                                                              | ✅ closed                                       | PR 1.5 (#261) で対応済                                                                                                                                  |
| [#269](https://github.com/fumtas1k/devtools/issues/269) | ToggleGroup / QrReader / Gs1Databar `type="button"` (PR 1 由来漏れ)                        | ✅ closed                                       | PR `#270` で対応                                                                                                                                        |
| [#271](https://github.com/fumtas1k/devtools/issues/271) | ESLint `react/button-has-type` 導入 + index.astro 残り 2 件                                | 独立 (低優先)                                   | PR 6 以降または専用 PR で                                                                                                                               |
| [#273](https://github.com/fumtas1k/devtools/issues/273) | `useTicketVerification.verify` の external signal を `AbortSignal.any` 化                  | PR 6 cleanup スコープ候補                       | 現 callsite 実害なし                                                                                                                                    |
| [#276](https://github.com/fumtas1k/devtools/issues/276) | applyProductionCsp の `browser.newContext` boilerplate を `withProductionCsp` ラッパで集約 | ✅ closed                                       | PR [#278](https://github.com/fumtas1k/devtools/pull/278) で対応 (2026-05-07)。陽性対照メタテスト 2 件は inline 維持                                     |
| [#279](https://github.com/fumtas1k/devtools/issues/279) | `waitForReactHydration` の label-aware 待ちオプション拡張                                  | event 駆動 (低優先)                             | PR #278 由来 (review 提案 #2)。個別 spec で `waitFor(label)` workaround が 2 件以上溜まったら集約。実害なし                                             |
| [#280](https://github.com/fumtas1k/devtools/issues/280) | `withProductionCsp` の options 引数 (contextOptions / hydrationTimeout) 拡張               | event 駆動 (YAGNI)                              | PR #278 由来 (review 提案 #3)。`locale` / `viewport` / `hydrationTimeout` 等が必要になった最初のテスト着手時に対応                                      |
| [#281](https://github.com/fumtas1k/devtools/issues/281) | `withProductionCsp` 自体の挙動を検証する meta-test 追加                                    | **PR 5 着手前に再確認**                         | PR #278 由来 (review 提案 #4)。`fn` throw 時の `context.close` 確実呼出 / `assertNoViolations` 自動呼出 を assert。PR 5 完了後 or #280 着手時に併設候補 |
| [#119](https://github.com/fumtas1k/devtools/issues/119) | .text-link-color 命名規則統一                                                              | 独立 (低優先)                                   | PR 1.5 で消費パターン定着、改名は all-files rename になる時期まで保留                                                                                   |

## B 案接近系 issue（独立判断）

B 案直接 follow-up ではないが関連する issue:

- [#225](https://github.com/fumtas1k/devtools/issues/225) → ✅ closed (PR `#272` 内同時対応)
- [#231](https://github.com/fumtas1k/devtools/issues/231) → ✅ closed (resolved by PR `#236`)
- [#238](https://github.com/fumtas1k/devtools/issues/238) + [#239](https://github.com/fumtas1k/devtools/issues/239) → **両者を 1 PR で統合対応推奨**（独立、PR 1.5 で `.btn-action` 地盤整備済）
- [#234](https://github.com/fumtas1k/devtools/issues/234) (applyProductionCsp 全ツール展開) ↔ [#262](https://github.com/fumtas1k/devtools/issues/262): **部分重複だが両方 KEEP**。`#262` は PR 6 blocking の 2 spec 限定、`#234` は 19 spec 横展開。`#262` 完了時に `#234` のチェックリストで該当 2 件を消込

## PR 6 必須チェックリスト（merge 直前に必ず確認）

PR 6 で以下を **すべて含む** こと。漏れを防ぐため本セクションを SoT とする:

- [ ] `public/_headers` の CSP から `style-src 'unsafe-inline'` を削除
- [ ] `astro.config.mjs` から `stripMetaStyleSrc()` integration 削除（A-1 で導入した暫定 strip）
- [ ] `src/utils/styles.ts` 削除（PR 1〜5 で全 import 元が CSS class 参照に置換完了している前提）
- [ ] `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array を `await glob('src/components/**/*.tsx')` 等で全件カバー化
- [ ] `src/utils/__tests__/headers.test.ts` を strict 化（`'unsafe-inline'` 不在を陽性 assert）
- [ ] `src/utils/__tests__/meta-csp.test.ts` の `style-src 不在 assert` を `style-src strict 形式 assert` に変更
- [ ] `src/utils/__tests__/astro-config-csp.test.ts` から `stripMetaStyleSrc` 呼び出し assert 削除
- [ ] **PR 6 着手前に issue [#262](https://github.com/fumtas1k/devtools/issues/262) を close** — generator ページ (ulid-generator / uuid-v7) に `applyProductionCsp(page)` E2E gate を追加する。PR 1.5 で `setProperty('--var', value)` パターンを導入したため、CSP strict 化（`'unsafe-inline'` 削除）後に violation を能動検出する E2E が必要。VRT は pixel diff のみで CSP 違反を silent pass しうるため、本 issue 完了が PR 6 の前段必須条件。Claude memory `feedback_prod_parity_csp.md` 参照。
- [ ] **`docs/decisions.md` に [067] エントリ追加**（B 案完了の記録、PR 1〜6 のシリーズ依存図 + 各 PR で何を達成したかのサマリ）— PR 1 (#256) の reviewer I-3 で defer 容認、PR 6 で一括記録の約束
- [ ] visual regression baseline が flip 後の CSP で再撮影されている（CI Linux runner）
- [ ] PR description に「`#176` B 案完了」を明記、関連 PR (#249/#254/#256/#261/#272/PR 3-5) を全 link
- [ ] `grep -c "style={{" src/` = **0** を最終確認
- [ ] 全 E2E + 全 unit + astro check pass
- [ ] PR 1 (#256) / PR 1.5 (#261) / PR 2 (#272) / PR 3 (#275) / PR 4 (#277) / 前段 infra PR (#278) の follow-up 系 issue のうち PR 6 で同時対応するものがあれば close、後続するものは PR 6 description で言及。
  - PR 1 由来: #257-#260
  - PR 1.5 由来: [#262](https://github.com/fumtas1k/devtools/issues/262) (CSP gate / **PR 5 で close**、PR 3 で uuid-v7 partial 対応済) / [#263](https://github.com/fumtas1k/devtools/issues/263) (aria-selected ARIA spec) / [#264](https://github.com/fumtas1k/devtools/issues/264) (キーボード操作 WCAG 2.1.1) / [#265](https://github.com/fumtas1k/devtools/issues/265) (useEffect deps anti-pattern, ✅ closed) / [#266](https://github.com/fumtas1k/devtools/issues/266) (width JSDoc origin discipline, ✅ closed)
  - PR 2 由来: [#273](https://github.com/fumtas1k/devtools/issues/273) (`AbortSignal.any` 化、`useTicketVerification.verify` external signal link 改善)
  - PR 3 由来: [#276](https://github.com/fumtas1k/devtools/issues/276) (`withProductionCsp` ラッパ helper、✅ closed PR [#278](https://github.com/fumtas1k/devtools/pull/278))
  - PR #278 由来: [#279](https://github.com/fumtas1k/devtools/issues/279) (waitForReactHydration label-aware 拡張、event 駆動) / [#280](https://github.com/fumtas1k/devtools/issues/280) (withProductionCsp options 拡張、YAGNI) / [#281](https://github.com/fumtas1k/devtools/issues/281) (withProductionCsp 自体の meta-test、**PR 5 着手前に再確認**)
- [ ] **`.text-primary` 命名衝突リスクの再評価** — `src/styles/global.css` の `.text-primary` (PR 2 で追加) は `--color-primary` を `@theme` に登録すると Tailwind auto-utility と衝突する可能性。PR 6 で `@theme` 切替するなら `text-brand` 等への rename 候補。`@theme` 切替自体を見送るなら現状維持で OK。決定事項を `docs/decisions.md` [067] に明記すること。
- [ ] **Tailwind `border` utility と `@layer components` の `border-color` 優先度確認** — PR 2 で導入した `.alert-success` / `.alert-error` は `<div className="rounded-lg p-4 border alert-success">` のように Tailwind `border` (border-color: currentColor 系) と併用。layer 順序によっては期待色にならないリスクが PR 2 review で指摘済（実害は VRT pass で未顕在）。CSP strict 化後の VRT 再撮影で diff が出たら fix。

## spec 文書の現状

- 旧 spec (`docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md`) は PR `#253` と一緒に close されたブランチにあった（VRT 分離前の内容で stale）
- 各 PR は自己完結 spec を `docs/superpowers/specs/` 配下に都度作成
- master B 案 spec の repo commit は不採用（PR 1 spec の batch table + 本 doc + PR 6 の `docs/decisions.md` [067] でカバーする方針、reviewer I-3 で defer 容認）

## 運用注意

- **PR は直列**（前 PR がマージされてから次 PR 着手）。並列禁止 — review 衝突回避と意味クラス追加（`@layer components`）の競合回避のため
- 各 PR の作業前に **必ず spec 全文** を読む（本 doc は index 用）
- 各 PR マージ後に本 doc の「進捗状況」テーブルと follow-up issue 状態を更新する commit を含める（または直後の chore PR で更新）
- **PR 6 着手時は「PR 6 必須チェックリスト」を TaskList の最初の task として展開し、漏れを防ぐ**

## Claude memory との関係

本 doc は repo SoT として複数セッション・複数 PC 共有。Claude memory (`~/.claude/projects/.../memory/project_b_plan_progress.md`) は本 doc への thin pointer のみ保持し、SoT は repo 側に統一する。

参照される個別 Claude memory（PC ローカル、`~/.claude/projects/.../memory/`）:

- `feedback_subagent_*` 系（subagent 運用）
- `feedback_worktree_*` 系（worktree 運用）
- `feedback_pr_*` 系（PR 作成手順）
- `feedback_vrt_*` 系（VRT 運用）
- `feedback_e2e_before_pr.md` / `feedback_commander_checklist.md` / `feedback_heredoc_no_escape.md` / `feedback_followup_routing.md` / `feedback_review_integrity.md` / `feedback_hold_push_during_review.md` / `feedback_prod_parity_csp.md` / `feedback_pr_size.md` / `feedback_infra_feature_separation.md`

これらは Claude collaboration の preference であり project SoT ではないため repo には移さない。
