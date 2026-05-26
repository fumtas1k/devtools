# 正規表現ビジュアライザ＆ReDoS検出 実装計画（PR1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正規表現を AST ツリーで可視化し、ReDoS 脆弱性を検出するブラウザ完結型ツール（slug `regex-visualizer`）を追加する。

**Architecture:** `regexp-tree` で regex を AST へパースして描画用ツリーへ正規化。`recheck` の **同期 API `checkSync`**（browser ビルド）で ReDoS を判定する。parse と ReDoS はどちらも同期処理なので、1 つの `useDebouncedTransform` でまとめて駆動する（async effect は不要）。ReDoS 判定は `安全 / 脆弱 / 不明` の 3 状態を厳密に区別し、「不明」を「安全」と表示しない。

**Tech Stack:** Astro + React (TSX) / `regexp-tree@0.1.27`（パース・pure JS・型同梱）/ `recheck@4.5.0`（ReDoS・`browser` フィールド・型同梱・install script なし）/ Vitest（unit）/ Playwright（E2E）

**設計スペック:** `docs/superpowers/specs/2026-05-27-regex-visualizer-design.md`

**本計画の範囲:** PR1（AST ツリー + ReDoS 検出）。鉄道図 SVG レンダラ（PR2）は PR1 完了後に別計画を作成する。Phase 0（spike）は実施済み（下記の確定事項を参照）。

---

## Phase 0（spike）確定事項 — 実施済み

実機検証の結果、以下が確定している。**本計画はこの結論を前提に書かれている。**

- ✅ `recheck@4.5.0` / `regexp-tree@0.1.27` をインストール済み（`package.json` / `package-lock.json` は変更済み・PR1 の最初のコミットに含める）。
- ✅ **recheck はブラウザで動作する**。ただし **async `check()` は使用不可**：内部で `blob:` Worker を生成し、本番 CSP（`script-src 'self'`、`worker-src` 未設定）に弾かれて永久に解決しない。**同期 API `checkSync()` を使う**（Worker を作らないため CSP 下で動作）。CSP の変更は不要。
- ✅ `checkSync(source, flags, { timeout: 1000 })` で実行。同期=メインスレッド占有のため **timeout（ms）を必ず渡す**（病的入力での UI フリーズ防止）。timeout 時は `status: 'unknown'`（→「判定不能」表示）。
- ✅ 両ライブラリとも TS 型を同梱 → **型 shim 不要**。
- ✅ バンドル: recheck チャンク 2.7MB raw / 674KB gzip / 334KB brotli。`client:load` でこのツールページのみ遅延ロード（他ページ無影響）。**この採用はユーザー承認済み。**
- ⚠️ **E2E は本番 CSP 下で実行必須**（`withProductionCsp`）。これがないと async `check` への回帰が node テストを通過し本番のみ壊れる（prod-parity gate）。

### recheck Diagnostics の確定 shape（`node_modules/recheck/index.d.ts`）

```ts
type Diagnostics = SafeDiagnostics | VulnerableDiagnostics | UnknownDiagnostics;
// safe:       { status: 'safe'; complexity: { type: 'constant'|'linear'|'safe'; ... } }
// vulnerable: { status: 'vulnerable'; attack: { string: string; pattern: string; ... };
//               complexity: { type: 'polynomial'; degree: number } | { type: 'exponential' };
//               hotspot: { start: number; end: number; temperature: 'heat'|'normal' }[] }
// unknown:    { status: 'unknown'; error: { kind: 'timeout'|'cancel'|'unsupported'|'invalid'|'unexpected' } }
```

### regexp-tree AST の確定 shape

- `parse(re, { captureLocations: true })` が `AstRegExp`（`{ type:'RegExp', body, flags }`）を返す（型同梱）。
- **`loc` は `{ source, start:{line,column,offset}, end:{line,column,offset} }`**（offset は数値）。
- **offset は `/pattern/` リテラル基準**（先頭 `/` 込み）。recheck hotspot は raw pattern 基準。→ ハイライト用に **`offset - 1`** で揃える（`/` を含む正規表現では best-effort、コア判定は影響なし）。

---

## 前提知識（実装者向け）

