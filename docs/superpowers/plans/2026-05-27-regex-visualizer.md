# 正規表現ビジュアライザ＆ReDoS検出 実装計画（PR0 spike + PR1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正規表現を AST ツリーで可視化し、ReDoS 脆弱性を検出するブラウザ完結型ツール（slug `regex-visualizer`）を追加する。

**Architecture:** `regexp-tree` で regex を AST へパースして描画用ツリーへ正規化（同期）。`recheck` の browser ビルドで ReDoS を判定（非同期）。React コンポーネントが両者を統括し、parse は `useDebouncedTransform`、ReDoS は debounce + cancel フラグの async effect で駆動する。ReDoS 判定は `安全 / 脆弱 / 不明` の 3 状態を厳密に区別し、「不明」を「安全」と表示しない。

**Tech Stack:** Astro + React (TSX) / `regexp-tree@0.1.27`（パース・pure JS）/ `recheck@4.5.0`（ReDoS・`browser` フィールドあり・install script なし）/ Vitest（unit）/ Playwright（E2E）

**設計スペック:** `docs/superpowers/specs/2026-05-27-regex-visualizer-design.md`

**本計画の範囲:** PR0（spike）+ PR1（AST ツリー + ReDoS 検出）。鉄道図 SVG レンダラ（PR2）は spike/PR1 完了後に別計画を作成する。

---

## 前提知識（実装者向け）

- **依存ポリシー**: `.npmrc` に `ignore-scripts=true` / `min-release-age=7` / `save-exact=true`。`recheck` は install script を持たず browser フィールド（`lib/browser.js`）を持つため Vite が自動で browser ビルドを選ぶ。platform binary は optionalDependencies（install bloat になるが browser バンドルには含まれない）。
- **recheck API（grounded）**: `import { check } from 'recheck';` → `const d = await check(pattern: string, flags: string)`。`d.status` は `'safe' | 'vulnerable' | 'unknown'`。
  - `vulnerable`: `d.attack.string`（攻撃文字列）, `d.complexity.type`（`'exponential' | 'polynomial'`）, `d.complexity.degree`（polynomial の次数）, `d.hotspot`（`{ start, end, temperature }[]` の source オフセット範囲）
  - `unknown`: `d.error.kind`（`'timeout' | 'unsupported' | ...`）
  - **実際の version での shape は PR0 spike で確認すること。**
- **regexp-tree API**: `import { parse } from 'regexp-tree';` → `parse(re, { captureLocations: true })` が `{ type:'RegExp', body, flags }` を返す。`captureLocations` で各ノードに `loc:{ source, start, end }` が付く（recheck の hotspot オフセットと突き合わせて危険箇所をハイライトするため）。型定義を同梱しないため型 shim が要る場合がある（spike で確認）。
- **既存パターン**: 共通 UI は `src/components/ui/`（`InputField` / `OutputField` / `ToggleGroup` / `CopyButton` / `ClearButton` / `ErrorMessage`）。同期変換フックは `useDebouncedTransform`（`src/hooks/`）。色は Tailwind primitive 直書き禁止、`@layer components` の意味クラス（`alert-success` / `bg-warning-tint` / `text-warning` 等）を使う（`docs/shared-agent-rules.md` 7 章）。
- **ツール追加手順**: component → page → `src/data/tools.ts` 登録 → `tests/e2e/visual-regression-pages.ts` の `PAGES` 追加 → README/SPEC/decisions 更新（`docs/shared-agent-rules.md` 5 章）。

---

## File Structure

