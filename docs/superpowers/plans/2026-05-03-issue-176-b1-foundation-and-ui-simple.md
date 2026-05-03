# #176 B 案 PR 1: 基礎工事 + ui/\* simple 11 ファイル migration 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/components/ui/` の simple 11 ファイルから JSX `style={{}}` および CSSOM 直接 mutation (`element.style.X = Y`) を完全除去し、後続 PR (#176 B 案 PR 1.5〜PR 6) の foundation を整える。

**Architecture:** Tailwind v4 の `@theme` auto-utility を優先採用し、auto-utility 化されない `:root` 直書き token と awkward な auto 名のみ `@layer components` で semantic class として補完する。Component-scoped 状態（hover / variant / pressed）は BEM 風 component class で集約し、`:hover` / `:disabled` / `[aria-pressed="true"]` 擬似で動的性を CSS に押し込む。動的列数は CSSOM `setProperty('--var', value)` 経由（属性経由ではないため CSP3 strict 下でも許容）で表現する。

**Tech Stack:** Astro 6 + React 19 + Tailwind v4 (`@theme` block) + Vitest 4 + Playwright 1.59 + TypeScript 5.9。VRT 基盤は #254 で導入済み（`tests/e2e/visual-regression.spec.ts` + `visual-regression.yml`）。

**Spec:** `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md` を必ず先に通読すること。

**Prerequisites:**

- Branch: `feature/issue-176-b1-foundation-and-ui-simple`（main checkout で develop から作成済み、commit `b3e4e24` に spec あり）
- Subagent dispatch: 実装は `model: "sonnet"` 指定の subagent に委譲（memory `feedback_subagent_model.md`）
- Worktree (任意): subagent-driven-development を選ぶ場合 `.claude/worktrees/issue-176-b1/` に `git worktree add .claude/worktrees/issue-176-b1 origin/develop -b feature/issue-176-b1-foundation-and-ui-simple` で作成（ただし同名 branch 既存のため、checkout 切替の方が簡潔）
- 開始前に `git checkout feature/issue-176-b1-foundation-and-ui-simple && git pull` で最新化
- Node 22.12+、`npm ci` 済み（worktree なら SessionStart hook で自動）

---

## File Structure

| 種別   | パス                                                         | 役割                                                                                                                                               |
| ------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `src/styles/global.css`                                      | 末尾に `@layer components` ブロック追加、PR 1 で実使用する 11 件の class 群（typography 2 + 色補完 7 + alias 2 + elevation 1 + component 9）を集約 |
| Create | `src/utils/__tests__/inline-style-migration.test.ts`         | 11 ファイルからの `style={{` / DOM mutation 検出 + 陽性対照 3 件のメタテスト                                                                       |
| Modify | `src/components/ui/ActionButton.tsx`                         | `style={{}}` + variant maps を `.btn-action--{variant}` + `:disabled` 擬似に置換                                                                   |
| Modify | `src/components/ui/BareInput.tsx`                            | `style={{}}` を className（条件 `border-error` / `border-input` + 任意 `font-mono`）に置換                                                         |
| Modify | `src/components/ui/ClearButton.tsx`                          | `style={{}}` + onMouseEnter/Leave を `.btn-clear` + CSS `:hover` に置換                                                                            |
| Modify | `src/components/ui/CopyButton.tsx`                           | `style={{}}` 2 箇所と `copyStateColors` ヘルパを `.btn-copy.is-copied / .is-compact` に置換                                                        |
| Modify | `src/components/ui/CountInput.tsx`                           | label / input / hint の `style={{}}` 3 箇所を className 化                                                                                         |
| Modify | `src/components/ui/DownloadButton.tsx`                       | inner span の `style={{}}` を `inline-flex items-center gap-1.5` Tailwind utility に置換                                                           |
| Modify | `src/components/ui/ErrorMessage.tsx`                         | block / inline 両 variant の `style={{}}` 3 箇所を className 化                                                                                    |
| Modify | `src/components/ui/OutputField.tsx`                          | header / label / textarea の `style={{}}` 3 箇所を className 化                                                                                    |
| Modify | `src/components/ui/Section.tsx`                              | 外枠 / header / body の `style={{}}` 3 箇所を className 化                                                                                         |
| Modify | `src/components/ui/Select.tsx`                               | wrapper / select / svg の `style={{}}` 3 箇所を className 化                                                                                       |
| Modify | `src/components/ui/ToggleGroup.tsx`                          | 外枠 / button の `style={{}}` 2 箇所を `.toggle-grid` + `.btn-toggle[aria-pressed="true"]` + `setProperty('--toggle-cols', ...)` に置換            |
| Modify | `docs/ui-conventions.md`                                     | Section 2.1 (hover ルール) / 2.2 (typography 名) を class-based ルールに更新                                                                       |
| Modify | `.claude/skills/dads-design-system/SKILL.md`                 | 冒頭に「issue #176 B 案 移行中」status banner 追記                                                                                                 |
| Modify | `.claude/skills/dads-design-system/references/components.md` | 冒頭に同 status banner 追記                                                                                                                        |

---

## Task 1: `src/styles/global.css` に `@layer components` ブロック追加

**Files:**

- Modify: `src/styles/global.css`（末尾に追記）

- [ ] **Step 1: 既存 global.css 末尾を確認**

Run: `tail -20 src/styles/global.css`

Expected: 既存 `.text-link` block が末尾近くに見える（行 158-175 付近）。

- [ ] **Step 2: ファイル末尾に `@layer components` ブロックを追記**

Edit `src/styles/global.css`、最後の `.text-link:visited { ... }` ブロックの直後に以下を追加:

```css
/* === issue #176 B 案: inline style 撤去用 semantic class === */
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

  /* CopyButton: copied 状態の bg / color / border 切替
     注意: ルール順序は base → is-compact → is-copied。両 class 同時適用時に
     is-copied (= 後勝ち) で color/bg が success に上書きされる必要があるため。 */
  .btn-copy {
    border: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
    color: var(--color-text);
    transition:
      background-color 0.2s,
      color 0.2s,
      border-color 0.2s;
  }
  .btn-copy.is-compact {
    border: none;
    color: var(--color-muted);
  }
  .btn-copy.is-copied {
    border-color: var(--color-success);
    background: var(--color-success-bg);
    color: var(--color-success);
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

- [ ] **Step 3: prettier で整形**

Run: `npm run format -- src/styles/global.css`
Expected: `src/styles/global.css` が整形され、コンソールに warning なし。

- [ ] **Step 4: TypeScript / Astro 型チェックで CSS が parse できることを確認**

Run: `npx astro check 2>&1 | tail -20`
Expected: 「0 errors, 0 warnings」または既存の warning のみ（CSS 起因で増えていない）。

- [ ] **Step 5: 既存 vitest が壊れていないことを確認**

Run: `npm run test 2>&1 | tail -5`
Expected: 全 pass。

- [ ] **Step 6: コミット**

```bash
git add src/styles/global.css
git commit -m "feat(styles): #176 B 案 PR 1 — global.css に @layer components 追加

