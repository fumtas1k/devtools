# #176 B 案 PR 1: 基礎工事 + `ui/*` simple 11 ファイル migration 設計書

**作成日**: 2026-05-03
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 1
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) 完了済み
**マスター設計書**: 旧 `docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md`（PR #253 と一緒に close されたブランチ。`$TMPDIR/issue-176-b1-archive/` にバックアップ済み）。バッチ計画全体は memory `project_b_plan_progress.md` を SoT とする。本 PR 1 spec を読めば PR 1 の作業は完結する自己完結設計。

---

## ゴール

`src/components/ui/` の simple 11 ファイルから JSX `style={{}}` および CSSOM 直接 mutation (`element.style.X = Y`) を完全除去し、後続 PR の foundation を整える。

完了基準:

1. 対象 11 ファイルから `style={{` ヒット数 0、`element.style.X = Y` 形式の inline mutation 0（`element.style.setProperty('--var', value)` 形式の CSSOM API 経由は許容）
2. `src/styles/global.css` に `@layer components` ブロックが追加され、PR 1 で実使用される class のみが定義される（YAGNI 厳守、PR 2-6 用 class は都度追加）
3. `src/utils/__tests__/inline-style-migration.test.ts` が新規追加され、11 ファイルを `MIGRATED_FILES` array に登録、`style={{` および DOM mutation を陽性検出。陽性対照（positive control）として意図的違反が検出されることも assert
4. **VRT 検証**:
   - CI 上 `visual-regression.yml` が `npm run test:vrt` を実行、36/36 baseline 比較。差分があれば PR comment + artifact link 投稿
   - 意図しない差分の場合: 該当 component / class を修正
   - 意図的差分の場合: PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger して baseline 更新
   - ローカル mac での `npm run test:vrt` は参考情報（OS フォントレンダリング差で flake する可能性、baseline は CI Linux 専用）。push 前のハードゲートにはしない
   - VRT は branch protection の required check に**含まれない**（`docs/decisions.md` [066]）→ fail しても merge 可、reviewer 判断
5. ローカル必須ゲート: push 前に `npm run test`（vitest）/ `npx astro check` / `npm run test:e2e` 全 green
6. `src/utils/styles.ts` 自体は **削除しない**（ResultTable / InputField / qr-ticket / tools 側で参照継続。PR 6 で削除）
7. `docs/ui-conventions.md` Section 2.1（hover ルール）/ 2.2（typography 名）を class-based ルールに更新
8. `.claude/skills/dads-design-system/SKILL.md` および `.claude/skills/dads-design-system/references/components.md` の冒頭に「issue #176 B 案 移行中」のステータスバナーを追記（既存の inline-style 例には「移行中の暫定パターン」と注釈、削除は PR 6 で実施）

非ゴール: ResultTable / InputField の API redesign（PR 1.5）、qr-ticket / tools 側 migration（PR 2-5）、CSP `_headers` flip（PR 6）

---

## なぜ独立 PR か

旧 PR #253 が VRT 導入と ui migration を bundle したため architectural に close された。VRT は #254 で proper sequencing（mock 注入 → CI Linux baseline → 非 required check）で先行導入済み。本 PR は VRT 監視下で ui migration foundation を作る最初の段。

memory 参照:

- `feedback_vrt_setup_sequencing.md`
- `feedback_infra_feature_separation.md`
- `feedback_subagent_verification_trust.md`
- `project_b_plan_progress.md`

---

## 採用する設計

### 1. 命名規約: Tailwind v4 auto-utility 優先 + `@layer components` 補完

**前提**:

- Tailwind v4 の `@theme` ブロック内 `--color-*` token は **auto-generate された utility が利用可能**（例: `--color-primary` → `text-primary` / `bg-primary` / `border-primary`）
- `:root` 直書き token は auto-generate されない（例: `--color-text` / `--color-muted` / `--color-bg-subtle` 等）
- 既存 `.text-link` / `.text-link-color` / `.tool-info-*` / `.skip-link` は維持（命名衝突を避ける）