| ファイル                                                  | 責務                                                                                           |
| :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `src/types/regexp-tree.d.ts`（必要時）                    | regexp-tree の最小型 shim（`parse` と AST ノード）                                             |
| `src/utils/regex-visualizer/parse.ts`                     | pattern+flags → 描画用 AST（`RegexAstNode`）。native `new RegExp` で検証、regexp-tree でパース |
| `src/utils/regex-visualizer/redos.ts`                     | pattern+flags → `RedosResult`（async）。recheck の Diagnostics を 3 状態へ正規化               |
| `src/utils/regex-visualizer/index.ts`                     | barrel export                                                                                  |
| `src/utils/regex-visualizer/__tests__/parse.test.ts`      | parse.ts の unit テスト                                                                        |
| `src/utils/regex-visualizer/__tests__/redos.test.ts`      | redos.ts の unit テスト（陽性対照含む）                                                        |
| `src/components/tools/RegexAstTree.tsx`                   | `RegexAstNode` を再帰描画するプレゼンテーションコンポーネント                                  |
| `src/components/tools/RegexVisualizer.tsx`                | メイン。入力・flags・parse・ReDoS パネルを統括                                                 |
| `src/components/tools/__tests__/RegexVisualizer.test.tsx` | コンポーネントの unit テスト                                                                   |
| `src/pages/tools/regex-visualizer.astro`                  | ページ（`client:load` マウント）                                                               |
| `tests/e2e/regex-visualizer.spec.ts`                      | E2E                                                                                            |
| `src/data/tools.ts`                                       | ツール登録                                                                                     |
| `tests/e2e/visual-regression-pages.ts`                    | VRT 対象に `/tools/regex-visualizer` 追加                                                      |
| `README.md` / `SPEC.md` / `docs/decisions.md`             | ドキュメント更新                                                                               |

---

## Phase 0: Spike（PR0 — go/no-go 検証）

目的: `recheck` の browser ビルドが Vite で動くか、`regexp-tree` の型/出力が想定どおりかを **本実装前に** 確認する。失敗時は ReDoS エンジンを自前静的解析へフォールバックする判断材料を得る。spike 用の probe は使い捨て（最後に削除）し、結論を `docs/decisions.md` に記録する。

### Task S1: 依存をインストール

**Files:** `package.json` / `package-lock.json`

- [ ] **Step 1: 依存追加（min-release-age / save-exact は .npmrc 準拠）**

```bash
npm install regexp-tree recheck --cache "$TMPDIR/npm-cache" --no-audit --no-fund
```

Expected: `package.json` の dependencies に `regexp-tree`（exact 版）と `recheck`（exact 版）が追加される。`package-lock.json` も更新される。`min-release-age=7` で弾かれた場合はバージョン指定（例 `recheck@4.5.0`）で再実行。

- [ ] **Step 2: optionalDependencies の install bloat を確認**

Run: `ls node_modules | grep -i recheck`
Expected: `recheck` 本体 + platform binary（例 `recheck-darwin-arm64`）+ `recheck-jar` 等。これらは browser バンドルには含まれない（後続ビルドで確認）。

### Task S2: recheck の node 実行を確認（vitest 環境）

**Files:** `src/utils/regex-visualizer/__probe__.test.ts`（使い捨て）

- [ ] **Step 1: probe テストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { check } from 'recheck';

describe('recheck probe (throwaway)', () => {
  it('flags a known ReDoS pattern as vulnerable', async () => {
    const d = await check('(a+)+$', '');
    // shape を観察: status / attack / complexity / hotspot
    console.log(JSON.stringify(d, null, 2));
    expect(d.status).toBe('vulnerable');
  });

  it('marks a safe pattern as safe', async () => {
    const d = await check('^[a-z]+$', '');
    expect(d.status).toBe('safe');
  });
});
```

- [ ] **Step 2: 実行して shape を記録**

Run: `npx vitest run src/utils/regex-visualizer/__probe__.test.ts`
Expected: 2 件 PASS。console 出力から `attack.string` / `complexity.type` / `complexity.degree` / `hotspot` の実フィールド名を控える（PR1 の redos.ts はこの実 shape に合わせる）。

> **判定不能を返す場合**: node 環境で `check` が `unknown`（backend 未解決）を返すなら `checkSync` を試す。両方失敗するなら ReDoS エンジンをフォールバック（自前静的解析）に切替える判断を S4 で行う。

### Task S3: regexp-tree のパースと loc を確認

**Files:** `src/utils/regex-visualizer/__probe__.test.ts`（同上・使い捨て）

- [ ] **Step 1: probe を追記**

```ts
import { parse } from 'regexp-tree';