ui/* simple 11 ファイル migration 用の semantic class を 1 ブロックに集約。
- typography: .body-emphasis / .caption（旧 src/utils/styles.ts 同等）
- color tokens not in @theme: .text-default/.text-muted/.text-on-primary/
  .bg-default/.bg-subtle/.border-default/.border-input
- alias for awkward auto-utility: .bg-error-tint / .bg-success-tint
- elevation: .shadow-elev-2
- component-scoped: .btn-clear / .btn-copy / .btn-action--{variant} /
  .toggle-grid / .btn-toggle

Refs: #176"
```

---

## Task 2: `inline-style-migration.test.ts` 追加（陽性対照込み、空 MIGRATED_FILES）

**Files:**

- Create: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: テストファイルを作成**

Create `src/utils/__tests__/inline-style-migration.test.ts` with the following content:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * #176 B 案 progressive migration tracker.
 * 移行済みファイルから `style={{` および CSSOM 直接 mutation
 * (`element.style.X = ...` 形式) が消えていることを assert する。
 *
 * 各 PR で MIGRATED_FILES に追記、PR 6 で `await glob('src/**\/*.tsx')` に置換して全件カバー化。
 *
 * 例外 (許容):
 * - `ref.current.style.setProperty('--var', value)` — CSSOM API 経由は許容
 *   regex は `\.style\.X = Y` のみ検出、`.style.setProperty(` は検出しない
 */
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加していく（Task 3-13）
];

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

- [ ] **Step 2: テストが pass することを確認（MIGRATED_FILES 空 + 陽性対照のみ実行）**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`
Expected: 「3 passed」（陽性対照 3 件のみ）。MIGRATED_FILES が空のため `describe.each` セクションは 0 件で skip される。

- [ ] **Step 3: prettier で整形**

Run: `npm run format -- src/utils/__tests__/inline-style-migration.test.ts`
Expected: warning なし。

- [ ] **Step 4: コミット**

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "test: #176 B 案 PR 1 — inline-style-migration tracker 追加

style={{ / element.style.X= を progressive に検出する vitest を導入。
MIGRATED_FILES は空のまま、陽性対照 3 件で detector 自体の妥当性を担保。
Task 3-13 で 11 ファイルを順次 array に追加していく。

Refs: #176"
```

---

## Task 3: `ActionButton.tsx` migration

**Files:**

