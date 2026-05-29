# JSON整形・ビューア PR4: TypeScript 型生成 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** json-formatter に「型」表示モードを追加し、入力 JSON（クエリ有効時は抽出結果）から TypeScript 型定義を自作エミッターで生成してコピー/DL できるようにする。

**Architecture:** 純関数の推論コア `inferType`（全要素マージ）＋ エミッター `generateTypeScript`（ネスト object を別 interface に切り出し）。依存ゼロ・CSP 影響なし。UI は mask と同方式で `useMemo` 生成 → `OutputField` 表示。

**Tech Stack:** TypeScript / React 19 / Astro / Vitest / Playwright（文字列生成のみ、新規ライブラリなし）

設計書: `docs/superpowers/specs/2026-05-29-json-formatter-typegen-design.md`

---

## File Structure

- Create: `src/utils/json-formatter/type-gen.ts` — `inferType` / `generateTypeScript` / `TypeNode`
- Create: `src/utils/json-formatter/__tests__/type-gen.test.ts`
- Modify: `src/utils/json-formatter/index.ts` — `export * from './type-gen';`
- Modify: `src/components/tools/JsonFormatter.tsx` — 「型」モード追加
- Modify: `tests/e2e/json-formatter.spec.ts` — 型モード E2E
- Modify: `README.md` / `SPEC.md` / `docs/decisions.md`

ブランチ: `feat/json-formatter-typegen`（作成済み、origin/develop 起点）。

---

## Task 1: type-gen.ts（推論コア＋TS エミッター）

**Files:**

- Create: `src/utils/json-formatter/type-gen.ts`
- Test: `src/utils/json-formatter/__tests__/type-gen.test.ts`

変換器（検知機構ではない）のため通常の単体テストで担保。出力は厳密文字列で検証する。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/json-formatter/__tests__/type-gen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTypeScript } from '../type-gen';