- **依存ポリシー**: `.npmrc` に `ignore-scripts=true` / `min-release-age=7` / `save-exact=true`。deps は導入済み。
- **既存パターン**: 共通 UI は `src/components/ui/`（`InputField` / `CopyButton` / `ClearButton` / `ErrorMessage`）。同期変換フックは `useDebouncedTransform`（`src/hooks/useDebouncedTransform.ts`）— `source` が `null` のとき即時クリア、`transform` が throw すると error をセットし result は emptyResult に戻す。返り値は `{ result, error, isPending }`。
- **色**: Tailwind primitive 直書き禁止。`@layer components` の意味クラス（`bg-subtle` / `bg-warning-tint` / `text-warning` / `alert-success` 等）を使う。`@layer components` 手書きクラスに `hover:` 等の variant prefix を付けない（CSS rule が生成されない・`docs/shared-agent-rules.md` 7.1）。CSS 変数名は `src/styles/global.css` で確認する。
- **ツール追加手順**: component → page → `src/data/tools.ts` 登録 → `tests/e2e/visual-regression-pages.ts` の `PAGES` 追加 → README/SPEC/decisions 更新（`docs/shared-agent-rules.md` 5 章）。
- **テストロケータ**: `getByRole` / `getByText` / `getByLabel` を使う。`locator('[role="X"]')` は禁止。

---

## File Structure

| ファイル                                                  | 責務                                                                                            |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| `src/utils/regex-visualizer/parse.ts`                     | pattern+flags → 描画用 AST（`RegexAstNode`）。native `new RegExp` で検証、regexp-tree でパース  |
| `src/utils/regex-visualizer/redos.ts`                     | pattern+flags → `RedosResult`（**同期**）。recheck `checkSync` の Diagnostics を 3 状態へ正規化 |
| `src/utils/regex-visualizer/index.ts`                     | barrel export                                                                                   |
| `src/utils/regex-visualizer/__tests__/parse.test.ts`      | parse.ts の unit テスト                                                                         |
| `src/utils/regex-visualizer/__tests__/redos.test.ts`      | redos.ts の unit テスト（陽性対照含む）                                                         |
| `src/components/tools/RegexAstTree.tsx`                   | `RegexAstNode` を再帰描画するプレゼンテーションコンポーネント                                   |
| `src/components/tools/RegexVisualizer.tsx`                | メイン。入力・flags・parse・ReDoS パネルを統括                                                  |
| `src/components/tools/__tests__/RegexVisualizer.test.tsx` | コンポーネントの unit テスト                                                                    |
| `src/pages/tools/regex-visualizer.astro`                  | ページ（`client:load` マウント）                                                                |
| `tests/e2e/regex-visualizer.spec.ts`                      | E2E（本番 CSP 下）                                                                              |
| `src/data/tools.ts`                                       | ツール登録                                                                                      |
| `tests/e2e/visual-regression-pages.ts`                    | VRT 対象に `/tools/regex-visualizer` 追加                                                       |
| `README.md` / `SPEC.md` / `docs/decisions.md`             | ドキュメント更新                                                                                |

---

## Phase 1: PR1（AST ツリー + ReDoS 検出）

### Task 1: deps コミット

**Files:** `package.json` / `package-lock.json`（変更済み）

- [ ] **Step 1: 差分確認**

Run: `git diff --stat package.json package-lock.json`
Expected: `recheck@4.5.0` / `regexp-tree@0.1.27` が dependencies に追加されている。

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: 正規表現ビジュアライザ用に regexp-tree と recheck を追加"
```

### Task 2: parse.ts — pattern+flags を描画用 AST へ

**Files:**

- Create: `src/utils/regex-visualizer/parse.ts`
- Test: `src/utils/regex-visualizer/__tests__/parse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { parseRegex } from '../parse';