- Modify: `src/components/ui/ActionButton.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Edit `src/utils/__tests__/inline-style-migration.test.ts`、`MIGRATED_FILES` array を以下に変更:

```ts
const MIGRATED_FILES: readonly string[] = ['src/components/ui/ActionButton.tsx'];
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`
Expected: `src/components/ui/ActionButton.tsx > JSX inline style object (style={{) が残っていない` が FAIL。陽性対照 3 件は PASS。

- [ ] **Step 3: ActionButton.tsx を全置換**

Replace entire content of `src/components/ui/ActionButton.tsx` with:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'secondary' | 'danger';

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'style' | 'className'
> {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
}

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `disabled=true`: variant ごとに disabled 時の bg/border を CSS `:disabled` 擬似で上書き
 *   （primary は border 不可視・secondary は背景透過維持）
 * - `aria-*` など ButtonHTMLAttributes のほとんどの属性を渡せる
 *
 * style: global.css `@layer components` の `.btn-action` / `.btn-action--{variant}` を参照。
 */
export function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'default',
  loading = false,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={`caption font-semibold inline-flex items-center px-4 py-2 rounded-lg whitespace-nowrap btn-action btn-action--${variant}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: テストが PASS することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`
Expected: 全 5 件 pass（ActionButton 2 + 陽性対照 3）。

- [ ] **Step 5: TypeScript 型チェック**

Run: `npx astro check 2>&1 | tail -5`
Expected: 0 errors。

- [ ] **Step 6: prettier で整形**

Run: `npm run format -- src/components/ui/ActionButton.tsx src/utils/__tests__/inline-style-migration.test.ts`
Expected: warning なし。

- [ ] **Step 7: コミット**

```bash
git add src/components/ui/ActionButton.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — ActionButton を class-based に移行

- variant maps (bgMap/colorMap/borderMap/disabled overrides) を撤去
- style={{}} を .btn-action / .btn-action--{variant} className に置換
- disabled 時の bg/border は CSS :disabled 擬似で吸収
- caption / fontWeight 600 は 'caption font-semibold' Tailwind utility に
- inline-style-migration test に登録

Refs: #176"
```

---

## Task 4: `BareInput.tsx` migration

**Files:**

- Modify: `src/components/ui/BareInput.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Edit `src/utils/__tests__/inline-style-migration.test.ts`、`MIGRATED_FILES` を以下に変更:

```ts
const MIGRATED_FILES: readonly string[] = [
  'src/components/ui/ActionButton.tsx',
  'src/components/ui/BareInput.tsx',
];
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`
Expected: BareInput の `style={{` 検出で FAIL。

- [ ] **Step 3: BareInput.tsx を全置換**

Replace entire content of `src/components/ui/BareInput.tsx` with:

```tsx
import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'style' | 'className'
> {
  value: string;
  onChange: (value: string) => void;
  /** エラー状態のときボーダー色を error に変更する */
  error?: boolean;
  /** monospace フォントを使用する */
  mono?: boolean;
  /** カスタム className（flexbox 内の幅制御などに使用） */
  className?: string;
}

/**
 * ラベル無し・グリッド配置向けの薄い `<input>` コンポーネント。
 *
 * - `InputField` はラベル前提のため、ラベル不要のグリッド内 input はこちらを使う
 * - `outline: none` を component base から外し、global CSS の `:focus-visible` に委ねる（a11y 向上）
 *
 * style: global.css `@layer components` の `.caption` / `.bg-default` / `.text-default` /
 * `.border-input` / `.border-error` (Tailwind auto-utility from --color-error in @theme) を参照。
 */
export function BareInput({
  value,
  onChange,
  error = false,
  mono = false,
  className,
  ...rest
}: Props) {
  const borderClass = error ? 'border-error' : 'border-input';
  const monoClass = mono ? 'font-mono' : '';
  const extraClass = className ?? '';
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`caption rounded-md border ${borderClass} ${monoClass} bg-default text-default w-full px-2 py-1.5 ${extraClass}`.trim()}
      {...rest}
    />
  );
}
```

注意: 旧 `padding: '0.4rem 0.5rem'` ≈ `px-2 py-1.5`（Tailwind）。微差はあるが VRT で検証。

- [ ] **Step 4: テストが PASS することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`
Expected: 全 7 件 pass（ActionButton 2 + BareInput 2 + 陽性対照 3）。

- [ ] **Step 5: 型チェック**

Run: `npx astro check 2>&1 | tail -5`
Expected: 0 errors。

- [ ] **Step 6: prettier で整形**

Run: `npm run format -- src/components/ui/BareInput.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 7: コミット**

```bash
git add src/components/ui/BareInput.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — BareInput を class-based に移行

- style={{}} を className（caption / bg-default / text-default / border-input
  または border-error / 任意 font-mono）に置換
- padding は Tailwind utility (px-2 py-1.5) で近似、微差は VRT で検証

Refs: #176"
```

---

## Task 5: `ClearButton.tsx` migration（CSSOM mutation 撤去）

**Files:**

- Modify: `src/components/ui/ClearButton.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Edit `src/utils/__tests__/inline-style-migration.test.ts`、`MIGRATED_FILES` に `'src/components/ui/ClearButton.tsx'` を追加:

```ts
const MIGRATED_FILES: readonly string[] = [
  'src/components/ui/ActionButton.tsx',
  'src/components/ui/BareInput.tsx',
  'src/components/ui/ClearButton.tsx',
];
```

- [ ] **Step 2: テストが FAIL することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`
Expected: ClearButton の `style={{` および `.style.background = ` 両方で FAIL。

- [ ] **Step 3: ClearButton.tsx を全置換**

Replace entire content of `src/components/ui/ClearButton.tsx` with:

```tsx
interface Props {
  onClick: () => void;
  className?: string;
}

/**
 * クリアボタン。hover 時に bg-subtle に変化（CSS :hover で実現）。
 *
 * style: global.css `@layer components` の `.btn-clear` を参照。
 * `.btn-clear:hover` で background-color が var(--color-bg-subtle) になる。
 */
export function ClearButton({ onClick, className = '' }: Props) {
  return (
    <button
      onClick={onClick}
      className={`caption text-muted btn-clear rounded-lg px-3 py-1.5 whitespace-nowrap border-0 ${className}`.trim()}
    >
      クリア
    </button>
  );
}
```

注意: 旧 `transition-colors` は `.btn-clear { transition: background-color 0.15s; }` で吸収。`border: 'none'` は Tailwind の `border-0` utility で吸収。

- [ ] **Step 4: テストが PASS することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`
Expected: 全 9 件 pass。

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/ClearButton.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/ClearButton.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — ClearButton の hover を CSS :hover に移行

- style={{}} と onMouseEnter/Leave の CSSOM mutation を撤去
- .btn-clear class + CSS :hover で hover bg を表現（CSP strict 化に整合）
- transition-colors は .btn-clear の transition で吸収

Refs: #176"
```

---

## Task 6: `CopyButton.tsx` migration

**Files:**

- Modify: `src/components/ui/CopyButton.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/CopyButton.tsx'` to `MIGRATED_FILES`.

- [ ] **Step 2: テストが FAIL することを確認**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`
Expected: CopyButton で FAIL。

- [ ] **Step 3: CopyButton.tsx を全置換**

Replace entire content of `src/components/ui/CopyButton.tsx` with:

```tsx
import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/utils/clipboard';

function ClipboardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyAnnounce({ copied }: { copied: boolean }) {
  if (!copied) return null;
  return (
    <span role="status" aria-live="polite" className="sr-only">
      コピーしました
    </span>
  );
}

interface Props {
  text: string;
  label?: string;
  className?: string;
  /** テーブル行など狭い場所向けのコンパクト表示 */
  compact?: boolean;
}

/**
 * クリップボードコピー用ボタン。
 *
 * style: global.css `@layer components` の `.btn-copy` / `.btn-copy.is-copied` /
 * `.btn-copy.is-compact` を参照。状態は `is-copied` / `is-compact` className で切替。
 */
export function CopyButton({ text, label = 'コピー', className = '', compact = false }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const stateClass = copied ? 'is-copied' : '';

  if (compact) {
    return (
      <button
        onClick={handleClick}
        aria-label={label}
        className={`btn-copy is-compact ${stateClass} rounded-md inline-flex items-center justify-center text-xs px-2 py-1 min-w-8 min-h-8 whitespace-nowrap`.trim()}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
        <CopyAnnounce copied={copied} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      className={`btn-copy ${stateClass} caption font-bold inline-flex items-center gap-1.5 rounded px-3 py-2 leading-none tracking-wide whitespace-nowrap ${className}`.trim()}
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
      {label}
      <CopyAnnounce copied={copied} />
    </button>
  );
}
```

注意:

- 旧 `fontSize: '0.75rem'` (compact) → `text-xs` (Tailwind = 0.75rem)
- 旧 `padding: '0.25rem 0.5rem'` (compact) → `px-2 py-1` (近似)
- 旧 `minWidth: '32px'` / `minHeight: '32px'` → `min-w-8 min-h-8` (32px = 8 × 4px)
- 旧 `fontSize: '0.875rem'` + `lineHeight: 1` + `letterSpacing: '0.02em'` → `caption leading-none tracking-wide` (caption は 0.875rem + 1.7 line-height、Tailwind の `leading-none` で 1 に上書き、`tracking-wide` ≈ 0.025em で近似)
- `copyStateColors` ヘルパは不要、CSS class で表現
- `border` / `background` 切替は `.btn-copy` / `.btn-copy.is-copied` / `.btn-copy.is-compact` の組み合わせで吸収

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`
Expected: 全 11 件 pass。

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/CopyButton.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/CopyButton.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — CopyButton を class-based に移行

- copyStateColors ヘルパ撤去、状態切替は .btn-copy.is-copied で吸収
- compact mode は .btn-copy.is-compact で border 等を上書き
- Tailwind utility (text-xs / leading-none / tracking-wide / min-w-8) で近似

Refs: #176"
```

---

## Task 7: `CountInput.tsx` migration

**Files:**

- Modify: `src/components/ui/CountInput.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/CountInput.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: CountInput.tsx を全置換**

Replace entire content of `src/components/ui/CountInput.tsx` with:

```tsx
import { useCallback } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useClampedInput } from '@/hooks/useClampedInput';

interface Props {
  id: string;
  label?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  buttonLabel?: string;
  onGenerate: (count: number) => void;
}

export function CountInput({
  id,
  label = '生成数',
  min = 1,
  max = 100,
  defaultValue = 1,
  buttonLabel = '生成',
  onGenerate,
}: Props) {
  const { value, inputStr, handleChange, handleBlur } = useClampedInput(defaultValue, min, max);

  const handleGenerate = useCallback(() => {
    onGenerate(value);
  }, [value, onGenerate]);

  return (
    <div>
      <label htmlFor={id} className="body-emphasis text-default block mb-1">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={inputStr}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleBlur();
              handleGenerate();
            }
          }}
          className="caption w-24 rounded-lg border border-input bg-default text-default px-3 py-2"
          aria-describedby={`${id}-hint`}
        />
        <ActionButton onClick={handleGenerate} variant="primary">
          {buttonLabel}
        </ActionButton>
      </div>
      <p id={`${id}-hint`} className="caption text-muted mt-1">
        {min}〜{max}
      </p>
    </div>
  );
}
```

注意:

- 旧 `marginBottom: '0.25rem'` → `mb-1` (Tailwind = 0.25rem)
- 旧 `width: '6rem'` → `w-24` (Tailwind = 6rem)
- 旧 `outline: 'none'` は `:focus-visible` で外側の outline は CSS 既定で扱われる。明示的な outline 禁止は不要（global.css で `:focus-visible` 設定済み）。
- 旧 `marginTop: '0.25rem'` → `mt-1`

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/CountInput.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/CountInput.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — CountInput を class-based に移行

- label / input / hint の style={{}} を className に置換
- bodyEmphasis → 'body-emphasis text-default'、caption → 'caption text-muted'
- width 6rem → w-24、margin → mb-1 / mt-1 Tailwind utility

Refs: #176"
```

---

## Task 8: `DownloadButton.tsx` migration（最小修正）

**Files:**

- Modify: `src/components/ui/DownloadButton.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/DownloadButton.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: DownloadButton.tsx の inner span のみ修正**

Edit `src/components/ui/DownloadButton.tsx`、以下の行を:

```tsx
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
```

次のように変更:

```tsx
      <span className="inline-flex items-center gap-1.5">
```

注意: 旧 `gap: '0.375rem'` → `gap-1.5` (Tailwind = 0.375rem)。

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/DownloadButton.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/DownloadButton.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — DownloadButton inner span を Tailwind utility に

style={{ display: inline-flex, ..., gap: 0.375rem }} を 'inline-flex items-center gap-1.5'
className に置換。

Refs: #176"
```

---

## Task 9: `ErrorMessage.tsx` migration

**Files:**

- Modify: `src/components/ui/ErrorMessage.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/ErrorMessage.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: ErrorMessage.tsx を全置換**

Replace entire content of `src/components/ui/ErrorMessage.tsx` with:

```tsx
interface Props {
  id?: string;
  message: string;
  variant?: 'inline' | 'block';
}

/**
 * エラーメッセージ表示。
 *
 * style: Tailwind auto-utility (border-error / text-error from --color-error in @theme)
 * + global.css `@layer components` の `.bg-error-tint` (var(--color-error-bg)) を参照。
 */
export function ErrorMessage({ id, message, variant = 'inline' }: Props) {
  if (variant === 'block') {
    return (
      <div id={id} role="alert" className="border border-error bg-error-tint rounded-lg p-4">
        <p className="caption text-error">{message}</p>
      </div>
    );
  }
  return (
    <p id={id} role="alert" className="caption text-error mt-1">
      {message}
    </p>
  );
}
```

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/ErrorMessage.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/ErrorMessage.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — ErrorMessage を class-based に移行

- block variant: border border-error bg-error-tint で枠線+背景
- inline / block text: caption text-error
- colors / caption import を撤去

Refs: #176"
```

---

## Task 10: `OutputField.tsx` migration

**Files:**

- Modify: `src/components/ui/OutputField.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/OutputField.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: OutputField.tsx を全置換**

Replace entire content of `src/components/ui/OutputField.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';

interface OutputFieldProps {
  /** textarea の id（label との関連付けに使用） */
  id: string;
  /** 見出しラベル */
  label: string;
  /** 出力値（空文字列のときは CopyButton を visibility: hidden にしてレイアウトを保つ） */
  value: string;
  /** textarea 行数。既定 12。 */
  rows?: number;
  /** モノスペースフォントを使う。既定 true。 */
  mono?: boolean;
  /** ユーザーによる縦リサイズを許可する。既定 true。 */
  resize?: boolean;
  /** スクリーンリーダー用ラベル（見出しと別の説明が必要な場合） */
  ariaLabel?: string;
  /** CopyButton のラベル。既定 'コピー'。 */
  copyLabel?: string;
  /** CopyButton を表示するか。既定 true。 */
  showCopy?: boolean;
  /** ラベル右側に並べる追加要素（ダウンロードボタンなど） */
  rightSlot?: ReactNode;
}

/**
 * 出力カード共通 UI。
 * ラベル＋（CopyButton／任意要素）＋ readOnly textarea を一定構造で描画する。
 */
export function OutputField({
  id,
  label,
  value,
  rows = 12,
  mono = true,
  resize = true,
  ariaLabel,
  copyLabel = 'コピー',
  showCopy = true,
  rightSlot,
}: OutputFieldProps) {
  const hasValue = value !== '';
  const monoClass = mono ? 'font-mono' : '';
  const resizeClass = resize ? 'resize-y' : 'resize-none';
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 min-h-8">
        <label htmlFor={id} className="body-emphasis text-default">
          {label}
        </label>
        {hasValue && (
          <div className="flex items-center gap-2">
            {rightSlot}
            {showCopy && <CopyButton text={value} label={copyLabel} />}
          </div>
        )}
      </div>
      <textarea
        id={id}
        readOnly
        value={value}
        rows={rows}
        className={`caption ${monoClass} ${resizeClass} w-full rounded-lg border border-default bg-subtle text-default px-3 py-2 tracking-wide`.trim()}
        aria-label={ariaLabel ?? label}
      />
    </div>
  );
}
```

注意:

- 旧 `marginBottom: '0.75rem'` → `mb-3` (Tailwind = 0.75rem)
- 旧 `minHeight: '2rem'` → `min-h-8` (= 2rem)
- 旧 `fontFamily: 'monospace'` → `font-mono` (条件 className)
- 旧 `letterSpacing: '0.02em'` → `tracking-wide`

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/OutputField.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/OutputField.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — OutputField を class-based に移行

- header / label / textarea の style={{}} を className に置換
- mono / resize は条件 className（font-mono / resize-y / resize-none）
- minHeight 2rem → min-h-8 / margin → mb-3 Tailwind utility

Refs: #176"
```

---

## Task 11: `Section.tsx` migration

**Files:**

- Modify: `src/components/ui/Section.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/Section.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: Section.tsx を全置換**

Replace entire content of `src/components/ui/Section.tsx` with:

```tsx
import type { AriaAttributes, ReactNode } from 'react';

interface Props extends AriaAttributes {
  title?: ReactNode;
  headerSlot?: ReactNode;
  children: ReactNode;
  /** role 属性を外側コンテナに付与する（例: "status"） */
  role?: string;
  /**
   * `title` を span[role="heading"] で描画するときの aria-level。
   * 旧実装は <h3> だったため default は 3。
   * ページ構造上 level を変えたい場合のみ明示指定する。
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * 共通セクションコンポーネント。
 * `title` を指定すると左寄せのタイトルとして表示し、`headerSlot` で右側に任意の要素を追加できる。
 * `title` と `headerSlot` の両方を省略した場合はヘッダーを描画しない。
 * `role` や `aria-*` props は外側コンテナ div に透過転送される。
 */
export function Section({
  title,
  headerSlot,
  children,
  role,
  headingLevel = 3,
  ...ariaProps
}: Props) {
  const hasHeader = title != null || headerSlot != null;

  return (
    <div role={role} {...ariaProps} className="rounded-xl border border-default overflow-hidden">
      {hasHeader && (
        <div
          className={`body-emphasis text-default bg-subtle border-b border-default px-4 py-3 m-0${headerSlot ? ' flex items-center justify-between flex-wrap gap-2' : ''}`}
        >
          {title != null && (
            <span role="heading" aria-level={headingLevel}>
              {title}
            </span>
          )}
          {headerSlot}
        </div>
      )}
      <div className="bg-default p-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/Section.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/Section.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — Section を class-based に移行

- 外枠 / header / body の style={{}} を className に置換
- 外枠: rounded-xl border border-default
- header: body-emphasis text-default bg-subtle border-b border-default
- body: bg-default p-4

Refs: #176"
```

---

## Task 12: `Select.tsx` migration

**Files:**

- Modify: `src/components/ui/Select.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/Select.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: Select.tsx を全置換**

Replace entire content of `src/components/ui/Select.tsx` with:

```tsx
interface Option<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  id?: string;
}

export function Select<T extends string>({ options, value, onChange, ariaLabel, id }: Props<T>) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={ariaLabel}
        className="caption w-full rounded-lg border border-input bg-default text-default appearance-none pl-3 pr-10 py-2"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
      >
        <path
          d="M2 4L6 8L10 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
```

注意:

- 旧 `paddingRight: '2.5rem'` + 既存 `px-3 py-2` → `pl-3 pr-10 py-2` (Tailwind: pr-10 = 2.5rem)
- 旧 `position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)'` → `absolute right-3 top-1/2 -translate-y-1/2`
- 旧 `color: colors.muted` (svg) → `text-muted` (svg は `currentColor` 参照のため text-muted で OK)

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/Select.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/Select.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — Select を class-based に移行

- wrapper / select / svg の style={{}} を className に置換
- select の paddingRight 2.5rem → pr-10 Tailwind utility
- svg の絶対配置 → absolute right-3 top-1/2 -translate-y-1/2 + text-muted

Refs: #176"
```

---

## Task 13: `ToggleGroup.tsx` migration（setProperty 経由 CSS 変数注入）

**Files:**

- Modify: `src/components/ui/ToggleGroup.tsx`
- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: MIGRATED_FILES に追加**

Append `'src/components/ui/ToggleGroup.tsx'`.

- [ ] **Step 2: テストが FAIL**

Run: `npm run test -- inline-style-migration 2>&1 | tail -20`

- [ ] **Step 3: ToggleGroup.tsx を全置換**

Replace entire content of `src/components/ui/ToggleGroup.tsx` with:

```tsx
import { useEffect, useRef } from 'react';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** ボタンサイズ。デフォルトは `md` */
  size?: 'sm' | 'md';
  /** `grid`: 等幅グリッド（デフォルト）。`wrap`: flex-wrap で自然幅 */
  layout?: 'grid' | 'wrap';
}