it('parses with locations', () => {
  const re = new RegExp('(a+)+$', '');
  const ast = parse(re, { captureLocations: true }) as any;
  console.log(JSON.stringify(ast, null, 2));
  expect(ast.type).toBe('RegExp');
  expect(ast.body).toBeTruthy();
});
```

- [ ] **Step 2: 実行して AST 形状・loc を記録**

Run: `npx vitest run src/utils/regex-visualizer/__probe__.test.ts`
Expected: PASS。ノードの `type`（`Repetition` / `Group` / `Alternative` / `Char` / `CharacterClass` / `Assertion` / `Disjunction` / `Backreference`）と `loc.start/end` の有無を確認。TS で型エラーが出る場合は型 shim 要（Task 1 で対応）。

### Task S4: ブラウザビルドと go/no-go 記録

**Files:** `docs/decisions.md`（追記）、probe 削除

- [ ] **Step 1: ビルドが recheck browser ビルドを取り込めるか確認する一時 probe ページ**

`src/pages/__probe__.astro` を作成:

```astro
---

---

<html>
  <body
    ><div id="r">checking…</div><script>
      import { check } from 'recheck';
      check('(a+)+$', '').then((d) => {
        document.getElementById('r')!.textContent = 'status=' + d.status;
      });
    </script></body
  >
</html>
```

- [ ] **Step 2: ビルド実行**

Run: `npm run build`
Expected: ビルド成功（recheck の browser エントリがバンドルされ、node 専用 API でコケない）。失敗時はエラーを記録し、フォールバック判断へ。

- [ ] **Step 3: dev で実ブラウザ実行を確認（Playwright MCP もしくは手動）**

Run: `npm run dev` → `http://localhost:4321/__probe__` を開く
Expected: `status=vulnerable` が表示される（browser ランタイムで recheck が動く）。

- [ ] **Step 4: 結論を decisions.md に記録し probe を削除**

```bash
rm src/utils/regex-visualizer/__probe__.test.ts src/pages/__probe__.astro
```

`docs/decisions.md` に「recheck browser ビルドは Vite で動作（or 動作せずフォールバック採用）」「recheck Diagnostics の実 shape」「regexp-tree 型 shim 要否」を追記。

> **GO**: recheck browser 動作 → Phase 1 を recheck で進める。
> **NO-GO**: 動作せず → Phase 1 の redos.ts を自前静的解析（ネスト量指定子 `(x+)+`・重複選択肢検出）へ差し替え、本計画の redos.ts タスクを再設計する（別途）。

---

## Phase 1: PR1（AST ツリー + ReDoS 検出）

以降は **GO 前提**。Phase 0 で確認した recheck の実 shape に合わせて微調整すること。

### Task 1: regexp-tree 型 shim（spike で必要と判明した場合のみ）

**Files:** Create `src/types/regexp-tree.d.ts`

- [ ] **Step 1: 最小型を宣言**

