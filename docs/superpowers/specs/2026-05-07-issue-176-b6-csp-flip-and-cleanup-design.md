# #176 B 案 PR 6: `style-src 'unsafe-inline'` 撤廃 + cleanup 設計書

> **⚠️ 実装中の設計前提誤り発覚 (2026-05-07 PR 6 実施時)**
>
> 本 spec は「PR 1〜5b で全 inline style 移行完了」を前提としていたが、PR 6 の `npm run test:e2e` 実行時に **Astro `<element style="...">` 属性 65 件 / 15 ファイル** が未移行で残存していたことが判明した (CSP `style-src 'self'` で 12 spec が CSP 違反 fail)。元の B 案 PR 1〜5b は React `style={{...}}` のみが対象で、Astro 側 inline style 属性は scope 外だった (本 spec §7.5 の glob 化議論でも「Astro `<style>` block は scoped CSS で hash 対象」と注釈していたが、`<element style="...">` 属性は scoped CSS とは別物で、CSP3 仕様で hash 対象外)。
>
> 対応として本 PR 6 は **scope を `styles.ts` 削除 + migration tracker glob 化のみに縮小** し、CSP flip / `stripMetaStyleSrc` 撤去 / `decisions.md [067]` は後続 PR (Astro inline migration → 最終 flip) に委譲する。
>
> - PR 6 で実施: `src/utils/styles.ts` 削除 + `inline-style-migration.test.ts` glob 化 (本 spec §7.4 / §7.5)
> - PR 6 で見送り: 本 spec §7.1 / §7.2 / §7.3 / §7.6 / §7.7 / §7.8 / §7.9 (CSP flip + test strict 化 + decisions [067])
> - 後続 PR: 別 issue で Astro inline 65 件 migration → その後最終 flip PR で本 spec §7.1〜§7.9 を実施
>
> 本 spec は historical record として残すが、§7.1〜§7.9 の §7.4 / §7.5 以外は **未実施**。PR 6 実施時の commit 履歴も `git log feature/issue-176-b6-csp-flip-and-cleanup` で確認可能 (Phase A flip commit `8ae383a` は revert 済)。

