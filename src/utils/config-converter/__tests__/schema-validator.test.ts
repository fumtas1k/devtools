import { describe, it, expect } from 'vitest';
import { lintSchema, validateWithSchema } from '../schema-validator';

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
    // 未知のキーワードは検証結果を変えず、lint の警告として別途返す。
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

    it('未知のキーワードは検証結果を失敗にしない（valid:true）', () => {
      // 仕様準拠の挙動を明示しておく回帰防止テスト。
      // 旧 Ajv `strict: true` では失敗していたが、cfworker / spec-compliant 実装では通る。
      const schema = {
        type: 'object',
        properties: { name: { type: 'string', unknownKeyword: 'oops' } },
      };
      const result = validateWithSchema({ name: '太郎' }, schema);
      expect(result.valid).toBe(true);
    });

    it('未対応 draft URI（draft-06 等）は draft-07 として処理される', () => {
      // detectDraft の現在の意図表明: 未対応 draft URI は警告無く draft-07
      // にフォールバックする。draft-06 は draft-07 とキーワードがほぼ同一の
      // ため運用上の問題は薄いが、将来仕様変更を入れる際の意図確認として固定。
      const schema = {
        $schema: 'http://json-schema.org/draft-06/schema#',
        type: 'object',
        properties: { x: { type: 'integer' } },
        required: ['x'],
      };
      // draft-07 として解釈されるなら通る
      expect(validateWithSchema({ x: 1 }, schema).valid).toBe(true);
      // draft-07 として解釈されているならば required 違反は検出される
      expect(validateWithSchema({}, schema).valid).toBe(false);
    });
  });
});

describe('スキーマ警告の陽性対照', () => {
  it('未知キーワードを検証成功とともにパス付きで返す', () => {
    const result = validateWithSchema(
      { name: '太郎' },
      {
        type: 'object',
        properties: { name: { type: 'string', unknownKeyword: true } },
      }
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ path: '/properties/name/unknownKeyword' }),
    ]);
  });

  it('number に対する minLength を検証成功とともにパス付きで返す', () => {
    const result = validateWithSchema(
      { age: 30 },
      {
        type: 'object',
        properties: { age: { type: 'number', minLength: 2 } },
      }
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ path: '/properties/age/minLength' }),
    ]);
  });
});