```ts
declare module 'regexp-tree' {
  export interface RegExpTreeLoc {
    source: string;
    start: number;
    end: number;
  }
  export interface RegExpTreeNode {
    type: string;
    loc?: RegExpTreeLoc;
    [key: string]: unknown;
  }
  export interface RegExpTreeAst extends RegExpTreeNode {
    type: 'RegExp';
    body: RegExpTreeNode;
    flags: string;
  }
  export function parse(
    re: RegExp | string,
    options?: { captureLocations?: boolean }
  ): RegExpTreeAst;
}
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: regexp-tree 由来の型エラーが消える。

- [ ] **Step 3: Commit**

```bash
git add src/types/regexp-tree.d.ts
git commit -m "build: regexp-tree の型 shim を追加"
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

  it('各ノードに loc を持つ', () => {
    const root = parseRegex('a+', '');
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
  /** regexp-tree のノード種別（'Char' | 'Repetition' | 'Group' | 'Disjunction' | 'Alternative' | 'CharacterClass' | 'Assertion' | 'Backreference' 等） */
  type: string;
  /** 日本語の表示ラベル */
  label: string;
  /** source 内の位置（recheck hotspot との突き合わせ用） */
  loc?: { start: number; end: number };
  children: RegexAstNode[];
}

function quantifierLabel(q: {
  kind: string;
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
    case 'Range': {
      const to = q.to == null ? '' : q.to === q.from ? '' : `〜${q.to} 回`;
      return q.to == null
        ? `${q.from} 回以上の繰り返し${lazy}`
        : q.to === q.from
          ? `ちょうど ${q.from} 回${lazy}`
          : `${q.from}${to} の繰り返し${lazy}`;
    }
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
function childrenOf(node: Record<string, any>): Record<string, any>[] {
  if (node.type === 'Alternative') return node.expressions ?? [];
  if (node.type === 'Disjunction') return [node.left, node.right].filter(Boolean);
  if (node.type === 'Group' || node.type === 'Repetition' || node.type === 'Assertion') {
    return node.expression ? [node.expression] : [];
  }
  if (node.type === 'CharacterClass') return node.expressions ?? [];
  return [];
}

function toRenderNode(node: Record<string, any>): RegexAstNode {
  return {
    type: node.type,
    label: labelFor(node),
    loc: node.loc ? { start: node.loc.start, end: node.loc.end } : undefined,
    children: childrenOf(node).map(toRenderNode),
  };
}

/**
 * pattern + flags を描画用 AST へ変換する。
 * native `new RegExp` で構文・フラグを検証（不正なら SyntaxError を投げる）し、
 * regexp-tree で位置情報付き AST を得る。ルートは body を「連結」ノードに正規化して返す。
 */
export function parseRegex(pattern: string, flags: string): RegexAstNode {
  const re = new RegExp(pattern, flags); // 不正な pattern / flags はここで throw
  const ast = parseRegExpTree(re, { captureLocations: true });
  const body = ast.body as Record<string, any>;
  const root = toRenderNode(body);
  // ルートが Alternative でない単一ノードでもツリー表示できるよう children 配列に包む
  return root.type === 'Alternative'
    ? { type: 'Root', label: '正規表現', loc: undefined, children: root.children }
    : { type: 'Root', label: '正規表現', loc: undefined, children: [root] };
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/parse.test.ts`
Expected: 全 PASS。loc 期待値（`a+` の `{start:0,end:2}`）が実際とズレたら Phase 0 の観察値に合わせて修正。

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/parse.ts src/utils/regex-visualizer/__tests__/parse.test.ts
git commit -m "feat: 正規表現を描画用 AST へ変換する parse を追加"
```

### Task 3: redos.ts — recheck を 3 状態へ正規化（test-gates）

**Files:**

- Create: `src/utils/regex-visualizer/redos.ts`
- Test: `src/utils/regex-visualizer/__tests__/redos.test.ts`

> **このタスクは「検知機構」の実装。`Skill` tool で `test-gates` skill を呼んでから着手すること。** 陽性対照（既知の脆弱 regex を必ず `vulnerable` と判定）を必須とする。

- [ ] **Step 1: 失敗するテストを書く（陽性対照 + 陰性対照）**

```ts
import { describe, it, expect } from 'vitest';
import { analyzeRedos } from '../redos';

describe('analyzeRedos', () => {
  // 陽性対照: 既知の脆弱パターンを必ず vulnerable と判定できること
  it('陽性対照: (a+)+$ を vulnerable と判定し攻撃文字列を返す', async () => {
    const r = await analyzeRedos('(a+)+$', '');
    expect(r.status).toBe('vulnerable');
    expect(typeof r.attackString).toBe('string');
    expect(r.attackString!.length).toBeGreaterThan(0);
    expect(r.complexity).toBeTruthy();
  });

  // 陰性対照: 安全なパターンを safe と判定すること
  it('陰性対照: ^[a-z]+$ を safe と判定する', async () => {
    const r = await analyzeRedos('^[a-z]+$', '');
    expect(r.status).toBe('safe');
    expect(r.attackString).toBeUndefined();
  });

  it('hotspot を source オフセット範囲として返す', async () => {
    const r = await analyzeRedos('(a+)+$', '');
    expect(Array.isArray(r.hotspot)).toBe(true);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/redos.test.ts`
Expected: FAIL（`analyzeRedos` 未定義）

- [ ] **Step 3: redos.ts を実装（Phase 0 の実 shape に合わせる）**

```ts
import { check } from 'recheck';

export type RedosStatus = 'safe' | 'vulnerable' | 'unknown';

export interface RedosResult {
  status: RedosStatus;
  /** vulnerable のとき: 攻撃文字列 */
  attackString?: string;
  /** vulnerable のとき: 複雑度の日本語表記 */
  complexity?: string;
  /** vulnerable のとき: source 内の危険箇所オフセット範囲 */
  hotspot?: { start: number; end: number }[];
  /** unknown のとき: 理由（timeout 等） */
  reason?: string;
}

function complexityLabel(c: { type?: string; degree?: number } | undefined): string {
  if (!c) return '不明';
  if (c.type === 'exponential') return '指数時間（exponential）';
  if (c.type === 'polynomial') return `多項式時間（${c.degree ?? '?'} 次）`;
  return c.type ?? '不明';
}

/**
 * pattern + flags の ReDoS 脆弱性を判定する。
 * recheck の Diagnostics を 安全 / 脆弱 / 不明 の 3 状態へ正規化する。
 * 「不明」を「安全」と混同しないこと（呼び出し側 UI も区別表示する）。
 */
export async function analyzeRedos(pattern: string, flags: string): Promise<RedosResult> {
  const d: any = await check(pattern, flags);
  switch (d.status) {
    case 'vulnerable':
      return {
        status: 'vulnerable',
        attackString: d.attack?.string,
        complexity: complexityLabel(d.complexity),
        hotspot: Array.isArray(d.hotspot)
          ? d.hotspot.map((h: any) => ({ start: h.start, end: h.end }))
          : [],
      };
    case 'safe':
      return { status: 'safe' };
    default:
      return { status: 'unknown', reason: d.error?.kind ?? 'unknown' };
  }
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/redos.test.ts`
Expected: 全 PASS。フィールド名（`attack.string` 等）が Phase 0 観察値と違えば修正。

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

**Files:** Create `src/components/tools/RegexAstTree.tsx`

- [ ] **Step 1: コンポーネントを実装**

```tsx
import type { RegexAstNode } from '@/utils/regex-visualizer';

interface Props {
  node: RegexAstNode;
  /** 危険箇所の source オフセット範囲（ReDoS hotspot）。重なるノードを強調する。 */
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

- [ ] **Step 2: 意味クラスを global.css に追加**

`src/styles/global.css` の `@layer components` に追記（primitive 直書き禁止のため意味クラスで定義）:

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

> 既存の `--color-*` 変数名は `src/styles/global.css` で確認し、無ければ既存意味クラス（`bg-subtle` / `bg-warning-tint` / `text-warning`）に合わせて命名する。`hover:` 等 variant は手書きクラスに付けない（`docs/shared-agent-rules.md` 7.1）。

- [ ] **Step 3: 型チェック & ビルドで CSS 生成を確認**

Run: `node_modules/.bin/astro check && npm run build`
Expected: 成功。`dist/_astro/*.css` に `.regex-ast-node-hot` ルールが生成される。

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/RegexAstTree.tsx src/styles/global.css
git commit -m "feat: 正規表現 AST ツリー描画コンポーネントを追加"
```

### Task 5: RegexVisualizer.tsx — メインコンポーネント

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
    const input = screen.getByLabelText('正規表現');
    await userEvent.type(input, 'a+');
    await waitFor(() => expect(screen.getByText(/1 回以上の繰り返し/)).toBeInTheDocument());
  });

  it('不正な正規表現でエラーを表示する', async () => {
    render(<RegexVisualizer />);
    const input = screen.getByLabelText('正規表現');
    await userEvent.type(input, '(');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('脆弱な正規表現で危険判定を表示する', async () => {
    render(<RegexVisualizer />);
    const input = screen.getByLabelText('正規表現');
    await userEvent.type(input, '(a+)+$');
    await waitFor(() => expect(screen.getByText(/脆弱/)).toBeInTheDocument(), { timeout: 5000 });
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: FAIL（`RegexVisualizer` 未定義）

- [ ] **Step 3: RegexVisualizer.tsx を実装**

```tsx
import { useEffect, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  parseRegex,
  analyzeRedos,
  type RegexAstNode,
  type RedosResult,
} from '@/utils/regex-visualizer';
import { RegexAstTree } from './RegexAstTree';

const FLAGS = ['g', 'i', 'm', 's', 'u', 'y', 'd'] as const;
const SAMPLE = '(a+)+$';
const EMPTY_AST: RegexAstNode | null = null;

export function RegexVisualizer() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('');

  // parse（同期・debounce）
  const parsed = useDebouncedTransform<{ pattern: string; flags: string }, RegexAstNode | null>(
    pattern.trim() ? { pattern, flags } : null,
    ({ pattern, flags }) => parseRegex(pattern, flags),
    EMPTY_AST,
    [],
    { fallbackError: '正規表現が不正です' }
  );

  // ReDoS（非同期・debounce + cancel）
  const dPattern = useDebouncedValue(pattern, 400);
  const dFlags = useDebouncedValue(flags, 400);
  const [redos, setRedos] = useState<RedosResult | null>(null);
  const [redosPending, setRedosPending] = useState(false);

  useEffect(() => {
    if (!dPattern.trim()) {
      setRedos(null);
      return;
    }
    // 無効な regex では recheck を呼ばない（parse エラー側で表示済み）
    try {
      new RegExp(dPattern, dFlags);
    } catch {
      setRedos(null);
      return;
    }
    let cancelled = false;
    setRedosPending(true);
    analyzeRedos(dPattern, dFlags)
      .then((r) => {
        if (!cancelled) setRedos(r);
      })
      .catch(() => {
        if (!cancelled) setRedos({ status: 'unknown', reason: 'error' });
      })
      .finally(() => {
        if (!cancelled) setRedosPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dPattern, dFlags]);

  const toggleFlag = (f: string) =>
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : prev + f));

  const handleClear = () => {
    setPattern('');
    setFlags('');
    setRedos(null);
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
          error={parsed.error || undefined}
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
        {redosPending && <p className="caption text-subtle">判定中…</p>}
        {!redosPending && redos?.status === 'safe' && (
          <p className="alert-success">安全：壊滅的バックトラッキングは検出されませんでした。</p>
        )}
        {!redosPending && redos?.status === 'vulnerable' && (
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
        {!redosPending && redos?.status === 'unknown' && (
          <p className="text-subtle">判定不能（{redos.reason}）：安全とは限りません。</p>
        )}
        {!redosPending && !redos && (
          <p className="caption text-subtle">正規表現を入力してください。</p>
        )}
      </section>

      {/* AST ツリー */}
      <section aria-label="構造ツリー">
        <h2 className="body-emphasis text-default mb-2">構造ツリー</h2>
        {parsed.error ? (
          <ErrorMessage message={parsed.error} variant="block" />
        ) : parsed.result ? (
          <RegexAstTree node={parsed.result} hotspot={redos?.hotspot} />
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

- [ ] **Step 4: flag-toggle 意味クラスを global.css に追加**

`@layer components` に:

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

> 変数名は既存 `global.css` で確認。`InputField` / `CopyButton` / `ClearButton` / `ErrorMessage` の props は各コンポーネント定義を読んで合わせる（`onSampleClick` / `mono` / `variant` 等の有無）。

- [ ] **Step 5: 実行して PASS を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 全 PASS。recheck 呼び出しが node 環境で遅い/失敗する場合は 3 つ目のテストの timeout を調整、それでも不安定なら redos をモックして「vulnerable 表示の描画」だけを検証し、エンジン正当性は redos.test.ts（Task 3）の陽性対照に委ねる。

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

- [ ] **Step 1: tools.ts にエントリ追加**

`toolEntries` 配列に追加:

```ts
  {
    slug: 'regex-visualizer',
    name: '正規表現ビジュアライザ＆ReDoS検出',
    description: '正規表現を構造ツリーで可視化し、ReDoS（壊滅的バックトラッキング）脆弱性を検出します',
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
Expected: ページが表示され、`(a+)+$` で「脆弱」、`^[a-z]+$` で「安全」、`(` でエラーが出る。

- [ ] **Step 4: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/pages/tools/regex-visualizer.astro src/data/tools.ts
git commit -m "feat: 正規表現ビジュアライザのページとツール登録を追加"
```

### Task 7: VRT 登録

**Files:** Modify `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: PAGES に追加**

`PAGES` 配列末尾に `'/tools/regex-visualizer',` を追加。

- [ ] **Step 2: meta テストで漏れがないことを確認**

Run: `npx vitest run tests/meta/vrt-pages-coverage.test.ts`
Expected: PASS（全 slug が PAGES に存在）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/visual-regression-pages.ts
git commit -m "test: 正規表現ビジュアライザを VRT 対象に追加"
```

### Task 8: E2E

**Files:** Create `tests/e2e/regex-visualizer.spec.ts`

- [ ] **Step 1: E2E を書く（既存 spec の構造に合わせる）**

```ts
import { test, expect } from '@playwright/test';

test.describe('正規表現ビジュアライザ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/regex-visualizer');
  });

  test('有効な正規表現で構造ツリーが表示される', async ({ page }) => {
    await page.getByLabel('正規表現').fill('(ab)+');
    await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible();
  });

  test('脆弱な正規表現で危険判定と攻撃文字列が出る', async ({ page }) => {
    await page.getByLabel('正規表現').fill('(a+)+$');
    await expect(page.getByText(/脆弱/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '攻撃文字列をコピー' })).toBeVisible();
  });

  test('安全な正規表現で安全判定が出る', async ({ page }) => {
    await page.getByLabel('正規表現').fill('^[a-z]+$');
    await expect(page.getByText(/安全/)).toBeVisible({ timeout: 10000 });
  });

  test('不正な正規表現でエラーが出る', async ({ page }) => {
    await page.getByLabel('正規表現').fill('(');
    await expect(page.getByText(/不正/)).toBeVisible();
  });
});
```

- [ ] **Step 2: E2E 実行（preview 経由）**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS。ロケータは `getByLabel` / `getByText` / `getByRole`（`locator('[role=...]')` 禁止・memory 参照）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/regex-visualizer.spec.ts
git commit -m "test: 正規表現ビジュアライザの E2E を追加"
```

### Task 9: ドキュメント更新

**Files:** Modify `README.md` / `SPEC.md` / `docs/decisions.md`

- [ ] **Step 1: README のツール一覧に追加**

`README.md` のツール一覧へ「正規表現ビジュアライザ＆ReDoS検出」を追記（既存の記法に合わせる）。

- [ ] **Step 2: SPEC.md を更新**

  2.3（ライブラリ: `regexp-tree` / `recheck`）、2.4（`src/utils/regex-visualizer/`）、4・5（ツール一覧）、9（チェックリスト）を更新。

- [ ] **Step 3: decisions.md に選定理由を記録**

`regexp-tree` 採用理由（手書きパーサ回避）、`recheck` 採用理由（browser フィールド・install script なし・min-release-age 適合）、`safe-regex` 不採用理由、ReDoS 3 状態の誠実さ方針、（Phase 0 で記録済みでなければ）browser ビルド検証結果。

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

Playwright MCP で `(a+)+$` を入力した状態のスクショを撮り、3 状態（安全/脆弱/不明）の表示・ハイライト・レスポンシブを目視確認（`docs/shared-agent-rules.md` 7 章）。

> push / PR 作成は `develop` ベース。`gh pr create --base develop`。VRT baseline は CI Linux runner で `Update Visual Regression Baseline` workflow を（承認を得てから）dispatch して生成する。

---

## Self-Review（計画 vs スペック）

- **スペック 2 柱**: 可視化 = Task 4/5（AST ツリー）✅ ／ ReDoS 検出 = Task 3/5 ✅（鉄道図は PR2 で別計画）
- **依存（spec 2 章）**: regexp-tree / recheck = Task S1・Phase 0 で検証 ✅
- **3 状態の誠実さ（spec 5 章）**: redos.ts の `unknown` 正規化 + コンポーネントで 3 状態区別表示 ✅／「不明」を「安全」と出さない ✅
- **test-gates / 陽性対照（spec 5・7 章）**: Task 3 で陽性対照（`(a+)+$`→vulnerable）必須・test-gates skill 呼び出し明記 ✅
- **エラーハンドリング（spec 6 章）**: 不正 regex = parse throw → ErrorMessage（Task 5）✅／timeout/unknown = 判定不能表示 ✅／WASM ロード失敗 = catch → unknown 表示（Task 5 effect の catch）✅
- **テスト（spec 7 章）**: unit（parse/redos）・E2E・VRT 登録・meta カバレッジ = Task 2/3/7/8 ✅
- **ドキュメント（spec 8 章）**: README/SPEC/decisions = Task 9 ✅
- **placeholder スキャン**: TODO/TBD なし。各コード step に実コードあり ✅
- **型整合**: `RegexAstNode`（parse.ts 定義）を RegexAstTree/コンポーネントで一貫使用、`RedosResult` の `hotspot` 型が RegexAstTree の `hotspot` prop と一致 ✅

> **未確定リスク**: recheck の Diagnostics 実フィールド名・browser バンドル可否・vitest(node) での `check` 動作は Phase 0 spike で確定する。NO-GO 時は redos.ts を自前静的解析へ差し替え、Task 3 と関連テストを再設計する。
