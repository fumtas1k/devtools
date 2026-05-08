# `#176` B 案 PR 10 — `style-src` strict 化最終 flip + Astro island hash 取り込み Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `#176` B 案最終 flip で `style-src 'unsafe-inline'` を両層 (header + meta) から完全除去し、Astro island runtime style hash を取り込んで両層 strict 化する。

**Architecture:** 1 PR / 5 commit / ~250 行で完結。A (PR 8 backup 3 commit 再投入) + B (Astro hash hardcode + 検出網) + C (`[068]` 完了記録) + D (SoT 完了反映)。親 Opus 直接実装 (CSP flip は高 stakes、subagent 委譲なし)。

**Tech Stack:** TypeScript / Astro 5 / Vitest / Playwright / Node.js crypto / git/gh CLI / prettier (pre-commit hook)

**Spec:** `docs/superpowers/specs/2026-05-09-issue-176-b10-final-flip-design.md` (commit `25787c3`)

**Branch:** `feature/issue-176-b10-final-flip` (本 plan 着手前に既に切り替え済、spec commit 1 件 ahead of `develop`)

---

## File Structure

| ファイル                                       | 変更                                                                     | 想定行数           |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| `public/_headers`                              | `style-src` を strict 化 + Astro island hash 追加                        | +0 -0 (1 行内変更) |
| `src/utils/csp.ts`                             | `PRODUCTION_CSP` 同期更新                                                | +0 -0 (1 行内変更) |
| `astro.config.mjs`                             | `stripMetaStyleSrc()` 関数 + integration entry + 関連 import 削除        | +1 -82             |
| `src/utils/__tests__/headers.test.ts`          | strict assert に反転 + Astro hash 存在 assert                            | +約 10 / -約 5     |
| `src/utils/__tests__/meta-csp.test.ts`         | strict assert に反転 + Astro inline style 検出 + sha256 整合性メタテスト | +約 25 / -約 10    |
| `src/utils/__tests__/astro-config-csp.test.ts` | `stripMetaStyleSrc` 関連 2 ブロック削除 + JSDoc 更新                     | +約 5 / -約 18     |
| `docs/decisions.md`                            | `[068]` B 案完了記録 (新規 entry)                                        | +約 130            |
| `docs/projects/issue-176-b-plan-progress.md`   | PR 10 行 ✅ merged 化 + 「B 案完了」セクション追加                       | +約 25             |

## TDD Note

本 PR は test 反転 (既存 assert を strict 形式に変更) + 新規検出網追加。新規実装は既存テストを **意図的に red にしてから green に戻す** 段階遷移を含むため、各 commit ごとの test 期待値を明示する。

検出網 (Astro hash 整合性メタテスト) は **陽性対照** として機能: hash 値を 1 文字書換 → test fail を手動確認 (Task 6 で実施)。

---

### Task 1: `_headers` / `csp.ts` strict 化 + Astro hash 追加

**Files:**

- Modify: `public/_headers` (line 7 の CSP 行)
- Modify: `src/utils/csp.ts` (line 33 の `style-src` 行)

**目的:** `style-src 'self' 'unsafe-inline'` を `style-src 'self' 'sha256-vv9I...'` に flip。両ファイルで完全同期。

- [ ] **Step 1: 既存 `_headers` を確認**

Run: `Read /Users/fumta/projects/devtools/public/_headers`
Expected: line 7 に `style-src 'self' 'unsafe-inline';` を含む CSP 行が 1 行ある。

- [ ] **Step 2: `_headers` の `style-src` を strict 化**

`old_string` (`public/_headers`、唯一マッチ):

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

`new_string`:

```
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
```

- [ ] **Step 3: `csp.ts` の `PRODUCTION_CSP` を同期更新**

`old_string` (`src/utils/csp.ts`、line 33 含む唯一マッチ):

```ts
  "style-src 'self' 'unsafe-inline'; " +
```

`new_string`:

```ts
  "style-src 'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='; " +
```

- [ ] **Step 4: 既存 test の status 確認 (red 想定)**

Run: `npm run test -- src/utils/__tests__/headers.test.ts`
Expected: **失敗** (既存 `style-src は 'unsafe-inline' を許可` test が新しい strict 値とミスマッチ)。本 commit 単独の意図的 red 状態。Task 3 で test を反転して green に戻す。

`headers.test.ts` の line 100-108 にある「`PRODUCTION_CSP` と完全一致する」test は **両ファイル同期して strict 化したため pass する**。同一性 assert は維持される。

- [ ] **Step 5: commit 1 を作成**

Run:

```bash
git add public/_headers src/utils/csp.ts
git commit -m "$(cat <<'EOF'
refactor(csp): #176 B 案 PR 10 (1/5) — _headers / csp.ts style-src strict 化

- public/_headers: style-src 'self' 'unsafe-inline' → 'self' 'sha256-vv9I...'
- src/utils/csp.ts: PRODUCTION_CSP 同期更新

Astro island runtime が injection する inline style:
<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
の sha256 (vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=) を取り込む。
Astro が当該 inline style 文字列を変更しない限り stable な fingerprint。

Note: headers.test.ts / meta-csp.test.ts の strict assert 反転は本 PR
commit 3 で実施。本 commit 単独では既存 test が red (commit 3 で green
に戻す段階遷移)。
EOF
)"
```

Expected: pre-commit hook (prettier + tsc) pass、commit 作成成功。pre-commit hook は test を実行しないため、本 commit 単独の test red は commit 自体を block しない。

---

### Task 2: `stripMetaStyleSrc()` integration 撤去

**Files:**

- Modify: `astro.config.mjs` (関数定義 line 9-85、integrations 配列 entry line 89、関連 import line 5-7)

**目的:** PR 8 backup `1392831` を再投入。`<meta>` 側 CSP は Astro `security.csp` で hash 付き strict 形式に自動切替。

- [ ] **Step 1: 既存 `astro.config.mjs` を確認**

Run: `Read /Users/fumta/projects/devtools/astro.config.mjs`
Expected: line 5-7 に `readFileSync` / `writeFileSync` / `fileURLToPath` / `glob` import、line 9-85 に `stripMetaStyleSrc()` 関数定義、line 89 に `integrations: [react(), sitemap(), stripMetaStyleSrc()]`。

- [ ] **Step 2: `stripMetaStyleSrc` を含む全範囲を削除**

`old_string` (`astro.config.mjs` line 5-7、唯一マッチ):

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
```

`new_string`: (空文字列でこの 3 行を削除)

`old_string` 2 (`astro.config.mjs` line 8-86、`stripMetaStyleSrc` 関数定義全体、唯一マッチ):

最初の `// #176 A-1 / [064]:` から関数末尾の `}\n}` まで全範囲を削除。実装が長いため、削除対象を特定するアンカーは関数定義開始の `// #176 A-1 / [064]: <meta> CSP` と関数定義終了の `}\n}\n\nexport default defineConfig` の間。

