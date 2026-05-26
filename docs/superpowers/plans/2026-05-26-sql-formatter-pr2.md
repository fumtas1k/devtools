# SQLパラメータ埋め込み（PR2）実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の SQL整形ツール（`/tools/sql-formatter`）に「パラメータ埋め込み」タブを追加し、プレースホルダ付き SQL（`?` / `$n` / `:name`）と JSON パラメータを合体させてデバッグ用の完全な SQL を組み立てられるようにする。

**Architecture:** 埋め込みロジックを `src/utils/sql/embedParams.ts` に純粋関数として隔離する。文字列リテラル・コメント・識別子クォートを読み飛ばす軽量スキャナでプレースホルダを検出し（誤検出防止）、方言依存の値レンダリングで置換、失敗時は日本語 `Error` を throw。`SqlFormatter.tsx` に `ToggleGroup`（整形／埋め込み）を追加し、埋め込みタブは「実行禁止・デバッグ用」警告バナーを常設する。出力は `formatSql(embedParams(...))` でチェーンする。

**Tech Stack:** Astro 6 + React 19 + TypeScript / `sql-formatter@15.8.0`（PR1 で導入済み）/ Vitest / Playwright

**設計の正本:** `docs/superpowers/specs/2026-05-26-sql-formatter-design.md`（PR2 は 7・8 章＋9 章「PR2」に対応）

**前提:** PR1（整形タブ）は merge 済み。本ブランチ `feat/sql-formatter-embed` は `origin/develop`（PR1 を含む）起点。

---

### Task 1: 埋め込みロジック `embedParams` を TDD で実装

検知機構（スキャナ＋バリデータ群）のため **test-gates の陽性対照を必須** とする。陰性対照（正常系）と陽性対照（違反検知）を別 test に分け、「単純 regex 実装に当てると fail する」スキャナ陽性対照を含める。

**Files:**

- Create: `src/utils/sql/embedParams.ts`
- Modify: `src/utils/sql/index.ts`（barrel に re-export 追加）
- Test: `src/utils/sql/__tests__/embedParams.test.ts`

- [ ] **Step 1: 失敗するテストを書く（陰性対照 + 陽性対照を分離）**