/**
 * 排他選択トグル。
 *
 * style: global.css `@layer components` の `.toggle-grid`（CSS 変数 --toggle-cols 経由で
 * 動的列数）/ `.btn-toggle` / `.btn-toggle[aria-pressed="true"]` を参照。
 *
 * 動的列数は `setProperty('--toggle-cols', N)` で CSS 変数を注入する。これは CSSOM API 経由の
 * 設定で、属性経由の `el.style.gridTemplateColumns = ...` ではないため CSP3 strict 下でも許容される。
 */
export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  layout = 'grid',
}: Props<T>) {
  const isWrap = layout === 'wrap';
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isWrap && gridRef.current) {
      gridRef.current.style.setProperty('--toggle-cols', String(options.length));
    }
  }, [isWrap, options.length]);

  const containerClass = isWrap
    ? 'bg-subtle rounded-lg border border-input p-1 flex flex-wrap gap-1 w-max max-w-full'
    : 'bg-subtle rounded-lg border border-input p-1 toggle-grid';
  const buttonSizeClass = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5';

  return (
    <div ref={gridRef} className={containerClass} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`caption font-semibold btn-toggle rounded-lg whitespace-nowrap ${buttonSizeClass}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

注意:

- 旧 wrap mode の `width: 'max-content', maxWidth: '100%'` → wrap container のレイアウトは `flex flex-wrap gap-1 max-w-full` で対応。`width: 'max-content'` 相当は flex の natural width で達成（厳密一致は VRT で確認）。
- 旧 grid mode の動的 `gridTemplateColumns: repeat(N, minmax(0, 1fr))` → `.toggle-grid` class + `setProperty('--toggle-cols', N)` で表現。
- 状態色（`copied` / pressed）は `.btn-toggle[aria-pressed="true"]` で吸収、JSX には条件式不要。
- `setProperty('--toggle-cols', ...)` は migration test の許容パターン（`.style.setProperty(` を許容）。

- [ ] **Step 4: テストが PASS**

Run: `npm run test -- inline-style-migration 2>&1 | tail -10`
Expected: 全 25 件 pass（11 ファイル × 2 spec + 陽性対照 3）。

- [ ] **Step 5: 型チェック + prettier**

Run: `npx astro check 2>&1 | tail -5 && npm run format -- src/components/ui/ToggleGroup.tsx src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 6: コミット**

```bash
git add src/components/ui/ToggleGroup.tsx src/utils/__tests__/inline-style-migration.test.ts
git commit -m "refactor(ui): #176 B 案 PR 1 — ToggleGroup を class-based に移行

- 外枠 / button の style={{}} を className に置換
- 動的 grid columns は .toggle-grid + setProperty('--toggle-cols', N) で表現
  （CSSOM API 経由のため CSP3 strict 下でも許容、属性経由 ≠）
- pressed 状態色は .btn-toggle[aria-pressed='true'] で吸収
- elevation.level2 inline → .btn-toggle[aria-pressed='true'] の box-shadow

Refs: #176"
```

---

## Task 14: `docs/ui-conventions.md` Section 2.1 / 2.2 改訂

**Files:**

- Modify: `docs/ui-conventions.md`

- [ ] **Step 1: 現状確認**

Run: `sed -n '25,55p' docs/ui-conventions.md`
Expected: Section 2.1 / 2.2 / 2.3 の本文が表示される。

- [ ] **Step 2: Section 2.1 全置換**

Edit `docs/ui-conventions.md`、以下の Section 2.1 ブロック:

````markdown
### 2.1 ホバー時の色変化

`hover:` クラスは禁止（カラークラス使用制限と整合させるため）。`onMouseEnter` / `onMouseLeave` でインラインスタイルを差し替える。

```tsx
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
/>
```
````

````

を以下に置換:

```markdown
### 2.1 ホバー時の色変化

CSP `style-src 'unsafe-inline'` 撤去（issue #176 B 案）に伴い、JSX の `style={{}}` および `e.currentTarget.style.X = Y` 形式の DOM mutation は使用禁止。ホバー / 状態色は `src/styles/global.css` の `@layer components` に semantic class として定義し、`:hover` / `[aria-pressed="true"]` / 条件 `className` 切替で表現する。

- Tailwind の **色値直書き** utility（`text-blue-500`, `bg-red-200` 等）は引き続き禁止
- ただし `@theme` 経由で auto-generate される **意味トークン** utility（`text-primary` / `bg-error` / `text-link` 等は `--color-primary` / `--color-error` / `--color-link` を参照）は使用可。色値直書きではなく既存 SoT を経由するため、カラー使用制限の趣旨と整合
- 同じ理由で `hover:bg-subtle` のような「Tailwind hover utility + 意味クラス」も許容

```tsx
// before (PR #176 B 案 移行前の旧パターン、現在は禁止)
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
/>

// after (PR #176 B 案 移行後の正典パターン)
<button className="caption text-muted btn-clear" />

// global.css `@layer components` ブロック内（PR 1 で実定義）
.btn-clear {
  background: transparent;
  transition: background-color 0.15s;
}
.btn-clear:hover {
  background: var(--color-bg-subtle);
}
````

````

- [ ] **Step 3: Section 2.2 を class 参照に更新**

Edit `docs/ui-conventions.md`、Section 2.2 の以下:

```markdown
### 2.2 ボタン高さの揃え

横並びでボタン高さを揃えたい場合は **`lineHeight: 1` を明示する**（`caption` / `bodyEmphasis` は lineHeight 1.7 のため意図より大きくなる）。
````

を以下に置換:

````markdown
### 2.2 ボタン高さの揃え

横並びでボタン高さを揃えたい場合は **`leading-none` Tailwind utility を併記する**（`.caption` / `.body-emphasis` class は line-height 1.7 のため意図より大きくなる）。

```tsx
// caption の line-height 1.7 を Tailwind の leading-none で 1 に上書き
<button className="caption leading-none">クリック</button>
```
````

````

- [ ] **Step 4: prettier で整形**

Run: `npm run format -- docs/ui-conventions.md`

- [ ] **Step 5: コミット**

```bash
git add docs/ui-conventions.md
git commit -m "docs(ui-conventions): #176 B 案 PR 1 — Section 2.1 / 2.2 を class-based ルールに更新

- 2.1: onMouseEnter/Leave による inline style 操作を禁止に変更
  （@layer components の :hover 擬似で表現する例を提示）
- 2.1: Tailwind 色値直書きは禁止維持、@theme 経由 auto-utility は許容と明記
- 2.2: caption / bodyEmphasis 参照を class 名に更新、leading-none 併記方法を提示

Refs: #176"
````

---

## Task 15: `.claude/skills/dads-design-system/` に migration banner 追記

**Files:**

- Modify: `.claude/skills/dads-design-system/SKILL.md`
- Modify: `.claude/skills/dads-design-system/references/components.md`

- [ ] **Step 1: SKILL.md の冒頭付近を確認**

Run: `head -20 .claude/skills/dads-design-system/SKILL.md`
Expected: front matter (`---` で囲まれた metadata) と冒頭 heading が見える。

- [ ] **Step 2: SKILL.md の最初の `---` 終端（front matter 終了）の直後に migration banner を挿入**

Edit `.claude/skills/dads-design-system/SKILL.md`、最初の `---` (1 行目) と次の `---` (front matter 終了) の直後の最初の本文行の前に、以下を空行付きで挿入:

```markdown
> ⚠️ **移行中**: issue [#176](https://github.com/fumtas1k/devtools/issues/176) B 案で `colors.* + style={{}}` パターン → `@layer components` semantic class へ移行中。
>
> - **新規 component**: class-based パターン（`src/styles/global.css` に semantic class を追加 + className で参照）を使う
> - **既存 component**: PR 番号順に migration（progress: PR 1 = `ui/*` simple 11、PR 1.5 = `ResultTable` + `InputField`、PR 2 = `qr-ticket/*`、PR 3-5 = tools、PR 6 = CSP flip + `colors.*` 撤去）
> - 本 SKILL.md / references/components.md の inline-style 例は **移行中の暫定パターン**。PR 6 で全例を class-based に rewrite 予定
```

- [ ] **Step 3: references/components.md にも同 banner を冒頭追加**

Edit `.claude/skills/dads-design-system/references/components.md`、ファイル先頭（前 front matter があれば直後、なければ最初の heading の直前）に同じ banner ブロックを挿入。

挿入位置の具体的判定: ファイル先頭が `# 〜` の heading で始まっていれば heading 行の上に挿入。`---` で始まる front matter があればその閉じの直後に挿入。

- [ ] **Step 4: prettier で整形**

Run: `npm run format -- .claude/skills/dads-design-system/SKILL.md .claude/skills/dads-design-system/references/components.md`

- [ ] **Step 5: 視認確認**

Run: `head -25 .claude/skills/dads-design-system/SKILL.md && echo '---' && head -25 .claude/skills/dads-design-system/references/components.md`
Expected: 両ファイルの先頭近くに `> ⚠️ **移行中**` で始まる banner が見える。

- [ ] **Step 6: コミット**

```bash
git add .claude/skills/dads-design-system/SKILL.md .claude/skills/dads-design-system/references/components.md
git commit -m "docs(skills): #176 B 案 PR 1 — dads-design-system skill に移行中 banner 追加

- SKILL.md / references/components.md 冒頭に '⚠️ 移行中' status banner
- 既存の colors.* + style={{}} 例は『移行中の暫定パターン』として残置
- 全 rewrite は PR 6 で実施予定

Refs: #176"
```

---

## Task 16: ローカル必須ゲートの実行（コミットなし）

**Files:** なし（検証のみ）

- [ ] **Step 1: 全 vitest 実行**

Run: `npm run test 2>&1 | tail -20`
Expected: 全 pass（既存 + 新規 inline-style-migration の 25 件含む）。失敗があれば該当を fix。

- [ ] **Step 2: TypeScript / Astro 型チェック**

Run: `npx astro check 2>&1 | tail -10`
Expected: 0 errors。

- [ ] **Step 3: E2E 実行（functional のみ、VRT 除外）**

Run: `npm run test:e2e 2>&1 | tail -20`
Expected: 144 passed, 1 skipped（既存通り）。失敗があれば該当 component の className を fix。

- [ ] **Step 4: 11 ファイルから `colors` / `caption` / `bodyEmphasis` import が消えたことを確認**

Run: `grep -nE "from '@/utils/styles'" src/components/ui/{ActionButton,BareInput,ClearButton,CopyButton,CountInput,DownloadButton,ErrorMessage,OutputField,Section,Select,ToggleGroup}.tsx 2>&1`
Expected: 何も hit しない（11 ファイルから styles import が完全に消えている）。

- [ ] **Step 5: `style={{` の最終確認**

Run: `grep -c "style={{" src/components/ui/*.tsx 2>&1 | grep -v ":0$"`
Expected: `ResultTable.tsx:8` と `InputField.tsx:4` のみ表示される（PR 1.5 対象）。11 simple ファイルは出ない。

- [ ] **Step 6: CSSOM mutation の最終確認**

Run: `grep -nE "\.style\.[a-zA-Z]+\s*=(?!=)" src/components/ui/*.tsx 2>&1 | grep -v setProperty`
Expected: 何も hit しない（11 ファイルから .style.X = Y 形式が消えている）。

すべて green なら次タスクへ。

---

## Task 17: push と CI/VRT 監視

**Files:** なし（git operation のみ）

- [ ] **Step 1: git status 最終確認**

Run: `git status && git log --oneline origin/develop..HEAD`
Expected: working tree clean、Task 1〜15 の 15 commits が `origin/develop..HEAD` に並んでいる。

- [ ] **Step 2: ブランチを push**

Run: `git push -u origin feature/issue-176-b1-foundation-and-ui-simple`
Expected: 通常の push 成功メッセージ。SSH 鍵 / known_hosts エラーが出たら memory `feedback_git_no_dash_c.md` に従って対処。

- [ ] **Step 3: CI 状態を確認（test + visual-regression workflow）**

Run: `gh run list --branch feature/issue-176-b1-foundation-and-ui-simple --limit 5`
Expected: `test` workflow と `visual-regression` workflow が起動している。

- [ ] **Step 4: test workflow 完了を待ち、結果を確認**

Run: `gh run watch $(gh run list --branch feature/issue-176-b1-foundation-and-ui-simple --workflow=test.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: success。fail なら log を確認して fix。

- [ ] **Step 5: visual-regression の PR comment を確認**

PR 作成後、`visual-regression.yml` が PR comment + artifact を投稿するため、PR ページを開いて diff を確認:

```bash
gh pr list --base develop --head feature/issue-176-b1-foundation-and-ui-simple
```

PR がまだ無い場合は Task 18 で作成する。Comment が posted される頃に diff を確認。

判断フロー:

- diff なし（36/36 pass）→ そのまま merge 可
- diff あり、意図しない regression → component を fix → push
- diff あり、意図的な見た目変化（migration による近似差）→ Step 6 で baseline 更新

- [ ] **Step 6 (条件付き): VRT baseline 更新**

意図的差分の場合、PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger:

```bash
gh workflow run update-visual-baseline.yml --ref feature/issue-176-b1-foundation-and-ui-simple
```

bot が PR ブランチに baseline 更新 commit を push する。完了後にローカルで `git pull` して受領。再度 `visual-regression.yml` を待ち、green を確認。

---

## Task 18: PR 作成

**Files:** なし（gh operation のみ）

- [ ] **Step 1: PR を `--base develop` で作成**

Run:

```bash
gh pr create --base develop --title "refactor(ui): #176 B 案 PR 1 — ui/* simple 11 ファイル inline style 撤去 + 基礎工事" --body "$(cat <<'EOF'
## サマリ

`#176` B 案（`style-src 'unsafe-inline'` 撤去）の PR 1。`src/components/ui/` の simple 11 ファイルから JSX `style={{}}` および CSSOM 直接 mutation を完全除去し、`@layer components` semantic class の foundation を整える。

設計書: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
実装計画: `docs/superpowers/plans/2026-05-03-issue-176-b1-foundation-and-ui-simple.md`
バッチ全体: memory `project_b_plan_progress.md`（PR 1.5 → PR 6 の順で直列進行予定）

## 主な変更

- `src/styles/global.css` 末尾に `@layer components` ブロックを追加（typography 2 + 色補完 7 + alias 2 + elevation 1 + component 9）
- `src/utils/__tests__/inline-style-migration.test.ts` 新規追加（progressive migration tracker、陽性対照 3 件込み）
- 11 ファイル migration: ActionButton / BareInput / ClearButton / CopyButton / CountInput / DownloadButton / ErrorMessage / OutputField / Section / Select / ToggleGroup
- ClearButton: `onMouseEnter/Leave` の CSSOM mutation を `.btn-clear:hover` (CSS) に置換
- ToggleGroup: 動的 `gridTemplateColumns` を `.toggle-grid` + `setProperty('--toggle-cols', N)` (CSSOM API) に置換
- `docs/ui-conventions.md` Section 2.1 / 2.2 を class-based ルールに更新
- `.claude/skills/dads-design-system/SKILL.md` および `references/components.md` 冒頭に「issue #176 B 案 移行中」status banner を追記

## スコープ外（後続 PR）

- `ResultTable.tsx` / `InputField.tsx` の API redesign → PR 1.5
- `qr-ticket/*` migration → PR 2
- tools 系 migration → PR 3-5
- `_headers` の `style-src 'unsafe-inline'` 削除 / `stripMetaStyleSrc()` 撤去 / `src/utils/styles.ts` 削除 → PR 6

## テスト計画

- [ ] `npm run test`（vitest unit + 新規 migration test 25 件）pass を確認
- [ ] `npx astro check` 0 errors を確認
- [ ] `npm run test:e2e`（functional E2E 144 + 1 skip）pass を確認
- [ ] CI `test.yml` / `visual-regression.yml` 結果を確認
- [ ] VRT diff があれば PR comment を判断し、意図的なら `update-visual-baseline.yml` で baseline 更新
- [ ] PR 4 / 5 / 6 が `--base develop` で順に作られる中間ゲートとして本 PR が green であることを確認
- [ ] PC (1280x800) / スマホ (390x844) で各 component を含む代表ページ（gs1-databar, dummy-text, qr-ticket）を目視確認
- [ ] `role=` / `aria-*` 属性が migration で消えていないか `git diff -- src/components/ui/` で確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: PR URL を記録**

Run: `gh pr view --json url --jq '.url'`
Expected: PR URL が出力される。memory `project_b_plan_progress.md` のテーブルに「PR 1: #XXX」を追記する（後続セッションで実施）。

---

## Self-Review チェックリスト（実行 agent 向け）

実装完了時に以下を確認:

- [ ] 全 18 task 完了、コミット数 15（Task 1〜15）+ Task 16 検証 + Task 17 push + Task 18 PR
- [ ] `git log --oneline origin/develop..HEAD` の commit message が全て日本語、prefix が適切（feat/refactor/test/docs）
- [ ] `grep -c "style={{" src/components/ui/*.tsx | grep -v ":0$"` が `ResultTable.tsx:8` と `InputField.tsx:4` のみ
- [ ] `grep -nE "\.style\.[a-zA-Z]+\s*=(?!=)" src/components/ui/*.tsx | grep -v setProperty` が空
- [ ] `inline-style-migration.test.ts` の `MIGRATED_FILES` に 11 ファイル全件登録済み
- [ ] `src/utils/styles.ts` は **削除されていない**（PR 6 までの中間状態）
- [ ] `_headers` の CSP は **未変更**（`style-src 'unsafe-inline'` がまだ残る、PR 6 で flip）
- [ ] `docs/ui-conventions.md` 2.1 / 2.2 が class-based 記述
- [ ] `.claude/skills/dads-design-system/SKILL.md` および `references/components.md` 冒頭に migration banner

## 補足: Tailwind utility 換算リファレンス

| 旧 inline 値                               | Tailwind utility                      |
| ------------------------------------------ | ------------------------------------- |
| `marginBottom: '0.25rem'`                  | `mb-1`                                |
| `marginBottom: '0.5rem'`                   | `mb-2`                                |
| `marginBottom: '0.75rem'`                  | `mb-3`                                |
| `marginTop: '0.25rem'`                     | `mt-1`                                |
| `padding: '0.4rem 0.5rem'`                 | `px-2 py-1.5`（近似）                 |
| `padding: '0.25rem 0.5rem'`                | `px-2 py-1`（近似）                   |
| `padding: '0.5rem 0.75rem'`                | `px-3 py-2`                           |
| `width: '6rem'`                            | `w-24`                                |
| `minWidth: '32px'`                         | `min-w-8`                             |
| `minHeight: '32px'`                        | `min-h-8`                             |
| `minHeight: '2rem'`                        | `min-h-8`                             |
| `gap: '0.375rem'`                          | `gap-1.5`                             |
| `gap: '0.25rem'`                           | `gap-1`                               |
| `right: '0.75rem'`                         | `right-3`                             |
| `paddingRight: '2.5rem'`                   | `pr-10`                               |
| `top: '50%' + transform: translateY(-50%)` | `top-1/2 -translate-y-1/2`            |
| `fontSize: '0.75rem'`                      | `text-xs`                             |
| `lineHeight: 1`                            | `leading-none`                        |
| `letterSpacing: '0.02em'`                  | `tracking-wide`（近似 0.025em）       |
| `fontFamily: 'monospace'`                  | `font-mono`                           |
| `appearance: 'none'`                       | `appearance-none`                     |
| `outline: 'none'`                          | （指定不要、`:focus-visible` に委譲） |
| `border: 'none'`                           | `border-0`                            |
| `position: 'absolute'`                     | `absolute`                            |
| `position: 'relative'`                     | `relative`                            |
| `pointerEvents: 'none'`                    | `pointer-events-none`                 |
| `whiteSpace: 'nowrap'`                     | `whitespace-nowrap`                   |
| `display: 'inline-flex'`                   | `inline-flex`                         |
| `alignItems: 'center'`                     | `items-center`                        |
| `justifyContent: 'space-between'`          | `justify-between`                     |