具体的には以下の `old_string` 全体を空文字列に置換:

```js
// #176 A-1 / [064]: <meta> CSP の style-src ディレクティブを除去するインライン統合。
// Astro の security.csp は style-src にも sha256 ハッシュを付与するが、
// CSP Level 2+ の仕様では 'unsafe-inline' はハッシュが存在すると無効化される。
// React の style="" 属性 (200+ 箇所) を段階的に廃止する B 案 PR まで、
// <meta> CSP から style-src を除き HTTP ヘッダ側 (_headers) の
// style-src 'self' 'unsafe-inline' のみで制御する。
// 参照: docs/decisions.md [064]
//
// 実装: regex で `<meta>` タグを attribute 順序非依存に検出し、
// http-equiv が "content-security-policy" のものだけ content から style-src を除去する。
// 失敗時 (HTML ファイル無し / 書き込み失敗 / CSP meta 1 件も見つからず) は明示的に throw し
// silent-pass を防ぐ（B 案完了まで暫定の defense-in-depth）。
function stripMetaStyleSrc() {
  return {
    name: 'strip-meta-style-src',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const htmlFiles = [];
        for await (const f of glob('**/*.html', { cwd: distDir })) {
          htmlFiles.push(`${distDir}/${f}`);
        }
        if (htmlFiles.length === 0) {
          throw new Error(
            'strip-meta-style-src: dist に HTML ファイルが 1 件も無い。' +
              'build 失敗 or 出力先の不一致を疑う。'
          );
        }

        let strippedCount = 0;
        for (const htmlFile of htmlFiles) {
          const content = readFileSync(htmlFile, 'utf-8');
          // <meta ...> タグを順次列挙し、attribute 順序非依存に http-equiv と content を抽出する
          const modified = content.replace(/<meta\s+([^>]+?)\s*\/?>/gi, (full, attrs) => {
            const httpEquivMatch = attrs.match(/\bhttp-equiv\s*=\s*"([^"]*)"/i);
            if (!httpEquivMatch) return full;
            if (httpEquivMatch[1].toLowerCase() !== 'content-security-policy') return full;
            const contentMatch = attrs.match(/\bcontent\s*=\s*"([^"]*)"/i);
            if (!contentMatch) return full;
            const cspValue = contentMatch[1];
            const stripped = cspValue
              .replace(/\s*style-src\s+[^;]+(;\s*|$)/g, ' ')
              .trim()
              .replace(/\s+/g, ' ');
            // 元の attributes 文字列内で content="..." だけを書き換える
            const newAttrs = attrs.replace(/\bcontent\s*=\s*"[^"]*"/i, `content="${stripped}"`);
            // #250: String.prototype.replace(string, string) の semantics で
            // newAttrs 内の $& / $1 / $$ などが特殊置換パターンとして解釈される
            // のを避けるため callback 形式で渡す。CSP 値に $ が含まれる可能性は
            // 実質ゼロだが防御的に対処（PR #249 レビュー補足）。
            return full.replace(attrs, () => newAttrs);
          });
          if (modified !== content) {
            try {
              writeFileSync(htmlFile, modified, 'utf-8');
            } catch (err) {
              throw new Error(`strip-meta-style-src: ${htmlFile} の書き込みに失敗: ${err.message}`);
            }
            strippedCount++;
          }
        }

        if (strippedCount === 0) {
          throw new Error(
            'strip-meta-style-src: ' +
              `dist の ${htmlFiles.length} 件の HTML から CSP meta tag を 1 件も見つけられず、` +
              'style-src を除去できなかった。security.csp の設定や Astro の <meta> 出力仕様変更を疑う。'
          );
        }

        logger.info?.(
          `strip-meta-style-src: ${strippedCount}/${htmlFiles.length} HTML から style-src を除去`
        );
      },
    },
  };
}
```

(注意: 末尾の空行も含めて削除)

- [ ] **Step 3: `integrations` 配列から `stripMetaStyleSrc()` を削除**

`old_string`:

```js
  integrations: [react(), sitemap(), stripMetaStyleSrc()],
```

`new_string`:

```js
  integrations: [react(), sitemap()],
```

- [ ] **Step 4: 既存 test の status 確認 (red 想定)**

Run: `npm run test -- src/utils/__tests__/astro-config-csp.test.ts`
Expected: **失敗** (`stripMetaStyleSrc` 関連 2 ブロックが no-match で red)。本 commit 単独の意図的 red、Task 3 で test 削除して green に戻す。

- [ ] **Step 5: commit 2 を作成**

Run:

```bash
git add astro.config.mjs
git commit -m "$(cat <<'EOF'
refactor(csp): #176 B 案 PR 10 (2/5) — stripMetaStyleSrc 暫定 integration 撤去

- astro.config.mjs: stripMetaStyleSrc 関数定義 + integrations 配列 entry
  + 関連 import (readFileSync/writeFileSync/fileURLToPath/glob) 削除

#176 A-1 [064] で導入した暫定 integration。CSP3 仕様で hash と
'unsafe-inline' 共存時にブラウザが unsafe-inline を無視する制約により、
<meta> から style-src を除いて header 側の 'unsafe-inline' のみで制御
する設計だった。

PR 1〜9 で React style={{}} と Astro inline style を全廃 + PR 9 で
setProperty 経路を Constructable Stylesheets 化したことで、<meta> 側でも
style-src を hash + 'self' の strict 形式で生成して safe になった。

Note: meta-csp.test.ts / astro-config-csp.test.ts の test 反転 / 削除は
本 PR commit 3 で実施。本 commit 単独では test red (commit 3 で green
に戻す段階遷移)。
EOF
)"
```

Expected: pre-commit hook pass、commit 作成成功。

---

### Task 3: test 群 strict 化 + Astro island hash 検出網

**Files:**

- Modify: `src/utils/__tests__/headers.test.ts` (line 89-94 の `style-src` test)
- Modify: `src/utils/__tests__/meta-csp.test.ts` (line 79-86 の `style-src` test + 検出網新規追加)
- Modify: `src/utils/__tests__/astro-config-csp.test.ts` (`stripMetaStyleSrc` 関連 2 ブロック削除 + JSDoc 更新)

**目的:** Task 1 / 2 で red にした test を strict 形式に反転 + 新規検出網追加で green に戻す。

#### 3.1 `headers.test.ts` strict 化 + Astro hash 存在 assert

- [ ] **Step 1: `style-src` test を strict 形式に反転**

`old_string` (`headers.test.ts` line 89-94、唯一マッチ):