describe('parseRegex', () => {
  it('単一文字を Char ノードにする', () => {
    const root = parseRegex('a', '');
    expect(root.children[0].type).toBe('Char');
    expect(root.children[0].label).toContain('a');
  });

  it('量指定子付きグループを Repetition > Group で表現する', () => {
    const root = parseRegex('(ab)+', '');
    const rep = root.children[0];
    expect(rep.type).toBe('Repetition');
    expect(rep.label).toContain('1 回以上');
    expect(rep.children[0].type).toBe('Group');
  });

  it('選択肢を Disjunction にする', () => {
    const root = parseRegex('a|b', '');
    expect(root.children[0].type).toBe('Disjunction');
    expect(root.children[0].children).toHaveLength(2);
  });

  it('各ノードに pattern 基準の loc（offset-1 補正済み）を持つ', () => {
    const root = parseRegex('a+', '');
    // '/a+/' の Repetition 'a+' は offset 1..3 → pattern 基準 0..2
    expect(root.children[0].loc).toEqual({ start: 0, end: 2 });
  });

  it('不正な正規表現で例外を投げる', () => {
    expect(() => parseRegex('(', '')).toThrow();
  });

  it('不正なフラグで例外を投げる', () => {
    expect(() => parseRegex('a', 'Z')).toThrow();
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/parse.test.ts`
Expected: FAIL（`parseRegex` 未定義）

- [ ] **Step 3: parse.ts を実装**

```ts
import { parse as parseRegExpTree } from 'regexp-tree';

export interface RegexAstNode {
  /** regexp-tree のノード種別（'Char' | 'Repetition' | 'Group' | 'Disjunction' | 'Alternative' | 'CharacterClass' | 'Assertion' | 'Backreference' | 'Root' 等） */
  type: string;
  /** 日本語の表示ラベル */
  label: string;
  /** pattern 文字列基準の位置（recheck hotspot との突き合わせ用、offset-1 補正済み） */
  loc?: { start: number; end: number };
  children: RegexAstNode[];
}

interface RegExpTreeNode {
  type: string;
  loc?: { start: { offset: number }; end: { offset: number } };
  [key: string]: unknown;
}

function quantifierLabel(q: {
  kind?: string;
  from?: number;
  to?: number;
  greedy?: boolean;
}): string {
  const lazy = q.greedy === false ? '（最短一致）' : '';
  switch (q.kind) {
    case '+':
      return `1 回以上の繰り返し${lazy}`;
    case '*':
      return `0 回以上の繰り返し${lazy}`;
    case '?':
      return `0 回または 1 回${lazy}`;
    case 'Range':
      if (q.to == null) return `${q.from} 回以上の繰り返し${lazy}`;
      if (q.to === q.from) return `ちょうど ${q.from} 回${lazy}`;
      return `${q.from}〜${q.to} 回の繰り返し${lazy}`;
    default:
      return `繰り返し${lazy}`;
  }
}

function labelFor(node: Record<string, any>): string {
  switch (node.type) {
    case 'Char':
      return node.kind === 'meta' ? `メタ文字 ${node.value}` : `文字 "${node.value}"`;
    case 'CharacterClass':
      return node.negative ? '文字クラス（否定）' : '文字クラス';
    case 'ClassRange':
      return `範囲 ${node.from?.value}-${node.to?.value}`;
    case 'Alternative':
      return '連結';
    case 'Disjunction':
      return '選択肢 (|)';
    case 'Group':
      return node.capturing
        ? node.name
          ? `グループ（名前付き: ${node.name}）`
          : `キャプチャグループ #${node.number}`
        : 'グループ（非キャプチャ）';
    case 'Repetition':
      return quantifierLabel(node.quantifier ?? {});
    case 'Assertion':
      return `アサーション ${node.kind}`;
    case 'Backreference':
      return `後方参照 \\${node.reference}`;
    default:
      return node.type;
  }
}

/** regexp-tree ノードの子を一様に取り出す */
function childrenOf(node: Record<string, any>): RegExpTreeNode[] {
  if (node.type === 'Alternative') return node.expressions ?? [];
  if (node.type === 'Disjunction') return [node.left, node.right].filter(Boolean);
  if (node.type === 'Group' || node.type === 'Repetition' || node.type === 'Assertion') {
    return node.expression ? [node.expression] : [];
  }
  if (node.type === 'CharacterClass') return node.expressions ?? [];
  return [];
}

function toRenderNode(node: RegExpTreeNode): RegexAstNode {
  return {
    type: node.type,
    label: labelFor(node),
    // offset-1: regexp-tree は /pattern/ リテラル基準なので先頭 '/' 分を引き pattern 基準へ
    loc: node.loc ? { start: node.loc.start.offset - 1, end: node.loc.end.offset - 1 } : undefined,
    children: childrenOf(node).map(toRenderNode),
  };
}

/**
 * pattern + flags を描画用 AST へ変換する。
 * native `new RegExp` で構文・フラグを検証（不正なら SyntaxError を投げる）し、
 * regexp-tree で位置情報付き AST を得る。ルートは body を Root ノードに包んで返す。
 */
export function parseRegex(pattern: string, flags: string): RegexAstNode {
  const re = new RegExp(pattern, flags); // 不正な pattern / flags はここで throw
  const ast = parseRegExpTree(re, { captureLocations: true });
  const body = ast.body as unknown as RegExpTreeNode;
  const rendered = toRenderNode(body);
  return {
    type: 'Root',
    label: '正規表現',
    children: rendered.type === 'Alternative' ? rendered.children : [rendered],
  };
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/parse.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/parse.ts src/utils/regex-visualizer/__tests__/parse.test.ts
git commit -m "feat: 正規表現を描画用 AST へ変換する parse を追加"
```

### Task 3: redos.ts — recheck checkSync を 3 状態へ正規化（test-gates）

**Files:**

- Create: `src/utils/regex-visualizer/redos.ts`
- Create: `src/utils/regex-visualizer/index.ts`
- Test: `src/utils/regex-visualizer/__tests__/redos.test.ts`

> **このタスクは「検知機構」の実装。着手前に `Skill` tool で `test-gates` skill を呼ぶこと。** 陽性対照（既知の脆弱 regex を必ず `vulnerable` と判定）を必須とする。

- [ ] **Step 1: 失敗するテストを書く（陽性対照 + 陰性対照）**

```ts
import { describe, it, expect } from 'vitest';
import { analyzeRedos } from '../redos';

describe('analyzeRedos', () => {
  // 陽性対照: 既知の脆弱パターンを必ず vulnerable と判定できること
  it('陽性対照: (a+)+$ を vulnerable と判定し攻撃文字列を返す', () => {
    const r = analyzeRedos('(a+)+$', '');
    expect(r.status).toBe('vulnerable');
    expect(typeof r.attackString).toBe('string');
    expect(r.attackString!.length).toBeGreaterThan(0);
    expect(r.complexity).toBeTruthy();
  });

  // 陰性対照: 安全なパターンを safe と判定すること
  it('陰性対照: ^[a-z]+$ を safe と判定する', () => {
    const r = analyzeRedos('^[a-z]+$', '');
    expect(r.status).toBe('safe');
    expect(r.attackString).toBeUndefined();
  });

  it('vulnerable のとき hotspot を返す', () => {
    const r = analyzeRedos('(a+)+$', '');
    expect(Array.isArray(r.hotspot)).toBe(true);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/redos.test.ts`
Expected: FAIL（`analyzeRedos` 未定義）

- [ ] **Step 3: redos.ts を実装（同期 checkSync・timeout 必須）**

```ts
import { checkSync } from 'recheck';

export type RedosStatus = 'safe' | 'vulnerable' | 'unknown';

export interface RedosResult {
  status: RedosStatus;
  /** vulnerable のとき: 攻撃文字列 */
  attackString?: string;
  /** vulnerable のとき: 複雑度の日本語表記 */
  complexity?: string;
  /** vulnerable のとき: pattern 内の危険箇所オフセット範囲 */
  hotspot?: { start: number; end: number }[];
  /** unknown のとき: 理由（timeout 等） */
  reason?: string;
}

function complexityLabel(c: { type: string; degree?: number }): string {
  if (c.type === 'exponential') return '指数時間（exponential）';
  if (c.type === 'polynomial') return `多項式時間（${c.degree ?? '?'} 次）`;
  return c.type;
}

/**
 * pattern + flags の ReDoS 脆弱性を判定する（同期）。
 * recheck checkSync の Diagnostics を 安全 / 脆弱 / 不明 の 3 状態へ正規化する。
 * timeout（メインスレッド占有の上限）を渡し、timeout 時は unknown とする。
 * 「不明」を「安全」と混同しないこと（呼び出し側 UI も区別表示する）。
 */
export function analyzeRedos(pattern: string, flags: string): RedosResult {
  const d = checkSync(pattern, flags, { timeout: 1000 });
  switch (d.status) {
    case 'vulnerable':
      return {
        status: 'vulnerable',
        attackString: d.attack.string,
        complexity: complexityLabel(d.complexity),
        hotspot: d.hotspot.map((h) => ({ start: h.start, end: h.end })),
      };
    case 'safe':
      return { status: 'safe' };
    default:
      return { status: 'unknown', reason: d.error.kind };
  }
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/redos.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: barrel export を追加**

`src/utils/regex-visualizer/index.ts`:

```ts
export { parseRegex, type RegexAstNode } from './parse';
export { analyzeRedos, type RedosResult, type RedosStatus } from './redos';
```

- [ ] **Step 6: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/redos.ts src/utils/regex-visualizer/__tests__/redos.test.ts src/utils/regex-visualizer/index.ts
git commit -m "feat: recheck で ReDoS を判定する analyzeRedos を追加"
```

### Task 4: RegexAstTree.tsx — AST を再帰描画

**Files:** Create `src/components/tools/RegexAstTree.tsx`、Modify `src/styles/global.css`

- [ ] **Step 1: コンポーネントを実装**

```tsx
import type { RegexAstNode } from '@/utils/regex-visualizer';

interface Props {
  node: RegexAstNode;
  /** 危険箇所の pattern オフセット範囲（ReDoS hotspot）。重なるノードを強調する。 */
  hotspot?: { start: number; end: number }[];
}

function isHot(node: RegexAstNode, hotspot?: { start: number; end: number }[]): boolean {
  if (!hotspot || !node.loc) return false;
  return hotspot.some((h) => node.loc!.start < h.end && h.start < node.loc!.end);
}

export function RegexAstTree({ node, hotspot }: Props) {
  const hot = isHot(node, hotspot);
  return (
    <ul className="regex-ast-tree" role={node.type === 'Root' ? 'tree' : 'group'}>
      <li role="treeitem">
        <span className={hot ? 'regex-ast-node regex-ast-node-hot' : 'regex-ast-node'}>
          {node.label}
          {hot && <span className="caption text-warning"> ⚠ ReDoS 危険箇所</span>}
        </span>
        {node.children.map((child, i) => (
          <RegexAstTree key={i} node={child} hotspot={hotspot} />
        ))}
      </li>
    </ul>
  );
}
```

- [ ] **Step 2: 意味クラスを global.css の `@layer components` に追加**

`src/styles/global.css` で既存の `--color-*` 変数名を確認し、`@layer components` に追記:

```css
.regex-ast-tree {
  margin-left: 1rem;
  border-left: 1px solid var(--color-border);
  padding-left: 0.75rem;
}
.regex-ast-node {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  background: var(--color-subtle);
  font-family: var(--font-mono, monospace);
  margin: 0.125rem 0;
}
.regex-ast-node-hot {
  background: var(--color-warning-tint);
  color: var(--color-warning);
}
```

> 変数名（`--color-border` / `--color-subtle` / `--color-warning-tint` / `--color-warning`）は `global.css` の実定義に合わせる。variant prefix（`hover:` 等）はこれら手書きクラスに付けない。

- [ ] **Step 3: 型チェック & ビルドで CSS 生成を確認**

Run: `node_modules/.bin/astro check && npm run build`
Expected: 成功。`grep -r "regex-ast-node-hot" dist/_astro/*.css` でルールが生成されている。

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/RegexAstTree.tsx src/styles/global.css
git commit -m "feat: 正規表現 AST ツリー描画コンポーネントを追加"
```

### Task 5: RegexVisualizer.tsx — メインコンポーネント（parse + ReDoS を同期 transform で統括）

**Files:**

- Create: `src/components/tools/RegexVisualizer.tsx`
- Test: `src/components/tools/__tests__/RegexVisualizer.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegexVisualizer } from '../RegexVisualizer';

describe('RegexVisualizer', () => {
  it('有効な正規表現を入力すると AST ラベルが表示される', async () => {
    render(<RegexVisualizer />);
    await userEvent.type(screen.getByLabelText('正規表現'), 'a+');
    await waitFor(() => expect(screen.getByText(/1 回以上の繰り返し/)).toBeInTheDocument());
  });

  it('不正な正規表現でエラーを表示する', async () => {
    render(<RegexVisualizer />);
    await userEvent.type(screen.getByLabelText('正規表現'), '(');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('脆弱な正規表現で危険判定を表示する', async () => {
    render(<RegexVisualizer />);
    await userEvent.type(screen.getByLabelText('正規表現'), '(a+)+$');
    await waitFor(() => expect(screen.getByText(/脆弱/)).toBeInTheDocument());
  });

  it('安全な正規表現で安全判定を表示する', async () => {
    render(<RegexVisualizer />);
    await userEvent.type(screen.getByLabelText('正規表現'), '^[a-z]+$');
    await waitFor(() => expect(screen.getByText(/安全/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: FAIL（`RegexVisualizer` 未定義）

- [ ] **Step 3: RegexVisualizer.tsx を実装**

```tsx
import { useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';
import {
  parseRegex,
  analyzeRedos,
  type RegexAstNode,
  type RedosResult,
} from '@/utils/regex-visualizer';
import { RegexAstTree } from './RegexAstTree';

const FLAGS = ['g', 'i', 'm', 's', 'u', 'y', 'd'] as const;
const SAMPLE = '(a+)+$';

interface Analysis {
  ast: RegexAstNode;
  redos: RedosResult;
}

const EMPTY: Analysis | null = null;

export function RegexVisualizer() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('');

  // parse（同期・throw でエラー表示）と ReDoS（同期 checkSync）を 1 つの debounce 変換で駆動
  const analysis = useDebouncedTransform<{ pattern: string; flags: string }, Analysis | null>(
    pattern.trim() ? { pattern, flags } : null,
    ({ pattern, flags }) => ({
      ast: parseRegex(pattern, flags), // 不正なら throw → error 表示
      redos: analyzeRedos(pattern, flags),
    }),
    EMPTY,
    [],
    { fallbackError: '正規表現が不正です' }
  );

  const ast = analysis.result?.ast ?? null;
  const redos = analysis.result?.redos ?? null;

  const toggleFlag = (f: string) =>
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : prev + f));

  const handleClear = () => {
    setPattern('');
    setFlags('');
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <InputField
          id="regex-input"
          label="正規表現"
          value={pattern}
          onChange={setPattern}
          placeholder="(a+)+$"
          error={analysis.error || undefined}
          onSampleClick={() => setPattern(SAMPLE)}
          mono
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="フラグ">
          {FLAGS.map((f) => {
            const on = flags.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFlag(f)}
                className={on ? 'flag-toggle flag-toggle-on' : 'flag-toggle'}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* ReDoS 判定パネル（3 状態を区別） */}
      <section
        aria-label="ReDoS 判定"
        aria-live="polite"
        className="rounded-lg border border-default p-4"
      >
        <h2 className="body-emphasis text-default mb-2">ReDoS 判定</h2>
        {analysis.isPending && <p className="caption text-subtle">判定中…</p>}
        {!analysis.isPending && redos?.status === 'safe' && (
          <p className="alert-success">安全：壊滅的バックトラッキングは検出されませんでした。</p>
        )}
        {!analysis.isPending && redos?.status === 'vulnerable' && (
          <div className="space-y-2">
            <p className="text-warning body-emphasis">
              ⚠ 脆弱：ReDoS のリスクがあります（{redos.complexity}）。
            </p>
            {redos.attackString && (
              <div className="flex items-center gap-2">
                <code className="bg-subtle rounded px-2 py-1 font-mono break-all">
                  {redos.attackString}
                </code>
                <CopyButton text={redos.attackString} ariaLabel="攻撃文字列をコピー" />
              </div>
            )}
          </div>
        )}
        {!analysis.isPending && redos?.status === 'unknown' && (
          <p className="text-subtle">判定不能（{redos.reason}）：安全とは限りません。</p>
        )}
        {!analysis.isPending && !redos && (
          <p className="caption text-subtle">正規表現を入力してください。</p>
        )}
      </section>

      {/* AST ツリー */}
      <section aria-label="構造ツリー">
        <h2 className="body-emphasis text-default mb-2">構造ツリー</h2>
        {analysis.error ? (
          <ErrorMessage message={analysis.error} variant="block" />
        ) : ast ? (
          <RegexAstTree node={ast} hotspot={redos?.hotspot} />
        ) : (
          <p className="caption text-subtle">正規表現を入力すると構造が表示されます。</p>
        )}
      </section>

      <div className="flex justify-end">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: flag-toggle 意味クラスを global.css の `@layer components` に追加**

```css
.flag-toggle {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-family: var(--font-mono, monospace);
}
.flag-toggle-on {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border-color: var(--color-primary);
}
```

> `InputField` / `CopyButton` / `ClearButton` / `ErrorMessage` の props（`onSampleClick` / `mono` / `text` / `ariaLabel` / `variant` 等）は各コンポーネント定義を読んで実際の API に合わせる。`SqlFormatter.tsx` が同じ顔ぶれの使用例。

- [ ] **Step 5: 実行して PASS を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 全 PASS。`checkSync` は同期なので jsdom でも追加 backend 不要で動く。

- [ ] **Step 6: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/components/tools/RegexVisualizer.tsx src/components/tools/__tests__/RegexVisualizer.test.tsx src/styles/global.css
git commit -m "feat: 正規表現ビジュアライザのメインコンポーネントを追加"
```

### Task 6: ページとツール登録

**Files:**

- Create: `src/pages/tools/regex-visualizer.astro`
- Modify: `src/data/tools.ts`

- [ ] **Step 1: tools.ts の `toolEntries` 配列にエントリ追加**

```ts
  {
    slug: 'regex-visualizer',
    name: '正規表現ビジュアライザ＆ReDoS検出',
    description:
      '正規表現を構造ツリーで可視化し、ReDoS（壊滅的バックトラッキング）脆弱性を検出します',
    category: 'convert',
    yomi: 'せいきひょうげんびじゅあらいざ',
  },
```

- [ ] **Step 2: ページを作成**

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { RegexVisualizer } from '@/components/tools/RegexVisualizer';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'regex-visualizer')!;
---

<ToolLayout tool={tool}>
  <RegexVisualizer client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      正規表現を入力すると、構造を AST ツリーで可視化し、ReDoS（壊滅的バックトラッキング）
      脆弱性の有無を判定します。脆弱な場合は攻撃文字列と計算量の種類を表示します。 対象は
      JavaScript（ECMAScript）の正規表現です。すべてブラウザ内で処理され、外部に送信されません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>複雑な正規表現の構造を把握したい</li>
      <li>入力検証の正規表現が ReDoS に対して安全か確認したい</li>
      <li>
        危険なネスト量指定子（例 <code class="rounded px-1 font-mono bg-subtle text-sm">(a+)+</code
        >）を見つけたい
      </li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 3: dev で表示確認**

Run: `npm run dev` → `http://localhost:4321/tools/regex-visualizer`
Expected: `(a+)+$` で「脆弱」、`^[a-z]+$` で「安全」、`(` でエラー。

- [ ] **Step 4: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/pages/tools/regex-visualizer.astro src/data/tools.ts
git commit -m "feat: 正規表現ビジュアライザのページとツール登録を追加"
```

### Task 7: VRT 登録

**Files:** Modify `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: PAGES 配列末尾に追加**

`'/tools/regex-visualizer',` を `PAGES` 配列末尾に追加。

- [ ] **Step 2: meta テストで漏れがないことを確認**

Run: `npx vitest run tests/meta/vrt-pages-coverage.test.ts`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/visual-regression-pages.ts
git commit -m "test: 正規表現ビジュアライザを VRT 対象に追加"
```

### Task 8: E2E（本番 CSP 下・prod-parity gate）

**Files:** Create `tests/e2e/regex-visualizer.spec.ts`

> **本番 CSP 下で実行すること。** `withProductionCsp` は末尾で `guard.assertNoViolations()` を呼ぶため、将来 `checkSync`→async `check` に戻すと blob Worker の CSP 違反でこのテストが落ちる（回帰検知ゲート）。`tests/e2e/config-converter.spec.ts` が `withProductionCsp` の使用例。

- [ ] **Step 1: E2E を書く**

```ts
import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('正規表現ビジュアライザ', () => {
  test('有効な正規表現で構造ツリーが表示される', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(ab)+');
      await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible();
    });
  });

  test('脆弱な正規表現で危険判定と攻撃文字列が出る（CSP 下で checkSync 動作）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(a+)+$');
      await expect(page.getByText(/脆弱/)).toBeVisible();
      await expect(page.getByRole('button', { name: '攻撃文字列をコピー' })).toBeVisible();
    });
  });

  test('安全な正規表現で安全判定が出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('^[a-z]+$');
      await expect(page.getByText(/安全/)).toBeVisible();
    });
  });

  test('不正な正規表現でエラーが出る', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByLabel('正規表現').fill('(');
      await expect(page.getByText(/不正/)).toBeVisible();
    });
  });
});
```

- [ ] **Step 2: E2E 実行（preview 経由）**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS。CSP 違反 0（`assertNoViolations`）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/regex-visualizer.spec.ts
git commit -m "test: 正規表現ビジュアライザの E2E を本番 CSP 下で追加"
```