`src/utils/sql/__tests__/embedParams.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { embedParams } from '../embedParams';

describe('embedParams（正常系 / 陰性対照）', () => {
  it('? を出現順に配列値で置換する', () => {
    expect(embedParams('SELECT * FROM t WHERE a = ? AND b = ?', '[1, "x"]', 'mysql')).toBe(
      "SELECT * FROM t WHERE a = 1 AND b = 'x'"
    );
  });

  it('$n を番号で参照し、同番号の再利用もできる', () => {
    expect(embedParams('WHERE id = $1 OR ref = $1 OR p = $2', '[5, 9]', 'postgresql')).toBe(
      'WHERE id = 5 OR ref = 5 OR p = 9'
    );
  });

  it(':name をキーで参照する', () => {
    expect(embedParams('WHERE id = :id AND name = :name', '{"id": 1, "name": "x"}', 'mysql')).toBe(
      "WHERE id = 1 AND name = 'x'"
    );
  });

  it('文字列はシングルクォートで囲み内部の単一引用符を二重化する', () => {
    expect(embedParams('WHERE name = :n', '{"n": "O\'Brien"}', 'mysql')).toBe(
      "WHERE name = 'O''Brien'"
    );
  });

  it('null は NULL に、数値はそのまま埋め込む', () => {
    expect(embedParams('WHERE a = ? AND b = ?', '[null, 42]', 'mysql')).toBe(
      'WHERE a = NULL AND b = 42'
    );
  });

  it('真偽値は方言依存（PostgreSQL は TRUE/FALSE、他は 1/0）', () => {
    expect(embedParams('WHERE active = ?', '[true]', 'postgresql')).toBe('WHERE active = TRUE');
    expect(embedParams('WHERE active = ?', '[true]', 'mysql')).toBe('WHERE active = 1');
    expect(embedParams('WHERE active = ?', '[false]', 'sqlite')).toBe('WHERE active = 0');
  });

  it('プレースホルダが無ければ SQL をそのまま返す', () => {
    expect(embedParams('SELECT 1', '[]', 'mysql')).toBe('SELECT 1');
  });
});

describe('embedParams（検知 / 陽性対照）', () => {
  // スキャナ陽性対照: 文字列リテラル内の ? は置換されない。
  // 単純 regex 実装ならこの ? も置換し、プレースホルダ 2 個と誤認 → 件数不一致 error になり fail する。
  it('文字列リテラル内の ? を置換せず、外側の ? のみ置換する', () => {
    expect(embedParams("WHERE note = 'why?' AND id = ?", '[7]', 'mysql')).toBe(
      "WHERE note = 'why?' AND id = 7"
    );
  });

  it('行コメント内の ? を置換しない', () => {
    expect(embedParams('-- ignore ?\nWHERE id = ?', '[7]', 'mysql')).toBe(
      '-- ignore ?\nWHERE id = 7'
    );
  });

  it('文字列リテラル内の $1 を置換せず、外側の $1 のみ置換する', () => {
    expect(embedParams("WHERE s = '$1' AND id = $1", '[7]', 'mysql')).toBe(
      "WHERE s = '$1' AND id = 7"
    );
  });

  it(':: キャスト演算子を名前付きプレースホルダと誤認しない', () => {
    // PostgreSQL の id::text は置換対象でない。: で始まる本物の :v のみ置換。
    expect(embedParams('SELECT id::text WHERE v = :v', '{"v": 1}', 'postgresql')).toBe(
      'SELECT id::text WHERE v = 1'
    );
  });

  it('記法混在はエラー', () => {
    expect(() => embedParams('WHERE a = ? AND b = :name', '[1]', 'mysql')).toThrow('混在');
  });

  it('? の件数とパラメータ数の不一致はエラー', () => {
    expect(() => embedParams('WHERE a = ?', '[1, 2]', 'mysql')).toThrow(
      'プレースホルダ 1 個に対しパラメータ 2 個'
    );
  });

  it('パラメータが JSON として不正ならエラー', () => {
    expect(() => embedParams('WHERE a = ?', 'not json', 'mysql')).toThrow('JSON');
  });

  it('配列・オブジェクトの値は埋め込めない', () => {
    expect(() => embedParams('WHERE a = ?', '[[1, 2]]', 'mysql')).toThrow('配列・オブジェクト');
  });

  it('名前付きキーの欠落はキー名付きでエラー', () => {
    expect(() => embedParams('WHERE id = :id', '{"name": 1}', 'mysql')).toThrow(':id');
  });

  it('番号指定の範囲外参照はエラー', () => {
    expect(() => embedParams('WHERE id = $3', '[1]', 'mysql')).toThrow('範囲外');
  });

  it('? 記法にオブジェクトを渡すとエラー', () => {
    expect(() => embedParams('WHERE a = ?', '{"a": 1}', 'mysql')).toThrow('配列');
  });

  it(':name 記法に配列を渡すとエラー', () => {
    expect(() => embedParams('WHERE a = :a', '[1]', 'mysql')).toThrow('オブジェクト');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/utils/sql/__tests__/embedParams.test.ts`
Expected: FAIL（`embedParams` 未定義 / モジュール解決エラー）

- [ ] **Step 3: 実装を書く**

`src/utils/sql/embedParams.ts`:

```ts
import { type SqlDialect } from './format';

type ParamStyle = 'positional' | 'numbered' | 'named';

interface Placeholder {
  style: ParamStyle;
  start: number; // sql 内の開始 index
  end: number; // 終了 index（排他）
  index?: number; // numbered: 1 始まりの番号
  name?: string; // named: キー名
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;

/**
 * SQL を走査し、文字列リテラル（'...'）・識別子クォート（"..." / `...`）・
 * コメント（-- 行 / 区間）を読み飛ばした「外側」のプレースホルダのみ収集する。
 * これにより 'why?' の ? を誤検出しない。
 * 制約: PostgreSQL の dollar-quoted string（$tag$...$tag$）は未対応（$ + 数字のみ番号指定として扱う）。
 */
function scanPlaceholders(sql: string): Placeholder[] {
  const result: Placeholder[] = [];
  const n = sql.length;
  let i = 0;
  // クォート系（' " `）を終端までスキップ。同記号 2 連はエスケープ扱い。
  const skipQuoted = (quote: string): void => {
    i++; // 開きクォートを消費
    while (i < n) {
      if (sql[i] === quote) {
        if (sql[i + 1] === quote) {
          i += 2; // エスケープ（'' / "" / ``）
          continue;
        }
        i++; // 閉じクォート
        return;
      }
      i++;
    }
  };

  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2; // 閉じ */ を消費（未終端でも i は末尾超で while を抜ける）
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      skipQuoted(c);
      continue;
    }
    if (c === '?') {
      result.push({ style: 'positional', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '$' && /[0-9]/.test(sql[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(sql[j])) j++;
      result.push({ style: 'numbered', start: i, end: j, index: Number(sql.slice(i + 1, j)) });
      i = j;
      continue;
    }
    if (c === ':') {
      if (sql[i + 1] === ':') {
        i += 2; // PostgreSQL の :: キャスト演算子
        continue;
      }
      if (i + 1 < n && IDENT_START.test(sql[i + 1])) {
        let j = i + 1;
        while (j < n && IDENT_CHAR.test(sql[j])) j++;
        result.push({ style: 'named', start: i, end: j, name: sql.slice(i + 1, j) });
        i = j;
        continue;
      }
    }
    i++;
  }
  return result;
}

/** JSON 値を方言に応じた SQL リテラルへ変換する。配列・オブジェクトは非対応。 */
function renderValue(value: unknown, dialect: SqlDialect): string {
  if (value === null) return 'NULL';
  switch (typeof value) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'number':
      return String(value);
    case 'boolean':
      return dialect === 'postgresql' ? (value ? 'TRUE' : 'FALSE') : value ? '1' : '0';
    default:
      throw new Error('配列・オブジェクトの値は埋め込めません');
  }
}

/**
 * プレースホルダ付き SQL に JSON パラメータを埋め込む（整形は行わない）。
 * 失敗時は日本語メッセージの Error を throw する。
 */
export function embedParams(sql: string, paramsJson: string, dialect: SqlDialect): string {
  const placeholders = scanPlaceholders(sql);
  if (placeholders.length === 0) return sql;

  const styles = new Set(placeholders.map((p) => p.style));
  if (styles.size > 1) {
    throw new Error(
      'プレースホルダの記法が混在しています（? / $n / :name のいずれかに統一してください）'
    );
  }
  const style = placeholders[0].style;

  let parsed: unknown;
  try {
    parsed = JSON.parse(paramsJson);
  } catch {
    throw new Error('パラメータが JSON として解釈できません');
  }

  // source 順に描画値を計算
  const rendered: string[] = [];
  if (style === 'positional') {
    if (!Array.isArray(parsed)) throw new Error('? 記法のパラメータは JSON 配列で指定してください');
    if (parsed.length !== placeholders.length) {
      throw new Error(
        `プレースホルダ ${placeholders.length} 個に対しパラメータ ${parsed.length} 個です`
      );
    }
    placeholders.forEach((_, idx) => rendered.push(renderValue(parsed[idx], dialect)));
  } else if (style === 'numbered') {
    if (!Array.isArray(parsed))
      throw new Error('$n 記法のパラメータは JSON 配列で指定してください');
    placeholders.forEach((ph) => {
      const num = ph.index as number;
      if (num < 1 || num > parsed.length) {
        throw new Error(`$${num} はパラメータ配列の範囲外です（配列長 ${parsed.length}）`);
      }
      rendered.push(renderValue(parsed[num - 1], dialect));
    });
  } else {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(':name 記法のパラメータは JSON オブジェクトで指定してください');
    }
    const obj = parsed as Record<string, unknown>;
    placeholders.forEach((ph) => {
      const key = ph.name as string;
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        throw new Error(`パラメータに :${key} がありません`);
      }
      rendered.push(renderValue(obj[key], dialect));
    });
  }

  // 末尾から置換して index ずれを回避
  let out = sql;
  for (let k = placeholders.length - 1; k >= 0; k--) {
    out = out.slice(0, placeholders[k].start) + rendered[k] + out.slice(placeholders[k].end);
  }
  return out;
}
```

`src/utils/sql/index.ts` に追記（既存の `formatSql` export を残したまま 1 行追加）:

```ts
export { embedParams } from './embedParams';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/utils/sql/__tests__/embedParams.test.ts`
Expected: PASS（陰性 7 + 陽性 11 = 18 件程度）

- [ ] **Step 5: スキャナ陽性対照が「単純 regex 実装」に対して fail することを確認（test-gates 鉄則 1）**

一時的に `scanPlaceholders` を「文字列/コメントを読み飛ばさない単純 regex」（例: `/\?|\$\d+|:[A-Za-z_]\w*/g` での全マッチ）に差し替えると、`文字列リテラル内の ? を置換せず…` テストが **件数不一致 or 出力不一致で fail** することをローカルで一度確認する。確認後、正しいスキャナ実装に戻す（この差し替えはコミットしない）。
Run（差し替え状態で）: `npx vitest run src/utils/sql/__tests__/embedParams.test.ts`
Expected: 文字列/コメント系の陽性対照が FAIL すること（＝検知能力の証明）。確認後 revert。

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/utils/sql/embedParams.ts src/utils/sql/index.ts src/utils/sql/__tests__/embedParams.test.ts
git commit -m "feat: SQLパラメータ埋め込みロジック embedParams を追加"
```

