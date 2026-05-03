# #176 B 案: `style-src 'unsafe-inline'` 削減 設計書

**作成日**: 2026-05-03
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
**前提**: A 案（[#249](https://github.com/fumtas1k/devtools/pull/249) で merged、`docs/decisions.md` [064]）完了済み

---

## ゴール

`public/_headers` の CSP から `style-src 'unsafe-inline'` を削除し、`<meta>` 由来の hash-only な strict CSP を style-src にも適用する。あわせて A 案で導入した `stripMetaStyleSrc()` 暫定 integration を撤去する。

完了状態:

- `grep -c "style={{" src/` が **0 件**
- `_headers` の CSP が `style-src 'self'`（`'unsafe-inline'` 不在）
- `astro.config.mjs` から `stripMetaStyleSrc()` integration 削除
- `<meta>` の `style-src` が `'self' 'sha256-...'`（auto-hash）形式で出力
- `src/utils/__tests__/headers.test.ts` / `src/utils/__tests__/meta-csp.test.ts` が strict 化に追従
- 全 E2E + visual regression が pass

## なぜ完全撲滅が必要か

CSP3 仕様で、`style-src` から `'unsafe-inline'` を削除すると:

- `<style>` block: hash で許可可（Astro security.csp が auto-hash）
- `style="..."` HTML 属性: **hash 適用対象外**（spec 上、attribute は hash/nonce で許可不可）
- `'unsafe-hashes'` source expression を使えば attribute も hash 適用可能だが、React の動的値で hash list が爆発し非現実的

→ 全ての `style="..."` 属性出力を 0 にする以外に道がない。React で `style={{}}` を使わないことが必須。

---

## 採用する設計

### 1. Target style system: Tailwind utility + 意味クラス

| 種類                                 | 移行先                                                                                            | 例                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| layout/spacing 静的                  | Tailwind utility                                                                                  | `style={{ marginBottom: '0.5rem' }}` → `className="mb-2"`                                           |
| color/typography token 参照          | `global.css` の意味クラス                                                                         | `style={{ ...caption, color: colors.muted }}` → `className="caption text-muted"`                    |
| 状態駆動の動的値                     | 条件 className 切替                                                                               | `style={{ color: isError ? 'red' : 'gray' }}` → `className={isError ? 'text-error' : 'text-muted'}` |
| 連続計算値（width %, 動的 color 等） | `useEffect` + `ref.style.setProperty('--var', value)` で CSS 変数注入、CSS 側で `var(--var)` 参照 | `style={{ width: \`${pct}%\` }}` → ref 経由                                                         |

**根拠**:

- 既存 Tailwind v4 全面採用と矛盾なし
- 既存 `var(--color-*)` SoT を意味クラス内部で参照する形になり、トークン管理は変わらない
- CSS Modules を新規採用するより cognitive load 低い（新ファイル増加なし）
- memory rule「Tailwind カラークラス禁止」は「色値直書きクラス（`text-blue-500`）」を指すため、意味クラス（`.text-primary` が `var(--color-primary)` を内部参照）とは衝突しない

### 2. 意味クラス定義場所: `src/styles/global.css` 集約

新規 `@layer components` ブロックに定義:

```css
@layer components {
  /* Typography (旧 src/utils/styles.ts の bodyEmphasis / caption) */
  .body-emphasis {
    font-size: 1.0625rem;
    font-weight: 700;
    line-height: 1.7;
    letter-spacing: 0.02em;
  }
  .caption {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.7;
    letter-spacing: 0.02em;
  }

  /* Color tokens (旧 colors.*) */
  .text-primary {
    color: var(--color-primary);
  }
  .text-muted {
    color: var(--color-muted);
  }
  .text-link {
    color: var(--color-link);
  }
  .text-on-primary {
    color: var(--color-text-on-primary);
  }
  .text-error {
    color: var(--color-error-text);
  }
  .text-success {
    color: var(--color-success);
  }
  .bg-surface {
    background: var(--color-bg-surface);
  }
  .bg-subtle {
    background: var(--color-bg-subtle);
  }
  .bg-primary {
    background: var(--color-background);
  }
  .bg-error {
    background: var(--color-error-bg);
  }
  .bg-success {
    background: var(--color-success-bg);
  }
  .border-default {
    border: 1px solid var(--color-border);
  }

  /* 共通 layout (qr-ticket sectionStyle 等の重複パターン) */
  .section-card {
    padding: 1rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
  }
}
```

ファイル分割（`src/styles/components.css` 等）はせず global.css 集約。理由: 175 → 250 行程度の拡張は可読性問題にならない、`@theme` と並ぶ位置で見渡しやすい。

### 3. 命名規約

- **意味ベース**（`.body-emphasis` / `.text-primary` / `.section-card`）— 用途で命名
- BEM (`.qr-ticket__field--invalid`) は単一 component 専用スタイルが必要な場合のみ
- Tailwind utility 風命名（`.text-md-primary`）は禁止 — Tailwind の生成 class と衝突回避

### 4. `src/utils/styles.ts` の段階的廃止

PR 1 で意味クラスを CSS に落とし込んだ時点で `src/utils/styles.ts` の役割は重複。ただし PR 1〜PR 5 の移行中は React 側の暫定参照として残す。**PR 6 で `src/utils/styles.ts` 削除 + 全 import 元の整理**。

---

## バッチ計画（7 PR）

| #          | PR スコープ                                                                                                                                                                                      | 移行件数 | 主目的                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR 1**   | 基礎工事 + `ui/*` の simple files (11 ファイル: CountInput / CopyButton / ClearButton / BareInput / ActionButton / DownloadButton / ToggleGroup / Section / ErrorMessage / OutputField / Select) | ~25      | 意味クラス定義、screenshot baseline、進捗 vitest 導入。simple ファイルでパターン確立                                                                            |
| **PR 1.5** | `ui/*` の complex files (ResultTable + InputField) — API redesign 含む                                                                                                                           | ~12      | `cellStyle: CSSProperties` escape hatch の撤廃、列幅は `<colgroup>` HTML 属性化、tools 側 callsite 更新含む                                                     |
| **PR 2**   | `qr-ticket/*` (GenerateTab + VerifyTab + TicketDetail)                                                                                                                                           | ~42      | 関連 3 ファイル一括                                                                                                                                             |
| **PR 3**   | 重量級: JwtDecoder + UuidV7Generator                                                                                                                                                             | ~41      | サイズ大の tools                                                                                                                                                |
| **PR 4**   | 中量級: Gs1Databar + EncodingConverter + DummyText                                                                                                                                               | ~53      | サイズ中の tools                                                                                                                                                |
| **PR 5**   | 軽量級: QrReader + ConfigConverter + JanCode + QrCode + UlidGenerator + Base64Codec + 残り tools                                                                                                 | ~42      | 残り tools を網羅                                                                                                                                               |
| **PR 6**   | flip + cleanup                                                                                                                                                                                   | 0        | `_headers` から `style-src 'unsafe-inline'` 削除、`stripMetaStyleSrc()` 撤去、`csp.ts`/`headers.test.ts` 同期、`src/utils/styles.ts` 削除、decisions [066] 追加 |

依存順序の根拠:

- **PR 1 first**: `ui/*` の simple files で意味クラスのパターン確立。後続 PR の foundation
- **PR 1.5**: ResultTable / InputField は API redesign を伴うため、simple ui のパターンが確立されてから着手すべき。`ResultTable` の `cellStyle: CSSProperties` prop を撤廃すると tools/ 側 callsite も更新が必要なため独立 PR にして影響範囲を明確化
- **PR 2-5**: 規模順で review 負荷分散。qr-ticket は同一ドメインで関連性高く独立化
- **PR 6 last**: 全 216 件移行確定後に CSP flip

PR 1.5 を分離した理由（2026-05-03 spec 改訂時に判明）:

- `ResultTable` は `cellStyle: CSSProperties` を arbitrary な escape hatch として受け取る設計で、これを撤廃しないと tools 側で結局 `style="..."` が出続けて strict 化不能
- `cellStyle` を削るには (a) `width: string` prop を `<colgroup><col width="X">` HTML 属性化（CSP 対象外）、(b) `textAlign` 等を className enum に変更、(c) tools 側 5+ callsite の更新、と影響範囲が広い
- `InputField` は runtime computed style (`border: 1px solid ${error ? colors.error : colors.borderInput}`) が散在し、条件 className 切替に変換するために clean な class 設計が必要
- これらを PR 1 に含めると 80+ 行 diff の巨大 PR になり review 困難

---

## 検証戦略

### 進捗検知 vitest（PR 1 で導入、各 PR で拡張）

`src/utils/__tests__/inline-style-migration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * #176 B 案 progressive migration tracker.
 * 移行済みファイルに style={{}} が残っていないことを assert する。
 * 各 PR で MIGRATED_FILES に追加していき、PR 6 で glob 全件に置き換えて完成。
 */
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追記:
  // 'src/components/ui/InputField.tsx',
  // 'src/components/ui/Section.tsx',
  // ...
];

describe('#176 B 案 progressive migration tracker', () => {
  for (const file of MIGRATED_FILES) {
    it(`${file} に style={{}} が残っていない`, () => {
      const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      expect(content).not.toMatch(/style=\{\{/);
    });
  }
});
```

PR 6 で `MIGRATED_FILES` を `await glob('src/components/**/*.tsx')` に置き換え、`src/` 全体カバー。

### Visual regression: Playwright `toHaveScreenshot()`（PR 1 で導入）

新規 `tests/e2e/visual-regression.spec.ts`:

- 全 18 ページ × 主要 viewport (Desktop 1280×800 / Mobile 390×844)
- baseline は CI Linux runner で撮影、git commit
- 各 PR で diff 検出、threshold は初期 `maxDiffPixels: 100` 程度で開始（flake 状況見て調整）
- ローカル mac で OS 差で flake → `--update-snapshots` で開発者が手動更新する運用（既存パターン）

baseline ファイルサイズ: 18 ページ × 2 viewport × ~80KB ≈ 3MB / 35 ファイル。git LFS 不要、通常の git commit で扱う。

### 既存 E2E + applyProductionCsp gate

各 PR で `npm run test:e2e` 全件 pass を維持。`applyProductionCsp` は本 spec 完了後（PR 6）の strict CSP 状態でも違反検出が陽性であることを confirm。

---

## スコープ外

- **`src/components/layout/*.astro` の `<style>` ブロック**: Header / Footer / MobileDrawer / Sidebar はすでに scoped `<style>` 化済み。Astro security.csp が auto-hash するため CSP 上の問題なし。本 spec の対象外
- **`src/pages/index.astro` の `<style>`**: 同上
- **`@theme` ブロックの整理**: 既存トークン定義は変更なし
- **ダークモード対応**: 既存 SoT (`var(--color-*)`) を維持するため、ダークモード追加は global.css の `.dark` block 拡張で別途対応可能。本 spec の対象外
- **新規 component の作成 / refactor**: 純粋に inline style → class 化のみ。component 構造変更は別 issue

---

## リスクと緩和

### R1: visual regression flake で CI が不安定化

**緩和**:

- baseline は **CI Linux runner で生成** する（mac とのフォントレンダリング差で flake 回避）。手順: PR 1 で空の screenshot test を commit → CI で初回 fail → workflow を `--update-snapshots` で再実行 → 生成されたファイルを artifact にアップロード → ローカルで download して commit、または GitHub Actions の commit step で push する運用にする
- `maxDiffPixels` を初期 100 程度で開始、flake 状況見て調整
- ローカル mac で OS 差で flake → 開発者が `--update-snapshots` で更新せず、CI 再実行のみで verify する運用
- それでも flake が頻発する場合は threshold 緩和 / ページ単位 mask で対処

### R2: 移行中の develop merge による conflict

**緩和**: 各 PR は前 PR がマージされてから着手（直列）。並列に進めない。conflict が出た場合は rebase で解消。ファイル分担が明確（PR 2 = qr-ticket/\*, PR 3 = JwtDecoder + UuidV7Generator, ...）なので相互衝突は限定的。

### R3: 動的値の対応で React anti-pattern (useEffect setProperty)

**緩和**: 本当に必要なケースのみに限定。多くは状態駆動の className 条件切替で表現可能。useEffect 経由 setProperty を使う場合はコメントで「CSP strict 化のため」と明記。

### R4: `useState` で動的に色変えるロジックを破壊

**緩和**: 各 PR の screenshot baseline + 機能 E2E でカバー。dynamic な見た目変化（input validation 状態の color 変更等）は手動 preview 確認も併用。

### R5: PR 6 の flip で見落としにより `<meta>` が破綻

**緩和**: PR 6 着手時に再度 `grep -c "style={{" src/` で 0 件確認 + 進捗 vitest を glob 全件に置き換えてから CSP flip。preview build で `<meta>` の `style-src` 内容を目視確認。

---

## 完了基準（PR 6 マージ時）

- `grep -c "style={{" src/` = **0**
- `public/_headers` の CSP に `style-src 'unsafe-inline'` 不在、`script-src` も既存通り strict
- `astro.config.mjs` から `stripMetaStyleSrc()` 関数定義 + integrations 配列の呼び出し削除
- `dist/*.html` の `<meta>` CSP に `style-src 'self' 'sha256-...'` が出現
- `src/utils/__tests__/headers.test.ts` の `style-src` テストが strict（`'unsafe-inline'` 不在を陽性 assert）に更新
- `src/utils/__tests__/meta-csp.test.ts` の `style-src 不在 assert` を `style-src strict 形式 assert` に変更
- `src/utils/__tests__/inline-style-migration.test.ts` が glob で全 `src/components/**/*.tsx` をカバー
- `src/utils/__tests__/astro-config-csp.test.ts` から `stripMetaStyleSrc` 呼び出し assert を削除
- `src/utils/styles.ts` 削除、全 import 元が CSS class 参照に置換
- visual regression baseline が flip 後の CSP で再撮影されている
- `docs/decisions.md` [066] エントリ追加（B 案完了の記録）
- 全 E2E + 全 unit + astro check pass

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1 完了)、[#247](https://github.com/fumtas1k/devtools/pull/247) (preview 切替), [#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp coverage)
- 過去 decisions: [054]（CSP 初導入）／[063]（preview 切替）／[064]（A-1 採用 + meta strict layer）
- 関連 issue: [#162](https://github.com/fumtas1k/devtools/issues/162)（共通 UI 抽出 — 完了済み）／[#164](https://github.com/fumtas1k/devtools/issues/164)（アクセントトークン拡張）
