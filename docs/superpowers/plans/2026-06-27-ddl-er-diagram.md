# DDL → ER図ジェネレータ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `CREATE TABLE` 文（MySQL/PostgreSQL）を貼り付けると ER 図を即描画し、Mermaid コード・SVG・PNG で出力するツール `ddl-er-diagram` を追加する。

**Architecture:** 純ロジック層（`src/utils/ddl-er-diagram.ts`: DDL→中間モデル→Mermaid 記法）と UI 層（`src/components/tools/DdlErDiagram.tsx`: 入力・mermaid 描画・出力）を分離。重い依存（`node-sql-parser` / `mermaid`）は dynamic import で当該ページに閉じ込める。

**Tech Stack:** node-sql-parser（DDL パース）, mermaid（ER 図描画）, React 19, Astro, Vitest, Playwright

---

## 重要な前提知識（node-sql-parser AST の癖）

実装前に必ず把握すること。検証済み（node-sql-parser 5.4.0）:

1. **カラム名の構造が引用方法で変わる**:
   - 非引用 / PostgreSQL: `def.column.column` が `{ expr: { type: 'default', value: 'id' } }`
   - MySQL バッククォート: `def.column.column` が文字列 `'id'`
   - → 両対応のヘルパ `columnName(ref)` が必須。
2. **テーブル名**: `ast[i].table[0].table` は常に文字列。
3. **constraint_type の大小文字が混在**: `'FOREIGN KEY'`（非引用）と `'primary key'`（引用）等 → `.toLowerCase()` で比較。
4. **PK の出方は 2 通り**:
   - 列定義に `primary_key: 'primary key'` フィールドが付く
   - テーブル制約 `{ resource: 'constraint', constraint_type: 'primary key', definition: [{column}] }`
5. **FK の出方は 2 通り**:
   - テーブル制約 `{ resource: 'constraint', constraint_type: 'FOREIGN KEY', definition: [col], reference_definition: { table, definition } }`
   - 列定義に `reference_definition: { table: [{table}], definition: [col] }` が付く
6. **構文エラー**: `parser.astify()` は throw する（`e.message` あり）。`parseDdl` 内で try/catch して `errors[]` に格納し throw しない。
7. **型表記の組み立て**: `def.definition.dataType`（例 `VARCHAR`）に `length`（例 255）が付くことがある → `VARCHAR(255)` のように整形。

---

## Task 1: 依存ライブラリの追加

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 依存を追加**

Run:

```bash
npm install node-sql-parser@5.4.0 mermaid@11.16.0 --cache "$TMPDIR/npm-cache" --no-audit --no-fund
```

Expected: `package.json` の `dependencies` に両者が入り、`package-lock.json` が更新される。

- [ ] **Step 2: lock 同期を確認**

Run: `git diff --name-only`
Expected: `package.json` と `package-lock.json` の両方が出る（片方だけなら lock 不整合）。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: node-sql-parser と mermaid を追加"
```

---

## Task 2: 純ロジック — 型定義と parseDdl（FK/PK/カラム抽出）

**Files:**

- Create: `src/utils/ddl-er-diagram.ts`
- Test: `src/utils/__tests__/ddl-er-diagram.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/ddl-er-diagram.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDdl } from '../ddl-er-diagram';