**規則**:

| ケース                                                               | 対応                                                           | 例                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `@theme` 内 token を直接使う                                         | Tailwind utility 直使用                                        | `text-primary`, `bg-error`, `border-error`, `text-success` |
| `:root` 直書き token を使う                                          | `@layer components` で semantic class を定義                   | `.text-default { color: var(--color-text); }`              |
| `@theme` 内 token だが auto-utility 名が awkward（`bg-error-bg` 等） | `@layer components` で semantic alias を定義（衝突しない別名） | `.bg-error-tint { background: var(--color-error-bg); }`    |
| typography pattern (`bodyEmphasis` / `caption`)                      | `@layer components` で class 定義                              | `.body-emphasis`, `.caption`                               |
| component-scoped 状態 / hover                                        | `@layer components` で BEM 風 component class                  | `.btn-clear`, `.btn-clear:hover`, `.btn-action--primary`   |

**「Tailwind カラークラス禁止」memory rule との整合**: ルールは「色値直書き utility（`text-blue-500`）」を指す。`text-primary`（`@theme` の意味 token 経由）は SoT を壊さないため許容。

### 2. `src/styles/global.css` への `@layer components` 追加

PR 1 で実使用する分のみ。後続 PR で必要に応じて積み増し。

```css
/* 既存 .text-link / .skip-link 等の後ろに追加 */
@layer components {
  /* === Typography (legacy bodyEmphasis / caption from src/utils/styles.ts) === */
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

  /* === Color tokens not in @theme (no Tailwind auto-utility) === */
  .text-default {
    color: var(--color-text);
  }
  .text-muted {
    color: var(--color-muted);
  }
  .text-on-primary {
    color: var(--color-text-on-primary);
  }
  .bg-default {
    background: var(--color-bg);
  }
  .bg-subtle {
    background: var(--color-bg-subtle);
  }
  .border-default {
    border-color: var(--color-border);
  }
  .border-input {
    border-color: var(--color-border-input);
  }

  /* === Semantic aliases for awkward Tailwind auto-utility names === */
  .bg-error-tint {
    background: var(--color-error-bg);
  }
  .bg-success-tint {
    background: var(--color-success-bg);
  }

  /* === Elevation alias === */
  .shadow-elev-2 {
    box-shadow: var(--elevation-2);
  }

  /* === Component-scoped classes === */
  /* ClearButton: hover bg を CSSOM mutation から CSS :hover へ */
  .btn-clear {
    background: transparent;
    transition: background-color 0.15s;
  }
  .btn-clear:hover {
    background: var(--color-bg-subtle);
  }

  /* CopyButton: copied 状態の bg / color / border 切替 */
  .btn-copy {
    border: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
    color: var(--color-text);
    transition:
      background-color 0.2s,
      color 0.2s,
      border-color 0.2s;
  }
  .btn-copy.is-copied {
    border-color: var(--color-success);
    background: var(--color-success-bg);
    color: var(--color-success);
  }
  .btn-copy.is-compact {
    border: none;
  }

  /* ActionButton: variant × disabled マトリクス */
  .btn-action {
    border-style: solid;
    border-width: 1px;
  }
  .btn-action--default {
    border-color: var(--color-border-input);
    background: var(--color-bg-subtle);
    color: var(--color-text);
  }
  .btn-action--primary {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }
  .btn-action--secondary {
    border-color: var(--color-primary);
    background: transparent;
    color: var(--color-primary);
  }
  .btn-action--danger {
    border-color: var(--color-error);
    background: transparent;
    color: var(--color-error);
  }
  /* disabled 上書き: variant 別に bg / border / color を再指定 */
  .btn-action:disabled {
    background: var(--color-bg-subtle);
    color: var(--color-muted);
    cursor: not-allowed;
  }
  .btn-action--primary:disabled {
    border-color: var(--color-bg-subtle);
  }
  .btn-action--secondary:disabled {
    border-color: var(--color-border);
    background: transparent;
  }

  /* ToggleGroup: button 状態切替 + 動的 grid columns 受け口 */
  .toggle-grid {
    display: grid;
    grid-template-columns: repeat(var(--toggle-cols, 2), minmax(0, 1fr));
    gap: 0.25rem;
  }
  .btn-toggle {
    background: transparent;
    color: var(--color-muted);
    transition:
      background-color 0.15s,
      color 0.15s,
      box-shadow 0.15s;
  }
  .btn-toggle[aria-pressed='true'] {
    background: var(--color-bg);
    color: var(--color-text);
    box-shadow: var(--elevation-2);
  }
}
```

