# `#176` B 案 PR 9 follow-up — `#309` (FOUC option A) / `#308` (sheet 再利用) decision メモ化 design

**作成日**: 2026-05-08
**対象 issue**: [#309](https://github.com/fumtas1k/devtools/issues/309) (close 予定) / [#308](https://github.com/fumtas1k/devtools/issues/308) (open 維持)
**親プロジェクト**: `#176` B 案 (`docs/projects/issue-176-b-plan-progress.md`)
**前段**: PR 9 ([#307](https://github.com/fumtas1k/devtools/pull/307), merged `52d6ef3`) — ResultTable + ToggleGroup `setProperty` を Constructable Stylesheets 化
**後段**: PR 10 ([#305](https://github.com/fumtas1k/devtools/issues/305)) — B 案最終 flip (`_headers` / `<meta>` strict 化)

## 1. 目的

PR 9 で導入した `useDynamicStyleSheet` hook 経路に関する 2 件の follow-up issue について、**PR 10 着手前に decision を memo 化** し、PR 10 spec 起草時に既決事項として参照できる状態にする。

実装変更は最小限 (JSDoc 1 箇所 + decisions.md 追記 + SoT 更新) の **decision-only PR**。

## 2. 背景

PR 9 で `ResultTable.tsx` / `ToggleGroup.tsx` の `el.style.setProperty(...)` を `useDynamicStyleSheet` 経由 Constructable Stylesheets に refactor 完了 (CSP3 `style-src` strict 化と互換)。merge 後の review で 2 件の指摘が follow-up issue として起票された:

- `#309`: SSR HTML → hydration 1 frame 間の dynamic style FOUC (`useEffect` 内 attach の本質的特性)
- `#308`: rules 変更ごとの `new CSSStyleSheet()` 生成と `adoptedStyleSheets` filter cleanup が Constructable Stylesheets API の設計意図 (in-place `replaceSync`) と非整合

両 issue とも PR 10 (B 案最終 flip) 着手前に「許容方針 / 実装方針」の確定が望ましい:

- `#309` → strict 化後 VRT diff に出る可能性、事前に許容方針を decision メモ化しておくと PR 10 review が楽になる
- `#308` → PR 10 のスコープ判断 (実装するか / しないか) が楽になる

## 3. 確定した方針 (brainstorming 合意)

### 3.1 `#309` ResultTable FOUC → **option A 採用 (現状容認 + JSDoc 明記)**

**仕組み**: `useDynamicStyleSheet` は `useEffect` 内で `document.adoptedStyleSheets` に attach するため、SSR HTML → hydration 1 frame だけ `min-width` / `width` 未適用 (column auto-width)。

**選定理由**:

1. **callsite 影響軽微**: `ResultTable` callsite は `UuidV7Generator` (minWidth=42rem) と `UlidGenerator` (minWidth=36rem) の 2 箇所のみ。すべて hard-coded literal で props 動的変化なし → FOUC は「初回画面の 1 frame」限定
2. **代表値 fallback 不在**: callsite ごとに `min-width` が異なる (36rem / 42rem) ため、`global.css` に「型代表値」を 1 つ復元する option B は原理的に必ずどちらかの callsite と乖離 (option B は ToggleGroup の `var(--toggle-cols, 2)` のような dimensionless 整数とは性質が異なる)
3. **VRT 影響なし**: PR 10 の VRT は `toHaveScreenshot` が networkidle + hydration 後撮影のため FOUC frame を捕捉しない
4. **CSP 互換性**: option C (SSR `style="..."` 属性経路) は CSP3 strict 化と非互換 → 採用不可

**対応**:

- `src/hooks/useDynamicStyleSheet.ts` の JSDoc に FOUC expected behavior を明記 (本 PR)
- `docs/decisions.md [067]` PR 9 outcome 末尾に "Follow-up decisions" subsection を追記し本 decision を記録
- issue `#309` を close (本 PR description に `Closes #309`)

### 3.2 `#308` useDynamicStyleSheet sheet 再利用最適化 → **(ii) 実装見送り、decision メモのみ**

**現状**: rules 変更ごとに `new CSSStyleSheet()` + `adoptedStyleSheets` filter cleanup。Constructable Stylesheets API は本来 sheet を retain して `replaceSync(newRules)` で in-place 更新できる設計。

**選定理由**:

1. **実害ゼロ**: 現 callsite (`ResultTable` / `ToggleGroup`) は rules 変化頻度ほぼゼロ (props で columns / minWidth が変わるユースケースなし) → 最適化 ROI 低い
2. **YAGNI**: 将来 dynamic な rules 利用が出た時に再評価で十分
3. **API 非整合は事実**: 設計意図との乖離は認識しているが、close せず future enhancement として記録 → 必要時に再起票するより issue 上の context を残す方が早い

**対応**:

- `docs/decisions.md [067]` Follow-up decisions に本 decision を記録 (実装見送りの根拠 + 再評価条件)
- issue `#308` は **open のまま** (future enhancement として残置)
- 本 PR では実装変更なし

## 4. PR スコープ

### 4.1 触るファイル

| ファイル                                     | 変更                                                                                         | 行数 (想定) |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| `src/hooks/useDynamicStyleSheet.ts`          | JSDoc に FOUC expected behavior + `decisions.md [067] Follow-up` 参照を追記                  | +5〜7       |
| `docs/decisions.md`                          | `[067]` PR 9 outcome 末尾に "Follow-up decisions (PR 10 着手前、2026-05-08)" subsection 追加 | +25〜30     |
| `docs/projects/issue-176-b-plan-progress.md` | PR 9 entry に follow-up 1 行追加 + PR 10 memo に「FOUC 許容方針確定済」反映                  | +2〜3       |

### 4.2 触らないファイル (明示)

- `src/components/ui/ResultTable.tsx` — 既存 JSDoc は `[067]` / PR 9 spec を参照済、hook 側に集約するため component 側は無変更
- `src/styles/global.css` — option A 採用、fallback 復元せず
- `src/hooks/__tests__/useDynamicStyleSheet.test.tsx` — behavioral 変更なし、test 追加不要
- `src/components/ui/ToggleGroup.tsx` — `useDynamicStyleSheet` 経路、JSDoc 集約により component 側無変更

### 4.3 commit 構成

**1 commit** で完結 (高凝集、分割不要):

```
chore(docs): #176 B 案 PR 9 follow-up — #309 (FOUC option A) / #308 (sheet 再利用) decision メモ化 + JSDoc 補強

- src/hooks/useDynamicStyleSheet.ts: FOUC expected behavior を JSDoc に明記
- docs/decisions.md [067]: Follow-up decisions (PR 10 着手前) subsection 追加
- docs/projects/issue-176-b-plan-progress.md: PR 9 entry / PR 10 memo に follow-up 反映

Closes #309
Refs #308 (open 維持、future enhancement)
```

`chore(docs):` type は直近の SoT 更新 PR (`ad698a5` / `68c58b5`) と整合。

## 5. 実装詳細

### 5.1 `src/hooks/useDynamicStyleSheet.ts` JSDoc 改修

**現状の JSDoc 抜粋** (line 10-12):

```ts
 * SSR-safe: `useId()` ベースで stable な class 名を返すため SSR / CSR で
 * markup mismatch しない。`adoptedStyleSheets` への attach は `useEffect`
 * 内で行うため client-side のみ実行される。
```

**追記後** (新規追加部分のみ):

```ts
 * SSR HTML → hydration 1 frame は dynamic style 未適用 (FOUC)。callsite が
 * hard-coded literal (例: ResultTable の minWidth='42rem') の場合は許容方針
 * (`docs/decisions.md [067] Follow-up decisions` 参照、option A)。callsite が
 * user input 経由 / props 動的変化を持つ場合は別途検討が必要。
```

### 5.2 `docs/decisions.md [067]` Follow-up decisions subsection

**追記場所**: `[067]` entry 末尾 (現 line 2545 「起源: `#176` B 案 PR 1.5...」の直前)

**追記内容** (full text):

```markdown
### Follow-up decisions (PR 10 着手前、2026-05-08)

PR 9 merge 後の review で 2 件の follow-up issue が起票され、PR 10 着手前に方針を確定した。

#### #309 ResultTable FOUC → option A (現状容認)

**現象**: `useDynamicStyleSheet` は `useEffect` 内で `adoptedStyleSheets` に attach するため、SSR HTML → hydration 1 frame だけ dynamic style 未適用 (`min-width` / `width` が auto)。

**評価した解**:

| 案  | 仕組み                                   | 採否                                       |
| --- | ---------------------------------------- | ------------------------------------------ |
| A   | 現状容認 + JSDoc 明記                    | ✅ **採用**                                |
| B   | `global.css` に「型代表値」fallback 復元 | 不採用 (callsite 固有値で代表値原理的不在) |
| C   | SSR `style="..."` 属性経路 (Astro hash)  | 不採用 (CSP3 strict 化と非互換)            |

**A 採用根拠**:

- callsite 2 箇所 (`UuidV7Generator` / `UlidGenerator`) すべて hard-coded literal、props 動的変化なし
- ToggleGroup `var(--toggle-cols, 2)` の dimensionless 整数 fallback とは異なり、ResultTable の `min-width` / `width` は callsite 固有値 (36rem / 42rem) で 1 つの代表値が原理的に存在しない
- PR 10 VRT は networkidle + hydration 後撮影 → FOUC frame は捕捉しない

**対応**: `useDynamicStyleSheet.ts` JSDoc に FOUC expected behavior 明記、issue `#309` を close。

#### #308 useDynamicStyleSheet sheet 再利用最適化 → (ii) 実装見送り

**現状**: rules 変更ごとに `new CSSStyleSheet()` 生成、cleanup で `adoptedStyleSheets` を filter 走査して取り外す。

**API 設計意図との乖離**: Constructable Stylesheets API は本来 sheet を retain して `replaceSync(newRules)` で in-place 更新できる設計。`useRef<CSSStyleSheet>` で sheet 保持 → 初回のみ attach、以降 `replaceSync` のみで更新の最適化が可能。

**評価**:

| 案                                 | 採否                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| (i) 今 PR で `useRef` 化実装       | 不採用 (rules 変化頻度ゼロで実害なし、YAGNI)                                      |
| (ii) decision メモのみ、実装見送り | ✅ **採用**                                                                       |
| (iii) close as won't-fix           | 不採用 (将来 dynamic rules 利用時に再起票より open 維持の方が context 保全に優位) |

**(ii) 採用根拠**:

- 現 callsite (`ResultTable` / `ToggleGroup`) は rules 変化頻度ほぼゼロ (props で columns / minWidth が変わるユースケースなし) → 最適化 ROI 低い
- API 非整合は事実だが、将来 dynamic な rules 利用が出た時に再評価で十分

**再評価条件**: `useDynamicStyleSheet` callsite で props に応じて rules が頻繁に変化するユースケースが追加された時 / `adoptedStyleSheets` 配列が観測可能なほど肥大化した時。

**対応**: 本 entry に decision 記録、issue `#308` は **open のまま** (future enhancement として残置)、本 PR では実装変更なし。
```

### 5.3 `docs/projects/issue-176-b-plan-progress.md` 更新

**変更箇所 1**: PR 9 entry (line 121-130) の末尾に follow-up 1 行追加:

```markdown
- **PR 9 follow-up (本 PR、`#312` の後続)**: `#309` (FOUC option A) close / `#308` (sheet 再利用) open 維持、`docs/decisions.md [067] Follow-up decisions` で記録
```

**変更箇所 2**: PR 10 entry (line 132-140) の前提リストに 1 行追加:

```markdown
- **前提**: PR 9 完了 (ResultTable refactor merge) + PR 9 follow-up decision メモ化済 (`#309` close / `#308` 方針確定)
```

## 6. 検証

| 項目      | 方法                      | 期待                                                                                                          |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 型検査    | 親直接 `astro check`      | 型変更なし → pass                                                                                             |
| unit test | 親直接 `npm run test`     | behavioral change ゼロ → pass (既存 `useDynamicStyleSheet` test 5 件すべて pass)                              |
| E2E       | 親直接 `npm run test:e2e` | behavioral change ゼロ → pass (PR 9 で導入した `csp-constructable-stylesheet.spec.ts` 永続検出網にも違反なし) |
| VRT       | CI Linux runner           | diff ゼロ (本 PR は doc + JSDoc のみ、レンダリング変更なし)                                                   |

## 7. 検証スコープ外

- `useRef` 化の挙動検証 — 本 PR では実装しないため不要
- `option B` の fallback 復元による FOUC 軽減効果検証 — option B 不採用のため不要

## 8. branch / PR 命名

- branch: `chore/issue-309-pr9-followup-decisions`
- PR title: `chore(docs): #176 B 案 PR 9 follow-up — #309 (FOUC option A) / #308 (sheet 再利用) decision メモ化 + JSDoc 補強`
- base: `develop` (`gh pr create --base develop` 明示、CLAUDE.md 必須)
- body: `--body-file /tmp/claude/pr_body.md` 経由 (CLAUDE.md 必須、バックティック化け事故防止)
- 言語: タイトル・本文すべて日本語

## 9. リスクと緩和

| リスク                                                            | 対応                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSDoc 表現が将来の callsite で誤解を生む (例: dynamic rules 利用) | JSDoc に「callsite が hard-coded literal の場合は許容、props 動的変化を持つ場合は別途検討」を明記                                                          |
| `decisions.md [067]` が長大化して読みづらい                       | Follow-up decisions を独立 subsection 化、見出しで明確に区切る                                                                                             |
| PR 10 spec 起草時に本 decision を見落とす                         | `docs/projects/issue-176-b-plan-progress.md` PR 10 entry の前提リストに「PR 9 follow-up decision メモ化済」を明記し、PR 10 spec 起草時の必読リストに含める |

## 10. 後段への引き継ぎ

PR 10 spec 起草時に参照する事項:

- 本 decision は `docs/decisions.md [067] Follow-up decisions` に集約済
- PR 10 で `_headers` strict 化後の VRT diff に **FOUC frame は含まれない** (本 decision で確認済) → VRT diff が出た場合は別原因 (Astro island runtime style hash 等、`[067]` PR 9 outcome 末尾参照) を調査
- `#308` は open 維持 → PR 10 では touch しない、将来 dynamic rules 利用が追加された時に再評価

## 11. 規模感

- 想定 diff: ~30 行 (decisions.md +25, useDynamicStyleSheet.ts JSDoc +5, SoT +2)
- commit 数: 1
- 工数: spec → plan → 実装 → 親直接 verify → PR 作成 で 30〜45 分想定 (subagent 委譲不要、親直接実装)
