import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import Ajv4 from 'ajv-draft-04';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

/**
 * JSON Schema (draft 7 or draft 4) でデータを検証する
 * @param data 検証対象データ (JS値)
 * @param schema JSON Schemaオブジェクト
 */
export function validateWithSchema(data: unknown, schema: unknown): ValidationResult {
  const schemaObj = schema as Record<string, unknown>;
  const isDraft04 = typeof schemaObj.$schema === 'string' && schemaObj.$schema.includes('draft-04');

  let validate: ReturnType<Ajv['compile']>;

  if (isDraft04) {
    const ajv4 = new Ajv4({ allErrors: true, strict: false });
    addFormats(ajv4 as unknown as Ajv);
    validate = ajv4.compile(schemaObj);
  } else {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validate = ajv.compile(schemaObj);
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
