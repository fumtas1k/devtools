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

| #                     | スコープ                                                                                                                                                                       | 状態      | PR                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------- |
| **PR 0**              | VRT 導入のみ（mock 注入版 spec、別 workflow、required check 外す、CI Linux baseline）                                                                                          | ✅ merged | [#254 (merged 26f566b)](https://github.com/fumtas1k/devtools/pull/254) |
| **PR 1**              | 基礎工事 + ui/\* simple (11 ファイル) — `@layer components` foundation + migration tracker + ClearButton CSSOM 撤去 + ToggleGroup setProperty 化                               | ✅ merged | [#256 (merged eb5e537)](https://github.com/fumtas1k/devtools/pull/256) |
| PR 1.5                | ui/\* complex (ResultTable + InputField) — API redesign 含む                                                                                                                   | ✅ merged | [#261 (merged 8e58bd5)](https://github.com/fumtas1k/devtools/pull/261) |
| PR 2                  | qr-ticket/\* — inline style 撤去 + #225 (useMemo/abort) 同梱                                                                                                                   | ✅ merged | [#272 (merged 37adb60)](https://github.com/fumtas1k/devtools/pull/272) |
| PR 3                  | JwtDecoder + UuidV7Generator + #262 partial (uuid-v7 CSP gate)                                                                                                                 | ✅ merged | [#275 (merged 1150883)](https://github.com/fumtas1k/devtools/pull/275) |
| PR 4                  | Gs1Databar + EncodingConverter + DummyText                                                                                                                                     | ✅ merged | [#277 (merged 495f60e)](https://github.com/fumtas1k/devtools/pull/277) |
| **infra (PR 5 前段)** | `withProductionCsp` ラッパ helper 追加 (#276 close)                                                                                                                            | ✅ merged | [#278 (merged 73de179)](https://github.com/fumtas1k/devtools/pull/278) |
| PR 5a                 | ConfigConverter + QrReader + JanCode (大物 3 つ、CSSOM hover 含む) — 31 inline style + 2 CSSOM                                                                                 | ✅ merged | [#283 (merged 46abcb5)](https://github.com/fumtas1k/devtools/pull/283) |
| PR 5b                 | Base64Codec + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 (QrTicket / UrlEncoder) + `tests/e2e/ulid-generator.spec.ts` を `withProductionCsp` 化 (#262 close) | ✅ merged | [#286 (merged d38b956)](https://github.com/fumtas1k/devtools/pull/286) |
| PR 6                  | scope 縮小: `styles.ts` 削除 + migration tracker glob 化 (Astro inline 65 件残存判明 → #289 へ委譲)                                                                            | ✅ merged | [#290 (merged 4505bcf)](https://github.com/fumtas1k/devtools/pull/290) |
| PR 7a                 | layout/\* 4 + layouts/\* 2 + ui/\*.astro 2 (Astro inline 23 件撤去 + 新規 7 class) — `#289` 由来                                                                               | ✅ merged | [#294 (merged 3d943bd)](https://github.com/fumtas1k/devtools/pull/294) |
| PR 7b                 | pages/\*.astro 7 ファイル (Astro inline 残 42 件 + 新規 3 class) — `#289` 由来                                                                                                 | ✅ merged | [#299 (merged 87d705a)](https://github.com/fumtas1k/devtools/pull/299) |
| PR 8                  | scope 縮小: Gs1Databar SVG `currentColor` 化 + Astro 検出網 (`.astro` glob) + `decisions.md [067]` (setProperty CSP3 制約発覚 + 延期記録) — strict 化は PR 10 に延期           | ✅ merged | [#303 (merged e2efd24)](https://github.com/fumtas1k/devtools/pull/303) |
| PR 9                  | ResultTable + ToggleGroup `setProperty` を Constructable Stylesheets 化 (issue 由来 ResultTable のみ → ToggleGroup 12 ツール影響を spec 起草時に発見し scope 拡張)             | ✅ merged | [#307 (merged 52d6ef3)](https://github.com/fumtas1k/devtools/pull/307) |
| **PR 10 (新規)**      | B 案最終 flip: `_headers` + `<meta>` 両側から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + test 群 strict 化 (PR 8 から rebase で削除した 3 commit を再投入)  | 未着手    | issue [#305](https://github.com/fumtas1k/devtools/issues/305)          |

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

### PR 5a (#283)

- **新規 class**: `.qr-video-preview` の 1 件のみ（QrReader `<video>` 黒背景専用）
- **再利用**: PR 4 で導入された `.hover-bg-subtle` を JanCode `<summary>` で再利用（新規不要）。`.summary-no-marker` も再利用
- **削除**: QrReader の module-level スタイル定数 4 個（`rescanButtonStyle` / `startCameraButtonStyle` / `stopCameraButtonStyle` / `uploadLabelStyle`）を全削除し className 化。`uploadLabelStyle(false)` 分岐は YAGNI で削除
- **race 回避運用**: PR 4 で確立した「subagent 非 commit + 親で順次 commit」を 2 回目運用、安定運用確認
- **CSSOM hover refactor**: JanCode `<summary>` の `onMouseEnter`/`onMouseLeave` 2 件を `.hover-bg-subtle` で CSS 化（memory `feedback_tailwind_v4_layer_variant.md` 準拠）
- **self-review NIT follow-up**: [#284](https://github.com/fumtas1k/devtools/issues/284) (`min-w-10` 集約検討、`.label-prefix` 専用 class 化) / [#285](https://github.com/fumtas1k/devtools/issues/285) (カメラボタン utility 列挙を `.btn-action--*-fill` variant に集約検討) を起票。**PR 5b / PR 6 で類似 pattern が出てきたら集約検討、出なければ close**

### PR 5b (#286)

- **新規 class**: なし (PR 1〜5a の class 資産で 100% カバー)
- **再利用**: `caption` / `body-emphasis` / `text-default` / `text-muted` / `text-primary` / `bg-default` / `bg-subtle` / `border-default` を活用
- **zero-style 登録**: `QrTicket.tsx` (root) / `UrlEncoder.tsx` をコード変更なしで `MIGRATED_FILES` に追加 (PR 6 全件 glob 化前の検出網)
- **dead import 発見**: `JsonCsv.tsx` の `import { caption, colors } from '@/utils/styles'` が本文未使用 (PR 1〜5a の削減過程で削除漏れ)、本 PR で削除
- **E2E gate 拡張**: `tests/e2e/ulid-generator.spec.ts` 既存 5 件を `withProductionCsp` で包み、陽性対照メタテスト 1 件を追加 → uuid-v7 (PR 3 で対応済) + ulid-generator (本 PR) で「generator 全体に CSP gate」が成立し **#262 close**
- **#234 部分消込**: 19 spec 横展開のチェックリストで uuid-v7 + ulid-generator の 2 件を消込
- **race 回避運用**: PR 4 / 5a で確立した「subagent 非 commit + 親で順次 commit」を 3 回目運用、安定運用確認
- **進捗 doc 訂正**: ulid-generator.spec.ts は当初「新設」と表記していたが、調査結果既存 spec として存在し CSP gate 未適用だったため「既存 spec の refactor + 陽性対照追加」と訂正
- **infra/feature 分離の例外判断**: ulid-generator E2E gate 化を migration と bundle 許容。根拠は spec §「なぜ独立 PR (5a / 5b 分割) か」(1 spec 内 + helper 既存 + #262 同期 + 別 PR 化のレビュー二度手間回避)

### infra PR (#278) — PR 5 前段

- **目的**: PR 3 で導入された `applyProductionCsp` E2E gate の `browser.newContext` boilerplate (9 行) を `withProductionCsp(browser, path, fn)` 1 行に集約。PR 5b で `tests/e2e/ulid-generator.spec.ts` を CSP gate 化する際の boilerplate 増殖を回避
- **scope**: helpers.ts に `withProductionCsp` 追加 + `uuid-v7.spec.ts` (5 件) / `config-converter.spec.ts` (1 件) の通常テスト書換。陽性対照メタテスト 2 件は `guard.violations.length` polling のため inline 維持
- **review feedback follow-up**: [#279](https://github.com/fumtas1k/devtools/issues/279) (waitForReactHydration label-aware) / [#280](https://github.com/fumtas1k/devtools/issues/280) (options 拡張) / [#281](https://github.com/fumtas1k/devtools/issues/281) (ラッパ自体の meta-test) を起票。**#281 は PR 5b 着手前に再確認**

### PR 6 (#290)

- **scope 縮小の経緯**: 当初 spec は「`_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `decisions.md [067]`」だったが、`npm run test:e2e` 実行段階で **Astro `<element style="...">` 属性 65 件 / 15 ファイル** が未移行で残存していたことが判明 (PR 1〜5b は React `style={{}}` のみが対象)。本 PR は scope を `styles.ts` 削除 + migration tracker glob 化のみに縮小し、Astro inline migration を `#289` に委譲
- **post-mortem**: 元 spec [`docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md`](../superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md) の post-mortem section 参照
- **次の PR**: PR 7a (本 PR、layout/ui Astro 23 件) → PR 7b (pages/ Astro 42 件) → PR 8 (最終 flip + cleanup、`8ae383a` の revert コードを再利用)

### PR 7a (#294) — `#289` 由来

- **scope**: `src/components/layout/*.astro` 4 + `src/layouts/*.astro` 2 + `src/components/ui/{CategoryBadge,ToolInfoSection}.astro` 2 = **8 ファイル / 23 inline 撤去**
- **新規 class**: 7 件 (`.caption-wide` / `.text-icon` / `.text-tertiary` / `.bg-badge` / `.footer-bar` / `.text-footer-meta` / `.drawer-backdrop`) を `src/styles/global.css` に追加
- **再利用**: `.caption` / `.text-default` / `.text-muted` / `.text-primary` / `.bg-default` / `.bg-surface` / `.border-default` (PR 1〜5b 既存資産で 14 件カバー)
- **Tailwind arbitrary**: `tracking-[0.02em]` x 5 / `text-[1.625rem] leading-[1.5]` x 1 / `z-[60]` x 1 / `text-sm leading-none` x 1 — 単発 typography は class 化見送り (YAGNI、PR 5b と同 judgement)
- **scope 外**: `src/pages/*.astro` 7 ファイル / 42 件 (PR 7b)、`style-src 'unsafe-inline'` 削除 (PR 8)、`inline-style-migration.test.ts` の Astro 検出網追加 (PR 7b 完了後 = 全 65 件移行後)
- **subagent 非委譲**: 親 Opus 直接実装 + 親直接 E2E (PR 6 / 292 と同パターン、memory `feedback_subagent_verification_trust.md`)
- **既存 Astro `<style>` scoped block との関係**: Footer / MobileDrawer / Sidebar に既存 `.footer-link` / `.drawer-close-btn` 等の scoped block あり (CSP auto-hash で通過する別経路)。本 PR では touch せず維持。新規 7 class は global.css `@layer components` に集約 (brainstorming Q3 で確定、PR 1〜5b パターン継承)

### PR 7b (#299) — `#289` 由来

- **scope**: `src/pages/*.astro` 7 ファイル (`index.astro` 13 + `privacy.astro` 12 + `about.astro` 10 + `tools/jwt-decoder.astro` 4 + `tools/url-encode.astro` 1 + `tools/json-xml.astro` 1 + `tools/json-csv.astro` 1) = **42 inline 撤去**
- **新規 class**: 3 件 (`.section-heading` / `.text-body` / `.scroll-snap-x`) を `src/styles/global.css` に追加
- **再利用**: `.bg-subtle` (PR 1) / `.caption` / `.text-muted` / `.text-default` / `.text-primary` / `.bg-default` / `.border-default` (PR 1〜5b) — code chip 7 件を bg-subtle で完全カバー、caption + muted で 3 件、border-default で 2 件
- **Tailwind arbitrary**: H1 単発 (`text-[2rem]` x1, `text-[1.75rem]` x2)、hero subtitle (`text-[var(--color-neutral-600)]`)、hero card bg (`bg-[var(--color-background)] border-[var(--color-blue-100)]`)、small label (`tracking-[0.02em]` x4)、list a L82 (`leading-[1.7]`) — 単発 typography は class 化見送り (YAGNI、PR 7a §126 と同 judgement)
- **scope 外**: `style-src 'unsafe-inline'` 削除 (PR 8 → PR 10 へ延期)、`inline-style-migration.test.ts` の Astro 検出網追加 (PR 8 で実施)、`decisions.md [067]` (PR 8 で記録、ただし内容は B 案完了でなく setProperty 制約発覚 + 延期記録に変更)
- **subagent 非委譲**: 親 Opus 直接実装 + 親直接 E2E (PR 7a / PR 6 / 292 と同パターン、memory `feedback_subagent_verification_trust.md`)
- **issue #289 完了**: PR 7a (23 件) + PR 7b (42 件) = 65 件 / 15 ファイル全廃完了。次は PR 8 で `style-src 'unsafe-inline'` 削減を最終 flip 予定だったが、PR 8 の E2E で setProperty CSP3 制約発覚 → PR 9 / PR 10 に分割
- **同梱で起票した follow-up issue**: [#297](https://github.com/fumtas1k/devtools/issues/297) (worktree 作成時の npm ci 必須ルールが docs framing 上の構造的欠陥で skip 多発、本 PR 着手時に発覚 — 修正は別 PR / docs only)

### PR 8 (#303、scope 縮小) — `setProperty` CSP3 制約発覚

- **当初スコープ**: 最終 flip + cleanup (`_headers` から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + `decisions.md [067]` + Astro 検出網追加 + Gs1Databar SVG `currentColor` 化)
- **scope 縮小の経緯**: subagent 直列 7 commit 完了後の親直接 E2E で 11 件 violation 発覚 (`ulid-generator.spec.ts` 5 / `uuid-v7.spec.ts` 6 / `config-converter.spec.ts` 1)。原因は `ResultTable.tsx` の `el.style.setProperty('--col-width', ...)` (PR 1.5 由来) が CSP3 仕様で `style-src` の制御対象であり、`'unsafe-inline'` / hash / nonce のいずれかが必須。連続値ゆえ hash 列挙不可。
- **rebase で削除した 3 commit**: CSP flip (`_headers` + `csp.ts`) / `stripMetaStyleSrc` 撤去 / test 群 strict 化 (3 commit)。これらは PR 10 で再投入予定。git backup branch `backup/pr8-full-original` で保全済 (push しないので消える時は注意)。
- **本 PR で残した 4 commit**: Gs1Databar SVG `currentColor` 化 + Astro 検出網 + `decisions.md [067]` (内容を「setProperty 制約発覚 + 延期記録」に書換) + 本 SoT 同期
- **次のステップ**: PR 9 (ResultTable refactor) → PR 10 (B 案最終 flip)
- **post-mortem**: 詳細は `docs/decisions.md [067]` 参照

### PR 9 (issue [#304](https://github.com/fumtas1k/devtools/issues/304)) — ResultTable + ToggleGroup `setProperty` refactor

- **scope 拡張 (spec 起草時に発見)**: 当初 issue は ResultTable のみ言及だったが、`ConfigConverter` は `ResultTable` 未使用で `config-converter` violation 1 件の真因は `ToggleGroup.tsx:41` の `setProperty('--toggle-cols', N)` (12 ツールで使用) と確認。PR 9 で **ResultTable + ToggleGroup を一括 refactor** (PR 10 strict 化で全 12 ツールが再違反するのを防ぐ)
- **採用**: (a) Constructable Stylesheets。Phase 0 minimal repro spec (`tests/e2e/csp-constructable-stylesheet.spec.ts`、永続) で Chromium 実機検証 pass を確認後 refactor
- **共通 hook**: `src/hooks/useDynamicStyleSheet.ts` (SSR-safe / `useId` ベース) に Constructable Stylesheets 経路を集約。`src/utils/css-length.ts` の `assertCssLength` で CSS injection 防御
- **migration test 反転**: `inline-style-migration.test.ts` の `setProperty` 除外を撤去し陽性 guard に変更
- **infra/feature 分離例外**: `applyStrictStyleSrcCsp` helper + Phase 0 spec を本 PR に bundle (PR 5b と同 judgement、`feedback_infra_feature_separation.md` 例外条項)
- **subagent 委譲方針**: Task 1〜7 は subagent (sonnet) 委譲、Task 8〜10 は親 Opus 直接 (overhead vs. ROI 判断、PR 7a / 7b / 8 と同パターンに揃える)
- **Phase 2 で発覚した PR 10 申し送り事項**: 13 ツール spec を strict CSP local run したところ、Astro 島ランタイムが injection する固定 inline `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>` (sha256-vv9I...) が headers 側 strict CSP で block される現象を確認。PR 9 の React refactor 自体は無問題 (`useDynamicStyleSheet` 経路は violation 起こさず) で、PR 10 で `_headers` strict 化と同時に Astro island style hash を取り込む経路設計が必要 (詳細は `docs/decisions.md [067]` PR 9 outcome section 参照)
- **後続**: PR 10 ([#305]) で `_headers` / `<meta>` strict 化 + `stripMetaStyleSrc` 撤去 + Astro island style hash 取り込み + test 群 strict 化 (PR 8 rebase で削除した 3 commit 再投入)
- **PR 9 follow-up (PR [#313](https://github.com/fumtas1k/devtools/pull/313), merged `55550ff`、`#312` の後続)**: `#309` (FOUC option A、closed) / `#308` (sheet 再利用 (ii) 実装見送り、open 維持)、`docs/decisions.md [067] Follow-up decisions` で記録 + `useDynamicStyleSheet.ts` JSDoc 補強

### PR 10 (issue [#305](https://github.com/fumtas1k/devtools/issues/305)、新規) — B 案最終 flip

- **scope**: PR 8 から rebase で削除した 3 commit を再投入
  - `_headers` から `style-src 'unsafe-inline'` 削除 + `src/utils/csp.ts` 同期
  - `astro.config.mjs` から `stripMetaStyleSrc()` integration 撤去 + 関連 import 削除
  - `headers.test.ts` / `meta-csp.test.ts` / `astro-config-csp.test.ts` 群を strict 化 (`'unsafe-inline'` 不在を陽性 assert)
- **前提**: PR 9 完了 (ResultTable refactor merge) + PR 9 follow-up decision メモ化済 (`#309` close / `#308` 方針確定、`docs/decisions.md [067] Follow-up decisions`)
- **検証**: 親直接 E2E (`npm run test:e2e`) で violation ゼロ + VRT diff ゼロ
- **`decisions.md` 追記**: `[068]` で B 案最終完了を記録 (PR 1〜10 シリーズ図、削除した暫定 infra、検出網運用ノート、設計判断 KEEP)

## PR 5 分割設計メモ (調査日: 2026-05-07)

PR 5 を **PR 5a / PR 5b** に分割する根拠と各 PR のスコープ。新セッションで spec 起草に直行できるよう本セクションに集約。

### 未 migrate 9 ツールの inline style 件数 (調査結果)

| ツール          | inline style | CSSOM | LOC | styles.ts import            | PR 5a/b 振り分け                                                  |
| --------------- | ------------ | ----- | --- | --------------------------- | ----------------------------------------------------------------- |
| ConfigConverter | 11           | 0     | 322 | colors+caption              | **5a** (大物)                                                     |
| QrReader        | 11           | 0     | 305 | colors+caption              | **5a** (大物、camera API 別途)                                    |
| JanCode         | 9            | **2** | 205 | colors+caption+bodyEmphasis | **5a** (CSSOM hover、Gs1Databar pattern 流用)                     |
| QrCode          | 7            | 0     | 122 | colors+caption+bodyEmphasis | 5b                                                                |
| Base64Codec     | 2            | 0     | 104 | colors+caption              | 5b                                                                |
| UlidGenerator   | 2            | 0     | 128 | colors+bodyEmphasis         | **5b** (#262 close: ulid-generator E2E gate 化)                   |
| JsonCsv         | 1            | 0     | 108 | colors+caption              | 5b                                                                |
| JsonXml         | 1            | 0     | 98  | **none**                    | 5b (import 不在 = `alignItems: 'flex-start'` のみで color 不使用) |
| QrTicket (root) | **0**        | 0     | 112 | none                        | 5b (zero-style 登録のみ、migration 不要)                          |
| UrlEncoder      | **0**        | 0     | 92  | none                        | 5b (zero-style 登録のみ、migration 不要)                          |

**合計**: 44 inline style + 2 CSSOM (PR 4 = 53 + 9 と同等規模、過大ではない)

### 分割ロジック

- **5a 採用基準**: inline style ≥ 7 OR CSSOM hover あり = 大物中物。3 ツール並列 sonnet で PR 4 と同パターン。
- **5b 採用基準**: 残り 7 ツール (うち 2 ツールは zero-style) + ulid-generator E2E gate 化 + #262 close。infra/feature 分離の観点で **migration と E2E gate 化の bundle を許容** (E2E は 1 spec のみで PR #278 のような分離コストに見合わないため)。

### PR 5a 着手時の memo

- **CSSOM hover refactor pattern**: PR 4 Gs1Databar の `hover:` modifier 化を JanCode 2 件に流用。spec で具体例を再掲する
- **QrReader camera API**: `getUserMedia()` 等の使用有無 → PR 6 で `media-src` directive 追加要否の判断材料 (今 PR 5a スコープ外、ただし spec で flag のみ)
- **新規 class 追加判断**: PR 1〜4 で 95%+ カバー済の前提。新規追加は最小限 (PR 4 の `.summary-no-marker` 風)

### PR 5b 着手時の memo

- **zero-style 登録**: `QrTicket.tsx` (root) / `UrlEncoder.tsx` を `MIGRATED_FILES` に追加するだけで pass する。「migration 不要」の論理を spec で明示
- **JsonXml.tsx の styles.ts import 不在** (調査結果 PR 5b 完了): 1 件の inline style は `alignItems: 'flex-start'` のみで color 不使用、もとから styles import 不要だった。本 PR で `items-start` Tailwind utility に置換完了
- **`tests/e2e/ulid-generator.spec.ts` の CSP gate 化** (調査結果、当初「新設」と表記していたが実際は既存 spec): PR #278 で導入した `withProductionCsp` ラッパで既存 5 件を包み、陽性対照メタテスト 1 件追加。陽性対照は `applyProductionCsp` 直接利用の inline pattern (uuid-v7 と同じ)
- **#262 close**: ulid-generator + uuid-v7 (PR 3 で対応済) で「generator 全体に E2E gate」が成立 → close
- **#234 への波及**: 19 spec 横展開のチェックリストで該当する ulid-generator + uuid-v7 を消込 (本 PR 5b で対応する範囲)
- **#281 再確認**: `withProductionCsp` 自体の meta-test。PR 5b 着手前に再確認、必要なら本 PR で同梱 or 別 follow-up PR に分離

## PR 1 / PR 1.5 / PR 2 / PR 3 / PR 4 / PR #278 (infra) / PR 5a follow-up issue 処理タイミング表

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
| [#284](https://github.com/fumtas1k/devtools/issues/284) | ラベル最小幅 `min-w-10` の集約検討 (`.label-prefix` 専用 class 化)                         | **PR 5b / PR 6 で類似 pattern 確認**            | PR 5a (#283) self-review NIT #1。出なければ close、blocking なし                                                                                        |
| [#285](https://github.com/fumtas1k/devtools/issues/285) | カメラボタン等の utility 列挙を `.btn-action--*-fill` variant に集約検討                   | **PR 5b / PR 6 で類似 pattern 確認**            | PR 5a (#283) self-review NIT #2。`bg-error-tint` 派 danger fill の新 variant 必要、出なければ close                                                     |
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
- [ ] `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array を `await glob('src/components/**/*.tsx')` 等で全件カバー化 — glob 化後は `MIGRATED_FILES` array 自体は不要となるため **削除する** (PR 1〜5b で漸進的に array 追加してきたものを glob 一本に置換、二重管理を避ける)
- [ ] `src/utils/__tests__/headers.test.ts` を strict 化（`'unsafe-inline'` 不在を陽性 assert）
- [ ] `src/utils/__tests__/meta-csp.test.ts` の `style-src 不在 assert` を `style-src strict 形式 assert` に変更
- [ ] `src/utils/__tests__/astro-config-csp.test.ts` から `stripMetaStyleSrc` 呼び出し assert 削除
- [ ] **PR 6 着手前に issue [#262](https://github.com/fumtas1k/devtools/issues/262) を close** — generator ページ (ulid-generator / uuid-v7) に `applyProductionCsp(page)` E2E gate を追加する。PR 1.5 で `setProperty('--var', value)` パターンを導入したため、CSP strict 化（`'unsafe-inline'` 削除）後に violation を能動検出する E2E が必要。VRT は pixel diff のみで CSP 違反を silent pass しうるため、本 issue 完了が PR 6 の前段必須条件。Claude memory `feedback_prod_parity_csp.md` 参照。
- [ ] **`docs/decisions.md` に [067] エントリ追加**（B 案完了の記録、PR 1〜6 のシリーズ依存図 + 各 PR で何を達成したかのサマリ）— PR 1 (#256) の reviewer I-3 で defer 容認、PR 6 で一括記録の約束
- [ ] visual regression baseline が flip 後の CSP で再撮影されている（CI Linux runner）
- [ ] PR description に「`#176` B 案完了」を明記、関連 PR (#249/#254/#256/#261/#272/PR 3-5) を全 link
- [ ] `grep -c "style={{" src/` = **0** を最終確認
- [ ] 全 E2E + 全 unit + astro check pass
- [ ] PR 1 (#256) / PR 1.5 (#261) / PR 2 (#272) / PR 3 (#275) / PR 4 (#277) / 前段 infra PR (#278) / PR 5a (#283) / PR 5b (#286) の follow-up 系 issue のうち PR 6 で同時対応するものがあれば close、後続するものは PR 6 description で言及。
  - PR 1 由来: #257-#260
  - PR 1.5 由来: [#262](https://github.com/fumtas1k/devtools/issues/262) (CSP gate / **PR 5b (#286) で close 済**、PR 3 で uuid-v7 partial 対応 + PR 5b で ulid-generator 完了で generator 全体 gate 完成) / [#263](https://github.com/fumtas1k/devtools/issues/263) (aria-selected ARIA spec) / [#264](https://github.com/fumtas1k/devtools/issues/264) (キーボード操作 WCAG 2.1.1) / [#265](https://github.com/fumtas1k/devtools/issues/265) (useEffect deps anti-pattern, ✅ closed) / [#266](https://github.com/fumtas1k/devtools/issues/266) (width JSDoc origin discipline, ✅ closed)
  - PR 2 由来: [#273](https://github.com/fumtas1k/devtools/issues/273) (`AbortSignal.any` 化、`useTicketVerification.verify` external signal link 改善)
  - PR 3 由来: [#276](https://github.com/fumtas1k/devtools/issues/276) (`withProductionCsp` ラッパ helper、✅ closed PR [#278](https://github.com/fumtas1k/devtools/pull/278))
  - PR #278 由来: [#279](https://github.com/fumtas1k/devtools/issues/279) (waitForReactHydration label-aware 拡張、event 駆動) / [#280](https://github.com/fumtas1k/devtools/issues/280) (withProductionCsp options 拡張、YAGNI) / [#281](https://github.com/fumtas1k/devtools/issues/281) (withProductionCsp 自体の meta-test、**PR 5b 完了 — 後続 PR or #280 着手時に併設候補**)
  - PR 5a (#283) 由来: [#284](https://github.com/fumtas1k/devtools/issues/284) (`min-w-10` 集約検討、`.label-prefix` 専用 class 化、**PR 6 で類似 pattern 確認、出なければ close**) / [#285](https://github.com/fumtas1k/devtools/issues/285) (カメラボタン等の utility 列挙を `.btn-action--*-fill` variant に集約検討、**PR 6 で類似 pattern 確認、出なければ close**)
  - PR 5b (#286) 由来: 新規 follow-up issue 起票なし (新規 class ゼロ + 既存 pattern 流用のため、追加検討事項なし)
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
