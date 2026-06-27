import Papa from 'papaparse';
import { escapeCsvFormula } from '@/utils/json-csv';
import { FIELD_DEFS } from './types';
import type { PersonRecord, FieldKey } from './types';

/** key → 日本語ラベル */
function labelOf(key: FieldKey): string {
  return FIELD_DEFS.find((f) => f.key === key)!.label;
}

/** 選択フィールドのみを {ラベル: 値} へ射影 */
function project(records: PersonRecord[], fields: FieldKey[]): Record<string, string>[] {
  return records.map((r) => {
    const o: Record<string, string> = {};
    for (const k of fields) o[labelOf(k)] = r[k];
    return o;
  });
}

const SEQ_HEADER = 'No.';

/** CSV 文字列（UTF-8 BOM 付き、CSV 数式インジェクション対策込み） */
export function toCsv(records: PersonRecord[], fields: FieldKey[], withSeqId = false): string {
  const labels = fields.map(labelOf);
  const columns = withSeqId ? [SEQ_HEADER, ...labels] : labels;
  const rows = project(records, fields).map((row, i) => {
    const o: Record<string, string | number | boolean | null> = {};
    if (withSeqId) o[SEQ_HEADER] = String(i + 1);
    for (const [k, v] of Object.entries(row)) o[k] = escapeCsvFormula(v);
    return o;
  });
  const csv = Papa.unparse(rows, { columns });
  return '﻿' + csv;
}

/** JSON 文字列（整形）。withSeqId 時は No. を数値で先頭キーに付与 */
export function toJson(records: PersonRecord[], fields: FieldKey[], withSeqId = false): string {
  const projected = project(records, fields);
  const out = withSeqId
    ? projected.map((row, i) => ({ [SEQ_HEADER]: i + 1, ...row }))
    : projected;
  return JSON.stringify(out, null, 2);
}