---

### Task 2: `SqlFormatter` にタブと埋め込みタブを追加

**Files:**

- Modify: `src/components/tools/SqlFormatter.tsx`（全面的に書き直し。下記で全文を置換）

現状のコンポーネントは整形タブのみ。`ToggleGroup` で「整形」「パラメータ埋め込み」を切り替え、方言セレクタは共通、埋め込みタブには警告バナーと 2 入力（SQL / パラメータ）を置く。

参照する既存 API:

- `ToggleGroup`: `options:{value,label}[]`, `value`, `onChange:(v)=>void`, `ariaLabel`（`src/components/tools/JsonXml.tsx` に使用例）
- `ErrorMessage`: `message`, `variant?: 'inline'|'block'`（`role="alert"` を内包）
- 警告バナーは既存 semantic を組み合わせる（`ErrorMessage` の error block と同パターン）: `border border-warning bg-warning-tint rounded-lg p-4` + `caption text-warning`。`border-warning` は `@theme` の `--color-warning` 由来 auto-utility、`bg-warning-tint`/`text-warning` は `global.css @layer components` 定義済み。新規 CSS は追加しない。
- `useCodec(transform, deps)` を 2 つ使う（整形タブ用・埋め込みタブ用）。埋め込みタブの「パラメータ」入力は別 `useState` で持ち、transform の deps に渡す。

- [ ] **Step 1: コンポーネントを全文置換**

`src/components/tools/SqlFormatter.tsx`:

