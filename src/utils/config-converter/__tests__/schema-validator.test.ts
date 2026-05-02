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

  it('draft-2020-12 スキーマを処理する', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    };
    const result = validateWithSchema(['hi', 42], schema);
    expect(result.valid).toBe(true);
  });

  it('format 検証が draft 既定の定義に従って効く', () => {
    // cfworker は draft の format 定義を内蔵しており、ajv-formats のような
    // 別パッケージ追加なしで date 等を評価する。
    const schema = {
      type: 'string',
      format: 'date',
    };
    const validResult = validateWithSchema('2026-05-02', schema);
    expect(validResult.valid).toBe(true);

    const invalidResult = validateWithSchema('not-a-date', schema);
    expect(invalidResult.valid).toBe(false);
  });

  it('非オブジェクトのスキーマでエラーを投げる', () => {
    expect(() => validateWithSchema({}, 'not a schema')).toThrow(
      'スキーマはオブジェクトである必要があります'
    );
  });

  describe('スキーマ自体の問題の取り扱い', () => {
    // 既知の挙動差: cfworker は JSON Schema 仕様に従うため、未知のキーワードや
    // 型と無関係なキーワード（例: number に minLength）は **無視** される。
    // Ajv `strict: true` のような検出は行わない。仕様準拠を優先する判断
    // （docs/decisions.md [061] 参照）。
    //
    // 一方、解決不能な $ref のように **検証を成立させられない** ケースは
    // 検証失敗として呼び出し側に返す。
    it('解決できない外部 $ref は valid:false で返す', () => {
      const schema = {
        type: 'object',
        properties: {
          x: { $ref: 'https://example.com/does-not-exist.json' },
        },
      };
      // 内部に渡せば（プロパティ x が無いオブジェクト）参照解決が要らないため通る。
      // 解決失敗を顕在化させるために x: 1 を含めて検証を走らせる。
      const result = validateWithSchema({ x: 1 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('未知のキーワードは仕様どおり無視される（valid:true）', () => {
      // 仕様準拠の挙動を明示しておく回帰防止テスト。
      // 旧 Ajv `strict: true` では失敗していたが、cfworker / spec-compliant 実装では通る。
      const schema = {
        type: 'object',
        properties: { name: { type: 'string', unknownKeyword: 'oops' } },
      };
      const result = validateWithSchema({ name: '太郎' }, schema);
      expect(result.valid).toBe(true);
    });
  });
});