**作成日**: 2026-05-07
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 6 (B 案最終 PR)
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) + PR 1.5 ([#261](https://github.com/fumtas1k/devtools/pull/261)) + PR 2 ([#272](https://github.com/fumtas1k/devtools/pull/272)) + PR 3 ([#275](https://github.com/fumtas1k/devtools/pull/275)) + PR 4 ([#277](https://github.com/fumtas1k/devtools/pull/277)) + 前段 infra ([#278](https://github.com/fumtas1k/devtools/pull/278)) + PR 5a ([#283](https://github.com/fumtas1k/devtools/pull/283)) + PR 5b ([#286](https://github.com/fumtas1k/devtools/pull/286)) 完了済み
**参照**: バッチ計画全体は repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)。PR 1〜5b spec の命名規約を継承。本 PR で B 案シリーズの最終 flip を行い [067] エントリで一括記録する。

---

## ゴール

`#176` B 案の **最終 flip + cleanup PR**。PR 1〜5b で React `style={{...}}` 219+ 箇所と CSSOM 直接 mutation の全撤去を完了したため、本 PR で実際に `public/_headers` の `style-src` から `'unsafe-inline'` を削除し、A-1 ([#249]) で導入した暫定 strip integration と progressive migration tracker を撤去して B 案を終端する。

具体的に同時実施する 7 件:

1. **CSP flip**: `public/_headers` の `style-src 'self' 'unsafe-inline'` → `style-src 'self'` に置換。`src/utils/csp.ts:PRODUCTION_CSP` も同期。
2. **暫定 strip 撤去**: `astro.config.mjs` の `stripMetaStyleSrc()` integration と関数定義を削除 (Astro `security.csp` が auto-hash 化した `<meta>` CSP の `style-src` をそのまま strict layer として活かす)。
3. **進捗 tracker 撤去**: `src/utils/styles.ts` 削除 (現 import 元は `inline-style-migration.test.ts` のみ。次項と同時消滅)。
4. **migration test glob 化**: `inline-style-migration.test.ts` の `MIGRATED_FILES` array (31 件) を `await glob('src/components/**/*.tsx')` に置換し、全件カバー化と二重管理解消。
5. **CSP test strict 化**: `headers.test.ts` (`'unsafe-inline'` 不在 を陽性 assert) / `meta-csp.test.ts` (style-src strict 形式 assert に反転) / `astro-config-csp.test.ts` (`stripMetaStyleSrc` 関連 2 test 削除)。
6. **decisions.md [067] 追加**: B 案完了の記録。PR 1〜6 シリーズ依存図 + 各 PR 達成内容 + `@theme` 切替見送り判断 + `.text-primary` 命名衝突リスクの現状維持判断を含む。
7. **follow-up 整理**: PR 5a 由来 [#284](https://github.com/fumtas1k/devtools/issues/284) / [#285](https://github.com/fumtas1k/devtools/issues/285) を「PR 6 で類似 pattern 出ず」comment で close。

完了基準:

1. `public/_headers` の CSP に `'unsafe-inline'` が style-src で **存在しない** (script-src 側の `'unsafe-inline'` は [064] AND 評価設計に基づき意図的に維持)。
2. `src/utils/csp.ts:PRODUCTION_CSP` も `style-src 'self'` のみ (1 と完全一致、`headers.test.ts` の `expect(headerValue).toBe(PRODUCTION_CSP)` で交差検証)。
3. `astro.config.mjs` から `stripMetaStyleSrc` の関数定義と integration 呼出が **完全に消滅** (grep で 0 件)。
4. `src/utils/styles.ts` が削除され、`grep -r "from '@/utils/styles'" src/` が 0 件。
5. `inline-style-migration.test.ts` の `MIGRATED_FILES` array が削除され、glob ベースの全件カバーになっている (`describe.each` ループの入力が glob 結果)。
6. `headers.test.ts` / `meta-csp.test.ts` / `astro-config-csp.test.ts` の 3 ファイルが strict 化済 (詳細は §7.6〜7.8)。
7. `docs/decisions.md` 末尾に `[067]` エントリが追加され、B 案完了の記録が整理されている (詳細は §7.9)。
8. `grep -rn 'style={{' src/` = **0 件** (テスト内文字列を除く本コード上の inline style ゼロを最終確認)。
9. ローカル必須ゲート: `npm run build && npm run test` (vitest) / `npx astro check` / `npm run test:e2e` (build + preview ベース) が全 green。
10. CI: VRT (`visual-regression.yml`) が pass。pixel diff が出た場合は `update-visual-baseline.yml` を `workflow_dispatch` で trigger し baseline 更新 commit を同 PR に追加。
11. follow-up issue 処理: [#284](https://github.com/fumtas1k/devtools/issues/284) / [#285](https://github.com/fumtas1k/devtools/issues/285) が close 済 (PR 6 内で類似 pattern 出ず判定)。
12. 進捗 doc (`docs/projects/issue-176-b-plan-progress.md`) の PR 6 列を `✅ merged` に更新する commit を post-merge で chore PR or 同 PR 末尾で追加。

非ゴール:

- **`@theme` 切替**: PR 6 では実施しない (decisions.md [067] で「見送り、必要になれば独立 issue で判断」と明記)。`.text-primary` を含む命名衝突リスクは現状維持。
- **新規 CSS class 追加**: PR 1〜5b で全 migration が完了済のため本 PR では追加なし (むしろ削除側)。
- **[#281](https://github.com/fumtas1k/devtools/issues/281)** (`withProductionCsp` meta-test): 別 issue として残存 (PR 6 description で「post-#176 follow-up」として参照)。
- **[#273](https://github.com/fumtas1k/devtools/issues/273)** (`AbortSignal.any` 化): 別 issue として残存 (B 案直接 follow-up でないため)。
- **[#271](https://github.com/fumtas1k/devtools/issues/271)** (ESLint `react/button-has-type` + `index.astro` 残り 2 件): 別 issue として残存。
- **[#260](https://github.com/fumtas1k/devtools/issues/260)** (clsx 統一一括) / **[#119](https://github.com/fumtas1k/devtools/issues/119)** (`.text-link-color` 命名規則統一) / **[#257](https://github.com/fumtas1k/devtools/issues/257)** / **[#259](https://github.com/fumtas1k/devtools/issues/259)** / **[#263](https://github.com/fumtas1k/devtools/issues/263)** / **[#264](https://github.com/fumtas1k/devtools/issues/264)**: 全て別 issue として残存。
- **[#234](https://github.com/fumtas1k/devtools/issues/234)** (`applyProductionCsp` 全 19 spec 横展開): 残 17 spec は本 PR スコープ外 (B 案直接 follow-up でないため)。
- **VRT baseline の事前再撮影**: pixel diff が出ない想定 (CSS 出力は不変、CSP flip は browser policy のみの変更) のため事前撮影は行わず、CI 結果を見て diff 出れば `workflow_dispatch` trigger で対応。

---

## 設計の前提と判断

### なぜ flip と cleanup を 1 PR にまとめるか

PR 1〜5b で migration を漸進的に進めてきたのは「review 単位を小さく保ち、各 PR で fail に倒れた場合の影響範囲を限定する」ため。本 PR は逆に「flip + cleanup を分離するメリットが薄い」状況:

- **flip 単独 PR**: `_headers` の `'unsafe-inline'` 削除 + `csp.ts:PRODUCTION_CSP` 同期 + 3 つの test strict 化 = 5 ファイル / 1 機能の集約
- **cleanup 単独 PR**: `styles.ts` 削除 + migration tracker glob 化 + `stripMetaStyleSrc` 撤去 + decisions.md [067] = 4 ファイル / 1 機能の集約
- 両者は **「B 案完了の記録としてセット」** で意味が成立 (cleanup だけ先行すると tracker 撤去後に flip 漏れが起きた場合に検知が後退する。flip だけ先行すると `stripMetaStyleSrc` で `<meta>` の strict 化が阻害されたままになる)
- 合計でも **9 ファイル / 全削除中心 / decisions.md は判断記録のみ** で review unit として過大ではない (`feedback_pr_size.md` の「20 commit / 1500 行は過大」基準には遠く及ばない)
- `docs/decisions.md` の [067] エントリで一括記録する都合上、flip と cleanup の両方の判断が同一 entry に乗る (PR 1 reviewer I-3 で「PR 6 で一括記録」と defer 容認した約束を履行)

→ 1 PR で完結させる。

### なぜ `@theme` 切替を見送るか

SoT (進捗 doc § PR 6 必須チェックリスト) で「`.text-primary` 命名衝突リスクの再評価」が宿題として明記されているが、本 PR では **見送る** 判断:

- PR 1 以降 `@layer components` 主体で進めてきており、`@theme` 切替を **必須にする driving force が現時点で無い** (Tailwind utility 側で `text-primary` を直接書く需要が出ていない)
- `@theme` 切替を本 PR に bundle すると以下が発生し、CSP flip の集中を阻害:
  - 全 className 参照箇所の grep + rename (現状 `text-primary` は `@layer components` 内のみで使用、外部 tsx 使用箇所も洗い出し必須)
  - `.text-primary` → `.text-brand` 等への rename と consumer 全箇所の追従
  - VRT 撮影リスク増 (rename 後の class 適用が SSR 側で正しく動くか確認要)
- 必要になった時に独立 issue で扱える (現状の `@layer components` 定義は `@theme` 化までブロックしない)

→ decisions.md [067] に「`@theme` 切替は見送り、`.text-primary` 命名は現状維持。Tailwind utility と命名衝突するケースが顕在化したら独立 issue で判断」と明記する。

### CSP test strict 化の方向性

本 PR の test 修正は **「permissive を許容する assert」を「strict を要求する assert」に反転** することが本質。現行 test は意図的に `'unsafe-inline'` の存在 / `style-src` の不在を **陽性** assert している (B 案途中の暫定状態を保護するため)。flip 後はこれらが **逆方向の陽性 assert** に置換される必要がある:

| ファイル                   | 現行 assert                                               | flip 後 assert                                                                    |
| -------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `headers.test.ts`          | style-src に `'self'` AND `'unsafe-inline'` 両方含む      | style-src に `'self'` 含み、`'unsafe-inline'` **不在**                            |
| `meta-csp.test.ts`         | `style-src` directive が `<meta>` に **不在** (strip 済)  | `style-src` directive が `<meta>` に **存在** し `'self'` + `'sha256-...'` を含む |
| `astro-config-csp.test.ts` | `stripMetaStyleSrc` 関数定義 + integration 呼出が**存在** | 該当 2 test (function existence + replace callback) を **削除**                   |

`astro-config-csp.test.ts` は「`stripMetaStyleSrc` が消えていることを assert する」ような **陽性** test を追加するアプローチも考えられるが、`stripMetaStyleSrc` という名前の関数が将来再導入される shape は予測しがたく、defensive 過剰と判断して **テスト自体を削除** する方針 (test 不在で発見できる回帰は無く、追加は YAGNI)。

### 進捗 tracker の glob 化方針

PR 1 で導入した `MIGRATED_FILES` array は「PR ごとに移行済ファイルを明示し、未移行ファイルへの style 追加を防ぐ網」だった。B 案完了時点では全ファイル移行済のため、array 管理は **二重管理になり保守コストになる**。glob 化して `src/components/**/*.tsx` 全件をカバーすれば:

- 新規追加された `.tsx` も自動で網に乗る (regression 防止が future-proof)
- array 更新忘れによる「移行漏れの偽陰性」を撲滅

ただし glob 化に伴う注意点:

- `__tests__/` 配下や `*.test.tsx` を **除外** する必要があるか確認 (現状 `src/components/` 配下に test ファイル無し、`src/utils/__tests__/` は対象外なので問題なし)
- `src/components/**/*.tsx` だけでは `src/pages/*.astro` の `<style>` block を網羅できないが、これは元々 migration tracker のスコープ外 (Astro `<style>` は scoped CSS で hash 対象、本 tracker は React `style={{}}` 専用)
- パフォーマンス影響軽微 (glob は build 時 1 回、test 実行時の readFileSync が 30+ → 30+ で同水準)

### memory 参照

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_pr_size.md` (本 PR の規模判断根拠)
- `feedback_subagent_verification_trust.md` (E2E は親 Opus 直接実行)
- `feedback_commander_checklist.md` (PR 作成前の親チェック手順)
- `feedback_e2e_before_pr.md` (E2E 実行は PR 作成前)
- `feedback_prod_parity_csp.md` (CSP gate の動機、PR 6 で `'unsafe-inline'` 削除した CSP が本番と同一になり applyProductionCsp の意義が完全成立)
- `feedback_positive_control_for_gates.md` (test 反転時の陽性対照維持の指針)
- `feedback_vrt_ci_only.md` (VRT は CI Linux 限定、ローカル mac で走らせない)
- `feedback_infra_feature_separation.md` (本 PR は flip + cleanup として feature work、infra ではないため bundle OK)
- `feedback_review_integrity.md` (review 中の修正 push は控える、レビュアー指摘は実装者に差し戻し)

---

## 採用する設計 (ファイル別)

### 7.1 `public/_headers`

`style-src` から `'unsafe-inline'` を削除し strict 化する。script-src は [064] の AND 評価設計により意図的に維持。

```diff
- Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
+ Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

ファイル冒頭の解説コメント (`script-src の 'unsafe-inline' は意図的に維持` で始まる block) は **そのまま維持**。script-src に関する説明は flip 後も妥当。

---

### 7.2 `src/utils/csp.ts`

`PRODUCTION_CSP` 定数を `_headers` と同期。

```diff
 export const PRODUCTION_CSP =
   "default-src 'self'; " +
   "img-src 'self' data: blob:; " +
   "media-src 'self' blob:; " +
-  "style-src 'self' 'unsafe-inline'; " +
+  "style-src 'self'; " +
   "script-src 'self' 'unsafe-inline'; " +
   "connect-src 'self'; " +
   "worker-src 'self'; " +
   "object-src 'none'; " +
   "frame-ancestors 'none'; " +
   "base-uri 'none'; " +
   "form-action 'self'; " +
   'upgrade-insecure-requests';
```

ファイル冒頭の JSDoc に「B 案完了 (#176 PR 6 / [067]) で style-src も strict 化済」を 1 文追記する:

```ts
/**
 * 本番 (Cloudflare Pages) で適用する Content-Security-Policy 文字列。
 * ...
 * #176 A-1 以降、script-src の 'unsafe-inline' は意図的に維持している。Astro
 * `security.csp` が生成する `<meta>` CSP が `script-src 'self' 'sha256-...'` で
 * hash-only の strict layer を提供し...
 *
+ * #176 B 案 (PR 6 / [067]) で style-src の 'unsafe-inline' を撤去済。React の
+ * `style={{...}}` を全て CSS class 化することで属性ベース inline style を撲滅し、
+ * style-src も hash 不要の strict layer (`'self'` のみ) に到達した。
 */
```

---

### 7.3 `astro.config.mjs`

`stripMetaStyleSrc()` integration の **関数定義** (line 9〜85) と **integrations 配列での呼出** (line 89) を削除。残す要素は `react()` / `sitemap()` の 2 integration と `security.csp` 設定 / `vite` 設定。

before:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

// #176 A-1 / [064]: <meta> CSP の style-src ディレクティブを除去するインライン統合。
// ...
function stripMetaStyleSrc() {
  return {
    name: 'strip-meta-style-src',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        // ... 60 行
      },
    },
  };
}

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap(), stripMetaStyleSrc()],
  // ...
});
```

after:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap()],
  // #176 A-1: Astro built-in CSP で `<meta http-equiv="content-security-policy">` を各ページに注入し、
  // bundled scripts (Astro island loader 等の inline `<script type="module">` 含む) を自動で SHA-256 hash 化。
  // 結果として `public/_headers` の `script-src` から `'unsafe-inline'` を安全に削除できる。
  // dev mode では security.csp は無効（公式仕様）。E2E は preview ベース (#247) で評価する。
  //
  // #176 B 案 (PR 6 / [067]) 完了時点で style-src も auto-hash により strict layer 化。
  // 旧 stripMetaStyleSrc() integration は削除した (style-src も meta strict policy で制御)。
  security: {
    csp: {
      algorithm: 'SHA-256',
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // #246: Vite デフォルト 4KB 未満の asset を data: URI として CSS にインライン化
      // するが、`public/_headers` の CSP は `font-src` を明示しておらず default-src 'self'
      // で data:font が block される（@fontsource/jetbrains-mono の小さな subset font (cyrillic-ext 等)
      // が該当）。inline 化を無効化し dev/preview/prod の挙動を一致させる。
      assetsInlineLimit: 0,
    },
  },
});
```

副次的に **未使用 import (`readFileSync`, `writeFileSync`, `fileURLToPath`, `glob`) を削除** する。これらは `stripMetaStyleSrc` の中でしか使われていない (PR #249 時に追加した)。`astro check` が未使用 import で fail するので必須。

---

### 7.4 `src/utils/styles.ts`

ファイル丸ごと **削除**。

事前確認: `grep -rln "from '@/utils/styles'" src/` の結果は本 PR 着手時点で `inline-style-migration.test.ts` のみ。同テストは §7.5 で全面書換され `styles.ts` import は不要になるため、本ファイル削除と migration test glob 化は **同 commit にまとめる** (片方先行で test fail を踏まないため)。

事後確認: `find src/utils -name styles.ts` が 0 件 / `grep -rn "@/utils/styles" src/ tests/` が 0 件。

---

### 7.5 `src/utils/__tests__/inline-style-migration.test.ts`

`MIGRATED_FILES` array を削除し、`glob('src/components/**/*.tsx')` で全件カバーに置換。

before (抜粋):

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATED_FILES: readonly string[] = [
  'src/components/ui/ActionButton.tsx',
  // ... 31 件
  'src/components/tools/UrlEncoder.tsx',
];

describe.skipIf(MIGRATED_FILES.length === 0)('#176 B 案 progressive migration tracker', () => {
  describe.each(MIGRATED_FILES)('%s', (file) => {
    const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');

    it('JSX inline style object (style={{) が残っていない', () => { ... });
    it('DOM style 属性代入 (element.style.X = ...) が残っていない', () => { ... });
  });
});

describe('migration detector の陽性対照', () => { ... });
```

after:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

/**
 * #176 B 案 完了後の `style={{` / CSSOM 直接 mutation 撲滅の永続的回帰防止網。
 *
 * PR 1〜5b で漸進的に MIGRATED_FILES array を拡張してきたが、PR 6 で B 案完了に
 * 伴い array 管理を撤廃し、`src/components/**\/*.tsx` 全件を glob で自動カバー化。
 * これにより新規追加された .tsx も自動で検出網に含まれ、array 更新忘れによる
 * 偽陰性を撲滅する。
 *
 * 例外 (許容):
 * - `ref.current.style.setProperty('--var', value)` — CSSOM API 経由は許容
 *   regex は `\.style\.X = Y` のみ検出、`.style.setProperty(` は検出しない
 *
 * 参照: docs/decisions.md [067] (B 案完了の記録)
 */

// top-level await: vitest は vite-node 経由で ESM として実行されるため利用可能。
const TARGET_FILES: string[] = [];
for await (const f of glob('src/components/**/*.tsx', { cwd: process.cwd() })) {
  TARGET_FILES.push(f);
}
TARGET_FILES.sort();

describe.skipIf(TARGET_FILES.length === 0)('#176 B 案 inline style 完全撲滅 (回帰防止)', () => {
  it(`src/components/**/*.tsx を ${TARGET_FILES.length} 件カバー`, () => {
    expect(TARGET_FILES.length).toBeGreaterThan(0);
  });

  describe.each(TARGET_FILES)('%s', (file) => {
    const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');

    it('JSX inline style object (style={{) が残っていない', () => {
      expect(content).not.toMatch(/style=\{\{/);
    });

    it('DOM style 属性代入 (element.style.X = ...) が残っていない', () => {
      const matches = content.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
      const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
      expect(violations).toEqual([]);
    });
  });
});

describe('migration detector の陽性対照', () => {
  it('意図的に style={{ を含む文字列が違反として検出される', () => {
    const malicious = `<div style={{color: 'red'}} />`;
    expect(malicious).toMatch(/style=\{\{/);
  });

  it('意図的に style.X = を含む文字列が違反として検出される', () => {
    const malicious = `el.style.background = 'red';`;
    const matches = malicious.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
    const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
    expect(violations.length).toBeGreaterThan(0);
  });

  it('setProperty は許容パターンとしてスルーされる', () => {
    const allowed = `ref.current.style.setProperty('--var', '1');`;
    const matches = allowed.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
    const violations = (matches ?? []).filter((m) => !m.includes('setProperty'));
    expect(violations).toEqual([]);
  });
});
```

ポイント:

- `MIGRATED_FILES` 削除し、`TARGET_FILES` という glob 結果の array に置換 (`describe.each` の入力として変数名は維持)。
- `describe.skipIf` は glob 結果 0 件時の safe-fail として残す (全削除されたら test 自体が disable、ただし基本ありえない)。
- 件数 assert (`expect(TARGET_FILES.length).toBeGreaterThan(0)`) を 1 件追加し、glob が壊れて 0 件になった時に明示 fail させる (silent skip 防止、`feedback_positive_control_for_gates.md` に基づく姿勢)。
- 陽性対照 (`migration detector の陽性対照` describe block) は **そのまま維持**。これは glob とは独立の self-test で、regex 自体の正確性を継続検証する。
- ファイル冒頭の JSDoc は B 案完了モードに書換 (PR 1 から残っていた「各 PR で MIGRATED_FILES に追記」記述は陳腐化したため撤去)。

---

### 7.6 `src/utils/__tests__/headers.test.ts`

style-src の strict 化を陽性 assert に反転。

before (line 89〜94):

```ts
it("style-src は 'unsafe-inline' を許可（React/Astro のインラインスタイル運用上必要）", () => {
  // 219+ 箇所の React `style={{...}}` と Astro `style="..."` が存在するため許可。
  // 中期的には CSS Modules / nonce 化を検討（docs/decisions.md [054] 参照）。
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

after:

```ts
it("style-src は 'self' のみで 'unsafe-inline' 不在 (#176 B 案完了 / [067])", () => {
  // #176 B 案 (PR 1〜6) で React `style={{...}}` を全て CSS class 化し、
  // 属性ベース inline style を撲滅したため style-src も strict 化された。
  // 'unsafe-inline' を除いた hash 不要の `'self'` のみで配信する。
  // 詳細: docs/decisions.md [067]
  expect(csp).toMatch(/style-src\s+'self'\s*(;|$)/);
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

ポイント:

- 第 1 expect は `style-src 'self'` 直後に `;` or 文字列終端が来ることを正規表現で固定し、`'unsafe-inline'` 等の trailing token が混入しないことを構造的に保証 (現行 test の `[^;]*` ベースは緩く、`style-src 'self' 'unsafe-inline'` でもパスする抜けがあった)。
- 第 2 expect の不在 assert は `'unsafe-inline'` が style-src directive 内に出現しないことを直接保証。
- script-src についての test (`script-src は 'self' と 'unsafe-inline' を保持する` line 79〜87) は **そのまま維持** (script-src の `'unsafe-inline'` は [064] AND 評価設計で意図的に保持)。

#### 完全一致 assert の追従

line 100〜108 の `it('src/utils/csp.ts の PRODUCTION_CSP と完全一致する', ...)` は **そのまま維持**。`PRODUCTION_CSP` 側を §7.2 で同期するため、両側更新で test pass。

---

### 7.7 `src/utils/__tests__/meta-csp.test.ts`

style-src 不在 assert を strict 形式 assert に反転。

before (line 79〜87):

```ts
it('style-src は meta から除去されている (stripMetaStyleSrc integration)', () => {
  // astro.config.mjs の stripMetaStyleSrc() で <meta> CSP から style-src を除く。
  // CSP3 仕様で hash と 'unsafe-inline' 共存時にブラウザが unsafe-inline を無視するため、
  // style-src は header 側 (`'self' 'unsafe-inline'`) のみで制御する。
  // B 案 (#176 アプローチ B) で React style="..." 200+ 箇所を移行後、
  // この strip integration 自体を削除して meta side でも strict 化する。
  expect(cspContent).not.toMatch(/style-src/);
});
```

after:

```ts
it('style-src は meta に存在し strict 形式 (self + sha256 hash, unsafe-inline 不在)', () => {
  // #176 B 案 (PR 6 / [067]) 完了で stripMetaStyleSrc integration 撤去済。
  // Astro security.csp が CSS file の SHA-256 hash を auto-allowlist するため、
  // <meta> 側でも style-src は strict layer として機能する。
  // header 側 (_headers / PRODUCTION_CSP) の style-src も `'self'` のみで AND 評価成立。
  expect(cspContent).toMatch(/style-src[^;]*'self'/);
  expect(cspContent).toMatch(/style-src[^;]*'sha256-[A-Za-z0-9+/=]+'/);
  expect(cspContent).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

ファイル冒頭の JSDoc も書き換える (line 13〜16 の `astro.config.mjs の stripMetaStyleSrc()...` block):

```diff
- * astro.config.mjs の `stripMetaStyleSrc()` integration で <meta> から style-src は除去
- * している（CSP3 仕様で hash と 'unsafe-inline' が共存するとブラウザが unsafe-inline を
- * 無視するため、style-src の strict 化は B 案 PR で React style="..." 200+ 箇所の段階移行
- * と合わせて行う）。本テストでは style-src の不在も検証する。
+ * #176 B 案 (PR 6 / [067]) 完了で stripMetaStyleSrc integration を撤去済。
+ * Astro security.csp は build 時に CSS の SHA-256 hash を <meta> CSP に auto 列挙するため、
+ * <meta> 側でも style-src は strict layer として機能する。本テストでは
+ * style-src の strict 形式 (self + sha256 hash, unsafe-inline 不在) を検証する。
```

#### dist/ 必須前提

本テストは `dist/*.html` を読み込むため `npm run build` 後でないと走らない。CI 構成 (`.github/workflows/test.yml`) は build step 先行のため変更不要。ローカル検証時は `npm run build && npm run test` の順序を厳守 (`feedback_e2e_before_pr.md` の手順に既出)。

---

### 7.8 `src/utils/__tests__/astro-config-csp.test.ts`

`stripMetaStyleSrc` 関連の 2 test を **削除**。

before (line 37〜43, 49〜56):

```ts
it('`stripMetaStyleSrc()` integration が integrations 配列に含まれる', () => {
  expect(ASTRO_CONFIG_CONTENT).toMatch(/function\s+stripMetaStyleSrc\s*\(/);
  expect(ASTRO_CONFIG_CONTENT).toMatch(/stripMetaStyleSrc\s*\(\s*\)/);
});

// ... (line 45〜47 の assetsInlineLimit test は維持)

it('stripMetaStyleSrc の full.replace は callback 形式で $ 特殊解釈を回避している (PR #249 review M / #250)', () => {
  expect(ASTRO_CONFIG_CONTENT).toMatch(/\.replace\([^,]+,\s*\(\)\s*=>\s*\w+\)/);
});
```

after: 該当 2 test を削除し、ファイル冒頭 JSDoc も `stripMetaStyleSrc` 言及を撤去:

```diff
 /**
  * `astro.config.mjs` から `security.csp` 設定が削除されると `<meta>` CSP が
  * 出力されず、`<meta>` strict layer + `_headers` permissive layer の AND 評価
  * 設計（[064]）の前提が崩れる。
  *
  * 本テストは `astro.config.mjs` を文字列として読み込み、必須要素の存在を
  * 直接 assert することで設定削除を CI で即時検知する陽性対照ゲート。
  *
  * 同種の検知は `meta-csp.test.ts` でも `<meta>` 不在として間接的に検出されるが、
  * 本テストは「config レベルで何が壊れたか」を明示するために併設する。
  *
  * 参照: docs/decisions.md [064]、メモリ feedback_positive_control_for_gates.md
- *
- * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) 対応。
+ *
+ * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) は
+ * #176 B 案 PR 6 / [067] で stripMetaStyleSrc 自体を撤去したため対応 test も削除済。
  */
```

維持するテスト:

1. `security` ブロックが存在する
2. `security.csp` ブロックが存在する
3. `security.csp.algorithm` が `'SHA-256'`
4. `vite.build.assetsInlineLimit` が `0` ([063] 由来)

→ 計 4 test (削除前は 6 test)。

---

### 7.9 `docs/decisions.md` への [067] 追加

ファイル末尾 (現状 [066] が最終、line 2402〜終端) に新規エントリを追加。フォーマットは [064] / [065] / [066] と同一構成 (背景・決断・実装内訳・効果・却下選択肢・影響/移行・関連 PR/issue)。

draft 内容 (確定文面):

```markdown
## [067] 2026-05-07 — `style-src 'unsafe-inline'` 撤廃: B 案完了、React `style={{}}` 全廃で属性ベース inline style 撲滅

**2026-05-07 | ステータス: 採用**

### 背景

[064] で A-1 (`script-src 'unsafe-inline'` 削減) を完了し、`<meta>` CSP を strict layer / `_headers` を permissive defense-in-depth に分離する設計が確立。残課題として `style-src 'unsafe-inline'` の撤廃が [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B として残っていた。

属性ベース inline style (`style="..."`) は CSP3 仕様で hash/nonce 照合の対象外のため、`style-src` strict 化には React の `style={{...}}` を **全廃** する必要があった。部分削減ではセキュリティ goal を達成できない (1 箇所でも残ると `'unsafe-inline'` が消せない)。

ユーザー承認のもと、数ヶ月にわたるコミットで段階的移行を実施した。

### 決断

**B 案を 6 PR に分割して段階移行し、最終 PR ([本 PR]) で `_headers` の `style-src` から `'unsafe-inline'` を削除して strict 化を完成。**

PR シリーズの依存と達成内容:

| PR     | スコープ                                                                                                | PR/Commit                                                       | 達成                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PR 0   | VRT 基盤導入 (mock 注入版 spec、別 workflow、required check 外す、CI Linux baseline)                    | [#254 (26f566b)](https://github.com/fumtas1k/devtools/pull/254) | VRT で migration の pixel diff を継続監視できる土台を作成                                                                     |
| PR 1   | `@layer components` foundation + ui/\* simple 11 ファイル + `MIGRATED_FILES` tracker 導入               | [#256 (eb5e537)](https://github.com/fumtas1k/devtools/pull/256) | 意味クラス基盤と progressive migration 検証網を確立                                                                           |
| PR 1.5 | ui/\* complex (ResultTable + InputField) — API redesign 含む                                            | [#261 (8e58bd5)](https://github.com/fumtas1k/devtools/pull/261) | 高度な ui/\* 2 件を移行、`setProperty('--var')` パターンで CSS variable 経由制御を確立                                        |
| PR 2   | qr-ticket/\* 移行 + #225 useMemo/abort 同梱                                                             | [#272 (37adb60)](https://github.com/fumtas1k/devtools/pull/272) | 大物 qr-ticket 3 ファイル移行、`.alert-success` / `.alert-error` 等の意味クラス導入                                           |
| PR 3   | JwtDecoder + UuidV7Generator + uuid-v7 E2E CSP gate (#262 partial)                                      | [#275 (1150883)](https://github.com/fumtas1k/devtools/pull/275) | tools/\* 2 件移行、`applyProductionCsp` E2E gate を generator ページに導入                                                    |
| PR 4   | Gs1Databar + EncodingConverter + DummyText + CSSOM hover refactor                                       | [#277 (495f60e)](https://github.com/fumtas1k/devtools/pull/277) | tools/\* 3 件移行、`onMouseEnter`/`onMouseLeave` の CSSOM mutation 9 件を Tailwind `hover:` modifier に集約                   |
| infra  | `withProductionCsp(browser, path, fn)` ラッパで CSP gate boilerplate 集約 (#276)                        | [#278 (73de179)](https://github.com/fumtas1k/devtools/pull/278) | 後続 PR の E2E gate 化コスト削減                                                                                              |
| PR 5a  | ConfigConverter + QrReader + JanCode (大物 3 つ、CSSOM hover 含む) — 31 inline + 2 CSSOM                | [#283 (46abcb5)](https://github.com/fumtas1k/devtools/pull/283) | tools/\* 大物 3 件移行、`.qr-video-preview` / `.hover-bg-subtle` 等の class 拡充                                              |
| PR 5b  | Base64Codec + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 + ulid E2E gate (#262 close) | [#286 (d38b956)](https://github.com/fumtas1k/devtools/pull/286) | 残ツール 7 件移行 (うち 2 件 zero-style 登録)、generator ページ全体に CSP gate 完成、`#262` close                             |
| PR 6   | flip + cleanup ([本 entry])                                                                             | TBD (本 PR)                                                     | `_headers` から `'unsafe-inline'` 撤去、`stripMetaStyleSrc` 削除、`styles.ts` 削除、migration tracker glob 化、test strict 化 |

### 実装内訳 (本 PR)

- `public/_headers`: `style-src 'self' 'unsafe-inline'` → `style-src 'self'`
- `src/utils/csp.ts`: `PRODUCTION_CSP` 定数を `_headers` と同期
- `astro.config.mjs`: `stripMetaStyleSrc()` 関数定義 (60 行) と integrations 配列の呼び出しを削除。`security.csp` 設定はそのまま維持し、Astro auto-hash で `<meta>` の style-src も SHA-256 hash で strict layer 化
- `src/utils/styles.ts`: 削除 (PR 1〜5b で全 import 元が CSS class 参照に置換完了)
- `src/utils/__tests__/inline-style-migration.test.ts`: `MIGRATED_FILES` array (31 件) を `await glob('src/components/**/*.tsx')` に置換し、全件カバーと二重管理解消
- `src/utils/__tests__/headers.test.ts`: style-src の `'unsafe-inline'` 不在を陽性 assert に反転
- `src/utils/__tests__/meta-csp.test.ts`: style-src 不在 assert を strict 形式 (self + sha256 hash) assert に反転
- `src/utils/__tests__/astro-config-csp.test.ts`: `stripMetaStyleSrc` 関連 2 test を削除

### セキュリティ効果

- **属性ベース inline style XSS 緩和**: 攻撃者が `dangerouslySetInnerHTML` 等の sink から inline `style="..."` を注入しても CSP `style-src 'self'` で block される。CSP3 仕様で属性 inline style は hash 照合不可のため、本来 strict 化には全廃が必須だった。B 案でこの goal を達成
- **defense-in-depth**: header (`style-src 'self'`) + `<meta>` (`style-src 'self' 'sha256-...'`) の AND 評価で、CSS file の auto-hash も含めた完全な strict layer になる。`<meta>` で strict、header で permissive (の保守的バックアップ) という [064] の役割分担からさらに進化し、両層共に strict 化に到達

### 却下した選択肢

- **`@theme` 切替を本 PR で同時実施**: `.text-primary` 等の Tailwind utility 命名衝突リスクを根本解消する案。本 PR の射程が CSP flip + cleanup に集中しなくなる肥大化を避けるため見送り。`.text-primary` 命名は現状維持し、Tailwind utility 側で衝突が顕在化したら独立 issue で対応する方針
- **flip と cleanup を別 PR**: 9 ファイル / 全削除中心 / decisions.md は判断記録のみで PR としての規模は過大ではない。`docs/decisions.md` [067] の一括記録の意味からも 1 PR 完結が自然
- **`stripMetaStyleSrc` を撤去せず継続**: 本 PR 完了後に Astro security.csp が auto-hash した `<meta>` style-src を strip し続けると、防御側が hash 列挙の strict layer を捨てる無駄が出るため撤去を採用。Astro pipeline 外から CSS が混入する経路は既存設計上ない

### 影響 / 移行

- **CSP の XSS 緩和効果**: header + meta の両層で style-src strict 化が完成し、属性 inline style 経由の XSS 注入経路を CSP で塞いだ。`'unsafe-inline'` の意味的削減目標 (アプローチ B の本来の goal) 達成
- **ローカル開発体験**: dev mode は `security.csp` 無効 (Astro 公式仕様) で従来どおり動作。preview / build は strict CSP で評価される
- **build 出力**: `<meta>` CSP に `style-src 'self' 'sha256-...'` が含まれる (auto-hash)。`stripMetaStyleSrc` 撤去によりビルド step 1 つ減少。ビルド時間わずかに短縮 (誤差レベル)
- **後続作業**: B 案直接 follow-up は本 PR でクローズ。残存する周辺 issue ([#281](https://github.com/fumtas1k/devtools/issues/281) `withProductionCsp` meta-test / [#273](https://github.com/fumtas1k/devtools/issues/273) `AbortSignal.any` 化 / [#271](https://github.com/fumtas1k/devtools/issues/271) ESLint `react/button-has-type` / [#260](https://github.com/fumtas1k/devtools/issues/260) clsx 統一 / [#234](https://github.com/fumtas1k/devtools/issues/234) `applyProductionCsp` 全 spec 横展開) は B 案 follow-up とは独立した issue として継続。`@theme` 切替判断は将来 Tailwind utility 命名衝突顕在化時に独立 issue で扱う

### 関連 PR / issue

- 本 PR (PR 6 / B 案最終): TBD
- 解消する issue: [#176](https://github.com/fumtas1k/devtools/issues/176) (B 案完了)
- B 案構成 PR (依存関係): [#254](https://github.com/fumtas1k/devtools/pull/254) → [#256](https://github.com/fumtas1k/devtools/pull/256) → [#261](https://github.com/fumtas1k/devtools/pull/261) → [#272](https://github.com/fumtas1k/devtools/pull/272) → [#275](https://github.com/fumtas1k/devtools/pull/275) → [#277](https://github.com/fumtas1k/devtools/pull/277) → [#278](https://github.com/fumtas1k/devtools/pull/278) → [#283](https://github.com/fumtas1k/devtools/pull/283) → [#286](https://github.com/fumtas1k/devtools/pull/286) → 本 PR
- 前提依存: [064] (A-1 / `<meta>` strict layer 設計) / [063] (E2E preview 切替) / [061] (CSP 違反 CI 検知ゲート) / [054] (CSP 初導入)
- 同時 close: [#284](https://github.com/fumtas1k/devtools/issues/284) (`min-w-10` 集約検討、PR 6 で類似 pattern 出ず) / [#285](https://github.com/fumtas1k/devtools/issues/285) (カメラボタン utility 集約検討、同上)

---
```

末尾の `---` は次エントリ ([068]) との区切り。現行末尾と同じ書式。

---

## 実装フロー (Step 順)

PR 4 / 5a / 5b で確立した親 Opus 単独運用パターンを踏襲。本 PR は subagent 並列の余地が小さいため (削除中心)、原則親直接実装。一部の検証は subagent 委譲する。

### Step 0: worktree 作成

```bash
cd /Users/fumta/projects/devtools
git fetch origin develop
# .claude/worktrees/issue-176-b6 配下に worktree 作成
git worktree add .claude/worktrees/issue-176-b6 -b feature/issue-176-b6-csp-flip-and-cleanup origin/develop
cd .claude/worktrees/issue-176-b6
# SessionStart hook が npm ci を自動実行 (CLAUDE.md / `docs/playbooks/e2e-validation.md` 参照)
```

### Step 1: test 側を先に strict 化

順序として「test 修正を先 → 実体 flip → test pass で完結」とする。逆順だと test 修正待ちで本体 flip が test fail を踏む期間が発生する。

ファイル単位:

1. `src/utils/__tests__/headers.test.ts` (§7.6) — style-src 反転
2. `src/utils/__tests__/meta-csp.test.ts` (§7.7) — style-src 反転 + JSDoc 書換
3. `src/utils/__tests__/astro-config-csp.test.ts` (§7.8) — `stripMetaStyleSrc` 関連 2 test 削除 + JSDoc 書換

この時点でローカル `npm run test` は **fail する** (実体 `_headers` がまだ `'unsafe-inline'` を含むため)。意図的な fail で、Step 2 完了で pass に転じる。Step 1 commit はせず Step 2 と同 commit にまとめるか、Step 1 / Step 2 を別 commit にしつつ「Step 1 単独では test fail」を commit message で明記するか。

**推奨**: Step 1 と Step 2 を **同 commit にまとめる** (test と実体を 1 commit でアトミックに切替)。理由は以下:

- Step 1 単独 commit は中間状態で test red、bisect 時にノイズになる
- Step 2 単独 commit も同様に中間状態 (test 期待値が古いまま実体だけ変わる)
- 「CSP strict 化」は概念的に分離しがたい一塊の変更

commit message 案: `refactor(csp): #176 B 案 PR 6 — style-src 'unsafe-inline' 撤廃 + stripMetaStyleSrc 削除`

### Step 2: 本体 flip

ファイル単位:

1. `public/_headers` (§7.1) — style-src 反転
2. `src/utils/csp.ts` (§7.2) — `PRODUCTION_CSP` 同期 + JSDoc 追記
3. `astro.config.mjs` (§7.3) — `stripMetaStyleSrc` 関数定義削除 + integrations 配列呼出削除 + 未使用 import 削除 + コメント書換

Step 1 と同 commit に含める。

### Step 3: cleanup

ファイル単位:

1. `src/utils/styles.ts` (§7.4) — 削除
2. `src/utils/__tests__/inline-style-migration.test.ts` (§7.5) — glob 化

`styles.ts` 削除と migration test glob 化は **同 commit にまとめる** (`styles.ts` import が消えるのは migration test のみ、両者連動でしか fail しないため)。

commit message 案: `refactor(csp): #176 B 案 PR 6 — styles.ts 削除 + migration tracker glob 化`

### Step 4: ドキュメント

ファイル単位:

1. `docs/decisions.md` — [067] 追加 (§7.9 の draft をそのまま貼り付け、本 PR 番号確定後に "TBD" を実 URL に書換)

commit message 案: `docs(decisions): [067] #176 B 案完了の記録追加`

### Step 5: 検証 (ローカル)

```bash
# unit test (vitest) と型 check
npm run build && npm run test
npx astro check

# E2E (build + preview ベース、親 Opus 直接実行を優先 / `feedback_subagent_verification_trust.md`)
npm run test:e2e
```

E2E は出力が大きく親の context を圧迫するので `feedback_delegate_basic_work.md` に従い subagent (model: sonnet) に委譲しても可。委譲時の指示テンプレート:

```
worktree .claude/worktrees/issue-176-b6 で `npm run test:e2e` を実行し、結果を報告してください。
- 全 test pass を確認
- fail した spec があれば fail message を抜粋して報告
- 完了したら結果のみ短く報告 (実行ログは記録不要)
- model: sonnet
```

E2E pass 後、`grep -rn 'style={{' src/` = 0 件を再確認 (テストファイル内文字列除外、`grep --include='*.tsx' -rn 'style={{' src/` で limit すれば完全 0)。

### Step 6: PR 作成 + follow-up close

PR 作成 (`docs/playbooks/pr-creation.md` の 4 点遵守):

1. base: `--base develop`
2. body: `--body-file /tmp/claude/pr_body.md`
3. pre-create check: develop ベース一致 / スコープ確認 / aria-\* 削除行なし
4. 言語: タイトル・本文 必ず日本語

PR description テンプレート (§13):

```markdown
## 概要

`#176` B 案 (`style-src 'unsafe-inline'` 撤廃) の **最終 PR**。React `style={{...}}` を全廃し終えた状態で `public/_headers` から `'unsafe-inline'` を撤去し、暫定 strip integration と進捗 tracker を撤去する。

詳細設計: [docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md](docs/superpowers/specs/2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md)
判断記録: docs/decisions.md [067]

## 変更内容

### CSP flip

- `public/_headers`: `style-src 'self' 'unsafe-inline'` → `style-src 'self'`
- `src/utils/csp.ts:PRODUCTION_CSP` 同期
- `script-src 'unsafe-inline'` は [064] AND 評価設計により意図的に維持

### 暫定 layer 撤去

- `astro.config.mjs`: `stripMetaStyleSrc()` 関数定義 (60 行) と integration 呼出を削除。Astro `security.csp` の auto-hash で `<meta>` 側 style-src も SHA-256 hash strict layer に到達
- 未使用 import (`readFileSync` / `writeFileSync` / `fileURLToPath` / `glob`) を削除

### 進捗 tracker 撤去

- `src/utils/styles.ts`: 削除 (PR 1〜5b で全 import 元が CSS class 参照に置換完了)
- `src/utils/__tests__/inline-style-migration.test.ts`: `MIGRATED_FILES` array (31 件) を `await glob('src/components/**/*.tsx')` に置換し全件カバー化、二重管理解消

### CSP test strict 化

- `headers.test.ts`: style-src の `'unsafe-inline'` 不在を陽性 assert
- `meta-csp.test.ts`: style-src strict 形式 (self + sha256 hash) assert に反転
- `astro-config-csp.test.ts`: `stripMetaStyleSrc` 関連 2 test を削除

### 判断記録

- `docs/decisions.md` [067]: B 案完了の記録 (PR 1〜6 シリーズ依存図 + 各 PR 達成内容 + `@theme` 切替見送り判断 + `.text-primary` 命名維持判断)

### follow-up close

- [#284](https://github.com/fumtas1k/devtools/issues/284) (`min-w-10` 集約検討、PR 6 で類似 pattern 出ず判定)
- [#285](https://github.com/fumtas1k/devtools/issues/285) (カメラボタン utility 集約検討、同上)

## 関連 PR (B 案シリーズ)

- 前提: A-1 [#249](https://github.com/fumtas1k/devtools/pull/249)
- VRT 基盤: [#254](https://github.com/fumtas1k/devtools/pull/254)
- migration: [#256](https://github.com/fumtas1k/devtools/pull/256) → [#261](https://github.com/fumtas1k/devtools/pull/261) → [#272](https://github.com/fumtas1k/devtools/pull/272) → [#275](https://github.com/fumtas1k/devtools/pull/275) → [#277](https://github.com/fumtas1k/devtools/pull/277) → [#283](https://github.com/fumtas1k/devtools/pull/283) → [#286](https://github.com/fumtas1k/devtools/pull/286)
- infra: [#278](https://github.com/fumtas1k/devtools/pull/278)

## 残存 follow-up (B 案 とは独立に継続)

- [#281](https://github.com/fumtas1k/devtools/issues/281) `withProductionCsp` meta-test
- [#273](https://github.com/fumtas1k/devtools/issues/273) `AbortSignal.any` 化
- [#271](https://github.com/fumtas1k/devtools/issues/271) ESLint `react/button-has-type`
- [#260](https://github.com/fumtas1k/devtools/issues/260) clsx 統一一括
- [#234](https://github.com/fumtas1k/devtools/issues/234) `applyProductionCsp` 残 17 spec 横展開
- `@theme` 切替判断 (Tailwind utility 命名衝突顕在化時)

## 検証

- [x] `npm run build && npm run test` (vitest) green
- [x] `npx astro check` green
- [x] `npm run test:e2e` (build + preview) green
- [x] `grep -rn 'style={{' src/` = 0 件
- [ ] CI: VRT (`visual-regression.yml`) green (pixel diff 出たら `update-visual-baseline.yml` を `workflow_dispatch` で trigger し baseline 更新 commit を追加)
- [ ] CI: 全 required check green
```

### Step 7: VRT 結果確認 (CI 後)

VRT 結果次第:

- **pass**: 何もしない、merge 可能状態
- **pixel diff あり**: pixel diff の内容を確認
  - **意図的 (CSP flip による rendering 影響なし、ただし CSS 出力経路変化で微差)**: `update-visual-baseline.yml` を PR ブランチ上で `workflow_dispatch` trigger → baseline 更新 commit を同 PR に push
  - **想定外 (CSS 出力に影響、何かが壊れた)**: rollback して原因調査。本 PR は CSS 出力を変更しない設計のため発生しないはず。出た場合は `.dark` ブロック内の class 衝突等を疑う

VRT は CI Linux runner 限定 (`feedback_vrt_ci_only.md`)。ローカル mac で `npm run test:vrt` は実行しない (baseline 不在で fail する)。

### Step 8: post-merge 進捗 doc 更新

merge 後、`docs/projects/issue-176-b-plan-progress.md` の PR 6 列を `✅ merged` に更新する commit を直後の chore PR で投入 (`feedback_followup_routing.md` の慣習)。

---

## 検証フロー

### ローカル必須ゲート (push 前、親 Opus 直接実行)

| 項目                                     | コマンド                                                                   | 期待                      |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| build + unit test                        | `npm run build && npm run test`                                            | green                     |
| 型チェック                               | `npx astro check`                                                          | green                     |
| E2E                                      | `npm run test:e2e`                                                         | green                     |
| inline style 残存チェック                | `grep -rn --include='*.tsx' 'style={{' src/`                               | 0 件 (テスト内文字列除外) |
| styles.ts 残存チェック                   | `find src/utils -name styles.ts`                                           | 0 件                      |
| `@/utils/styles` import 残存チェック     | `grep -rn "@/utils/styles" src/ tests/`                                    | 0 件                      |
| `stripMetaStyleSrc` 残存チェック         | `grep -rn 'stripMetaStyleSrc' src/ tests/ astro.config.mjs`                | 0 件                      |
| `'unsafe-inline'` style-src 残存チェック | `grep -E "style-src[^;]*'unsafe-inline'" public/_headers src/utils/csp.ts` | 0 件                      |

### CI gate

- `test` job (vitest + astro check)
- `e2e` job (Playwright preview ベース)
- `visual-regression` job (VRT)
- 全て green でマージ可

VRT が pixel diff で fail した場合の対応は Step 7 参照。

---

## VRT 戦略の補足

CSS 出力 (build 後の `*.css` ファイル内容) は本 PR で変更しない (utility/class 名・class 定義ともに不変)。理論上 pixel diff は出ない。

可能性のある diff source:

- Astro `security.csp` の `style-src` auto-hash 化が `<meta>` 配信ヘッダ size の微増で initial paint timing に影響 (実質ゼロのはず)
- `_headers` の CSP 緩和削除で browser policy enforcement timing が変わる (browser policy は rendering 前に評価されるため rendering 結果には影響しない)

→ 想定上 pass。出た場合は `update-visual-baseline.yml` で更新。

VRT 撮影は CI Linux 限定のため、ローカル mac で baseline 撮影は不可 (`feedback_vrt_ci_only.md`)。

---

## リスク / ロールバック計画

### リスク

| リスク                                                                                     | 影響 | 緩和                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flip 後の本番で予期せぬ inline style 残存 → 本番 UI 崩壊                                   | 高   | `applyProductionCsp` E2E gate で本番同等 CSP を再現済 (#262 で uuid-v7 / ulid-generator 適用)。preview server は `_headers` を解釈する構成のため、E2E が本番 reproducer になる。CI で E2E pass = 本番でも CSP block 起きない |
| VRT pixel diff (rendering 影響)                                                            | 中   | CSS 出力は変わらない (utility/class 化済) ので diff 出ない想定。出たら baseline 更新 commit を同 PR に追加                                                                                                                   |
| migration test glob 化で誤検出 (test ファイル等含む)                                       | 低   | glob を `src/components/**/*.tsx` に限定、`__tests__/` 除外確認 (本 PR スコープ内に test ファイルなし)                                                                                                                       |
| `astro check` (型エラー) — `styles.ts` 削除で残 import が型エラー                          | 低   | 事前 grep で import 元 = `inline-style-migration.test.ts` のみ確認済 (本 PR 着手時点)、Step 3 で同時削除する設計                                                                                                             |
| `astro.config.mjs` 未使用 import 削除漏れで `astro check` fail                             | 低   | Step 2 の checklist として明示。`readFileSync` / `writeFileSync` / `fileURLToPath` / `glob` の 4 個                                                                                                                          |
| `meta-csp.test.ts` の `style-src 'sha256-...'` 期待値が Astro の auto-hash 仕様変更で fail | 低   | Astro security.csp は SHA-256 を minimum で生成する仕様 (algorithm: 'SHA-256' 指定済)。仕様変更時は別途 Astro upgrade PR で対応する想定 (本 PR の責務外)                                                                     |

### ロールバック計画

PR 6 単独 revert で B 案前 (PR 5b 終端) の状態に戻る。`styles.ts` と `MIGRATED_FILES` の漸進管理機構は PR 1〜5b の commit に保存されているため revert 可能。

ただし B 案完了後の revert はセキュリティ後退となるため、本 PR 後に発見された問題は **個別 fix PR** で対処するのが優先。revert は本番で重大な regression が発生し、原因特定に時間がかかる場合の最終手段として位置づけ。

---

## follow-up issue 処理

### 同時 close (PR 6 description で参照)

| issue                                                   | 内容                                                                     | close 根拠                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [#284](https://github.com/fumtas1k/devtools/issues/284) | `min-w-10` 集約検討 (`.label-prefix` 専用 class 化)                      | PR 6 は CSS class を **追加しない** PR (削除側)。類似 pattern 発見の余地なく、close 適切 |
| [#285](https://github.com/fumtas1k/devtools/issues/285) | カメラボタン等の utility 列挙を `.btn-action--*-fill` variant に集約検討 | 同上、PR 6 中に新 class 追加なし                                                         |

close 時のコメントテンプレート:

```
PR #176 B 案 PR 6 ([本 PR 番号]) 完了時点で、本 issue 起票時に懸念された類似 pattern は出現しなかったため close。

- PR 6 は CSP flip + cleanup PR で新規 class 追加ゼロ
- B 案 (#176) シリーズ全体での新規 class 追加状況は decisions.md [067] の PR 別達成表に集約済

将来の追加実装で再度 pattern が出てきた場合は新規 issue で起票する。
```

### 別 issue として継続 (PR 6 description で参照のみ、close しない)

| issue                                                                                                             | 内容                                                                      | 継続理由                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#281](https://github.com/fumtas1k/devtools/issues/281)                                                           | `withProductionCsp` 自体の meta-test                                      | B 案 follow-up ではなく testing infra の独立改善。PR 6 で bundle すると infra/feature 分離 (`feedback_infra_feature_separation.md`) に反する       |
| [#273](https://github.com/fumtas1k/devtools/issues/273)                                                           | `useTicketVerification.verify` の external signal を `AbortSignal.any` 化 | qr-ticket の signal API 改善で、CSP とは独立                                                                                                       |
| [#271](https://github.com/fumtas1k/devtools/issues/271)                                                           | ESLint `react/button-has-type` 導入 + `index.astro` 残り 2 件             | ESLint rule 追加と `<button>` の規約整備で、CSP とは独立                                                                                           |
| [#260](https://github.com/fumtas1k/devtools/issues/260)                                                           | className 構築方式 clsx 統一                                              | 全 component の一括 refactor で、CSP とは独立                                                                                                      |
| [#234](https://github.com/fumtas1k/devtools/issues/234)                                                           | `applyProductionCsp` 全 spec (19 件) 展開、残 17 件                       | E2E gate の横展開。本 PR でも `applyProductionCsp` の意義は完全成立 (CSP strict 化で gate と本番ポリシーが一致) するため、横展開価値はむしろ高まる |
| [#119](https://github.com/fumtas1k/devtools/issues/119)                                                           | `.text-link-color` 命名規則統一                                           | rename PR は別 issue で扱う方針 (進捗 doc § follow-up 表)                                                                                          |
| [#257](https://github.com/fumtas1k/devtools/issues/257)                                                           | `ToggleGroup --toggle-cols` removeProperty cleanup                        | PR 1 由来の独立改善                                                                                                                                |
| [#259](https://github.com/fumtas1k/devtools/issues/259)                                                           | `ActionButton` danger+disabled border                                     | デザイン判断保留中の独立 issue                                                                                                                     |
| [#263](https://github.com/fumtas1k/devtools/issues/263) / [#264](https://github.com/fumtas1k/devtools/issues/264) | aria-selected ARIA 違反 / クリック行キーボード操作 (WCAG)                 | a11y 改善で CSP とは独立                                                                                                                           |

PR 6 description の「残存 follow-up」セクションで全件参照する (close せずリストアップのみ)。

---

## 着手前 checklist (新セッション開始時)

新セッションで実装に入る前に以下を全て確認:

- [ ] `git fetch origin develop` で develop 最新を取得し、PR 5b ([#286](https://github.com/fumtas1k/devtools/pull/286)) merged を再確認
- [ ] `gh issue view 262 --json state` で `#262` が CLOSED であることを再確認
- [ ] `grep -rn --include='*.tsx' 'style={{' src/` で本コード上の inline style が **0 件** であることを再確認
- [ ] `grep -rln "from '@/utils/styles'" src/` の結果が **`inline-style-migration.test.ts` のみ** であることを再確認 (他 import 元が残っていれば PR スコープに追加検討)
- [ ] worktree 作成 (`.claude/worktrees/issue-176-b6`) と branch 作成 (`feature/issue-176-b6-csp-flip-and-cleanup`)
- [ ] SessionStart hook で `npm ci` が完了していることを確認 (worktree 内の `node_modules` 存在確認)
- [ ] 本 spec (`2026-05-07-issue-176-b6-csp-flip-and-cleanup-design.md`) 全文を read
- [ ] writing-plans skill で plan を起草し、user review を経てから Step 0〜8 に着手

---

## 完了基準 (再掲、PR 完了時の最終 check)

- [ ] `_headers` から `style-src 'unsafe-inline'` が消えている (script-src 側は維持)
- [ ] `PRODUCTION_CSP` が `_headers` と完全一致 (`headers.test.ts` の交差検証 pass)
- [ ] `stripMetaStyleSrc` が `astro.config.mjs` から完全に消えている (関数定義 + integration 呼出 + 未使用 import 全削除)
- [ ] `src/utils/styles.ts` が削除されている
- [ ] `inline-style-migration.test.ts` が glob ベース (`src/components/**/*.tsx` 全件カバー)
- [ ] CSP test 3 ファイル (headers/meta-csp/astro-config-csp) が strict 化済
- [ ] `docs/decisions.md` に [067] エントリ追加済
- [ ] `grep -rn --include='*.tsx' 'style={{' src/` = 0 件
- [ ] `npm run build && npm run test` green / `npx astro check` green / `npm run test:e2e` green
- [ ] CI: 全 required check + VRT green
- [ ] [#284](https://github.com/fumtas1k/devtools/issues/284) / [#285](https://github.com/fumtas1k/devtools/issues/285) close 済
- [ ] PR description に B 案完了 + 関連 PR 全リンク + 残存 follow-up リスト 含む
- [ ] post-merge: `docs/projects/issue-176-b-plan-progress.md` の PR 6 列を `✅ merged` に更新する chore commit を投入