```ts
it("style-src は 'unsafe-inline' を許可（React/Astro のインラインスタイル運用上必要）", () => {
  // 219+ 箇所の React `style={{...}}` と Astro `style="..."` が存在するため許可。
  // 中期的には CSS Modules / nonce 化を検討（docs/decisions.md [054] 参照）。
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

`new_string`:

```ts
it("style-src は 'self' のみで 'unsafe-inline' を含まない (#176 B 案完了 / [068])", () => {
  // PR 1〜7b で React `style={{` / Astro `style="..."` 全廃 (PR 9 で setProperty
  // 経路も Constructable Stylesheets 化) + 本 PR (PR 10) で両層 strict 化。
  // 残る暗黙 inline style 経路は Astro island runtime のみで、当該 hash を取り込む。
  // CSP3 仕様で hash と 'unsafe-inline' 共存時に unsafe-inline は無効化されるため、
  // 'unsafe-inline' 不在を陽性 assert する。
  // 詳細: docs/decisions.md [068]
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});

it('style-src に Astro island runtime hash が含まれる (#176 B 案完了 / [068])', () => {
  // Astro 島ランタイム injection の inline style:
  // <style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
  // の sha256 hash を _headers の style-src に hardcode する handcoded
  // fingerprint 戦略。Astro が当該文字列を変更すると本テストは pass し続けるが、
  // meta-csp.test.ts の整合性メタテストが fail して検知する。
  // 詳細: docs/decisions.md [068]
  expect(csp).toMatch(/style-src[^;]*'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L\/9Cfn2H6LMk7\/ow='/);
});
```

#### 3.2 `meta-csp.test.ts` strict 化 + Astro 検出網追加

- [ ] **Step 2: JSDoc を更新**

`old_string` (`meta-csp.test.ts` line 13-16、唯一マッチ):

```ts
 * astro.config.mjs の `stripMetaStyleSrc()` integration で <meta> から style-src は除去
 * している（CSP3 仕様で hash と 'unsafe-inline' が共存するとブラウザが unsafe-inline を
 * 無視するため、style-src の strict 化は B 案 PR で React style="..." 200+ 箇所の段階移行
 * と合わせて行う）。本テストでは style-src の不在も検証する。
```

`new_string`:

```ts
 * `<meta>` 側の style-src は #176 B 案完了 ([068]) で `'self'` + Astro island hash の
 * strict 形式に。stripMetaStyleSrc integration を撤去し Astro security.csp の自動 hash
 * 付与をそのまま活用。本テストで strict 形式 (`'unsafe-inline'` 不在) を陽性 assert +
 * Astro inline style 検出網 + sha256 整合性メタテストを併設する。
```

- [ ] **Step 3: `style-src` test を strict 形式に反転**

`old_string` (`meta-csp.test.ts` line 79-86、唯一マッチ):

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

`new_string`:

```ts
it("style-src は 'self' のみで 'unsafe-inline' を含まない (#176 B 案完了 / [068])", () => {
  // [068] B 案完了。React style={{ / Astro style="" / SVG inline style /
  // setProperty 経路が全廃された後、<meta> CSP も style-src 'self' で安全に
  // 運用可能。本 PR commit 2 で stripMetaStyleSrc integration を削除した
  // 結果、Astro security.csp 由来の <meta> に style-src がそのまま出力される。
  expect(cspContent).toMatch(/style-src[^;]*'self'/);
  expect(cspContent).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});

it('style-src に sha256- ハッシュが少なくとも 1 つ含まれる (Astro auto-hash)', () => {
  // Astro security.csp が <style> ブロックを auto-hash した結果。
  // Astro island runtime の inline style (sha256-vv9I...) も auto-hash 対象に
  // 含まれる。1 つも無い場合は security.csp が無効化されているか失敗している。
  expect(cspContent).toMatch(/style-src[^;]*'sha256-[A-Za-z0-9+/=]+'/);
});
```

- [ ] **Step 4: ファイル末尾に Astro island hash 検出網 + 整合性メタテストを追加**

`meta-csp.test.ts` の最後の `});` の **後** (ファイル末尾) に以下を追加:

`old_string` (ファイル末尾の閉じ括弧、唯一マッチ):

```ts
});
```

`new_string`:

```ts
});

/**
 * Astro island runtime の inline style hash 整合性検出網 (#176 B 案完了 / [068]).
 *
 * Astro が各ページに injection する固定 inline style:
 *   <style>astro-island,astro-slot,astro-static-slot{display:contents}</style>
 * の sha256 hash を `_headers` の style-src に hardcoded fingerprint として
 * 取り込む handcoded 戦略 (option α、`docs/decisions.md [068]` 参照)。
 *
 * 本検出網は以下を assert する:
 * 1. dist HTML 内に Astro island inline style literal が含まれること
 * 2. dist HTML inline style content の sha256 が `_headers` の hash 値と一致すること
 *
 * Astro が当該 inline style 文字列を変更すると検出 1 / 2 が連鎖的に fail し、
 * silent regression を防ぐ陽性対照メタテスト。
 */
describe('Astro island runtime style hash 整合性 (#176 B 案完了 / [068])', () => {
  if (distPages.length === 0) {
    it.skip("dist/*.html が無い → 'npm run build' 後に再実行", () => {});
    return;
  }

  const ASTRO_ISLAND_INLINE_STYLE =
    '<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>';
  const ASTRO_ISLAND_INLINE_CONTENT = 'astro-island,astro-slot,astro-static-slot{display:contents}';

  it('dist HTML 内に Astro island inline style literal が含まれる', () => {
    const sampleHtml = readFileSync(distPages[0], 'utf-8');
    expect(sampleHtml).toContain(ASTRO_ISLAND_INLINE_STYLE);
  });

  it('dist HTML inline style の sha256 が _headers の hash と一致する (陽性対照メタテスト)', async () => {
    const { createHash } = await import('node:crypto');
    const computedHash = createHash('sha256').update(ASTRO_ISLAND_INLINE_CONTENT).digest('base64');
    const expectedToken = `'sha256-${computedHash}'`;

    const headersPath = path.resolve(process.cwd(), 'public', '_headers');
    const headersContent = readFileSync(headersPath, 'utf-8');

    expect(headersContent).toContain(expectedToken);
  });
});
```

#### 3.3 `astro-config-csp.test.ts` から `stripMetaStyleSrc` 関連削除

- [ ] **Step 5: JSDoc を `[068]` 参照に更新 + 関連 2 ブロック削除**

`old_string` (`astro-config-csp.test.ts` line 4-20、唯一マッチ):

```ts
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
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) 対応。
 */