### Task 9: ドキュメント更新

**Files:** Modify `README.md` / `SPEC.md` / `docs/decisions.md`

- [ ] **Step 1: README のツール一覧に追加**（既存記法に合わせる）

- [ ] **Step 2: SPEC.md を更新**：2.3（`regexp-tree` / `recheck`）、2.4（`src/utils/regex-visualizer/`）、4・5（ツール一覧）、9（チェックリスト）

- [ ] **Step 3: decisions.md に追記**
  - `regexp-tree` 採用（手書きパーサ回避）/ `recheck` 採用（browser フィールド・install script なし・min-release-age 適合）/ `safe-regex` 不採用
  - **recheck は async `check` が CSP の blob Worker 制約で不可 → `checkSync` を採用**（CSP 不変更）
  - バンドル 2.7MB raw / 334KB brotli を遅延ロードで許容（ユーザー承認済み）
  - ReDoS 3 状態の誠実さ方針／E2E は本番 CSP 下で実行（prod-parity gate）

- [ ] **Step 4: 整形 & Commit**

```bash
npm run format
git add README.md SPEC.md docs/decisions.md
git commit -m "docs: 正規表現ビジュアライザの追加に伴うドキュメント更新"
```

### Task 10: 最終検証（push 前必須）

- [ ] **Step 1: unit テスト全実行（集計行を確認）**

