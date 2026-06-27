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

// node-sql-parser のカラム参照は引用方法・文脈により構造が異なる:
// - 文字列: MySQLバッククォートの一部
// - { expr: { value } }: 非引用/PostgreSQL の列定義カラム名
// - { type: 'column_ref', column: string }: MySQL PRIMARY KEY / REFERENCES definition の要素
// - { type: 'column_ref', column: { expr: { value } } }: PostgreSQL FK definition の要素
// - { value: string }: その他
function refName(ref: unknown): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object') {
    const r = ref as {
      type?: string;
      column?: unknown;
      expr?: { value?: string };
      value?: string;
    };
    // column_ref 型の処理
    if (r.type === 'column_ref') {
      // MySQL: column が文字列
      if (typeof r.column === 'string') return r.column;
      // PostgreSQL: column が { expr: { value } } オブジェクト
      if (r.column && typeof r.column === 'object') {
        const col = r.column as { expr?: { value?: string } };
        if (col.expr?.value) return col.expr.value;
      }
    }
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
        columns.push({ name, type: formatType(def), nullable, isPrimaryKey: isPk, isForeignKey: isFk });
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
