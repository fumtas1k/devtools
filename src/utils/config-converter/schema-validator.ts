import { Validator, type OutputUnit, type Schema, type SchemaDraft } from '@cfworker/json-schema';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: SchemaWarning[];
}

export interface SchemaWarning {
  path: string;
  message: string;
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
 * - 非標準キーワードや型に適用されない制約は検証結果を変えず警告する。
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
  const warnings = lintSchema(schema);

  let validator: Validator;
  try {
    validator = new Validator(schemaObj, draft, /* shortCircuit */ false);
  } catch (err) {
    return invalidSchema(err, warnings);
  }

  let result;
  try {
    result = validator.validate(data);
  } catch (err) {
    return invalidSchema(err, warnings);
  }

  if (result.valid) {
    return { valid: true, errors: [], warnings };
  }
  return {
    valid: false,
    errors: result.errors.map(toLegacyError),
    warnings,
  };
}

// 標準キーワードはバリデータの実装状況とは独立して扱う。
const DRAFT_4 = `id $schema $ref title description default multipleOf maximum exclusiveMaximum
minimum exclusiveMinimum maxLength minLength pattern additionalItems items maxItems minItems
uniqueItems maxProperties minProperties required additionalProperties definitions properties
patternProperties dependencies enum type allOf anyOf oneOf not format`.split(/\s+/);
const DRAFT_7_EXTRA = `$id $comment const contains propertyNames if then else examples
readOnly writeOnly contentMediaType contentEncoding`.split(/\s+/);
const DRAFT_2019_EXTRA = `$defs $anchor $recursiveAnchor $recursiveRef $vocabulary
dependentRequired dependentSchemas unevaluatedItems unevaluatedProperties minContains
maxContains deprecated contentSchema`.split(/\s+/);
const DRAFT_2020_EXTRA = `$dynamicAnchor $dynamicRef prefixItems`.split(/\s+/);
const KEYWORDS: Record<SchemaDraft, Set<string>> = {
  '4': new Set(DRAFT_4),
  '7': new Set([...DRAFT_4.filter((key) => key !== 'id'), ...DRAFT_7_EXTRA]),
  '2019-09': new Set([
    ...DRAFT_4.filter((key) => key !== 'id'),
    ...DRAFT_7_EXTRA,
    ...DRAFT_2019_EXTRA,
  ]),
  '2020-12': new Set([
    ...DRAFT_4.filter((key) => key !== 'id' && key !== 'additionalItems'),
    ...DRAFT_7_EXTRA,
    ...DRAFT_2019_EXTRA,
    ...DRAFT_2020_EXTRA,
  ]),
};
const TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
const APPLICABILITY: Record<string, string> = Object.fromEntries([
  ...'multipleOf minimum maximum exclusiveMinimum exclusiveMaximum'
    .split(' ')
    .map((key) => [key, 'number']),
  ...'minLength maxLength pattern'.split(' ').map((key) => [key, 'string']),
  ...'items additionalItems prefixItems contains minContains maxContains minItems maxItems uniqueItems unevaluatedItems'
    .split(' ')
    .map((key) => [key, 'array']),
  ...'properties patternProperties additionalProperties required dependencies dependentRequired dependentSchemas propertyNames minProperties maxProperties unevaluatedProperties'
    .split(' ')
    .map((key) => [key, 'object']),
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const pointer = (base: string, key: string) =>
  `${base}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;

/** スキーマの宣言位置だけを調べる。参照の解決や入力の変更は行わない。 */
export function lintSchema(schema: unknown): SchemaWarning[] {
  if (!isRecord(schema)) return [];
  const draft = detectDraft(Object.hasOwn(schema, '$schema') ? schema.$schema : undefined);
  const keywords = KEYWORDS[draft];
  const warnings: SchemaWarning[] = [];
  const visited = new WeakSet<object>();
  const stack: Array<{ node: unknown; path: string }> = [{ node: schema, path: '' }];
  while (stack.length) {
    const { node, path } = stack.pop()!;
    if (!isRecord(node) || visited.has(node)) continue;
    visited.add(node);
    // 異なる、または未知の dialect の subtree は誤検知を避ける。
    if (path && Object.hasOwn(node, '$schema')) {
      const nested = node.$schema;
      if (
        typeof nested !== 'string' ||
        !/^https?:\/\/json-schema\.org\/(?:draft-0[47]\/schema#?|draft\/(?:2019-09|2020-12)\/schema#?)$/i.test(
          nested
        ) ||
        detectDraft(nested) !== draft
      )
        continue;
    }
    const rawType = Object.hasOwn(node, 'type') ? node.type : undefined;
    const types = typeof rawType === 'string' ? [rawType] : Array.isArray(rawType) ? rawType : [];
    const validTypes =
      types.length > 0 &&
      types.every((type) => typeof type === 'string' && TYPES.has(type)) &&
      new Set(types).size === types.length;
    const checkType =
      validTypes && !((draft === '4' || draft === '7') && Object.hasOwn(node, '$ref'));
    for (const key of Object.keys(node)) {
      const keyPath = pointer(path, key);
      if (!keywords.has(key)) {
        warnings.push({
          path: keyPath,
          message: 'この draft では非標準のキーワードです。綴りを確認してください。',
        });
      } else if (checkType && Object.hasOwn(APPLICABILITY, key)) {
        const expected = APPLICABILITY[key];
        if (
          !types.some((type) => type === expected || (expected === 'number' && type === 'integer'))
        ) {
          warnings.push({
            path: keyPath,
            message: `この制約は指定された type に適用されません（対象: ${expected}）。`,
          });
        }
      }
      if (!keywords.has(key)) continue;
      const value = node[key];
      const push = (child: unknown, childPath: string) => {
        if (isRecord(child)) stack.push({ node: child, path: childPath });
      };
      if (
        [
          'properties',
          'patternProperties',
          'definitions',
          '$defs',
          'dependentSchemas',
          'dependencies',
        ].includes(key) &&
        isRecord(value)
      ) {
        for (const name of Object.keys(value)) push(value[name], pointer(keyPath, name));
      } else if (['allOf', 'anyOf', 'oneOf', 'prefixItems'].includes(key) && Array.isArray(value)) {
        value.forEach((child, index) => push(child, pointer(keyPath, String(index))));
      } else if (key === 'items' && Array.isArray(value) && draft !== '2020-12') {
        value.forEach((child, index) => push(child, pointer(keyPath, String(index))));
      } else if (
        [
          'items',
          'additionalItems',
          'contains',
          'additionalProperties',
          'propertyNames',
          'not',
          'if',
          'then',
          'else',
          'unevaluatedItems',
          'unevaluatedProperties',
          'contentSchema',
        ].includes(key)
      ) {
        push(value, keyPath);
      }
    }
  }
  return warnings;
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

function invalidSchema(err: unknown, warnings: SchemaWarning[]): ValidationResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    valid: false,
    errors: [{ path: '/', message: `スキーマが無効です: ${message}` }],
    warnings,
  };
}