Run: `npm run test 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files ... passed` / `Tests ... passed`（fail 0）。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 3: E2E 全実行**

Run: `npm run test:e2e`
Expected: 全 PASS。

- [ ] **Step 4: UI 目視（PC 1280x800 / スマホ 390x844）**

Playwright MCP で `(a+)+$`（脆弱）/ `^[a-z]+$`（安全）/ `(`（エラー）を入力した状態のスクショを撮り、3 状態表示・hotspot ハイライト・レスポンシブを目視確認（`docs/shared-agent-rules.md` 7 章）。

> push / PR は `develop` ベース（`gh pr create --base develop`）。VRT baseline は CI Linux runner で `Update Visual Regression Baseline` workflow を**承認を得てから** dispatch して生成する。

---

## Self-Review（計画 vs スペック）

- **スペック 2 柱**: 可視化 = Task 4/5（AST ツリー）✅ ／ ReDoS 検出 = Task 3/5 ✅（鉄道図は PR2）
- **依存（spec 2 章）**: regexp-tree / recheck = Task 1（spike 検証済み）✅
- **3 状態の誠実さ（spec 5 章）**: redos.ts の `unknown` 正規化 + コンポーネントで 3 状態区別表示 ✅／「不明」を「安全」と出さない ✅
- **test-gates / 陽性対照（spec 5・7 章）**: Task 3 で陽性対照（`(a+)+$`→vulnerable）必須・test-gates skill 呼び出し明記 ✅
- **エラーハンドリング（spec 6 章）**: 不正 regex = parse throw → ErrorMessage（Task 5）✅／timeout/unknown = 判定不能表示 ✅／checkSync 採用で Worker/CSP 起因の失敗を回避 ✅
- **テスト（spec 7 章）**: unit（parse/redos）・E2E（本番 CSP 下）・VRT 登録・meta カバレッジ = Task 2/3/7/8 ✅
- **ドキュメント（spec 8 章）**: README/SPEC/decisions = Task 9 ✅
- **placeholder スキャン**: TODO/TBD なし。各コード step に実コードあり ✅
- **型整合**: `RegexAstNode`（parse.ts）/ `RedosResult`（redos.ts）を RegexAstTree・RegexVisualizer で一貫使用。`hotspot: {start,end}[]` が parse の loc（offset-1 補正）と同一座標系 ✅
- **spike 由来の修正反映**: checkSync（同期）✅ / 型 shim 削除 ✅ / loc offset-1 ✅ / E2E 本番 CSP ✅
