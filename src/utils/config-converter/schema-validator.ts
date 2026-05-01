import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import Ajv4 from 'ajv-draft-04';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

/**
 * JSON Schema (draft 7 or draft 4) でデータを検証する。
 *
 * セキュリティ:
 * - Ajv は `strict: true` と `validateSchema: true` で初期化する。これにより、
 *   未知のキーワード・無効な型・矛盾した制約・解決できない `$ref` などを
 *   コンパイル時にエラーとして検出する（loadSchema は意図的に未提供。
 *   外部スキーマの自動取得は SSRF 等のリスクを避けるため許可しない）。
 * - コンパイル時に投げられた例外は `valid: false` として `errors` に整形して返す。
 *
 * @param data 検証対象データ (JS値)
 * @param schema JSON Schemaオブジェクト
 */
export function validateWithSchema(data: unknown, schema: unknown): ValidationResult {
  if (typeof schema !== 'object' || schema === null) {
    throw new Error('スキーマはオブジェクトである必要があります');
  }
  const schemaObj = schema as Record<string, unknown>;
  const isDraft04 = typeof schemaObj.$schema === 'string' && schemaObj.$schema.includes('draft-04');

  let validate: ReturnType<Ajv['compile']>;

  try {
    if (isDraft04) {
      const ajv4 = new Ajv4({ allErrors: true, strict: true, validateSchema: true });
      (addFormats as (ajv: unknown) => void)(ajv4);
      validate = ajv4.compile(schemaObj);
    } else {
      const ajv = new Ajv({ allErrors: true, strict: true, validateSchema: true });
      addFormats(ajv);
      validate = ajv.compile(schemaObj);
    }
  } catch (err) {
    // Ajv は不正なスキーマ（未知のキーワード・解決できない $ref 等）に対し
    // コンパイル時に例外を投げる。これを ValidationResult.errors に流して
    // 呼び出し側の通常エラー表示経路に乗せる。
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [{ path: '/', message: `スキーマが無効です: ${message}` }],
    };
  }

  const valid = validate(data) as boolean;

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((err) => ({
    path: err.instancePath || '/',
    message: err.message || '',
  }));

  return { valid: false, errors };
}