```tsx
import { useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Select } from '@/components/ui/Select';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { formatSql, embedParams, type SqlDialect } from '@/utils/sql';
import { useCodec } from '@/hooks/useCodec';

type Mode = 'format' | 'embed';

const DIALECT_OPTIONS: { value: SqlDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'sqlserver', label: 'SQL Server' },
];

const FORMAT_SAMPLE =
  "select u.id, u.name, u.email from users u join orders o on o.user_id = u.id where u.status = 'active' and o.created_at > '2024-01-01' order by o.created_at desc limit 10";
const EMBED_SQL_SAMPLE = 'SELECT * FROM users WHERE id = ? AND status = ?';
const EMBED_PARAMS_SAMPLE = '[123, "active"]';

export function SqlFormatterTool() {
  const [mode, setMode] = useState<Mode>('format');
  const [dialect, setDialect] = useState<SqlDialect>('mysql');

  // 整形タブ
  const format = useCodec((text) => formatSql(text, dialect), [dialect]);

  // 埋め込みタブ（SQL は useCodec が、パラメータは別 state が保持）
  const [params, setParams] = useState('');
  const embed = useCodec(
    (sql) => formatSql(embedParams(sql, params, dialect), dialect),
    [params, dialect]
  );

  const handleEmbedClear = () => {
    embed.reset();
    setParams('');
  };

  return (
    <div className="space-y-6">
      <ToggleGroup
        options={[
          { value: 'format', label: '整形' },
          { value: 'embed', label: 'パラメータ埋め込み' },
        ]}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        ariaLabel="モード"
      />

      {/* 方言セレクタ（両タブ共通） */}
      <div className="max-w-xs">
        <label htmlFor="sql-dialect" className="body-emphasis text-default block mb-2">
          SQL 方言
        </label>
        <Select id="sql-dialect" options={DIALECT_OPTIONS} value={dialect} onChange={setDialect} />
      </div>

      {mode === 'format' ? (
        <>
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:flex-1 min-w-0">
              <InputField
                id="sql-input"
                label="SQL 入力"
                value={format.input}
                onChange={format.setInput}
                placeholder="SELECT * FROM users WHERE id = 1"
                multiline
                rows={16}
                error={format.error || undefined}
                onSampleClick={() => format.setInput(FORMAT_SAMPLE)}
                mono
                resize
              />
            </div>
            <div className="w-full md:flex-1 min-w-0">
              <OutputField
                id="sql-output"
                label="整形結果"
                value={format.output}
                rows={16}
                ariaLabel="整形結果"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <ClearButton onClick={format.reset} />
          </div>
        </>
      ) : (
        <>
          <div role="note" className="border border-warning bg-warning-tint rounded-lg p-4">
            <p className="caption text-warning">
              ⚠️ この出力はデバッグで内容を確認するための表示用です。文字列連結による値の埋め込みは
              SQL インジェクションの形そのものであり、生成された SQL をそのまま DB
              で実行しないでください。
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:flex-1 min-w-0 space-y-4">
              <InputField
                id="embed-sql-input"
                label="プレースホルダ付き SQL"
                value={embed.input}
                onChange={embed.setInput}
                placeholder="SELECT * FROM users WHERE id = ?"
                multiline
                rows={8}
                onSampleClick={() => {
                  embed.setInput(EMBED_SQL_SAMPLE);
                  setParams(EMBED_PARAMS_SAMPLE);
                }}
                mono
                resize
              />
              <InputField
                id="embed-params-input"
                label="パラメータ（JSON）"
                value={params}
                onChange={setParams}
                placeholder={'[123, "active"]'}
                multiline
                rows={6}
                mono
                resize
              />
              {embed.error && <ErrorMessage message={embed.error} variant="block" />}
            </div>
            <div className="w-full md:flex-1 min-w-0">
              <OutputField
                id="embed-output"
                label="埋め込み結果"
                value={embed.output}
                rows={16}
                ariaLabel="埋め込み結果"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <ClearButton onClick={handleEmbedClear} />
          </div>
        </>
      )}
    </div>
  );
}
```

設計メモ（実装者向け）:

- 整形タブと埋め込みタブは独立した state を持つ（`useCodec` 2 つ＋`params`）。モード切替時に state をリセットしない（行き来しても入力が保持される方が便利なため意図的）。
- 埋め込みのエラーは SQL／パラメータどちらにも起因しうるため、特定フィールドに紐付けず入力列の下に `ErrorMessage`（block）で表示する。
- 色は primitive scale を使わない（`border-warning`/`bg-warning-tint`/`text-warning`/`body-emphasis`/`text-default` のみ）。レイアウトクラス（`flex`/`gap`/`space-y`/`max-w-xs` 等）は可。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（`ToggleGroup`/`ErrorMessage`/`embedParams` の import と props が一致）。型エラーが出たら該当コンポーネントの実ファイルを読み props を合わせる（共通コンポーネント自体は変更しない）。

- [ ] **Step 3: build 後に警告バナーの CSS が生成されているか確認（CLAUDE.md 7.1）**

