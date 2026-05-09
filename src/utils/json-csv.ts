import Papa from 'papaparse';

/**
 * CSVフォーミュラインジェクション（CWE-1236）対策。
 * セル文字列の先頭が `=`, `+`, `-`, `@`, `\t`, `\r` の場合に
 * シングルクォートを前置し、Excel / Numbers / LibreOffice 等で
 * 数式として解釈されないようにする。
 *
 * 動作仕様:
 * - 文字列以外（数値・真偽値・null・undefined・object 等）は素通しで返す。
 *   呼び出し側の型保証が万一崩れて `undefined` などが渡っても安全に動作する。
 * - 空文字列も素通し。
 * - 戻り値の型は入力と同じ（文字列はエスケープ後の文字列、それ以外は元の値）。
 *
 * 型シグネチャはジェネリック（`<T>(value: T): T | string`）とし、内部呼び出し
 * （`flattenObject` の戻り値: `string | number | boolean | null`）の戻り型を
 * 維持しつつ、ランタイム上の型不整合（万一の `undefined` 混入等）にも防御的に
 * 振る舞えるようにしている。
 *
 * 注意: 配列値は `flattenObject` で `JSON.stringify` されるため文字列の先頭は
 * 必ず `[` になり、本関数のエスケープ対象にはならない。配列内の `=` で始まる
 * 値（例: `["=evil"]`）は CSV セルとして見ると `[\"=evil\"]` という文字列リテラル
 * になり、Excel でも先頭が `[` であるため数式実行されない。仕様として安全。
 */
export function escapeCsvFormula<T>(value: T): T | string {
  if (typeof value !== 'string' || value.length === 0) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * ネストされたオブジェクトをドット記法でフラット化する。
 *
 * セキュリティ:
 * - プロトタイプ汚染（CWE-1321）対策として、戻り値は null-prototype オブジェクト
 *   （`Object.create(null)`）で構築する。
 * - 加えて `__proto__` / `constructor` / `prototype` という危険なキーは
 *   多重防御として明示的にスキップする。これにより、悪意ある JSON 入力が
 *   Papaparse 経由で他のコードへ伝播してもプロトタイプチェーンへ影響しない。
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string | number | boolean | null> {
  const result = Object.create(null) as Record<string, string | number | boolean | null>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      result[fullKey] = JSON.stringify(value);
    } else {
      result[fullKey] = value as string | number | boolean | null;
    }
  }
  return result;
}

/**
 * JSON文字列 → CSV文字列。失敗時は Error を投げる。
 *
 * セキュリティ:
 * - 全セルに `escapeCsvFormula` を適用し、CSV フォーミュラインジェクション
 *   （CWE-1236）対策を既定 ON で行う。
 * - 配列値は `flattenObject` で JSON.stringify されるため、先頭が常に `[` と
 *   なり `escapeCsvFormula` のエスケープ対象外となる。これは Excel 等が
 *   `[\"=evil\"]` のような値を文字列リテラルとして扱い数式実行しないため
 *   安全であり、仕様として意図したものである。
 */
export function jsonToCsv(jsonStr: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('有効なJSONではありません');
  }

  let rows: Record<string, unknown>[];
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return '';
    rows = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    rows = [parsed as Record<string, unknown>];
  } else {
    throw new Error('オブジェクトまたはオブジェクトの配列を入力してください');
  }

  const flatRows = rows.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error('オブジェクトまたはオブジェクトの配列を入力してください');
    }
    const flat = flattenObject(row as Record<string, unknown>);
    // フォーミュラインジェクション対策（既定 ON）
    for (const k of Object.keys(flat)) {
      flat[k] = escapeCsvFormula(flat[k]);
    }
    return flat;
  });

  return Papa.unparse(flatRows);
}

/** CSV文字列 → JSON文字列（整形済み）。失敗時は Error を投げる */
export function csvToJson(csvStr: string): string {
  const result = Papa.parse<Record<string, unknown>>(csvStr, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    delimiter: ',',
  });

  // FieldMismatch（列数不一致）は警告扱いのため無視し、それ以外のエラーのみ拾う
  const criticalErrors = result.errors.filter((e) => e.type !== 'FieldMismatch');
  if (criticalErrors.length > 0) {
    throw new Error('CSVの解析に失敗しました');
  }

  return JSON.stringify(result.data, null, 2);
}
