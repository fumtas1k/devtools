import { describe, it, expect } from 'vitest';
import { validateWithSchema } from '../schema-validator';

describe('validateWithSchema', () => {
  it('有効なデータを検証する', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const result = validateWithSchema({ name: '太郎' }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('無効なデータのエラーを返す', () => {
    const schema = {
      type: 'object',
      properties: { age: { type: 'number' } },
      required: ['age'],
    };
    const result = validateWithSchema({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toHaveProperty('path');
    expect(result.errors[0]).toHaveProperty('message');
  });

  it('draft-04スキーマを処理する', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      properties: { x: { type: 'integer' } },
    };
    const result = validateWithSchema({ x: 1 }, schema);
    expect(result.valid).toBe(true);
  });

  it('非オブジェクトのスキーマでエラーを投げる', () => {
    expect(() => validateWithSchema({}, 'not a schema')).toThrow(
      'スキーマはオブジェクトである必要があります'
    );
  });
});
