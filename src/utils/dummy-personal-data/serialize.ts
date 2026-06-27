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

/** CSV 文字列（UTF-8 BOM 付き、CSV 数式インジェクション対策込み） */
export function toCsv(records: PersonRecord[], fields: FieldKey[]): string {
  const rows = project(records, fields).map((row) => {
    const o: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(row)) o[k] = escapeCsvFormula(v);
    return o;
  });
  const csv = Papa.unparse(rows, { columns: fields.map(labelOf) });
  return '﻿' + csv;
}

/** JSON 文字列（整形） */
export function toJson(records: PersonRecord[], fields: FieldKey[]): string {
  return JSON.stringify(project(records, fields), null, 2);
}