Run: `npm run build`
Expected: 成功。`border-warning` は auto-utility のため生成される。`bg-warning-tint` / `text-warning` は `@layer components` 定義済みで variant prefix を使っていない（`hover:` 等を付けていない）ため silent regression の懸念なし。

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/SqlFormatter.tsx
git commit -m "feat: SQL整形ツールにパラメータ埋め込みタブを追加"
```

---

### Task 3: E2E テストを追加（埋め込みフロー + 方言差分の陽性確認）

**Files:**

- Modify: `tests/e2e/sql-formatter.spec.ts`（既存の整形タブ test はそのまま残し、埋め込み用 describe を追記）

PR1 の整形タブ test（default mode）は ToggleGroup 追加後もそのまま通る（`getByLabel('SQL 入力')` 等は整形タブに存在）。本タスクは埋め込みタブの describe を追記する。ロケータは `getByRole`/`getByLabel` のみ。タブ切替は「パラメータ埋め込み」ボタンを click。

PR1 レビューで PR2 送りにした「方言差分を実際に検証する」指摘にここで対応する（真偽値 `?` の MySQL=1 / PostgreSQL=TRUE 差分を assert）。

- [ ] **Step 1: 埋め込み E2E を追記**

`tests/e2e/sql-formatter.spec.ts` の末尾（既存 `test.describe('SQL整形（production CSP 適用）', ...)` の後）に追加:

```ts
test.describe('SQLパラメータ埋め込み（production CSP 適用）', () => {
  test('? 位置指定パラメータを埋め込める（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('SELECT * FROM users WHERE id = ?');
      await page.getByLabel('パラメータ（JSON）').fill('[123]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/123/);
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/SELECT/);
    });
  });

  test('文字列値はクォートしエスケープして埋め込む（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('WHERE name = ?');
      await page.getByLabel('パラメータ（JSON）').fill('["O\'Brien"]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/'O''Brien'/);
    });
  });

  test('真偽値は方言で表現が変わる（MySQL=1 / PostgreSQL=TRUE）（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('WHERE active = ?');
      await page.getByLabel('パラメータ（JSON）').fill('[true]');
      // 既定 MySQL → 1
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/=\s*1/);
      // PostgreSQL に切替 → TRUE
      await page.getByLabel('SQL 方言').selectOption('postgresql');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/TRUE/);
    });
  });

  test('文字列リテラル内の ? は埋め込み対象にならない（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill("WHERE note = 'why?' AND id = ?");
      await page.getByLabel('パラメータ（JSON）').fill('[7]');
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/'why\?'/);
      await expect(page.getByLabel('埋め込み結果')).toHaveValue(/=\s*7/);
    });
  });

  test('件数不一致でエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'パラメータ埋め込み' }).click();
      await page.getByLabel('プレースホルダ付き SQL').fill('WHERE a = ?');
      await page.getByLabel('パラメータ（JSON）').fill('[1, 2]');
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
});
```

- [ ] **Step 2: stale port を kill してから E2E を実行**

ローカルで 4321 に stale サーバが残ると production CSP 偽陽性で全 fail するため、先にポートを解放する。

Run: `npm run pretest:vrt`
Run: `npm run build`
Run: `npm run test:e2e -- sql-formatter.spec.ts`
Expected: 整形タブ（5 件）＋ 埋め込み（5 件）の全件 PASS。

もし全件が `CSP 違反` で fail する場合は 4321 の stale サーバが原因。`lsof -nP -iTCP:4321 -sTCP:LISTEN` で確認し、`npm run pretest:vrt` で kill してから再実行する（直接 `lsof | xargs kill` は sandbox で拒否される）。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/sql-formatter.spec.ts
git commit -m "test: SQLパラメータ埋め込みの E2E テストを追加"
```

---

### Task 4: ドキュメント更新（改名・機能追記）

**Files:**

- Modify: `src/data/tools.ts`（name / description）
- Modify: `README.md`
- Modify: `SPEC.md`（4 章テーブル名 / 5.15 節）
- Modify: `docs/decisions.md`（[087] に埋め込み実装の追記）

PR1 で「SQL整形」だったツールを、埋め込み機能追加に伴い「SQL整形・パラメータ埋め込み」へ改名する。slug（`sql-formatter`）と yomi（`えすきゅーえるせいけい`）は変更しない。

- [ ] **Step 1: `src/data/tools.ts` の name / description を更新**

該当エントリ（slug `sql-formatter`）を次のように変更（編集前に周辺を読むこと）:

```ts
  {
    slug: 'sql-formatter',
    name: 'SQL整形・パラメータ埋め込み',
    description:
      '汚いSQLを方言別に整形し、プレースホルダ（? / $n / :name）にJSONパラメータを埋め込みます。MySQL / PostgreSQL / SQLite / SQL Server 対応',
    category: 'convert',
    yomi: 'えすきゅーえるせいけい',
  },
```

- [ ] **Step 2: `README.md` のツール一覧行を更新**