describe('lintSchema', () => {
  it('無効なデータとスキーマの警告を同時に返す', () => {
    const result = validateWithSchema({}, { type: 'object', required: ['name'], typo: true });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.map((w) => w.path)).toEqual(['/typo']);
  });

  it('参照解決例外でも警告を返す', () => {
    const result = validateWithSchema(
      { x: 1 },
      { typo: true, properties: { x: { $ref: 'https://example.com/x' } } }
    );
    expect(result.valid).toBe(false);
    expect(result.warnings.map((w) => w.path)).toEqual(['/typo']);
  });

  it('型の互換性と不正な型を扱う', () => {
    expect(lintSchema({ type: ['number', 'string'], minLength: 2, maximum: 3 })).toEqual([]);
    expect(lintSchema({ type: 'integer', maximum: 3 })).toEqual([]);
    expect(lintSchema({ minLength: 2 })).toEqual([]);
    expect(lintSchema({ type: ['number', 'oops'], minLength: 2 })).toEqual([]);
    expect(
      lintSchema({ type: 'object', minLength: 2, maximum: 3, items: {}, properties: {} }).map(
        (w) => w.path
      )
    ).toEqual(['/minLength', '/maximum', '/items']);
    expect(lintSchema({ $ref: '#', type: 'number', minLength: 2 })).toEqual([]);
  });

  it('draft のキーワードと予約済み名を区別する', () => {
    expect(
      lintSchema({
        $schema: 'http://json-schema.org/draft-04/schema#',
        $ref: '#',
        id: 'a',
        const: 1,
      }).map((w) => w.path)
    ).toEqual(['/const']);
    expect(
      lintSchema({
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'x',
        $comment: 'x',
        const: 1,
        contains: {},
        propertyNames: {},
        if: {},
        then: {},
        else: {},
        examples: [],
        readOnly: true,
        writeOnly: true,
        contentEncoding: 'x',
        contentMediaType: 'x',
      })
    ).toEqual([]);
    expect(
      lintSchema({
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        $defs: {},
        $anchor: 'x',
        $recursiveAnchor: true,
        $recursiveRef: '#',
        $vocabulary: {},
        dependentRequired: {},
        dependentSchemas: {},
        unevaluatedItems: {},
        unevaluatedProperties: {},
        minContains: 1,
        maxContains: 2,
        deprecated: true,
        contentSchema: {},
        definitions: {},
        dependencies: {},
      })
    ).toEqual([]);
    expect(
      lintSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $dynamicRef: '#x',
        $dynamicAnchor: 'x',
        $recursiveRef: '#',
        definitions: {},
        dependencies: {},
        prefixItems: [],
        additionalItems: false,
      }).map((w) => w.path)
    ).toEqual(['/additionalItems']);
    expect(lintSchema({ $schema: 'unknown', prefixItems: [] }).map((w) => w.path)).toEqual([
      '/prefixItems',
    ]);
  });

  it('宣言されたスキーマ位置だけを走査し JSON Pointer をエスケープする', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      properties: { 'a/~': { typo: true }, constructor: { typo: true } },
      patternProperties: { pattern: { typo: true } },
      $defs: { x: { typo: true } },
      definitions: { x: { typo: true } },
      dependentSchemas: { x: { typo: true } },
      dependencies: { a: ['typo'], b: { typo: true } },
      allOf: [{ typo: true }],
      anyOf: [{ typo: true }],
      oneOf: [{ typo: true }],
      prefixItems: [{ typo: true }],
      items: { typo: true },
      contains: { typo: true },
      additionalProperties: { typo: true },
      propertyNames: { typo: true },
      not: { typo: true },
      if: { typo: true },
      then: { typo: true },
      else: { typo: true },
      unevaluatedItems: { typo: true },
      unevaluatedProperties: { typo: true },
      contentSchema: { typo: true },
      default: { typo: true },
      examples: [{ typo: true }],
      enum: [{ typo: true }],
      const: { typo: true },
      $vocabulary: { typo: true },
      'x-custom': { typo: true },
    };
    const paths = lintSchema(schema).map((w) => w.path);
    for (const path of [
      '/properties/a~1~0/typo',
      '/properties/constructor/typo',
      '/patternProperties/pattern/typo',
      '/$defs/x/typo',
      '/definitions/x/typo',
      '/dependentSchemas/x/typo',
      '/dependencies/b/typo',
      '/allOf/0/typo',
      '/anyOf/0/typo',
      '/oneOf/0/typo',
      '/prefixItems/0/typo',
      '/items/typo',
      '/contains/typo',
      '/additionalProperties/typo',
      '/propertyNames/typo',
      '/not/typo',
      '/if/typo',
      '/then/typo',
      '/else/typo',
      '/unevaluatedItems/typo',
      '/unevaluatedProperties/typo',
      '/contentSchema/typo',
      '/x-custom',
    ])
      expect(paths).toContain(path);
    expect(paths).toHaveLength(23);
  });

  it('旧 draft の tuple items と additionalItems を走査する', () => {
    const paths = lintSchema({
      items: [{ typo: 1 }, true, null],
      additionalItems: { typo: true },
    }).map((w) => w.path);
    expect(paths).toEqual(expect.arrayContaining(['/items/0/typo', '/additionalItems/typo']));
    expect(paths).toHaveLength(2);
  });

  it('異なるまたは未知の nested dialect は subtree を検査しない', () => {
    const paths = lintSchema({
      properties: {
        same: { $schema: 'http://json-schema.org/draft-07/schema#', typo: true },
        other: { $schema: 'https://json-schema.org/draft/2020-12/schema', typo: true },
        unknown: { $schema: 'https://example.com/draft-07', typo: true },
      },
    }).map((w) => w.path);
    expect(paths).toEqual(['/properties/same/typo']);
  });

  it('循環・深いツリー・不正な子を安全に扱い入力を変えない', () => {
    const schema: Record<string, unknown> = { properties: {}, allOf: [false, null, 1, 'x'] };
    let current = schema;
    for (let i = 0; i < 5000; i++) {
      const child = {};
      current.properties = { x: child };
      current = child;
    }
    current.not = schema;
    current.typo = true;
    expect(lintSchema(schema)).toHaveLength(1);
    const plain = { properties: { x: { type: 'number', minLength: 1 } } };
    const before = JSON.stringify(plain);
    lintSchema(plain);
    expect(JSON.stringify(plain)).toBe(before);
    expect(lintSchema(true)).toEqual([]);
  });
});
