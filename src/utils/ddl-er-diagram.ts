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

function formatType(def: {
  dataType?: string;
  length?: number;
  scale?: number;
  suffix?: unknown[];
}): string {
  if (!def?.dataType) return '';
  let t = def.dataType;
  if (typeof def.length === 'number') {
    t += def.scale != null ? `(${def.length},${def.scale})` : `(${def.length})`;
  }
  // UNSIGNED / ZEROFILL 等の型修飾子（node-sql-parser は suffix 配列で返す）
  if (Array.isArray(def.suffix) && def.suffix.length) {
    const mods = def.suffix
      .map((s) => (typeof s === 'string' ? s : ((s as { value?: string })?.value ?? '')))
      .filter(Boolean);
    if (mods.length) t += ' ' + mods.join(' ');
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
          const toTable = ref?.table?.[0]?.table ?? '';
          const fromCols = (d.definition as unknown[]) ?? [];
          const toCols = (ref?.definition as unknown[]) ?? [];
          // 複合外部キー (FOREIGN KEY (x, y) REFERENCES a(x, y)) は列を index で対応付けて
          // 各列ごとにリレーションを生成する
          fromCols.forEach((fc, i) => {
            relations.push({
              fromTable: tableName,
              fromColumn: refName(fc),
              toTable,
              toColumn: refName(toCols[i]),
            });
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

// ---- 自前 SVG レンダラ --------------------------------------------------------

/** SVG テキストに埋め込む文字をエスケープする（XSS / SVG 破壊防止） */
function escSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// レイアウト定数
const FONT_SIZE = 13;
const CHAR_W = FONT_SIZE * 0.62; // 等幅フォント前提の文字幅推定係数
const ROW_H = 22; // 1行の高さ
const HEADER_H = 26; // ヘッダ行の高さ
const PAD_X = 12; // 水平パディング
const GAP = 40; // テーブル間の余白
const COLS = 3; // グリッド最大列数

// 配色（SVG presentation 属性として使用。Tailwindカラークラスではない）
const C = {
  border: '#334155',
  headerFill: '#e2e8f0',
  bodyFill: '#ffffff',
  text: '#0f172a',
  subText: '#475569',
  line: '#64748b',
  background: '#ffffff',
  pkBadge: '#1e40af',
  fkBadge: '#065f46',
};

interface TableLayout {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 純関数: SchemaModel → 自己完結した SVG 文字列。DOM 非依存。 */
export function toSvg(model: SchemaModel): string {
  const { tables, relations } = model;

  if (tables.length === 0) {
    const w = 300;
    const h = 80;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="${C.background}"/>` +
      `<text x="${w / 2}" y="${h / 2}" font-family="monospace" font-size="${FONT_SIZE}" ` +
      `fill="${C.subText}" text-anchor="middle" dominant-baseline="middle">テーブルがありません</text>` +
      `</svg>`
    );
  }

  // --- 各テーブルの幅・高さを計算 ---
  const tableSizes = tables.map((t) => {
    // ヘッダ行テキスト幅
    const headerLen = t.name.length;
    // カラム行テキスト幅: "colname : TYPE  PK,FK"
    const colTextLens = t.columns.map((c) => {
      const badge = [c.isPrimaryKey ? 'PK' : '', c.isForeignKey ? 'FK' : '']
        .filter(Boolean)
        .join(',');
      return `${c.name} : ${c.type}${badge ? '  ' + badge : ''}`.length;
    });
    const maxLen = Math.max(headerLen, ...colTextLens, 12);
    const w = Math.round(maxLen * CHAR_W + PAD_X * 2);
    const h = HEADER_H + t.columns.length * ROW_H + 4;
    return { w, h };
  });

  // --- グリッド配置 ---
  const numCols = Math.min(tables.length, COLS);
  const numRows = Math.ceil(tables.length / numCols);

  // 各グリッド列の最大幅・各グリッド行の最大高を求める
  const colWidths: number[] = Array(numCols).fill(0);
  const rowHeights: number[] = Array(numRows).fill(0);
  tableSizes.forEach(({ w, h }, i) => {
    const col = i % numCols;
    const row = Math.floor(i / numCols);
    if (w > colWidths[col]) colWidths[col] = w;
    if (h > rowHeights[row]) rowHeights[row] = h;
  });

  // 累積オフセット
  const colOffsets: number[] = [GAP];
  for (let c = 0; c < numCols - 1; c++) {
    colOffsets.push(colOffsets[c] + colWidths[c] + GAP);
  }
  const rowOffsets: number[] = [GAP];
  for (let r = 0; r < numRows - 1; r++) {
    rowOffsets.push(rowOffsets[r] + rowHeights[r] + GAP);
  }

  // テーブルレイアウト（絶対座標）
  const layouts: TableLayout[] = tables.map((t, i) => {
    const col = i % numCols;
    const row = Math.floor(i / numCols);
    return {
      name: t.name,
      x: colOffsets[col],
      y: rowOffsets[row],
      w: colWidths[col],
      h: tableSizes[i].h,
    };
  });

  // 全体サイズ
  const totalW = colOffsets[numCols - 1] + colWidths[numCols - 1] + GAP;
  const totalH = rowOffsets[numRows - 1] + rowHeights[numRows - 1] + GAP;

  const parts: string[] = [];

  // --- 背景 ---
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="${C.background}"/>`);

  // --- テーブルカード ---
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const l = layouts[i];
    const { x, y, w } = l;
    const sz = tableSizes[i];

    // カード枠
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${sz.h}" ` +
        `fill="${C.bodyFill}" stroke="${C.border}" stroke-width="1" rx="4"/>`
    );

    // ヘッダ背景
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${HEADER_H}" ` +
        `fill="${C.headerFill}" stroke="${C.border}" stroke-width="1" rx="4"/>`
    );
    // ヘッダ下辺の角丸を潰すための上書き矩形
    parts.push(
      `<rect x="${x}" y="${y + HEADER_H / 2}" width="${w}" height="${HEADER_H / 2}" ` +
        `fill="${C.headerFill}" stroke="none"/>`
    );
    // ヘッダ下辺ライン
    parts.push(
      `<line x1="${x}" y1="${y + HEADER_H}" x2="${x + w}" y2="${y + HEADER_H}" ` +
        `stroke="${C.border}" stroke-width="1"/>`
    );

    // ヘッダテキスト（テーブル名）
    parts.push(
      `<text x="${x + PAD_X}" y="${y + HEADER_H / 2 + 1}" ` +
        `font-family="monospace" font-size="${FONT_SIZE}" font-weight="bold" ` +
        `fill="${C.text}" dominant-baseline="middle">${escSvg(t.name)}</text>`
    );

    // カラム行
    for (let ci = 0; ci < t.columns.length; ci++) {
      const col = t.columns[ci];
      const rowY = y + HEADER_H + ci * ROW_H;
      const textY = rowY + ROW_H / 2 + 1;

      // 行区切り線（最初の行以外）
      if (ci > 0) {
        parts.push(
          `<line x1="${x}" y1="${rowY}" x2="${x + w}" y2="${rowY}" ` +
            `stroke="${C.border}" stroke-width="0.5" stroke-dasharray="2,3"/>`
        );
      }

      // カラム名 : 型
      const mainText = `${col.name} : ${col.type || '?'}`;
      parts.push(
        `<text x="${x + PAD_X}" y="${textY}" ` +
          `font-family="monospace" font-size="${FONT_SIZE - 1}" ` +
          `fill="${C.text}" dominant-baseline="middle">${escSvg(mainText)}</text>`
      );

      // PK / FK バッジ（右寄せ）
      const badges: { label: string; color: string }[] = [];
      if (col.isPrimaryKey) badges.push({ label: 'PK', color: C.pkBadge });
      if (col.isForeignKey) badges.push({ label: 'FK', color: C.fkBadge });
      let bx = x + w - PAD_X;
      for (const b of badges.reverse()) {
        const bw = b.label.length * (FONT_SIZE - 2) * 0.62 + 6;
        bx -= bw + 2;
        parts.push(
          `<rect x="${bx}" y="${textY - (ROW_H / 2 - 3)}" width="${bw}" height="${ROW_H - 6}" ` +
            `fill="${b.color}" rx="2"/>`
        );
        parts.push(
          `<text x="${bx + bw / 2}" y="${textY}" ` +
            `font-family="monospace" font-size="${FONT_SIZE - 3}" font-weight="bold" ` +
            `fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${b.label}</text>`
        );
      }
    }
  }

  // --- リレーション線 ---
  const tableIndex = new Map(layouts.map((l) => [l.name, l]));

  for (const rel of relations) {
    const from = tableIndex.get(rel.fromTable);
    const to = tableIndex.get(rel.toTable);
    if (!from || !to) continue; // 参照先が存在しない → スキップ

    // FK テーブルの右辺中央 → 参照先テーブルの左辺中央 を繋ぐ
    // （テーブルの位置関係によって左右を選ぶ簡易版）
    let x1: number, y1: number, x2: number, y2: number;
    const fromCx = from.x + from.w / 2;
    const toCx = to.x + to.w / 2;

    if (fromCx <= toCx) {
      // from が左側: from 右辺 → to 左辺
      x1 = from.x + from.w;
      y1 = from.y + from.h / 2;
      x2 = to.x;
      y2 = to.y + to.h / 2;
    } else {
      // from が右側: from 左辺 → to 右辺
      x1 = from.x;
      y1 = from.y + from.h / 2;
      x2 = to.x + to.w;
      y2 = to.y + to.h / 2;
    }

    // 曲線パス
    const mx = (x1 + x2) / 2;
    parts.push(
      `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" ` +
        `fill="none" stroke="${C.line}" stroke-width="1.5"/>`
    );

    // fromColumn ラベル（中点付近）
    const labelX = (x1 + x2) / 2;
    const labelY = (y1 + y2) / 2 - 6;
    // ラベル背景: 等幅フォント前提で文字列幅を推定し、白背景 rect をラベル直前に描画する
    const labelFontSize = FONT_SIZE - 3;
    const labelW = rel.fromColumn.length * labelFontSize * 0.62;
    const labelPadX = 3;
    const labelPadY = 2;
    const labelH = labelFontSize + labelPadY * 2;
    parts.push(
      `<rect x="${labelX - labelW / 2 - labelPadX}" y="${labelY - labelFontSize - labelPadY}" ` +
        `width="${labelW + labelPadX * 2}" height="${labelH}" ` +
        `fill="#ffffff" rx="2"/>`
    );
    parts.push(
      `<text x="${labelX}" y="${labelY}" ` +
        `font-family="monospace" font-size="${labelFontSize}" ` +
        `fill="${C.subText}" text-anchor="middle">${escSvg(rel.fromColumn)}</text>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">` +
    parts.join('') +
    `</svg>`
  );
}

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
    // ラベルは Mermaid の二重引用符文字列に入るため、" と改行を除去して構文破壊を防ぐ
    const label = rel.fromColumn.replace(/["\r\n]+/g, ' ').trim();
    // 多側(FK) }o--|| 一側(PK) の非識別リレーションで描画
    lines.push(`  ${safeToken(rel.fromTable)} }o--|| ${safeToken(rel.toTable)} : "${label}"`);
  }
  return lines.join('\n');
}