describe('generateTypeScript', () => {
  it('object ルートを interface にする（キー順を保持）', () => {
    expect(generateTypeScript({ name: 'x', age: 1 })).toBe(
      'interface Root {\n  name: string;\n  age: number;\n}'
    );
  });

  it('ネスト object を別 interface に切り出し、子→親の順で出力する', () => {
    expect(generateTypeScript({ user: { id: 1 } })).toBe(
      'interface User {\n  id: number;\n}\n\ninterface Root {\n  user: User;\n}'
    );
  });

  it('array of object ルートは要素 interface + type 別名にする', () => {
    expect(generateTypeScript([{ a: 1 }, { a: 2, b: 'x' }])).toBe(
      'interface RootItem {\n  a: number;\n  b?: string;\n}\n\ntype Root = RootItem[];'
    );
  });

  it('全要素マージ: 欠けキーは optional、型違いは union、null も union 要素', () => {
    expect(generateTypeScript([{ a: 1 }, { a: null, b: 2 }])).toBe(
      'interface RootItem {\n  a: number | null;\n  b?: number;\n}\n\ntype Root = RootItem[];'
    );
  });

  it('primitive ルートは type 別名', () => {
    expect(generateTypeScript(42)).toBe('type Root = number;');
    expect(generateTypeScript(null)).toBe('type Root = null;');
  });

  it('空配列フィールドは unknown[]', () => {
    expect(generateTypeScript({ tags: [] })).toBe('interface Root {\n  tags: unknown[];\n}');
  });

  it('primitive 配列は T[]、混在は (A | B)[]', () => {
    expect(generateTypeScript({ nums: [1, 2, 3] })).toBe('interface Root {\n  nums: number[];\n}');
    expect(generateTypeScript({ mixed: [1, 'x'] })).toBe(
      'interface Root {\n  mixed: (number | string)[];\n}'
    );
  });

  it('非識別子キーはクォート、キー名は PascalCase で interface 命名', () => {
    expect(generateTypeScript({ order_items: { sku: 'x' } })).toBe(
      'interface OrderItems {\n  sku: string;\n}\n\ninterface Root {\n  order_items: OrderItems;\n}'
    );
    expect(generateTypeScript({ 'order-id': 1 })).toBe(
      'interface Root {\n  "order-id": number;\n}'
    );
  });

  it('配列要素 object は 親名+Item で命名', () => {
    expect(generateTypeScript({ tags: [{ id: 1 }] })).toBe(
      'interface TagsItem {\n  id: number;\n}\n\ninterface Root {\n  tags: TagsItem[];\n}'
    );
  });

  it('interface 名の衝突は数字サフィックス', () => {
    expect(generateTypeScript({ a_b: { x: 1 }, 'a-b': { y: 2 } })).toBe(
      'interface AB {\n  x: number;\n}\n\ninterface AB2 {\n  y: number;\n}\n\n' +
        'interface Root {\n  a_b: AB;\n  "a-b": AB2;\n}'
    );
  });

  it('空 object は interface Root {}', () => {
    expect(generateTypeScript({})).toBe('interface Root {}');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/type-gen.test.ts`
Expected: FAIL（`Cannot find module '../type-gen'`）。

- [ ] **Step 3: 実装**

`src/utils/json-formatter/type-gen.ts`:

```ts
export type TypeNode =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'object'; fields: Map<string, { type: TypeNode; optional: boolean }> }
  | { kind: 'array'; element: TypeNode }
  | { kind: 'union'; members: TypeNode[] }
  | { kind: 'unknown' };

/** パース済み JS 値から型を推論する（配列は全要素マージ）。 */
export function inferType(value: unknown): TypeNode {
  if (value === null) return { kind: 'primitive', name: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', element: { kind: 'unknown' } };
    return { kind: 'array', element: unionOf(value.map(inferType)) };
  }
  if (typeof value === 'object') {
    const fields = new Map<string, { type: TypeNode; optional: boolean }>();
    for (const [k, v] of Object.entries(value)) {
      fields.set(k, { type: inferType(v), optional: false });
    }
    return { kind: 'object', fields };
  }
  if (value === undefined) return { kind: 'unknown' };
  const t = typeof value; // string | number | boolean
  return { kind: 'primitive', name: t as 'string' | 'number' | 'boolean' };
}

type ObjectType = Extract<TypeNode, { kind: 'object' }>;

function mergeObjects(a: ObjectType, b: ObjectType): ObjectType {
  const fields = new Map<string, { type: TypeNode; optional: boolean }>();
  const keys = new Set([...a.fields.keys(), ...b.fields.keys()]);
  for (const k of keys) {
    const fa = a.fields.get(k);
    const fb = b.fields.get(k);
    if (fa && fb) {
      fields.set(k, { type: unionOf([fa.type, fb.type]), optional: fa.optional || fb.optional });
    } else {
      const f = (fa ?? fb)!;
      fields.set(k, { type: f.type, optional: true }); // どちらかで欠ける → optional
    }
  }
  return { kind: 'object', fields };
}

/**
 * 複数の型を 1 つにまとめる。object 同士・array 同士はマージ、
 * primitive は名前で重複除去、混在は union にする。
 */
function unionOf(types: TypeNode[]): TypeNode {
  const flat: TypeNode[] = [];
  for (const t of types) {
    if (t.kind === 'union') flat.push(...t.members);
    else if (t.kind !== 'unknown') flat.push(t);
  }
  const objects = flat.filter((t): t is ObjectType => t.kind === 'object');
  const arrays = flat.filter((t): t is Extract<TypeNode, { kind: 'array' }> => t.kind === 'array');
  const prims = flat.filter(
    (t): t is Extract<TypeNode, { kind: 'primitive' }> => t.kind === 'primitive'
  );

  const result: TypeNode[] = [];
  if (objects.length > 0) result.push(objects.reduce(mergeObjects));
  if (arrays.length > 0)
    result.push({ kind: 'array', element: unionOf(arrays.map((a) => a.element)) });
  const seen = new Set<string>();
  for (const p of prims) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      result.push(p);
    }
  }

  if (result.length === 0) return { kind: 'unknown' };
  if (result.length === 1) return result[0];
  return { kind: 'union', members: result };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

function pascalCase(key: string): string {
  const parts = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return /^[A-Za-z]/.test(name) ? name : `Type${name}`;
}

/** TypeScript 型定義を生成する。ネスト object は別 interface に切り出す。 */
export function generateTypeScript(value: unknown, rootName = 'Root'): string {
  const interfaces: string[] = [];
  const used = new Set<string>();

  function uniqueName(base: string): string {
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);
    return name;
  }

  // node を型式の文字列にする。object は interface を登録して名前を返す。
  function ref(node: TypeNode, suggested: string): string {
    switch (node.kind) {
      case 'primitive':
        return node.name;
      case 'unknown':
        return 'unknown';
      case 'union':
        return node.members.map((m) => ref(m, suggested)).join(' | ');
      case 'array': {
        const elem = ref(node.element, `${suggested}Item`);
        return /[ |]/.test(elem) ? `(${elem})[]` : `${elem}[]`;
      }
      case 'object': {
        const name = uniqueName(suggested);
        const lines: string[] = [];
        for (const [k, f] of node.fields) {
          const fieldType = ref(f.type, pascalCase(k)); // 子 interface を先に push
          const key = IDENT.test(k) ? k : JSON.stringify(k);
          lines.push(`  ${key}${f.optional ? '?' : ''}: ${fieldType};`);
        }
        const body =
          lines.length === 0
            ? `interface ${name} {}`
            : `interface ${name} {\n${lines.join('\n')}\n}`;
        interfaces.push(body); // 親は子の後に push（子→親の順）
        return name;
      }
    }
  }

  const root = inferType(value);
  if (root.kind === 'object') {
    ref(root, rootName); // interfaces に root を最後に積む
    return interfaces.join('\n\n');
  }
  const rootExpr = ref(root, rootName);
  const decl = `type ${rootName} = ${rootExpr};`;
  return interfaces.length > 0 ? `${interfaces.join('\n\n')}\n\n${decl}` : decl;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/type-gen.test.ts`
Expected: PASS（11 tests）。失敗時は実装を修正（テストは変えない）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/json-formatter/type-gen.ts src/utils/json-formatter/__tests__/type-gen.test.ts
git commit -m "feat: JSON から TypeScript 型を生成する type-gen を追加（全要素マージ・自作エミッター）"
```

---

## Task 2: index.ts で re-export

**Files:** Modify `src/utils/json-formatter/index.ts`

- [ ] **Step 1: re-export を追加**

`src/utils/json-formatter/index.ts` の既存 `export * from './mask';` の隣に追加:

```ts
export * from './type-gen';
```

- [ ] **Step 2: 型チェック + 既存テスト**

Run: `node_modules/.bin/astro check && npx vitest run src/utils/json-formatter/`
Expected: 型 0 errors / 全 json-formatter 単体 PASS。

- [ ] **Step 3: Commit**

```bash
git add src/utils/json-formatter/index.ts
git commit -m "feat: generateTypeScript を json-formatter の公開 API に追加"
```

---

## Task 3: コンポーネントに「型」モードを追加

**Files:** Modify `src/components/tools/JsonFormatter.tsx`

UI はユニットテストせず Task 4 の E2E + 実機目視で検証する。現状ファイルは mask（`maskBaseValue`/`maskEval`/`effectiveOutput`）まで実装済み。

- [ ] **Step 1: import と View 型を更新**

- `@/utils/json-formatter` の import に `generateTypeScript` を追加（既存の `processJson, runQuery, maskValue, MASK_CATEGORIES, type IndentStyle, type TreeNode, type MaskCategory` の並びに加える）。
- `type View = 'text' | 'tree' | 'mask';` → `type View = 'text' | 'tree' | 'mask' | 'type';`

- [ ] **Step 2: 基準値を共有名にし、型生成 useMemo を追加**

現状の `const maskBaseValue = queryActive ? queryEval?.resultValue : meta.value;` を次に変更（mask と type で共有）:

```ts
// 表示対象の元値: クエリ有効なら抽出結果、無効なら入力全体（mask / type で共有）。
const baseValue = queryActive ? queryEval?.resultValue : meta.value;
```

`maskEval` 内の `maskBaseValue` 参照を `baseValue` に置換（`if (view !== 'mask' || baseValue === undefined) return null;` と `maskValue(baseValue, ...)`、deps 配列の `maskBaseValue` も `baseValue` に）。

`maskEval` の直後に型生成を追加:

```ts
const typeOutput = useMemo(() => {
  if (view !== 'type' || baseValue === undefined) return '';
  try {
    return generateTypeScript(baseValue);
  } catch {
    return '';
  }
}, [view, baseValue]);
```

- [ ] **Step 3: effectiveOutput と download を型モード対応に**

- `const effectiveOutput = view === 'mask' ? maskOutput : displayOutput;` を次に変更:

```ts
const effectiveOutput = view === 'type' ? typeOutput : view === 'mask' ? maskOutput : displayOutput;
```

- `handleDownload` を型モードで `types.ts` にする:

```ts
const handleDownload = () => {
  if (!effectiveOutput) return;
  if (view === 'type') {
    downloadText(effectiveOutput, 'types.ts', 'text/plain');
  } else {
    downloadText(effectiveOutput, 'data.json', 'application/json');
  }
};
```

- [ ] **Step 4: 表示トグルに「型」を追加**

表示 ToggleGroup の options に、mask の後へ追加:

```tsx
              { value: 'mask', label: 'マスク' },
              { value: 'type', label: '型' },
```

- [ ] **Step 5: 結果カラムに型モード描画を追加**

結果カラムのモード分岐は現状 `view === 'mask' ? (...) : view === 'text' ? (<OutputField/>) : (<tree>)`。`view === 'type'` を mask の後・text の前に追加する:

```tsx
          ) : view === 'type' ? (
            <OutputField
              id="json-formatter-type-output"
              label="結果（TypeScript）"
              value={effectiveOutput}
              rows={18}
              ariaLabel="生成された型"
              rightSlot={downloadButton}
            />
          ) : view === 'text' ? (
```

（既存の mask ブロック末尾 `</div>` と `) : view === 'text' ?` の間に挿入する。挿入後のチェーンは `mask ? ... : type ? <OutputField型> : text ? <OutputField> : <tree>` となる。）

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors。エラーが出たら修正してから commit。

- [ ] **Step 7: Commit**

```bash
git add src/components/tools/JsonFormatter.tsx
git commit -m "feat: json-formatter に TypeScript 型生成モードを追加"
```

---

## Task 4: E2E（型生成・CSP 無違反）

**Files:** Modify `tests/e2e/json-formatter.spec.ts`

- [ ] **Step 1: テストを追記**

`tests/e2e/json-formatter.spec.ts` の `test.describe` 内の末尾（最後の `});` の直前）に追加:

```ts
test('型生成: サンプルから TypeScript interface を生成する（CSP 違反なし）', async ({
  browser,
}) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await page.getByRole('button', { name: '型', exact: true }).click();

    const out = page.getByRole('textbox', { name: '生成された型' });
    await expect(out).toHaveValue(/interface Root \{/);
    await expect(out).toHaveValue(/name: string;/);
    await expect(out).toHaveValue(/open: boolean;/);
    // ネスト location が別 interface に切り出される
    await expect(out).toHaveValue(/interface Location \{/);
  });
});

test('型生成: クエリ抽出結果から型を生成する（CSP 違反なし）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
    await page.getByLabel('入力').fill('{"items":[{"id":1,"name":"A"}]}');
    await page.getByLabel('クエリ (JMESPath)').fill('items');
    await page.getByRole('button', { name: '型', exact: true }).click();
    const out = page.getByRole('textbox', { name: '生成された型' });
    await expect(out).toHaveValue(/type Root = RootItem\[\];/);
    await expect(out).toHaveValue(/id: number;/);
  });
});
```

- [ ] **Step 2: ビルド + E2E 実行**

Run: `npm run pretest:e2e && npx playwright test --project=e2e json-formatter`
Expected: 既存 12 + 新規 2 = 14 passed（CSP 違反なし）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/json-formatter.spec.ts
git commit -m "test(e2e): TypeScript 型生成モード（interface 生成・クエリ併用）を検証"
```

---

## Task 5: ドキュメント更新 + refactor issue

**Files:** Modify `README.md`, `SPEC.md`, `docs/decisions.md`

- [ ] **Step 1: README.md**

json-formatter 行の説明末尾（`機密データ（PII/シークレット）のマスク対応` の後）に追記: `。TypeScript 型生成対応`

- [ ] **Step 2: SPEC.md 4 章 row 20**

json-formatter 概要セル末尾（`PII/シークレットを検出してマスク` の後）に追記: `。TypeScript 型を生成`

- [ ] **Step 3: docs/decisions.md にエントリ追加**

ファイル末尾に追加:

```markdown
---

## [095] 2026-05-29 — json-formatter に TypeScript 型生成を追加（PR4）

**2026-05-29 | ステータス: 採用**

### 背景

json-formatter 段階リリースの最終段（クエリ・マスク・型生成の 3 軸の最後）。実 API レスポンスを貼って TypeScript 型を起こす機能を、ブラウザ内完結で提供する。

### 決断

- **エンジンは自作エミッター**（`src/utils/json-formatter/type-gen.ts`、依存ゼロ・CSP 影響なし・小バンドル）。`inferType` で全要素マージ推論（欠けキー→optional、型違い→union、空配列→`unknown[]`）、`generateTypeScript` でネスト object を別 interface に切り出して命名（PascalCase・衝突サフィックス・配列要素 +Item）。
- **スコープは TypeScript のみ**。Go struct / Zod は推論コアを再利用して後続で追加可能。
- 基準値はクエリ有効なら抽出結果、無ければ入力全体（mask と共有）。マスクは適用せず実構造から型を起こす。

### 却下した選択肢

- **`quicktype-core`**: 多言語対応だが unpacked 2.3 MB と重く、TS-only の v1 にはオーバーキル。
- **`json-to-ts`**: TS 専用だが 2017 年製で `es7-shim` 等 3 依存を持ち込み、将来 Zod に使い回せない。

### 結果・トレードオフ

- ✅ 依存ゼロ・CSP 安全・小バンドル。推論コアと emitter を分離し将来の Go/Zod 追加に再利用可能。
- ⚠️ 推論は構造ベースで、リテラル型・enum・日付等の意味推論は行わない。
- `JsonFormatter.tsx` が 4 モード（text/tree/mask/type）＋クエリで肥大化。モード切り出し refactor は別 issue に分離。
```

- [ ] **Step 4: format + commit**

```bash
npm run format
git add README.md SPEC.md docs/decisions.md
git commit -m "docs: json-formatter の TypeScript 型生成を README/SPEC/decisions に反映"
```

- [ ] **Step 5: refactor issue を起票**

`gh issue create` で「json-formatter: JsonFormatter.tsx のモード（text/tree/mask/type）切り出し refactor」を P2 + refactor で起票（4 モード＋クエリで肥大化、結果パネルを mode 別コンポーネントに分離する旨）。

---

## Task 6: 検証・PR・VRT

- [ ] **Step 1: 全体検証**

Run:

```bash
node_modules/.bin/astro check
npm run test 2>&1 | tail -5
npm run pretest:e2e && npx playwright test --project=e2e json-formatter
```

Expected: 型 0 errors / 単体集計行 all passed / E2E 14 passed。

- [ ] **Step 2: 実機目視（Playwright MCP）**

`npm run dev` 後、SW unregister + caches.delete + localStorage.clear → リロード。PC(1280x800)・スマホ(390x844) で「型」モード（生成 TS 表示・コピー/DL）を確認。push 前にユーザー承認を取る。

- [ ] **Step 3: PR 作成 → VRT baseline 再生成**

- `gh pr create --base develop --body-file <file>` で PR 作成。
- 「型」トグル追加で `/tools/json-formatter` のスクショが変わりうるため、VRT 結果を確認。fail した場合のみ **ユーザー承認後** に `Update Visual Regression Baseline` workflow を本ブランチで workflow_dispatch（PC+mobile）。bot コミットは後続 CI を起動しないため、必要なら close→reopen で head 上の CI を回す。

---

## Self-Review（記録）

- **Spec coverage**: 推論コア＋エミッター（Task1）/ 公開 API（Task2）/ 型モード UI・クエリ併用・DL（Task3）/ E2E（Task4）/ docs＋refactor issue（Task5）/ 検証・PR・VRT（Task6）。spec 全節を被覆。
- **Placeholder scan**: 各コードステップに実コードを記載。プレースホルダなし。
- **Type consistency**: `TypeNode`/`inferType`/`generateTypeScript`（type-gen.ts）、`baseValue`（mask と共有へ rename）/`typeOutput`/`effectiveOutput`（component）で一貫。E2E の `ariaLabel="生成された型"` は Task3 の OutputField と一致。
