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

  describe('strict モード（不正なスキーマの拒否）', () => {
    it('未知のキーワードを含むスキーマは valid:false で返す', () => {
      // `unknownKeyword` は JSON Schema に存在しないキーワード。
      // strict:true により Ajv はコンパイル時に例外を投げ、
      // ValidationResult.errors に流れる。
      const schema = {
        type: 'object',
        properties: { name: { type: 'string', unknownKeyword: 'oops' } },
      };
      const result = validateWithSchema({ name: '太郎' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toMatch(/スキーマが無効です/);
    });

    it('解決できない $ref を含むスキーマは valid:false で返す', () => {
      // 外部 URL の $ref は loadSchema 未提供のため解決できず compile で失敗する。
      const schema = {
        type: 'object',
        properties: {
          x: { $ref: 'https://example.com/does-not-exist.json' },
        },
      };
      const result = validateWithSchema({ x: 1 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toMatch(/スキーマが無効です/);
    });

    it('型と矛盾する制約（type:number に minLength）は valid:false で返す', () => {
      // strict:true により、型と矛盾するキーワードはコンパイル時エラーになる。
      const schema = {
        type: 'object',
        properties: { v: { type: 'number', minLength: 3 } },
      };
      const result = validateWithSchema({ v: 1 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/スキーマが無効です/);
    });

    it('draft-04 スキーマでも未知のキーワードを拒否する', () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: { x: { type: 'integer', unknownKeyword: 'oops' } },
      };
      const result = validateWithSchema({ x: 1 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toMatch(/スキーマが無効です/);
    });
  });
});
