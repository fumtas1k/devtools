# `#176` B 案 PR 10 — `style-src` strict 化最終 flip + Astro island hash 取り込み design

**作成日**: 2026-05-09
**対象 issue**: [#305](https://github.com/fumtas1k/devtools/issues/305) (B 案最終 flip) / `#176` (close 予定)
**親プロジェクト**: `#176` B 案 (`docs/projects/issue-176-b-plan-progress.md`)
**前段**: PR 9 ([#307](https://github.com/fumtas1k/devtools/pull/307), merged `52d6ef3`) — ResultTable + ToggleGroup `setProperty` Constructable Stylesheets 化 / PR 9 follow-up ([#313](https://github.com/fumtas1k/devtools/pull/313), merged `55550ff`) — `#309` / `#308` decision メモ化
**backup**: `backup/pr8-full-original` (PR 8 から rebase で削除した 3 commit を保全)

## 1. 目的

`#176` B 案 PR 1〜9 で完了した内容を最終 flip する:

- `_headers` (HTTP) と `<meta>` (Astro 自動注入) の **両層** で `style-src 'unsafe-inline'` 完全除去
- 両層を strict (`'self'` + 必要 hash のみ) 化することで XSS 緩和の defense-in-depth を確立
- `#176` の goal「両層 strict 化」を完走し issue close

PR 9 Phase 2 で発覚した **Astro island runtime style hash の取り込み** も本 PR で解決する (PR 10 申し送り事項、`docs/decisions.md [067]` PR 9 outcome 末尾参照)。

## 2. 戦略

### 2.1 Astro island hash 取り込み: handcoded fingerprint (option α)

Astro 島ランタイムが各ページに injection する固定 inline style (single-line minified):

```text
<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
```

(prettier 等のフォーマッタで multi-line 化すると **byte 列が変わり sha256 が崩れる**ので literal text として保存する。本 spec の `text` 言語指定はこの保護のため意図的)

の sha256 hash `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=` を `_headers` と `csp.ts` の `style-src` directive に hardcode する。Astro 側が当該 inline style 文字列を変更しない限り stable。

**評価した解** (詳細は `docs/decisions.md [068]` 予定):

| 案  | 仕組み                                  | 採否        |
| --- | --------------------------------------- | ----------- |
| α   | handcoded fingerprint + 検出網          | ✅ **採用** |
| β   | `astro:build:done` hook で自動抽出      | 不採用      |
| γ   | `_headers` permissive 維持、meta strict | 不採用      |

**α 採用根拠**:

- 取り込む hash は 1 個 (Astro が変えない限り stable)、β の 80-150 行 hook 実装は overkill
- γ は `_headers` permissive を維持するため、`<meta>` が壊れた状況 (Astro `security.csp` integration の bug / 設定ミス / build hook 失敗 / 仕様変更) で `_headers` 単独が permissive な fallback policy のみで動くと XSS 緩和の最終防衛ラインが緩い → `#176` B 案 goal「両層 strict 化」と矛盾
- α の運用コスト「Astro 更新で hash 変わると CI fail」は検出網で能動検知できるため silent regression にならない

### 2.2 PR 構造: 1 PR 完結

A (PR 8 backup 3 commit 再投入) + B (Astro hash 取り込み) + C (`[068]` 完了記録) + D (SoT 完了反映) を **1 PR / 5 commit / ~250 行** で完結。

memory `feedback_pr_size.md` の閾値 (10 commit / 500 行で分割検討) 内で素直に収まる規模。A と B は同期 commit が必須 (片方だけ merge すると本番 CSP が壊れる)、C は完了記録ゆえ core PR と同 timing が意味的に自然。

### 2.3 実装方針: 親直接実装

- 親 Opus 直接実装 (memory `feedback_subagent_verification_trust.md` 準拠、CSP flip は高 stakes)
- backup `pr8-full-original` の commit はそのまま cherry-pick できない (PR 9 で前提が変わったため)、内容を参考に手動再実装

## 3. 各 commit の詳細スコープ

### 3.1 Commit 1: `refactor(csp)` — `_headers` / `csp.ts` strict 化 + Astro hash 追加

| ファイル           | 変更                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `public/_headers`  | `style-src 'self' 'unsafe-inline'` → `style-src 'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='` |
| `src/utils/csp.ts` | `PRODUCTION_CSP` の `style-src` を上記と完全同期                                                              |

backup `e7ae9ff` (+2 -2) を Astro hash 追加分 upgrade。本 commit 単独では `headers.test.ts` の strict assertion が新規追加されるが、commit 3 で完成。

### 3.2 Commit 2: `refactor(csp)` — `stripMetaStyleSrc()` integration 撤去

| ファイル           | 変更                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `astro.config.mjs` | `stripMetaStyleSrc()` 関数定義 (line 9-85)、integrations 配列 entry (line 89)、関連 import (`readFileSync` / `writeFileSync` / `fileURLToPath` / `glob`) を削除 |

backup `1392831` (+1 -82) 相当をほぼそのまま再投入。本 commit 後、`<meta>` CSP は Astro `security.csp` で hash 付き strict 形式 (`style-src 'self' 'sha256-...'`) に自動切替。

### 3.3 Commit 3: `test(csp)` — test 群 strict 化 + Astro hash 検出網

| ファイル                   | 変更                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headers.test.ts`          | `'unsafe-inline'` 不在を陽性 assert + Astro hash (`sha256-vv9I...`) 存在 assert                                                                     |
| `meta-csp.test.ts`         | `<meta>` 側 `style-src` 不在 assert を strict 形式 (`'self' 'sha256-...'`) assert に反転 + 「dist HTML に Astro inline style が含まれる」検出網追加 |
| `astro-config-csp.test.ts` | `stripMetaStyleSrc` 関連 2 ブロック削除、JSDoc を `[068]` 参照に置換                                                                                |

**新規検出網の構造** (`meta-csp.test.ts` 拡張):

- 検出 1: dist HTML 内に literal string `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>` が含まれること
- 検出 2: `_headers` の style-src directive に `'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='` が含まれること
- 検出 1 と 2 の整合性: Astro が inline style を変えると検出 1 が更新され、`_headers` の hash 値も更新する必要があるという不変条件を documentation で明記

`feedback_positive_control_for_gates.md` 準拠で**陽性対照メタテスト**を追加: hash を意図的に 1 文字書き換えた場合に検出 2 が fail することを手動 1 回確認 (本 PR の検証 step で実施)。

### 3.4 Commit 4: `docs(decisions)` — `[068]` B 案完了記録

`docs/decisions.md` に `[068]` を追加 (~80-100 行)。内容構成:

1. **背景**: `#176` B 案の goal とこれまでの PR 1〜9 series の概観
2. **B 案 PR 1〜10 series の依存図**: 各 PR の達成サマリ + merge hash + close した issue 一覧
3. **本 PR (PR 10) で達成した事項**: 両層 strict 化 / `stripMetaStyleSrc` 撤去 / Astro hash 取り込み / 検出網拡張
4. **削除した暫定 infra**: `stripMetaStyleSrc` / `MIGRATED_FILES` array (PR 6 で glob 化済) / `applyStrictStyleSrcCsp` helper (本 PR で `applyProductionCsp` 自体が strict 化のため不要化、削除は別 cleanup PR 候補)
5. **Astro island hash 取り込みの設計選定**: α 採用、β/γ 不採用根拠
6. **設計判断 KEEP 記録**: `.text-primary` 命名 / Tailwind border + `@layer` 優先度 (PR 6 必須チェックリストの未消化分を本 entry で「現状維持」と確定)
7. **検出網運用ノート**: `inline-style-migration.test.ts` (glob) / `applyProductionCsp(page)` E2E gate / Phase 0 spec (`csp-constructable-stylesheet.spec.ts`) / 本 PR の Astro hash 検出網
8. **関連 PR / issue**: PR 0〜10 全 link、`#176` close
9. **Lessons learned**: PR 8 で発覚した setProperty CSP3 制約 / PR 9 Phase 2 で発覚した Astro island hash の必要性 / 各 PR で確立した運用パターン (subagent 非 commit / parent 直接 / E2E gate / etc)

### 3.5 Commit 5: `docs(projects)` — SoT 完了反映

`docs/projects/issue-176-b-plan-progress.md`:

- 進捗 table の **PR 10 行** を `未着手` → `✅ merged` に更新 (merge hash は本 PR merge 後の chore PR で別途反映、本 commit では `merged ` placeholder)
- 末尾に **「B 案完了」セクション** を新設:
  - `#176` close 言及
  - PR 0〜10 series 完走サマリ (B 案 4 ヶ月運用の振り返り、合計移行件数、削除した暫定 infra 一覧)
  - 後続 follow-up issue (cleanup PR 候補 / Astro hash 自動化検討 / 等) のリンク

## 4. 検証戦略

### 4.1 検証項目

| 項目                  | 方法                                                 | 期待                                                                    |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| 型検査                | 親直接 `astro check`                                 | 既存と同等 (warnings 増加ゼロ)                                          |
| unit test             | 親直接 `npm run test`                                | 全 pass (新規 strict assert + 検出網含む)                               |
| build                 | 親直接 `npm run build`                               | dist 生成成功、`<meta>` に hash 付き strict CSP                         |
| E2E (production CSP)  | 親直接 `npm run test:e2e`                            | violation ゼロ、`csp-constructable-stylesheet.spec.ts` 含む全 spec pass |
| E2E (strict CSP gate) | 13 ツール spec で `applyProductionCsp(page)`         | 12 ツール経路で violation ゼロ (PR 9 Phase 2 申し送り事項解消)          |
| VRT                   | CI Linux runner                                      | diff ゼロ                                                               |
| 検出網メタテスト      | hash 1 文字書換 → test fail → 戻す → pass を手動確認 | 陽性対照として hash mismatch を捕捉できること                           |

### 4.2 検証順序

1. 各 commit ごとに `astro check` + `npm run test` を実行 (commit 単位で red→green の遷移を意図通り確認)
2. 全 commit 完了後に `npm run build` + `npm run test:e2e` を親直接で 1 回
3. push 前に検出網メタテストを手動 1 回 (commit 3 完了直後)

### 4.3 高 stakes ゆえの予防策

- **Phase 0 minimal repro 永続検出**: `tests/e2e/csp-constructable-stylesheet.spec.ts` が現状 `useDynamicStyleSheet` 経路の strict CSP 互換を陽性 / 陰性対照で検証している。本 PR 後も pass し続けることを最終 E2E で確認
- **Phase 2 申し送り経路の解消確認**: PR 9 outcome で発覚した「13 ツール spec で `vv9I...` block」が本 PR の hash 取り込みで解消することを `applyProductionCsp` gate で確認
- **rollback 計画**: 万一本番で違反が出た場合、`_headers` の `'unsafe-inline'` を即座に書き戻す revert PR を発行 (Cloudflare Pages の deploy 自動化で revert merge 後 1-2 分で復旧可)

## 5. スコープ外 / 触らないファイル

### 5.1 明示的にスコープ外

| ファイル / 領域                                         | 理由                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/hooks/useDynamicStyleSheet.ts`                     | PR 9 + PR 9 follow-up で完成、本 PR で touch 不要                                   |
| `src/components/ui/ResultTable.tsx` / `ToggleGroup.tsx` | PR 9 で完成                                                                         |
| `src/utils/__tests__/inline-style-migration.test.ts`    | PR 8 で Astro glob 化済、PR 9 で `setProperty` 除外撤去済                           |
| `tests/e2e/csp-constructable-stylesheet.spec.ts`        | PR 9 で永続検出網として確立                                                         |
| `tests/e2e/helpers.ts` の `applyStrictStyleSrcCsp`      | 本 PR で `applyProductionCsp` 自体が strict 化のため不要化、**削除は別 cleanup PR** |

### 5.2 follow-up 候補

| 内容                                                      | 理由                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `applyStrictStyleSrcCsp` helper の削除                    | 本 PR で不要化、独立 cleanup PR が妥当 (memory `feedback_infra_feature_separation.md`) |
| `.text-primary` 命名衝突 / Tailwind border 優先度の再評価 | `[068]` で「KEEP」と記録、再評価が必要なら別 issue 起票                                |
| PR 10 merge hash 反映 chore PR                            | merge 後に SoT に hash 反映 (`ad698a5` / `5faa9f4` パターン)                           |
| Astro island hash の自動抽出検討 (β 選択肢)               | α が長期的に保守コスト懸念になった場合の future enhancement、issue 起票候補            |

## 6. リスクと緩和

| リスク                                                          | 緩和                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Astro 更新で inline style 文字列変化 → hash mismatch で本番崩壊 | 検出網が CI で fail させる (silent regression にならない) / Astro version pin 運用 / dependabot で更新時 review 必須 |
| `<meta>` strict 化で未発見の inline style 経路が顕在化          | E2E (`applyProductionCsp` 全ツール gate) で検知、PR 9 Phase 2 で 13 ツール走査済 (1 経路 = `vv9I...` 解消で完了想定) |
| build hook の暗黙依存削除で予期せぬ影響                         | `astro-config-csp.test.ts` で `security.csp.algorithm` 設定維持 + `assetsInlineLimit: 0` 維持を陽性 assert (継続)    |
| VRT diff 発生 (CSP 経路変更で paint timing 変わる可能性)        | CI VRT で検知、diff が出たら baseline 更新 vs regression を判別                                                      |
| commit 順序ミスで E2E が中間状態で red になる                   | commit 1 → 2 → 3 の順で test red→green を意図的に通す (commit message Note: で明示、PR 8 backup commits と同様)      |

## 7. branch / commit / PR 命名

- branch: `feature/issue-176-b10-final-flip`
- PR title: `refactor(csp): #176 B 案 PR 10 — style-src strict 化最終 flip + Astro island hash 取り込み + B 案完了記録 ([068])`
- base: `develop` (CLAUDE.md 必須、`gh pr create --base develop`)
- body: `--body-file /tmp/claude/pr_body.md` 経由 (CLAUDE.md 必須)
- 言語: タイトル・本文すべて日本語

### 7.1 commit message 例

#### Commit 1

```
refactor(csp): #176 B 案 PR 10 (1/5) — _headers / csp.ts style-src strict 化

- public/_headers: style-src 'self' 'unsafe-inline' → 'self' 'sha256-vv9I...'
- src/utils/csp.ts: PRODUCTION_CSP 同期更新

Astro island runtime が injection する inline style:
<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
の sha256 (vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=) を取り込む。
Astro が当該 inline style 文字列を変更しない限り stable な fingerprint。

Note: headers.test.ts の strict assert は本 PR commit 3 で実施。本 commit
単独では test が新規 assert 不在で red (commit 3 で green に戻る)。
```

#### Commit 2

```
refactor(csp): #176 B 案 PR 10 (2/5) — stripMetaStyleSrc 暫定 integration 撤去

- astro.config.mjs: stripMetaStyleSrc 関数定義 + integrations 配列 entry
  + 関連 import (readFileSync/writeFileSync/fileURLToPath/glob) 削除

#176 A-1 [064] で導入した暫定 integration。CSP3 仕様で hash と 'unsafe-inline'
共存時にブラウザが unsafe-inline を無視する制約により、<meta> から style-src
を除いて header 側の 'unsafe-inline' のみで制御する設計だった。

PR 1〜9 で React style={{}} と Astro inline style を全廃 + PR 9 で setProperty
経路を Constructable Stylesheets 化したことで、<meta> 側でも style-src を
hash + 'self' の strict 形式で生成して safe になった。

Note: meta-csp.test.ts / astro-config-csp.test.ts の test 反転は本 PR commit 3
で実施。本 commit 単独では test red。
```

#### Commit 3

```
test(csp): #176 B 案 PR 10 (3/5) — test 群 strict 化 + Astro hash 検出網

- headers.test.ts: style-src 'unsafe-inline' 不在 + Astro hash 存在を陽性 assert
- meta-csp.test.ts: <meta> 側 style-src 不在 → strict 形式 ('self' 'sha256-...')
  assert に反転 + dist HTML 内 Astro inline style 検出網追加 + _headers との
  hash 整合性 assert
- astro-config-csp.test.ts: stripMetaStyleSrc 関連 2 ブロック削除、
  JSDoc を [068] 参照に置換

陽性対照メタテストとして「hash 1 文字書換 → test fail」を本 PR 検証 step で
手動確認済 (silent pass しないことの保証)。
```

#### Commit 4

```
docs(decisions): #176 B 案 PR 10 (4/5) — [068] B 案完了記録

style-src 'unsafe-inline' 削除と B 案 (PR 1〜10) 完了の design decision
を記録。

- B 案 PR 1〜10 series の依存図 + 各 PR の達成サマリ
- 削除した暫定 infra (stripMetaStyleSrc / MIGRATED_FILES array)
- Astro island hash 取り込みの設計選定 (α handcoded、β/γ 不採用根拠)
- 設計判断 KEEP 記録 (.text-primary 命名 / Tailwind border + @layer 優先度)
- 検出網運用ノート (inline-style-migration glob / applyProductionCsp gate
  / Phase 0 spec / 本 PR の Astro hash 検出網)
- 関連 PR / issue (PR 0〜10 全 link、#176 close)
- Lessons learned (setProperty CSP3 制約 / Astro island hash の必要性)

PR 1 (#256) reviewer I-3 で defer 容認、PR 6 → PR 8 → PR 10 へ持ち越されていた
B 案完了記録の約束を消化。
```

#### Commit 5

```
docs(projects): #176 B 案 PR 10 (5/5) — SoT 進捗 table 完了状態に同期

- 進捗 table の PR 10 行を ✅ merged 化 (merge hash は本 PR merge 後の
  chore PR で別途反映)
- 末尾に「B 案完了」セクションを新設 (#176 close 言及、PR 0〜10 完走
  サマリ、follow-up issue リンク)
```

## 8. 規模感

- 想定 diff: ~250 行 (commit 1: ~5、commit 2: ~80 削除、commit 3: ~60、commit 4: ~80-100、commit 5: ~10)
- commit 数: 5
- 工数: spec → plan → 実装 → 親直接 verify → PR 作成 で 90〜150 分想定 (E2E + build + メタテスト含む)
- subagent 委譲: なし (CSP flip は高 stakes、親直接実装)

## 9. PR 作成時の必須チェックリスト (CLAUDE.md / `pr-creation.md` 準拠)

- [ ] base: `develop` 明示 (`gh pr create --base develop`)
- [ ] body: `--body-file /tmp/claude/pr_body.md` 経由 (バックティック化け防止)
- [ ] pre-create check: `git merge-base origin/develop HEAD` 一致確認 + `git diff origin/develop --name-only` でスコープ確認 + aria-\* 削除なし確認
- [ ] 言語: タイトル・本文すべて日本語
- [ ] PR 本文: `Closes #176, #305` を明記