```

`new_string`:

```ts
/**
 * `astro.config.mjs` から `security.csp` 設定が削除されると `<meta>` CSP が
 * 出力されず、両層 strict 化 (#176 B 案完了 [068]) の設計が崩れる。
 *
 * 本テストは `astro.config.mjs` を文字列として読み込み、必須要素の存在を
 * 直接 assert することで設定削除を CI で即時検知する陽性対照ゲート。
 *
 * 同種の検知は `meta-csp.test.ts` でも `<meta>` 不在として間接的に検出されるが、
 * 本テストは「config レベルで何が壊れたか」を明示するために併設する。
 *
 * 参照: docs/decisions.md [064] / [068]、メモリ feedback_positive_control_for_gates.md
 *
 * #250 I-3 / PR #249 レビュー M (defensive replace callback 形式) は
 * stripMetaStyleSrc 自体が #176 B 案完了で撤去されたため対応不要 ([068])。
 */
```

- [ ] **Step 6: `stripMetaStyleSrc` 関連 2 ブロック (line 37-43 と line 49-56) を削除**

`old_string` (line 37-43、唯一マッチ):

```ts
it('`stripMetaStyleSrc()` integration が integrations 配列に含まれる', () => {
  // <meta> CSP の style-src は CSP3 の hash + unsafe-inline 共存制約により
  // strip integration で削除する設計。integration 関数自体の定義と
  // integrations 配列での呼び出しの両方を確認。
  expect(ASTRO_CONFIG_CONTENT).toMatch(/function\s+stripMetaStyleSrc\s*\(/);
  expect(ASTRO_CONFIG_CONTENT).toMatch(/stripMetaStyleSrc\s*\(\s*\)/);
});
```

`new_string`: (空文字列でこの 8 行を削除)

`old_string` 2 (line 49-56、唯一マッチ):

```ts
it('stripMetaStyleSrc の full.replace は callback 形式で $ 特殊解釈を回避している (PR #249 review M / #250)', () => {
  // String.prototype.replace(string, string) の semantics で第二引数が string だと
  // $&/$1/$$ などが特殊解釈される。CSP 値に $ が混入した場合の安全網として
  // callback 形式 (() => newAttrs) で渡す実装を維持する。
  // 変数名 (attrs / newAttrs 等) には bind せず、`X.replace(Y, () => Z)` の callback パターンが使われていることだけを assert。
  // 将来 stripMetaStyleSrc 内で変数 rename されてもテストは追従する。
  expect(ASTRO_CONFIG_CONTENT).toMatch(/\.replace\([^,]+,\s*\(\)\s*=>\s*\w+\)/);
});
```

`new_string`: (空文字列でこの 9 行を削除)

#### 3.4 build + verify

- [ ] **Step 7: build 実行 (`meta-csp.test.ts` は dist HTML 入力)**

Run: `npm run build`
Expected: 成功、`dist/` に HTML が生成される。

- [ ] **Step 8: 全 unit test 実行 (全 green 想定)**

Run: `npm run test`
Expected: 全 pass。新規追加した「Astro island runtime style hash 整合性」describe ブロック含めて green。

- [ ] **Step 9: ファイル状態確認**

Run: `git status -s`
Expected:

```
 M src/utils/__tests__/astro-config-csp.test.ts
 M src/utils/__tests__/headers.test.ts
 M src/utils/__tests__/meta-csp.test.ts
```

- [ ] **Step 10: commit 3 を作成**

Run:

```bash
git add src/utils/__tests__/headers.test.ts src/utils/__tests__/meta-csp.test.ts src/utils/__tests__/astro-config-csp.test.ts
git commit -m "$(cat <<'EOF'
test(csp): #176 B 案 PR 10 (3/5) — test 群 strict 化 + Astro hash 検出網

- headers.test.ts: style-src 'unsafe-inline' 不在 + Astro hash 存在を陽性 assert
- meta-csp.test.ts: <meta> 側 style-src 不在 → strict 形式 ('self') assert に
  反転 + dist HTML 内 Astro inline style 検出網 + sha256 整合性メタテスト追加
- astro-config-csp.test.ts: stripMetaStyleSrc 関連 2 ブロック削除、JSDoc を
  [068] 参照に置換

陽性対照メタテストとして dist HTML inline style content の sha256 を計算し
_headers の hash 値と一致するか assert することで、Astro 文字列変更で hash
が同期更新されない silent regression を捕捉する。

Note: 本 commit で Task 1 / 2 の意図的 red 状態を resolved。全 unit test
green。
EOF
)"
```

Expected: pre-commit hook pass、commit 作成成功。

---

### Task 4: `docs/decisions.md` に `[068]` B 案完了記録を追加

**Files:**

- Modify: `docs/decisions.md` (`[067]` の末尾に新 entry `[068]` を追加)

**目的:** `#176` B 案 (PR 0〜10) の完了を repo SoT として記録。

- [ ] **Step 1: `decisions.md` 末尾の構造確認**

Run: `tail -10 docs/decisions.md`
Expected: 末尾は `[067]` の `### 関連 PR / issue` セクション内の最終行 (`- 起源: #176 B 案 PR 1.5 ...` 等)。

- [ ] **Step 2: `[068]` entry を `decisions.md` 末尾に追加**

`docs/decisions.md` の末尾に以下のテキスト全体を append (Edit tool で末尾の最終行を anchor に挿入):

`old_string` (decisions.md 末尾の唯一行、現状):

```markdown
- 起源: `#176` B 案 PR 1.5 (#261) で導入された `setProperty` パターン
```

`new_string`:

````markdown
- 起源: `#176` B 案 PR 1.5 (#261) で導入された `setProperty` パターン

## [068] 2026-05-09 — `#176` B 案完了 (両層 `style-src` strict 化 + Astro island hash 取り込み)

### 背景