**衝突確認**:

- `text-default` / `text-muted` / `text-on-primary` / `bg-default` / `bg-subtle` / `border-default` / `border-input` / `bg-error-tint` / `bg-success-tint` / `shadow-elev-2` の各 class 名対応 token は `@theme` ブロックに**存在しない**（`:root` 経由のみ） → Tailwind v4 auto-utility と衝突しない
- `.body-emphasis` / `.caption` は token 名と無関係、衝突なし
- 既存 `.text-link` / `.text-link-color` / `.tool-info-*` / `.skip-link` は無関係（命名衝突なし）
- `.btn-*` / `.toggle-grid` は BEM 風命名で唯一性確保

### 3. ファイル別 migration mapping

| #   | File                 | 現状 (style 件数) | 移行先                                                                                                                                                                                                                                                                         |
| --- | -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `ActionButton.tsx`   | 1                 | `caption font-semibold btn-action btn-action--{variant}`（disabled は `:disabled` 擬似で吸収）                                                                                                                                                                                 |
| 2   | `BareInput.tsx`      | 1                 | `caption px-2 py-1.5 bg-default text-default border` + 条件 `border-error` / `border-input` + 任意 `font-mono`                                                                                                                                                                 |
| 3   | `ClearButton.tsx`    | 1 + CSSOM 2       | `caption text-muted btn-clear`（hover bg は CSS `:hover`）                                                                                                                                                                                                                     |
| 4   | `CopyButton.tsx`     | 2                 | `caption btn-copy` + 条件 `is-copied` / `is-compact`                                                                                                                                                                                                                           |
| 5   | `CountInput.tsx`     | 3                 | label: `body-emphasis text-default block mb-1`、input: `caption w-24 border border-input bg-default text-default rounded-lg px-3 py-2`、hint: `caption text-muted mt-1`                                                                                                        |
| 6   | `DownloadButton.tsx` | 1                 | `inline-flex items-center gap-1.5` Tailwind utility に置換                                                                                                                                                                                                                     |
| 7   | `ErrorMessage.tsx`   | 3                 | block container: `border border-error bg-error-tint rounded-lg p-4`、block text: `caption text-error`、inline: `caption text-error mt-1`                                                                                                                                       |
| 8   | `OutputField.tsx`    | 3                 | header: `mb-3 min-h-8`、label: `body-emphasis text-default`、textarea: `caption font-mono border border-default bg-subtle text-default rounded-lg px-3 py-2 w-full` + 条件 `resize-y` / `resize-none`                                                                          |
| 9   | `Section.tsx`        | 3                 | 外枠: `rounded-xl border border-default overflow-hidden`、header: `body-emphasis text-default bg-subtle border-b border-default px-4 py-3 m-0`、body: `bg-default p-4`                                                                                                         |
| 10  | `Select.tsx`         | 3                 | wrapper: `relative`、select: `caption border border-input bg-default text-default rounded-lg pl-3 pr-10 py-2 w-full appearance-none`、svg: `absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted`                                                          |
| 11  | `ToggleGroup.tsx`    | 2                 | 外枠: `bg-subtle border border-input rounded-lg p-1` + `isWrap` のとき `flex flex-wrap gap-1`、それ以外（grid mode）は `toggle-grid`（CSS 変数 `--toggle-cols` 経由で動的列数）。button: `caption font-semibold btn-toggle ${size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5'}` |