`SQL整形` 行の名称を `SQL整形・パラメータ埋め込み` に、説明を「汚いSQLを方言別に整形し、プレースホルダにパラメータを埋め込み（デバッグ用）」へ更新（周辺行のフォーマットに合わせる）。

- [ ] **Step 3: `SPEC.md` を更新**

- 4 章のツールテーブル: `SQL整形` → `SQL整形・パラメータ埋め込み`、説明に埋め込み機能を追記。
- 5.15 節: 見出しを `SQL整形・パラメータ埋め込み（\`sql-formatter\`）` に変更し、「整形」に加えて「パラメータ埋め込み」タブの仕様（`?`/`$n`/`:name`、JSON パラメータ、文字列/コメント除外スキャナ、方言依存の値レンダリング、実行禁止の警告バナー、失敗時の日本語エラー）を追記。

- [ ] **Step 4: `docs/decisions.md` [087] に追記**

[087] の末尾（または「結果・トレードオフ」の後）に、PR2 で埋め込み機能を実装した旨を 2〜3 行で追記:

- プレースホルダ検出は単純 regex でなく、文字列リテラル・コメント・識別子クォートを読み飛ばす軽量スキャナを採用（`'why?'` の `?` 誤検出防止）。
- 値の埋め込みは方言依存（真偽値: PostgreSQL `TRUE/FALSE` / 他 `1/0`、文字列: `'` を `''` にエスケープ）。出力は「デバッグ表示用・実行禁止」を UI 警告バナーで明示。
- 既知の制約: PostgreSQL の dollar-quoted string（`$tag$...$tag$`）はスキャナ未対応。

- [ ] **Step 5: フォーマット・型チェック・全テスト**

Run: `npm run format`
Run: `node_modules/.bin/astro check`
Run: `npm run test`
Expected: 整形差分が解消、型エラーなし、全テスト PASS（集計行 `Test Files ... passed` / `Tests ... passed` を確認）。

- [ ] **Step 6: コミット**

```bash
git add src/data/tools.ts README.md SPEC.md docs/decisions.md
git commit -m "docs: SQLツールを整形・パラメータ埋め込みに改名し機能を追記"
```

---

## push 前の最終確認（親が実行）

- [ ] `npm run test`（集計行で全 PASS を確認）
- [ ] `node_modules/.bin/astro check`（型）
- [ ] `npm run pretest:vrt` → `npm run build` → `npm run test:e2e -- sql-formatter.spec.ts`（E2E ローカル全 PASS）
- [ ] `git log --oneline origin/develop..HEAD` をユーザーに見せて push 承認を得る

## PR 作成 / VRT

- ベースブランチは `develop`（`--base develop`）。本文は `--body-file` 経由。
- **VRT baseline 再生成が必須**: ToggleGroup 追加と改名（H1/breadcrumb）で `/tools/sql-formatter` の見た目が変わるため、既存 baseline と不一致になる。`Update Visual Regression Baseline` workflow を本 PR ブランチで `workflow_dispatch` trigger して baseline を再生成する（mac ローカル生成不可、CLAUDE.md 準拠）。

## 自己レビュー結果（spec との突き合わせ）

- 仕様 7.1（スキャナ: 文字列/コメント/識別子クォート除外、混在エラー）→ Task 1 `scanPlaceholders` + 陽性対照テスト。
- 仕様 7.2（値レンダリング: 文字列エスケープ / null / 真偽値方言依存 / ネスト非対応）→ Task 1 `renderValue`。
- 仕様 7.3（置換規則: `?` 件数一致 / `$n` 範囲 / `:name` キー存在）→ Task 1 各 resolver。
- 仕様 8（エラーハンドリング全 7 種）→ Task 1 のテスト（陽性対照）で網羅。
- 仕様 9「PR2」（embedParams / 埋め込みタブ + 警告バナー / test-gates 陽性対照 / E2E / docs）→ Task 1〜4。
- test-gates: スキャナ陽性対照（文字列内 `?` 不置換、単純 regex なら fail）を Task 1 Step 5 で旧実装 fail も確認。
- PR1 レビュー deferral（方言差分 E2E）→ Task 3 の真偽値方言差分テストで対応。
- 既知の制約（dollar-quoted string 未対応）を実装コメントと decisions に明記。
