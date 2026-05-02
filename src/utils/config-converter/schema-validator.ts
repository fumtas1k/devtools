import { Validator, type OutputUnit, type Schema, type SchemaDraft } from '@cfworker/json-schema';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

/**
 * JSON Schema (draft 4 / 7 / 2019-09 / 2020-12) でデータを検証する。
 *
 * 実装方針:
 * - `@cfworker/json-schema` の `Validator` を使用する。Ajv 系と異なり
 *   `new Function()` を介さない interpreter 実装で、CSP `unsafe-eval`
 *   無しでも動作する（本番デプロイ先 Cloudflare Pages の `_headers` で
 *   `script-src` に `'unsafe-eval'` を許可していないため必須）。
 * - 外部スキーマの取得は行わない（SSRF 等のリスク回避）。`Validator` は
 *   `addSchema` で明示登録された参照しか解決しない。
 * - スキーマ自体の検出可能な不整合（解決不能な `$ref` 等）はコンストラクタで
 *   throw されるため `valid:false` に変換し、呼び出し側の通常エラー表示経路に乗せる。
 *
 * 既知の挙動差（Ajv 8.x からの移行に伴うもの）:
 * - 未知のキーワード（例: `unknownKeyword`）は JSON Schema 仕様に従い
 *   無視される。Ajv `strict: true` のような検出は行わない。
 * - `format` は draft 既定の定義に従って評価される（`addFormats` 不要）。
 *
 * @param data 検証対象データ (JS値)
 * @param schema JSON Schemaオブジェクト
 */
export function validateWithSchema(data: unknown, schema: unknown): ValidationResult {
  if (typeof schema !== 'object' || schema === null) {
    throw new Error('スキーマはオブジェクトである必要があります');
  }
  const schemaObj = schema as Schema;
  const draft = detectDraft((schemaObj as Record<string, unknown>).$schema);

  let validator: Validator;
  try {
    validator = new Validator(schemaObj, draft, /* shortCircuit */ false);
  } catch (err) {
    return invalidSchema(err);
  }

  let result;
  try {
    result = validator.validate(data);
  } catch (err) {
    return invalidSchema(err);
  }

  if (result.valid) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.errors.map(toLegacyError),
  };
}

/**
 * `$schema` URI から draft を検出する。未指定または認識不能なら draft-07 を既定とする
 * （旧 Ajv 既定との互換維持）。
 */
function detectDraft($schema: unknown): SchemaDraft {
  if (typeof $schema !== 'string') return '7';
  if (/draft-04/i.test($schema)) return '4';
  if (/draft-07/i.test($schema)) return '7';
  if (/draft\/2019-09/i.test($schema)) return '2019-09';
  if (/draft\/2020-12/i.test($schema)) return '2020-12';
  return '7';
}

function toLegacyError(unit: OutputUnit): { path: string; message: string } {
  return {
    path: unit.instanceLocation || '/',
    // cfworker は通常 error 文字列を返すが、null/undefined のケースに当たった
    // 場合の UI 表示崩れ（`/path: ` で右辺が空になる）を防ぐ既定値を入れる。
    message: unit.error || '検証失敗（詳細なし）',
  };
}

function invalidSchema(err: unknown): ValidationResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    valid: false,
    errors: [{ path: '/', message: `スキーマが無効です: ${message}` }],
  };
}
