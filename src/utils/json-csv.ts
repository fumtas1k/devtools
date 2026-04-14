import Papa from 'papaparse';

/** ネストされたオブジェクトをドット記法でフラット化する */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(obj)) {
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

/** JSON文字列 → CSV文字列。失敗時は Error を投げる */
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
    return flattenObject(row as Record<string, unknown>);
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