`#176` B 案 = `style-src 'unsafe-inline'` 削減 (A-1 [#249] 完了後の続編、`docs/decisions.md` [064] 参照)。

`<meta>` strict + `_headers` permissive の AND 評価設計 ([064]) では、header 側に `'unsafe-inline'` を残しているため `<meta>` 自動 hash が壊れた状況 (Astro `security.csp` integration の bug / 設定ミス / build hook 失敗 / Astro 仕様変更) で fallback policy が permissive になる潜在リスクがあった。両層を strict (`'self'` + 必要 hash のみ) に揃えることで XSS 緩和の defense-in-depth を完成させる goal。

PR 0〜10 series で段階的に React / Astro inline style と CSSOM mutation を全廃し、最終 PR 10 で両層 flip + Astro island runtime hash 取り込みを実施。

### B 案 PR 0〜10 series 依存図

```
PR 0   (#254)  VRT 導入 (mock 注入版、CI Linux baseline、required check 外し)
PR 1   (#256)  基礎工事 + ui/* simple 11 ファイル (ClearButton CSSOM 撤去含む)
PR 1.5 (#261)  ui/* complex (ResultTable + InputField, API redesign)
PR 2   (#272)  qr-ticket/* + #225 同梱
PR 3   (#275)  JwtDecoder + UuidV7Generator + #262 partial
PR 4   (#277)  Gs1Databar + EncodingConverter + DummyText
PR 5a  (#283)  ConfigConverter + QrReader + JanCode (CSSOM hover 含む)
PR 5b  (#286)  残 7 ツール + zero-style 登録 + ulid-generator E2E gate / #262 close
PR 6   (#290)  styles.ts 削除 + migration tracker glob 化
PR 7a  (#294)  layout/ui Astro inline 23 件
PR 7b  (#299)  pages Astro inline 42 件
PR 8   (#303)  scope 縮小 (setProperty CSP3 制約発覚で延期、[067])
PR 9   (#307)  ResultTable + ToggleGroup setProperty を Constructable Stylesheets 化
PR 9 follow-up (#313)  #309 / #308 decision メモ化
PR 10  (本 PR) 両層 strict 化 + Astro island hash 取り込み
```

### 本 PR (PR 10) で達成

- `public/_headers` / `src/utils/csp.ts`: `style-src 'unsafe-inline'` を削除し `style-src 'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='` に flip
- `astro.config.mjs`: `stripMetaStyleSrc()` 暫定 integration ([064] 由来) を完全撤去
- `<meta>` 側 CSP は Astro `security.csp` で hash 付き strict 形式に自動切替
- test 群 strict 化 (`headers.test.ts` / `meta-csp.test.ts` / `astro-config-csp.test.ts`)
- Astro island hash 検出網追加 (dist HTML literal + `_headers` hash 整合性 + 陽性対照メタテスト)

### Astro island hash 取り込みの設計選定

PR 9 Phase 2 で発覚した、Astro 島ランタイムが各ページに injection する固定 inline style `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>` の sha256 hash `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=` を `_headers` の `style-src` に取り込む必要があった。

**評価した解**:

| 案  | 仕組み                                  | 採否                                    |
| --- | --------------------------------------- | --------------------------------------- |
| α   | handcoded fingerprint + 検出網          | ✅ **採用**                             |
| β   | `astro:build:done` hook で自動抽出      | 不採用 (overkill: hash は 1 個固定)     |
| γ   | `_headers` permissive 維持、meta strict | 不採用 (B 案 goal「両層 strict」と矛盾) |

**α 採用根拠**:

- 取り込む hash は 1 個 (Astro が当該文字列を変更しない限り stable)
- β の 80-150 行 hook 実装は 1 hash の自動抽出に対して overweight
- γ は `<meta>` が壊れた状況で `_headers` permissive のみが効くため XSS 緩和の最終防衛ラインが緩い → goal「両層 strict」と部分矛盾
- α の運用コスト「Astro 更新で hash 変わると CI fail」は検出網で能動検知できるため silent regression にならない

### 削除した暫定 infra

- `stripMetaStyleSrc()` integration ([064] / `astro.config.mjs`):
  CSP3 仕様で hash と `'unsafe-inline'` 共存時にブラウザが `'unsafe-inline'` を無視する制約により、`<meta>` から `style-src` を除く暫定。本 PR で両層 strict 化により不要化、撤去。
- `MIGRATED_FILES` array (`inline-style-migration.test.ts`):
  PR 6 で glob 化済 (`src/components/**/*.{tsx,astro}` 等)、本 PR では touch せず。
- `applyStrictStyleSrcCsp` helper (`tests/e2e/helpers.ts`):
  PR 9 で `applyProductionCsp` から派生として追加。本 PR で `applyProductionCsp` 自体が strict になるため不要化。**削除は別 cleanup PR** に切り出す候補 (memory `feedback_infra_feature_separation.md` 準拠)。

### 設計判断 KEEP 記録

PR 6 必須チェックリスト末尾の未消化項目を本 entry で「現状維持」と確定:

- **`.text-primary` 命名衝突リスク**: PR 2 で導入した `.text-primary` (`--color-primary` 由来) は Tailwind `text-primary` auto-utility と衝突する可能性があるが、現状 `@theme` に `--color-primary` を登録していないため衝突は発生していない。**現状維持**: 将来 `@theme` 切替する場合は `text-brand` 等への rename を検討。
- **Tailwind `border` utility と `@layer components` の `border-color` 優先度**: PR 2 で導入した `.alert-success` / `.alert-error` は `<div className="rounded-lg p-4 border alert-success">` のように Tailwind `border` と併用。layer 順序によっては期待色にならないリスクが PR 2 review で指摘済だが、CSP strict 化後の VRT 再撮影でも diff が出ていないため実害は未顕在。**現状維持**: 将来 Tailwind v4 layer 仕様変更で問題が顕在化したら再評価。

### 検出網運用ノート

B 案完了後も継続運用する検出網:

- `inline-style-migration.test.ts` (glob、PR 6 で導入): `src/components/**/*.{tsx,astro}` 等で `style={{` / `style="..."` の string match が出現した場合に fail。新規ファイル追加時の自動検出網。
- `applyProductionCsp(page)` E2E gate (`tests/e2e/helpers.ts`、PR 3 / PR 5b で確立): 本番相当 CSP を dev server に注入して E2E 走行、CSP violation 発生で fail。19 spec のうち重要経路で適用。
- `csp-constructable-stylesheet.spec.ts` (PR 9 で導入、永続): Phase 0 minimal repro spec。Chromium で `useDynamicStyleSheet` 経路の strict CSP 互換を陽性 / 陰性対照で検証。Chromium 動作変更 / CSP 仕様改訂への早期検知用。
- 本 PR (PR 10) の Astro island hash 検出網 (`meta-csp.test.ts` / `headers.test.ts` 拡張):
  - dist HTML 内に Astro inline style literal が含まれること
  - `_headers` の `style-src` に対応 hash が含まれること
  - dist HTML inline style content から計算した sha256 が `_headers` の hash と一致すること (陽性対照メタテスト)

### 関連 PR / issue

- 本 entry を記録: PR 10 (本 PR、`#305` 対応)
- B 案 series 全 PR: PR 0 (#254) / PR 1 (#256) / PR 1.5 (#261) / PR 2 (#272) / PR 3 (#275) / PR 4 (#277) / PR 5a (#283) / PR 5b (#286) / PR 6 (#290) / PR 7a (#294) / PR 7b (#299) / PR 8 (#303) / PR 9 (#307) / PR 9 follow-up (#313) / PR 10 (本 PR)
- 過去: [054] (CSP 採用根拠) / [064] (CSP A-1 / script-src strict 化) / [067] (PR 8 setProperty CSP3 制約 + PR 9 outcome + Follow-up decisions)
- close: `#176` (本 entry で完了確認) / `#305` (PR 10 issue)

### Lessons learned

- **CSP3 仕様の事前確認**: PR 1.5 で `setProperty('--var', value)` パターンを導入した時、「CSSOM API は CSP 観点で `style="..."` HTML 属性とは別経路」という前提で設計したが、これは誤りだった (`[067]` で発覚)。CSP3 仕様 (`https://www.w3.org/TR/CSP3/#directive-style-src`) では `setProperty` 経由の DOM mutation も `style-src` 対象と明記されている。**教訓**: 新規 CSP 関連パターン導入時は仕様を熟読し、E2E `applyProductionCsp` gate を 1.5 段階で導入していれば早期検知できた。
- **Astro island runtime の暗黙 inline style**: PR 9 Phase 2 で発覚。Astro 自身が injection する inline style は `<meta>` 側 hash には自動取り込みされるが `_headers` 側には自動反映されない。**教訓**: build 出力の HTML 全体を grep して全 inline style 経路を網羅するチェックを strict 化前に実施。
- **ガード/バリデータには陽性対照を必須とする**: PR 5b の `withProductionCsp` meta-test (#281) や本 PR の Astro hash 検出網メタテストのように、検出網自体が silent pass しないことを陽性対照で能動確認する運用が定着。memory `feedback_positive_control_for_gates.md`。
- **段階的 PR の本数管理**: B 案は当初 PR 1〜6 想定だったが、実際は PR 0〜10 + follow-up で計 15 PR (含む scope 縮小 PR / 計画外発覚での分割)。「PR の自然分割は infra / foundation / 個別 migration / docs」の方針 (memory `feedback_pr_size.md`) に従ったため、各 PR は review 単位で適切な大きさを維持できた。
- **subagent 委譲方針の使い分け**: PR 4 / 5a / 5b で「subagent 非 commit + 親で順次 commit」運用を確立、PR 7a / 7b / 8 / 9 / 10 では「親 Opus 直接実装」へ移行 (CSP flip / 高 stakes 検証は subagent verification trust の観点で親直接が安全)。memory `feedback_subagent_verification_trust.md` / `feedback_subagent_model.md`。
````

- [ ] **Step 3: ファイル状態確認**

Run: `git diff --stat docs/decisions.md`
Expected: `+130` 前後の追加行 (prettier 整形で +1〜+5 程度の差は許容)。削除行ゼロ。

- [ ] **Step 4: commit 4 を作成**

Run:

```bash
git add docs/decisions.md
git commit -m "$(cat <<'EOF'
docs(decisions): #176 B 案 PR 10 (4/5) — [068] B 案完了記録

style-src 'unsafe-inline' 削除と B 案 (PR 0〜10 series) 完了の design
decision を記録。

- B 案 PR 0〜10 series の依存図 + 各 PR の達成サマリ
- 本 PR (PR 10) で達成した事項 (両層 strict 化 / stripMetaStyleSrc 撤去
  / Astro island hash 取り込み / 検出網拡張)
- Astro island hash 取り込みの設計選定 (α handcoded、β/γ 不採用根拠)
- 削除した暫定 infra (stripMetaStyleSrc / MIGRATED_FILES / applyStrictStyleSrcCsp)
- 設計判断 KEEP 記録 (.text-primary 命名 / Tailwind border + @layer 優先度)
- 検出網運用ノート (inline-style-migration glob / applyProductionCsp gate
  / Phase 0 spec / 本 PR の Astro hash 検出網)
- 関連 PR / issue (PR 0〜10 全 link、#176 / #305 close)
- Lessons learned (CSP3 仕様 / Astro 暗黙 inline style / 陽性対照運用 /
  PR 本数管理 / subagent 委譲方針)

PR 1 (#256) reviewer I-3 で defer 容認、PR 6 → PR 8 → PR 10 へ持ち越されて
いた B 案完了記録の約束を本 entry で消化。
EOF
)"
```

Expected: pre-commit hook pass、commit 作成成功。

---

### Task 5: SoT (`docs/projects/issue-176-b-plan-progress.md`) を完了反映

**Files:**

- Modify: `docs/projects/issue-176-b-plan-progress.md` (進捗 table の PR 10 行 / 末尾に「B 案完了」セクション追加)

**目的:** PR 0〜10 series 完走を SoT に反映。merge hash は本 PR merge 後の chore PR で別途反映 (本 PR では `merged ` placeholder)。

- [ ] **Step 1: 進捗 table の PR 10 行を更新**

`old_string` (line 36 付近、唯一マッチ):

```markdown
| **PR 10 (新規)** | B 案最終 flip: `_headers` + `<meta>` 両側から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + test 群 strict 化 (PR 8 から rebase で削除した 3 commit を再投入) | 未着手 | issue [#305](https://github.com/fumtas1k/devtools/issues/305) |
```

`new_string`:

```markdown
| **PR 10** | B 案最終 flip: `_headers` + `<meta>` 両側から `style-src 'unsafe-inline'` 削除 + `stripMetaStyleSrc` 撤去 + test 群 strict 化 + Astro island hash 取り込み (`sha256-vv9I...`) + `[068]` B 案完了記録 | ✅ merged | issue [#305](https://github.com/fumtas1k/devtools/issues/305) (本 PR、merge hash は merge 後の chore PR で反映) |
```

- [ ] **Step 2: ファイル末尾に「B 案完了」セクションを追加**

`old_string` (現状の末尾、唯一マッチ):

```markdown
これらは Claude collaboration の preference であり project SoT ではないため repo には移さない。
```

`new_string`:

```markdown
これらは Claude collaboration の preference であり project SoT ではないため repo には移さない。

## B 案完了 (2026-05-09)

`#176` B 案 (PR 0〜10 + follow-up) 完走。詳細は `docs/decisions.md [068]` 参照。

### 達成サマリ

- **両層 (header / `<meta>`) で `style-src 'unsafe-inline'` 完全除去**: `_headers` / `<meta>` ともに `'self'` + 必要 hash のみの strict policy
- **React `style={{}}`**: 200+ 箇所を全廃 (PR 1〜5b)
- **Astro `style="..."`**: 65 件を全廃 (PR 6 / 7a / 7b)
- **CSSOM mutation (`setProperty` / `style.X =`)**: 全廃 (PR 9 で Constructable Stylesheets に refactor)
- **Astro island runtime style hash 取り込み** (handcoded fingerprint α): `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=` を `_headers` に hardcode + 整合性メタテスト

### 削除した暫定 infra

- `stripMetaStyleSrc()` integration (`astro.config.mjs`、[064] 由来)
- `MIGRATED_FILES` array (`inline-style-migration.test.ts`、PR 6 で glob 化済)
- `applyStrictStyleSrcCsp` helper (`tests/e2e/helpers.ts`、本 PR で不要化、削除は別 cleanup PR 候補)

### follow-up issue / 後続候補

- `applyStrictStyleSrcCsp` helper の削除 (cleanup PR 候補)
- Astro island hash 自動抽出検討 (β 選択肢、`[068]` 参照、handcoded fingerprint が長期保守コスト懸念になった場合の future enhancement)
- PR 10 merge hash 反映 chore PR (merge 後)
```

- [ ] **Step 3: ファイル状態確認**

Run: `git diff --stat docs/projects/issue-176-b-plan-progress.md`
Expected: `+25` 前後の追加行 (削除行は table の 1 行修正で 0 or 1)。

- [ ] **Step 4: commit 5 を作成**

Run:

```bash
git add docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
docs(projects): #176 B 案 PR 10 (5/5) — SoT 進捗 table 完了状態に同期

- 進捗 table の PR 10 行を「未着手」→「✅ merged」に更新 (merge hash は
  本 PR merge 後の chore PR で別途反映)
- 末尾に「B 案完了」セクションを新設 (達成サマリ / 削除した暫定 infra /
  follow-up 候補)、#176 close を明記

詳細な design decision は docs/decisions.md [068] を参照。
EOF
)"
```

Expected: pre-commit hook pass、commit 作成成功。

---

### Task 6: 親直接 verify (build + E2E + 検出網メタテスト)

**目的:** 全 5 commit の status を最終検証。CSP flip は高 stakes ゆえ親直接で全項目 pass を確認。

- [ ] **Step 1: 全 commit 状態確認**

Run: `git log --oneline -7`
Expected: 直近 7 commit に以下が順番に並ぶ:

```
<hash5> docs(projects): #176 B 案 PR 10 (5/5) ...
<hash4> docs(decisions): #176 B 案 PR 10 (4/5) ...
<hash3> test(csp): #176 B 案 PR 10 (3/5) ...
<hash2> refactor(csp): #176 B 案 PR 10 (2/5) ...
<hash1> refactor(csp): #176 B 案 PR 10 (1/5) ...
25787c3 docs(spec): #176 B 案 PR 10 ...
5faa9f4 chore(docs): #176 B 案 SoT に PR #313 merge hash 反映 ...
```

- [ ] **Step 2: 型検査**

Run: `astro check`
Expected: 既存と同等 (errors 0、warnings 0、hints 一定数で増加なし)。

- [ ] **Step 3: 全 unit test**

Run: `npm run test`
Expected: 全 pass。新規追加した「Astro island runtime style hash 整合性」describe ブロック含めて green。

- [ ] **Step 4: 親直接 E2E (production CSP gate 含む全 spec)**

Run: `npm run test:e2e`
Expected: violation ゼロ、全 spec pass (~149 件想定)。

特に注目すべき spec:

- `csp-constructable-stylesheet.spec.ts` (Phase 0 minimal repro): pass
- `applyProductionCsp` gate を持つ spec (uuid-v7 / ulid-generator / config-converter 等): violation ゼロ (PR 9 Phase 2 で発覚した `vv9I...` block が本 PR の hash 取り込みで解消)

- [ ] **Step 5: 検出網メタテスト陽性対照確認 (手動 1 回)**

Run (一時的に hash を 1 文字書換):

```bash
# 一時的に _headers の hash を 1 文字変更 (例: 末尾 'ow=' を 'oo=' に)
# 編集ツールで public/_headers の 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=' を
# 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/oo=' に変更
npm run test -- meta-csp
```

Expected: 「dist HTML inline style の sha256 が \_headers の hash と一致する」test が **fail**。本テストが silent pass しないことを陽性対照で確認。

その後、変更を元に戻す:

```bash
# public/_headers の hash を 'ow=' に戻す (元の値)
git diff public/_headers  # 変更が消えていることを確認
```

`git diff public/_headers` が empty であれば元に戻っている。

最終確認:

Run: `npm run test -- meta-csp`
Expected: 全 pass (元に戻したため green)。

---

### Task 7: PR 作成 (CLAUDE.md 必須 4 点遵守)

**目的:** PR を `develop` ベースで作成。

- [ ] **Step 1: pre-create check (base 一致 / スコープ確認 / aria-\* 削除なし)**

Run:

```bash
git fetch origin develop
git merge-base origin/develop HEAD
git diff origin/develop --name-only
```

Expected:

- `git merge-base` が origin/develop tip hash (現状 `5faa9f4`) を返す
- `git diff` で本 PR で touch する 8 ファイル一覧 (spec + 7 implementation files):
  - `docs/superpowers/specs/2026-05-09-issue-176-b10-final-flip-design.md`
  - `docs/superpowers/plans/2026-05-09-issue-176-b10-final-flip-plan.md` (本 plan、commit 6 で含める or 別 commit)
  - `public/_headers`
  - `src/utils/csp.ts`
  - `astro.config.mjs`
  - `src/utils/__tests__/headers.test.ts`
  - `src/utils/__tests__/meta-csp.test.ts`
  - `src/utils/__tests__/astro-config-csp.test.ts`
  - `docs/decisions.md`
  - `docs/projects/issue-176-b-plan-progress.md`

aria-\* 削除なし (本 PR は HTML 触らないため自明だが念のため `git diff origin/develop -- '*.tsx' '*.astro' | grep aria-` で確認、出力空であれば OK)。

- [ ] **Step 2: plan を commit (もし未 commit なら)**

`git status -s` で `docs/superpowers/plans/...` が untracked or modified なら commit:

```bash
git add docs/superpowers/plans/2026-05-09-issue-176-b10-final-flip-plan.md
git commit -m "$(cat <<'EOF'
docs(plan): #176 B 案 PR 10 implementation plan

spec 25787c3 に基づく bite-sized task 実装プラン。7 tasks 構成:

- Task 1-2: refactor(csp) — _headers / csp.ts / astro.config.mjs strict 化
- Task 3: test(csp) — test 群 strict 化 + Astro hash 検出網 (sha256 整合性
  メタテスト含む)
- Task 4-5: docs — [068] B 案完了記録 + SoT 完了反映
- Task 6: 親直接 verify (build + E2E + 検出網陽性対照)
- Task 7: PR 作成

各 step に exact code / exact command / expected output を記載済。
EOF
)"
```

- [ ] **Step 3: branch を origin に push**

Run: `git push -u origin feature/issue-176-b10-final-flip`
Expected: push 成功。

- [ ] **Step 4: PR body を `/tmp/claude/pr_body.md` に書き出し**

Run: `mkdir -p /tmp/claude` (idempotent)、その後 Write tool で `/tmp/claude/pr_body.md` に以下内容を保存:

```markdown
## 概要

`#176` B 案 (PR 0〜10 series) の最終 flip。`style-src 'unsafe-inline'` を `_headers` (HTTP) と `<meta>` (Astro 自動注入) の両層から完全除去し、Astro island runtime style hash を取り込んで両層 strict 化を完成させる。

PR 9 ([#307](https://github.com/fumtas1k/devtools/pull/307)) で `setProperty` 経路を Constructable Stylesheets 化し、PR 9 follow-up ([#313](https://github.com/fumtas1k/devtools/pull/313)) で FOUC / sheet 再利用 decision を確定済。本 PR で B 案 series 完走。

## 実装内容

- **`_headers` / `csp.ts`**: `style-src 'self' 'unsafe-inline'` → `'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='`
- **`astro.config.mjs`**: `stripMetaStyleSrc()` 暫定 integration ([064] 由来) を完全撤去 + 関連 import 削除
- **test 群 strict 化**: `headers.test.ts` / `meta-csp.test.ts` で `'unsafe-inline'` 不在 + Astro hash 存在を陽性 assert、`astro-config-csp.test.ts` から `stripMetaStyleSrc` 関連 2 ブロック削除
- **Astro island hash 検出網追加** (`meta-csp.test.ts` 拡張):
  - dist HTML 内に Astro inline style literal `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>` が含まれること
  - dist HTML inline style content の sha256 が `_headers` の hash と一致すること (陽性対照メタテスト、Task 6 で手動確認済)
- **`decisions.md [068]`**: B 案完了の design decision を記録 (PR 0〜10 series 依存図 / Astro hash 設計選定 / 削除した暫定 infra / 設計判断 KEEP / 検出網運用ノート / Lessons learned)
- **SoT 完了反映**: PR 10 行 ✅ merged 化 + 「B 案完了」セクション追加

## 採用した戦略

Astro island hash 取り込みは **option α (handcoded fingerprint + 検出網)** を採用。

- (β) build-time 自動抽出: hash 1 個固定に対して 80-150 行 hook は overkill
- (γ) `_headers` permissive 維持、meta strict only: B 案 goal「両層 strict」と矛盾、`<meta>` が壊れた状況で fallback policy が permissive

詳細は `docs/decisions.md [068]` 参照。

## 検証

- 親直接 `astro check`: errors 0 / warnings 0
- 親直接 `npm run test`: 全 pass (新規追加した Astro hash 整合性メタテスト含む)
- 親直接 `npm run build`: dist 生成成功、`<meta>` に hash 付き strict CSP
- 親直接 `npm run test:e2e`: violation ゼロ、全 spec pass
  - `csp-constructable-stylesheet.spec.ts` (Phase 0 minimal repro): pass
  - `applyProductionCsp` gate を持つ spec: PR 9 Phase 2 で発覚した `vv9I...` block が本 PR の hash 取り込みで解消、green
- 検出網陽性対照メタテスト: hash 1 文字書換で test fail を手動確認済 (silent pass しないことの保証)

VRT は CI で自動 (本 PR は CSP flip / docs only でレンダリング変更なし、diff ゼロ想定)。

## 関連

- 親プロジェクト: `#176` B 案 (`docs/projects/issue-176-b-plan-progress.md`)
- 前段: PR `#307` (PR 9, ResultTable + ToggleGroup refactor) / PR `#313` (PR 9 follow-up, decision メモ化)
- 設計書: `docs/superpowers/specs/2026-05-09-issue-176-b10-final-flip-design.md` (commit `25787c3`)
- Closes `#176` (B 案完了)
- Closes `#305` (PR 10 issue)

## follow-up 候補

- `applyStrictStyleSrcCsp` helper の削除 (本 PR で `applyProductionCsp` 自体が strict 化のため不要化、cleanup PR 候補)
- PR 10 merge hash 反映 chore PR (本 PR merge 後、`5faa9f4` パターン)
- Astro island hash 自動抽出検討 (β、handcoded fingerprint が長期保守コスト懸念になった場合)
```

- [ ] **Step 5: gh pr create で PR 作成 (`--base develop` / `--body-file` 必須)**

Run:

```bash
gh pr create \
  --base develop \
  --title "refactor(csp): #176 B 案 PR 10 — style-src strict 化最終 flip + Astro island hash 取り込み + B 案完了記録 ([068])" \
  --body-file /tmp/claude/pr_body.md
```

Expected: PR URL が返る (例: `https://github.com/fumtas1k/devtools/pull/315` あたり)。

- [ ] **Step 6: PR 状態確認 + URL を user に共有**

Run: `gh pr view --json url,baseRefName,title,state | jq .`
Expected: `baseRefName: "develop"`、`state: "OPEN"`、title が日本語で正しく設定されている。

返却された PR URL を user に報告。

---

## Summary

- 7 tasks、すべて bite-sized
- 5 commit (Task 1-5) + spec commit `25787c3` + plan commit (Task 7 step 2 で含める)、合計 7 commit on branch
- 想定総工数: 90〜150 分 (E2E + build + 検出網メタテスト含む)
- 親直接実装 (subagent 委譲なし、CSP flip は高 stakes)
- CLAUDE.md 必須 4 点遵守: `--base develop` / `--body-file` / pre-create check / 日本語

## Self-Review

**Spec coverage:**

- spec § 2.1 (Astro hash 戦略 α): Task 1 (`_headers` / `csp.ts` に hash hardcode) + Task 3 (検出網)
- spec § 2.2 (1 PR 完結): Task 1-5 で 5 commit を 1 PR に集約
- spec § 2.3 (親直接実装): plan 全体で subagent 不使用、Task 6 で親直接 verify
- spec § 3.1-3.5 (各 commit 詳細): Task 1-5 にそれぞれ対応
- spec § 4 (検証戦略): Task 6 で全項目カバー
- spec § 5 (スコープ外): plan で明示的に touch せず (`useDynamicStyleSheet.ts` / `ResultTable.tsx` / `ToggleGroup.tsx` / `inline-style-migration.test.ts` / `csp-constructable-stylesheet.spec.ts` / `applyStrictStyleSrcCsp` helper)
- spec § 6 (リスクと緩和): Task 6 step 5 で陽性対照メタテスト確認
- spec § 7 (branch / PR 命名): Task 7 で CLAUDE.md 必須 4 点
- spec § 9 (PR 作成必須チェックリスト): Task 7 step 1 / 4 / 5 でカバー

**Placeholder scan:** TBD / TODO / 「適切に」「以下のように」等の placeholder 表現なし。各 step に exact code / exact command / expected output を記載済。

**Type consistency:** `useDynamicStyleSheet` / `PRODUCTION_CSP` / 各 test ファイル名 / hash 値 (`sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=`) は plan 全体で一貫。