describe('parseDdl', () => {
  it('単一テーブルのカラム・型・NULL可否・PKを抽出する', async () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL, bio TEXT);';
    const { model, errors } = await parseDdl(sql, 'postgresql');
    expect(errors).toEqual([]);
    expect(model.tables).toHaveLength(1);
    const users = model.tables[0];
    expect(users.name).toBe('users');
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'name', 'bio']);
    const id = users.columns[0];
    expect(id.type).toBe('INT');
    expect(id.isPrimaryKey).toBe(true);
    expect(id.nullable).toBe(false);
    const name = users.columns[1];
    expect(name.type).toBe('VARCHAR(255)');
    expect(name.nullable).toBe(false);
    expect(users.columns[2].nullable).toBe(true); // bio は NOT NULL なし
  });

  it('テーブル制約のFOREIGN KEYからリレーションを抽出する', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE posts (id INT PRIMARY KEY, user_id INT NOT NULL,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    expect(model.relations).toEqual([
      { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
    const fk = model.tables[1].columns.find((c) => c.name === 'user_id');
    expect(fk?.isForeignKey).toBe(true);
  });

  it('列定義内のREFERENCESからリレーションを抽出する（MySQLバッククォート）', async () => {
    const sql =
      'CREATE TABLE `users` (`id` INT PRIMARY KEY);\n' +
      'CREATE TABLE `posts` (`id` INT, `user_id` INT REFERENCES `users`(`id`));';
    const { model } = await parseDdl(sql, 'mysql');
    expect(model.relations).toEqual([
      { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
  });

  it('テーブル制約のPRIMARY KEYを各カラムに反映する', async () => {
    const sql = 'CREATE TABLE t (id INT, code VARCHAR(10), PRIMARY KEY (id, code));';
    const { model } = await parseDdl(sql, 'mysql');
    const cols = model.tables[0].columns;
    expect(cols.find((c) => c.name === 'id')?.isPrimaryKey).toBe(true);
    expect(cols.find((c) => c.name === 'code')?.isPrimaryKey).toBe(true);
  });

  it('構文エラー時はthrowせずerrorsに格納する', async () => {
    const { model, errors } = await parseDdl('CREATE TABLE', 'mysql');
    expect(model.tables).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBeTruthy();
  });

  it('FK参照先が未定義テーブルの場合は警告を出し描画は継続する', async () => {
    const sql = 'CREATE TABLE posts (id INT, user_id INT REFERENCES users(id));';
    const { model, errors } = await parseDdl(sql, 'postgresql');
    expect(model.tables).toHaveLength(1);
    expect(errors.some((e) => /users/.test(e.message))).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- ddl-er-diagram`
Expected: FAIL（`parseDdl` 未定義）

- [ ] **Step 3: 最小実装を書く**

`src/utils/ddl-er-diagram.ts`:

```ts
export type Dialect = 'mysql' | 'postgresql';

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

export interface Relation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface SchemaModel {
  tables: Table[];
  relations: Relation[];
}

export interface ParseError {
  message: string;
  line?: number;
}

export interface ParseResult {
  model: SchemaModel;
  errors: ParseError[];
}

// node-sql-parser のカラム参照は引用方法で `{ expr: { value } }` か文字列に変わる
function refName(ref: unknown): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object') {
    const r = ref as { expr?: { value?: string }; value?: string };
    if (r.expr?.value) return r.expr.value;
    if (typeof r.value === 'string') return r.value;
  }
  return String(ref);
}

function columnName(colDef: { column?: unknown }): string {
  return refName((colDef.column as { column?: unknown })?.column);
}

function formatType(def: { dataType?: string; length?: number; scale?: number }): string {
  if (!def?.dataType) return '';
  let t = def.dataType;
  if (typeof def.length === 'number') {
    t += def.scale != null ? `(${def.length},${def.scale})` : `(${def.length})`;
  }
  return t;
}

const DB_MAP: Record<Dialect, string> = { mysql: 'mysql', postgresql: 'postgresql' };

export async function parseDdl(sql: string, dialect: Dialect): Promise<ParseResult> {
  const errors: ParseError[] = [];
  const trimmed = sql.trim();
  if (!trimmed) return { model: { tables: [], relations: [] }, errors };

  const { Parser } = await import('node-sql-parser');
  let astList: unknown[];
  try {
    const parser = new Parser();
    const ast = parser.astify(trimmed, { database: DB_MAP[dialect] });
    astList = Array.isArray(ast) ? ast : [ast];
  } catch (e) {
    const err = e as { message?: string; location?: { start?: { line?: number } } };
    errors.push({ message: err.message ?? '構文エラー', line: err.location?.start?.line });
    return { model: { tables: [], relations: [] }, errors };
  }

  const tables: Table[] = [];
  const relations: Relation[] = [];

  for (const stmt of astList) {
    const s = stmt as {
      type?: string;
      keyword?: string;
      table?: { table: string }[];
      create_definitions?: Record<string, unknown>[] | null;
    };
    if (s.type !== 'create' || s.keyword !== 'table') continue;
    const tableName = s.table?.[0]?.table ?? '';
    const columns: Column[] = [];
    const pkNames = new Set<string>();
    const defs = s.create_definitions ?? [];

    for (const d of defs) {
      if (d.resource === 'column') {
        const name = columnName(d as { column?: unknown });
        const def = (d.definition ?? {}) as { dataType?: string; length?: number; scale?: number };
        const nullable = !(d.nullable as { type?: string })?.type && !d.primary_key;
        const isPk = !!d.primary_key;
        const ref = d.reference_definition as
          | { table?: { table: string }[]; definition?: unknown[] }
          | undefined;
        const isFk = !!ref;
        if (isPk) pkNames.add(name);
        columns.push({
          name,
          type: formatType(def),
          nullable,
          isPrimaryKey: isPk,
          isForeignKey: isFk,
        });
        if (ref) {
          relations.push({
            fromTable: tableName,
            fromColumn: name,
            toTable: ref.table?.[0]?.table ?? '',
            toColumn: refName(ref.definition?.[0]),
          });
        }
      } else if (d.resource === 'constraint') {
        const ctype = String(d.constraint_type ?? '').toLowerCase();
        if (ctype === 'primary key') {
          for (const c of (d.definition as unknown[]) ?? []) pkNames.add(refName(c));
        } else if (ctype === 'foreign key') {
          const ref = d.reference_definition as
            | { table?: { table: string }[]; definition?: unknown[] }
            | undefined;
          const fromCol = refName((d.definition as unknown[])?.[0]);
          relations.push({
            fromTable: tableName,
            fromColumn: fromCol,
            toTable: ref?.table?.[0]?.table ?? '',
            toColumn: refName(ref?.definition?.[0]),
          });
        }
      }
    }

    // テーブル制約由来の PK・FK をカラムへ反映
    for (const col of columns) {
      if (pkNames.has(col.name)) col.isPrimaryKey = true;
      if (col.isPrimaryKey) col.nullable = false;
    }
    for (const rel of relations) {
      if (rel.fromTable === tableName) {
        const col = columns.find((c) => c.name === rel.fromColumn);
        if (col) col.isForeignKey = true;
      }
    }
    tables.push({ name: tableName, columns });
  }

  // FK 参照先が未定義テーブルなら警告（描画は継続）
  const tableNames = new Set(tables.map((t) => t.name));
  for (const rel of relations) {
    if (!tableNames.has(rel.toTable)) {
      errors.push({
        message: `リレーション ${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}(${rel.toColumn}) の参照先テーブル「${rel.toTable}」が入力に存在しません`,
      });
    }
  }

  return { model: { tables, relations }, errors };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- ddl-er-diagram`
Expected: PASS（6 件）

- [ ] **Step 5: 型チェック**

Run: `npx astro check --filter src/utils/ddl-er-diagram.ts`（不可なら `node_modules/.bin/astro check`）
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/utils/ddl-er-diagram.ts src/utils/__tests__/ddl-er-diagram.test.ts
git commit -m "feat: DDLをパースしてスキーマ中間モデルを生成するparseDdlを追加"
```

---

## Task 3: 純ロジック — toMermaid（中間モデル→Mermaid記法）

**Files:**

- Modify: `src/utils/ddl-er-diagram.ts`
- Modify: `src/utils/__tests__/ddl-er-diagram.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`src/utils/__tests__/ddl-er-diagram.test.ts` に追記:

```ts
import { parseDdl, toMermaid } from '../ddl-er-diagram';

describe('toMermaid', () => {
  it('erDiagramで始まりテーブル属性とリレーションを出力する', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL);
      CREATE TABLE posts (id INT PRIMARY KEY, user_id INT,
        CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    const out = toMermaid(model);
    expect(out.startsWith('erDiagram')).toBe(true);
    expect(out).toContain('users {');
    expect(out).toContain('posts {');
    // PK/FK マーカー
    expect(out).toMatch(/INT id PK/);
    expect(out).toMatch(/INT user_id FK/);
    // リレーション行（posts が users を参照）
    expect(out).toContain('posts }o--|| users : "user_id"');
  });

  it('型の括弧やスペースをMermaid属性名として安全な形に整形する', async () => {
    const sql = 'CREATE TABLE t (amount DECIMAL(10,2));';
    const { model } = await parseDdl(sql, 'postgresql');
    const out = toMermaid(model);
    // Mermaid 属性の型トークンに空白や ( ) を残さない（_ 等へ置換）
    expect(out).not.toMatch(/DECIMAL\(10,2\)/);
    expect(out).toContain('amount');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- ddl-er-diagram`
Expected: FAIL（`toMermaid` 未定義）

- [ ] **Step 3: toMermaid を実装**

`src/utils/ddl-er-diagram.ts` の末尾に追加:

```ts
// Mermaid の属性 type/name トークンは英数と _ のみ安全。括弧・空白・カンマを _ に畳む
function safeToken(s: string): string {
  return s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

export function toMermaid(model: SchemaModel): string {
  const lines: string[] = ['erDiagram'];
  for (const table of model.tables) {
    lines.push(`  ${safeToken(table.name)} {`);
    for (const col of table.columns) {
      const type = safeToken(col.type || 'unknown');
      const keys: string[] = [];
      if (col.isPrimaryKey) keys.push('PK');
      if (col.isForeignKey) keys.push('FK');
      const suffix = keys.length ? ` ${keys.join(',')}` : '';
      lines.push(`    ${type} ${safeToken(col.name)}${suffix}`);
    }
    lines.push('  }');
  }
  for (const rel of model.relations) {
    // 多側(FK) }o--|| 一側(PK) の非識別リレーションで描画
    lines.push(
      `  ${safeToken(rel.fromTable)} }o--|| ${safeToken(rel.toTable)} : "${rel.fromColumn}"`
    );
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- ddl-er-diagram`
Expected: PASS（全件）

- [ ] **Step 5: Commit**

```bash
git add src/utils/ddl-er-diagram.ts src/utils/__tests__/ddl-er-diagram.test.ts
git commit -m "feat: スキーマモデルからMermaid ER記法を生成するtoMermaidを追加"
```

---

## Task 4: UI コンポーネント DdlErDiagram

**Files:**

- Create: `src/components/tools/DdlErDiagram.tsx`

mermaid 描画は `useEffect` 内で dynamic import → `mermaid.initialize` → `mermaid.render` で SVG 文字列を得て state に格納。`dangerouslySetInnerHTML` で SVG を挿入する（mermaid 生成 SVG のため。外部入力をそのまま挿入しない＝SVG は mermaid が組み立てたもの）。

- [ ] **Step 1: コンポーネントを作成**

`src/components/tools/DdlErDiagram.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadButtonGroup } from '@/components/ui/DownloadButtonGroup';
import { ClearButton } from '@/components/ui/ClearButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { parseDdl, toMermaid, type Dialect } from '@/utils/ddl-er-diagram';

const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
];

const SAMPLE = `CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255)
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);`;

export function DdlErDiagramTool() {
  const [input, setInput] = useState('');
  const [dialect, setDialect] = useState<Dialect>('mysql');
  const [mermaidCode, setMermaidCode] = useState('');
  const [svg, setSvg] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const renderSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const seq = ++renderSeq.current;
    if (!input.trim()) {
      setMermaidCode('');
      setSvg('');
      setErrors([]);
      return;
    }
    (async () => {
      const { model, errors: parseErrors } = await parseDdl(input, dialect);
      if (cancelled || seq !== renderSeq.current) return;
      setErrors(parseErrors.map((e) => e.message));
      if (model.tables.length === 0) {
        setMermaidCode('');
        setSvg('');
        return;
      }
      const code = toMermaid(model);
      setMermaidCode(code);
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
        const { svg: rendered } = await mermaid.render(`erd-${seq}`, code);
        if (cancelled || seq !== renderSeq.current) return;
        setSvg(rendered);
      } catch (e) {
        if (cancelled || seq !== renderSeq.current) return;
        setSvg('');
        setErrors((prev) => [...prev, `ER図の描画に失敗しました: ${(e as Error).message}`]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input, dialect]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'er-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const purl = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = purl;
        a.download = 'er-diagram.png';
        a.click();
        URL.revokeObjectURL(purl);
      }, 'image/png');
    };
    img.src = url;
  };

  const clear = () => {
    setInput('');
    setMermaidCode('');
    setSvg('');
    setErrors([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <span className="body-emphasis text-default block mb-2">SQL 方言</span>
        <ToggleGroup
          options={DIALECT_OPTIONS}
          value={dialect}
          onChange={(v) => setDialect(v as Dialect)}
          ariaLabel="SQL 方言"
        />
      </div>

      <InputField
        id="ddl-input"
        label="CREATE TABLE 文"
        value={input}
        onChange={setInput}
        placeholder="CREATE TABLE users (id INT PRIMARY KEY, ...);"
        multiline
        rows={14}
        onSampleClick={() => setInput(SAMPLE)}
        mono
        resize
      />

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((msg, i) => (
            <ErrorMessage key={i} message={msg} variant="block" />
          ))}
        </div>
      )}

      {svg && (
        <div className="space-y-4">
          <div
            className="overflow-auto rounded border bg-white p-4"
            data-testid="er-diagram"
            // mermaid が生成した SVG を挿入（外部入力の生挿入ではない）
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <DownloadButtonGroup onDownloadSvg={downloadSvg} onDownloadPng={downloadPng} />
        </div>
      )}

      {mermaidCode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="body-emphasis text-default">Mermaid コード</span>
            <CopyButton text={mermaidCode} />
          </div>
          <pre
            className="overflow-auto rounded bg-subtle p-3 text-sm font-mono"
            data-testid="mermaid-code"
          >
            {mermaidCode}
          </pre>
        </div>
      )}

      <div className="flex justify-end">
        <ClearButton onClick={clear} />
      </div>
    </div>
  );
}
```

> **実装注**: `CopyButton` / `ClearButton` / `ErrorMessage` / `InputField` / `ToggleGroup` の props は既存利用箇所（`SqlFormatter.tsx` 等）に厳密に合わせること。`border` / `bg-white` 等の素の Tailwind は使用可だが、**色値直書き utility（`text-blue-500` 等）は禁止**。背景は意味クラス（`bg-subtle` 等）を優先。`bg-white` が既存に無ければ `@layer components` の意味クラスを使うか既存パターンに合わせる。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（props 不一致があればここで判明 → 既存コンポーネントのシグネチャに合わせて修正）

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/DdlErDiagram.tsx
git commit -m "feat: DDL→ER図ジェネレータのUIコンポーネントを追加"
```

---

## Task 5: Astro ページとツール登録

**Files:**

- Create: `src/pages/tools/ddl-er-diagram.astro`
- Modify: `src/data/tools.ts`

- [ ] **Step 1: ツールエントリを追加**

`src/data/tools.ts` の `toolEntries` 配列に追加:

```ts
  {
    slug: 'ddl-er-diagram',
    name: 'DDL → ER図ジェネレータ',
    description:
      'CREATE TABLE 文（MySQL / PostgreSQL）から ER 図を描画します。外部キーからリレーション線を自動生成し、Mermaid コード・SVG・PNG で出力。データはブラウザ外に送信しません',
    category: 'convert',
    yomi: 'でぃーでぃーえるいーあーるずせいせい',
  },
```

- [ ] **Step 2: ページを作成**

`src/pages/tools/ddl-er-diagram.astro`:

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { DdlErDiagramTool } from '@/components/tools/DdlErDiagram';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'ddl-er-diagram')!;
---

<ToolLayout tool={tool}>
  <DdlErDiagramTool client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      <code class="rounded px-1 font-mono bg-subtle text-sm">CREATE TABLE</code> 文（MySQL / PostgreSQL）を貼り付けると
      ER 図を即描画します。明示的な外部キー制約（<code
        class="rounded px-1 font-mono bg-subtle text-sm">FOREIGN KEY ... REFERENCES</code
      > および列定義内の <code class="rounded px-1 font-mono bg-subtle text-sm">REFERENCES</code
      >）からリレーション線を自動生成します。Mermaid 記法のコピー、ER 図の SVG / PNG
      ダウンロードに対応。すべてブラウザ内で処理され、スキーマは外部に送信されません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>本番スキーマの DDL を外部サービスに貼らずに ER 図を確認したい</li>
      <li>レビューやドキュメント用に Mermaid コード / 図を生成したい</li>
      <li>外部キーのリレーションを視覚的に把握したい</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">制限</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>
        対象は <code class="rounded px-1 font-mono bg-subtle text-sm">CREATE TABLE</code> 文内の制約のみ。<code
          class="rounded px-1 font-mono bg-subtle text-sm">ALTER TABLE</code
        > での外部キー追加には未対応
      </li>
      <li>命名規則からの関係推測は行いません（明示的な外部キーのみ）</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 3: 型チェック・ビルド**

Run: `node_modules/.bin/astro check && npm run build`
Expected: エラーなし。`dist` にページが生成される。

- [ ] **Step 4: Commit**

```bash
git add src/data/tools.ts src/pages/tools/ddl-er-diagram.astro
git commit -m "feat: DDL→ER図ジェネレータのページとツール登録を追加"
```

---

## Task 6: E2E テストと VRT 登録

**Files:**

- Create: `tests/e2e/ddl-er-diagram.spec.ts`
- Modify: `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: VRT ページ配列に追加**

`tests/e2e/visual-regression-pages.ts` の `PAGES` 配列に `/tools/ddl-er-diagram` を追加（既存の並びに合わせる）。

- [ ] **Step 2: E2E テストを作成**

`tests/e2e/ddl-er-diagram.spec.ts`（既存 spec のヘルパ・パターンに合わせて記述）:

```ts
import { test, expect } from '@playwright/test';

test.describe('DDL → ER図ジェネレータ', () => {
  test('サンプルを入力するとER図とMermaidコードが生成される', async ({ page }) => {
    await page.goto('/tools/ddl-er-diagram');
    await page.getByRole('button', { name: 'サンプル' }).click();
    // ER 図（SVG）が描画される
    await expect(page.getByTestId('er-diagram').locator('svg')).toBeVisible();
    // Mermaid コードが表示される
    await expect(page.getByTestId('mermaid-code')).toContainText('erDiagram');
    // コピー・ダウンロードボタンが存在
    await expect(page.getByRole('button', { name: 'SVGダウンロード' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PNGダウンロード' })).toBeVisible();
  });

  test('構文エラーのSQLでエラーが表示される', async ({ page }) => {
    await page.goto('/tools/ddl-er-diagram');
    await page.getByLabel('CREATE TABLE 文').fill('CREATE TABLE');
    await expect(page.getByRole('alert').first()).toBeVisible();
  });
});
```

> **実装注**: サンプルボタンの aria 名・`getByLabel` のラベル文字列は実際のレンダリング結果に合わせて修正すること（`InputField` の `onSampleClick` ボタン名を確認）。

- [ ] **Step 3: ユニット・型・E2E を実行**

Run:

```bash
npm run test && node_modules/.bin/astro check && npm run test:e2e -- ddl-er-diagram
```

Expected: ユニット・型 PASS。E2E はサンプル描画・エラー表示が PASS（VRT baseline 未生成分は CI で対応）。

- [ ] **Step 4: meta テスト（VRT カバレッジ）確認**

Run: `npm run test -- vrt-pages-coverage`
Expected: PASS（`/tools/ddl-er-diagram` が PAGES に登録済みのため）

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ddl-er-diagram.spec.ts tests/e2e/visual-regression-pages.ts
git commit -m "test: DDL→ER図ジェネレータのE2EとVRT登録を追加"
```

---

## Task 7: ドキュメント更新

**Files:**

- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `docs/tools.md`
- Modify: `docs/decisions.md`
- Modify: `docs/tool-candidates.md`

- [ ] **Step 1: 各ドキュメントを更新**

- `README.md`: ツール一覧に「DDL → ER図ジェネレータ」を追加（既存の記載形式に合わせる）。
- `SPEC.md`: 2.3 節にライブラリ `node-sql-parser` / `mermaid` を追加、2.4・4・5 章のツール一覧、9 章チェックリストを更新。
- `docs/tools.md`: 仕組み（node-sql-parser で CREATE TABLE をパース→中間モデル→Mermaid→mermaid 描画）・準拠（明示 FK のみ）・制限（ALTER 非対応）を記載。
- `docs/decisions.md`: 採用理由（DDL は社外秘ゆえブラウザ完結／描画は mermaid に委譲、パースは node-sql-parser／初版は明示 FK のみ・ALTER 非対応のスコープ判断）を新規エントリで記載。
- `docs/tool-candidates.md`: B2-1 行の状態列はマージ時に ✅ + PR 番号を記載するため、ここでは触れない（マージ後に親が更新）。

- [ ] **Step 2: 整形チェック**

Run: `npm run format && npm run format:check`
Expected: 差分が整形済み。

- [ ] **Step 3: Commit**

```bash
git add README.md SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: DDL→ER図ジェネレータの追加に伴うドキュメントを更新"
```

---

## 完了条件（最終検証）

- [ ] `npm run test`（ユニット）PASS
- [ ] `node_modules/.bin/astro check`（型）PASS
- [ ] `npm run build` 成功
- [ ] `npm run test:e2e -- ddl-er-diagram` の機能テスト PASS（VRT baseline は CI で生成）
- [ ] `npm run lint` / `npm run format:check` PASS
- [ ] PC（1280x800）・スマホ（390x844）で目視確認（ER 図のはみ出し・横スクロール・ボタン重なりがないか）

```

```