#### ToggleGroup の動的 grid columns 対応

`gridTemplateColumns: repeat(${options.length}, minmax(0, 1fr))` は options 数に応じて変わる動的値。CSS 変数注入で対応:

```tsx
const gridRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (!isWrap && gridRef.current) {
    gridRef.current.style.setProperty('--toggle-cols', String(options.length));
  }
}, [isWrap, options.length]);

// className: `${isWrap ? 'flex flex-wrap gap-1' : 'toggle-grid'}`
```

`.toggle-grid` 側で `repeat(var(--toggle-cols, 2), minmax(0, 1fr))` を参照。

**根拠**: `style.setProperty('--var', value)` は CSSOM API 経由の CSS variable 注入で、CSP3 の解釈で属性経由の inline style mutation と区別される（widely allowed in browsers）。一方 `el.style.X = Y` は属性代入とみなされ strict CSP 下で block されうる。本 spec ではこの差を採用し setProperty 経由は許可、`el.style.X = Y` は migration test で禁止。

### 4. `inline-style-migration.test.ts` 設計

```ts
// src/utils/__tests__/inline-style-migration.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * #176 B 案 progressive migration tracker.
 * 移行済みファイルから `style={{` および CSSOM 直接 mutation
 * (`element.style.X = ...` 形式) が消えていることを assert する。
 *
 * 各 PR で MIGRATED_FILES に追記、PR 6 で `await glob('src/**\/*.tsx')` に置換して全件カバー化。
 */
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加
  'src/components/ui/ActionButton.tsx',
  'src/components/ui/BareInput.tsx',
  'src/components/ui/ClearButton.tsx',
  'src/components/ui/CopyButton.tsx',
  'src/components/ui/CountInput.tsx',
  'src/components/ui/DownloadButton.tsx',
  'src/components/ui/ErrorMessage.tsx',
  'src/components/ui/OutputField.tsx',
  'src/components/ui/Section.tsx',
  'src/components/ui/Select.tsx',
  'src/components/ui/ToggleGroup.tsx',
];

/**
 * 検出パターン:
 * 1. `style={{` — JSX inline style object 開始
 * 2. `\.style\.[a-zA-Z]+\s*=` — DOM 要素の style プロパティ代入
 *
 * 例外 (許容):
 * - `ref.current.style.setProperty('--var', value)` — CSSOM API 経由は許容
 *   regex は `\.style\.X = Y` のみ検出、`.style.setProperty(` は検出しない
 */
describe('#176 B 案 progressive migration tracker', () => {
  describe.each(MIGRATED_FILES)('%s', (file) => {
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

memory `feedback_positive_control_for_gates.md` 準拠。

### 5. `docs/ui-conventions.md` Section 2.1 / 2.2 改訂

**Section 2.1 (hover ルール)**: `onMouseEnter` / `onMouseLeave` で inline style を差し替えるパターンを禁止に変更。`@layer components` の `:hover` 擬似クラスへ移行する例を提示。「Tailwind カラー utility 禁止」は維持しつつ、`@theme` 経由 auto-utility は許容と明記。

**Section 2.2 (typography 名)**: `caption` / `bodyEmphasis` を TS インポートではなく CSS class 名で参照する形に更新（lineHeight 1.7 という事実は class 化後も保持）。

### 6. `.claude/skills/dads-design-system/` migration banner

**SKILL.md 冒頭**:

```markdown
> ⚠️ **移行中**: issue [#176](https://github.com/fumtas1k/devtools/issues/176) B 案で `colors.* + style={{}}` パターン → `@layer components` semantic class へ移行中。
>
> - **新規 component**: class-based パターン (`global.css` に semantic class を追加 + className で参照) を使う
> - **既存 component**: PR 番号順に migration（progress: PR 1 = `ui/*` simple 11、PR 1.5 = `ResultTable` + `InputField`、PR 2 = `qr-ticket/*`、PR 3-5 = tools、PR 6 = CSP flip + `colors.*` 撤去）
> - 本 SKILL.md / references/components.md の inline-style 例は移行中の暫定パターン。PR 6 で全例を class-based に rewrite 予定。
```

`references/components.md` も同様の banner を冒頭に追記。

---

## バッチ計画における本 PR の位置付け

memory `project_b_plan_progress.md` のテーブル参照。

| #        | スコープ                                                                                | 状態           |
| -------- | --------------------------------------------------------------------------------------- | -------------- |
| PR 0     | VRT 導入                                                                                | ✅ #254 merged |
| **PR 1** | **基礎工事 + ui/\* simple 11**                                                          | **本 PR**      |
| PR 1.5   | ui/\* complex (ResultTable + InputField) — API redesign 含む                            | 未着手         |
| PR 2     | qr-ticket/\*                                                                            | 未着手         |
| PR 3     | JwtDecoder + UuidV7Generator                                                            | 未着手         |
| PR 4     | Gs1Databar + EncodingConverter + DummyText                                              | 未着手         |
| PR 5     | QrReader + ConfigConverter + JanCode + QrCode + 残り tools                              | 未着手         |
| PR 6     | flip + cleanup（CSP strict 化、`stripMetaStyleSrc()` 撤去、`src/utils/styles.ts` 削除） | 未着手         |

PR は**直列**（前 PR がマージされてから次 PR 着手）。

---

## 検証戦略

### ローカル必須ゲート（push 前）

| 順  | コマンド                | 目的                                                              | 失敗時                                                    |
| --- | ----------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `npm run test` (vitest) | unit + 新規 migration test 11 ファイル × 2 spec + 陽性対照 3 spec | 該当ファイルの `style={{` / DOM mutation を実コードで除去 |
| 2   | `npx astro check`       | TypeScript 型チェック                                             | className のタイポ・未定義 class 参照を検出               |
| 3   | `npm run test:e2e`      | functional E2E 144 + 1 skip 全 pass                               | regression を fix                                         |

### CI（PR push で起動）

| workflow                | 実行内容                                                     | required?       |
| ----------------------- | ------------------------------------------------------------ | --------------- |
| `test.yml`              | vitest + e2e                                                 | ✅ required     |
| `visual-regression.yml` | `npm run test:vrt` (36 baseline 比較)、PR comment + artifact | ❌ non-required |

### VRT 差分の判断フロー

PR comment に diff があった場合:

- 意図しない regression → component / class の修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和（事前合意必要）
- 意図的変化 → PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back → PR 内で説明

### a11y 退化検知

memory `feedback_commander_checklist.md` 準拠。PR 作成時に親 Opus が `role=` / `aria-*` 属性の差分を確認（`git diff -- src/components/ui/*.tsx`）。class 化により `role` / `aria-*` が漏れていないことを目視チェック。

---

## スコープ外

- `ResultTable.tsx` / `InputField.tsx` (PR 1.5)
- `qr-ticket/*` (PR 2)
- JwtDecoder / UuidV7Generator (PR 3)
- Gs1Databar / EncodingConverter / DummyText (PR 4)
- QrReader / ConfigConverter / JanCode / QrCode / 残り tools (PR 5)
- `_headers` の `style-src 'unsafe-inline'` 削除 (PR 6)
- `stripMetaStyleSrc()` 撤去 (PR 6)
- `src/utils/styles.ts` 削除 (PR 6)
- `@theme` token 整理 / token rename (別 issue)
- `DownloadButtonGroup` / `*.astro` (CategoryBadge / PageContainer / ToolIcon / ToolInfoSection): 既に inline style なし or `<style>` block で hash 適用済み → 対象外
- `dads-design-system` skill の本格 rewrite (PR 6、PR 1 では migration note 追記のみ)
- `docs/ui-conventions.md` の Section 2.1 / 2.2 以外: 触らない

---

## リスクと緩和

| ID  | リスク                                                                                              | 緩和                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | VRT で意図しない pixel diff が大量発生                                                              | 11 ファイル × 18 page で影響を受ける page 数は限定的。差分があれば PR ブランチで `update-visual-baseline.yml` を trigger して baseline 更新、PR 内で「migration による期待差分」と注記 |
| R2  | ToggleGroup の `setProperty` 経由 CSS 変数注入が CSP 下で挙動変化                                   | `setProperty` は CSSOM API 経由で属性代入ではないため strict CSP でも block されない（仕様準拠）。E2E で動作確認                                                                       |
| R3  | ActionButton の variant × disabled マトリクス class 化で旧見た目崩壊                                | VRT が全 18 page で検出。ActionButton は qr-ticket / 他 tools でも widely 使用される hot path のため、単体での見た目確認は manual preview で重点チェック                               |
| R4  | ClearButton の hover 反応が CSS `:hover` への移行で間隔感が変わる                                   | `transition: background-color 0.15s` を旧 onMouseEnter から維持。VRT は静止状態のみ撮影なので hover 自体は manual preview で確認                                                       |
| R5  | 11 ファイルの className 変更が tools / qr-ticket / ResultTable / InputField の引数 / props 型に影響 | 11 ファイルは props API を変えない（内部実装のみ）。`Omit<..., 'style' \| 'className'>` 等の既存 API 制約は維持                                                                        |
| R6  | dads-design-system skill の migration banner が後続 PR で見落とされる                               | banner に進捗テーブルを記述、各 PR でテーブル更新                                                                                                                                      |

---

## ブランチ命名 / コミット粒度 / PR ベース

### ブランチ命名

- `feature/issue-176-b1-foundation-and-ui-simple`
- worktree 経由の場合は memory `feedback_worktree_base_branch.md` に従い `git worktree add ... origin/develop -b feature/issue-176-b1-foundation-and-ui-simple` を**明示**

### コミット粒度

```
1. global.css に @layer components ブロック追加
2. inline-style-migration.test.ts 追加（11 ファイル登録 + 陽性対照）
3. ActionButton.tsx migration
4. BareInput.tsx migration
5. ClearButton.tsx migration（CSSOM mutation 撤去含む）
6. CopyButton.tsx migration
7. CountInput.tsx migration
8. DownloadButton.tsx migration
9. ErrorMessage.tsx migration
10. OutputField.tsx migration
11. Section.tsx migration
12. Select.tsx migration
13. ToggleGroup.tsx migration（setProperty 経由 CSS 変数注入）
14. docs/ui-conventions.md Section 2.1 / 2.2 改訂
15. .claude/skills/dads-design-system/SKILL.md + references/components.md に migration banner 追記
```

各 commit で migration test を「追加した範囲だけ pass」する状態に保つ。順序は `test 追加 → 各ファイル migration` 推奨（CI 上で fail/green を順次 trace 可）。

### PR ベース

`gh pr create --base develop` で必ず明示（memory `feedback_branch_workflow.md` / `feedback_pr_language.md`）。

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1)、[#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp coverage)、[#254](https://github.com/fumtas1k/devtools/pull/254) (VRT 導入)
- 過去 decisions: [054]（CSP 初導入）／[064]（A-1 採用）／[066]（VRT 採用）
- 旧 PR: [#253](https://github.com/fumtas1k/devtools/pull/253) (closed) — VRT bundle で architectural 失敗、本 PR で proper sequencing で再着手
- memory: `project_b_plan_progress.md` / `feedback_vrt_setup_sequencing.md` / `feedback_infra_feature_separation.md` / `feedback_subagent_verification_trust.md` / `feedback_positive_control_for_gates.md` / `feedback_commander_checklist.md`
