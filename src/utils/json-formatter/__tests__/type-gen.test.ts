import { describe, it, expect } from 'vitest';
import { generateTypeScript } from '../type-gen';

describe('generateTypeScript', () => {
  it('object ルートを interface にする（キー順を保持）', () => {
    expect(generateTypeScript({ name: 'x', age: 1 })).toBe(
      'interface Root {\n  name: string;\n  age: number;\n}'
    );
  });

  it('ネスト object を別 interface に切り出し、子→親の順で出力する', () => {
    expect(generateTypeScript({ user: { id: 1 } })).toBe(
      'interface User {\n  id: number;\n}\n\ninterface Root {\n  user: User;\n}'
    );
  });

  it('array of object ルートは要素 interface + type 別名にする', () => {
    expect(generateTypeScript([{ a: 1 }, { a: 2, b: 'x' }])).toBe(
      'interface RootItem {\n  a: number;\n  b?: string;\n}\n\ntype Root = RootItem[];'
    );
  });

  it('全要素マージ: 欠けキーは optional、型違いは union、null も union 要素', () => {
    expect(generateTypeScript([{ a: 1 }, { a: null, b: 2 }])).toBe(
      'interface RootItem {\n  a: number | null;\n  b?: number;\n}\n\ntype Root = RootItem[];'
    );
  });

  it('primitive ルートは type 別名', () => {
    expect(generateTypeScript(42)).toBe('type Root = number;');
    expect(generateTypeScript(null)).toBe('type Root = null;');
  });

  it('空配列フィールドは unknown[]', () => {
    expect(generateTypeScript({ tags: [] })).toBe('interface Root {\n  tags: unknown[];\n}');
  });

  it('primitive 配列は T[]、混在は (A | B)[]', () => {
    expect(generateTypeScript({ nums: [1, 2, 3] })).toBe('interface Root {\n  nums: number[];\n}');
    expect(generateTypeScript({ mixed: [1, 'x'] })).toBe(
      'interface Root {\n  mixed: (number | string)[];\n}'
    );
  });

  it('非識別子キーはクォート、キー名は PascalCase で interface 命名', () => {
    expect(generateTypeScript({ order_items: { sku: 'x' } })).toBe(
      'interface OrderItems {\n  sku: string;\n}\n\ninterface Root {\n  order_items: OrderItems;\n}'
    );
    expect(generateTypeScript({ 'order-id': 1 })).toBe(
      'interface Root {\n  "order-id": number;\n}'
    );
  });

  it('配列要素 object は 親名+Item で命名', () => {
    expect(generateTypeScript({ tags: [{ id: 1 }] })).toBe(
      'interface TagsItem {\n  id: number;\n}\n\ninterface Root {\n  tags: TagsItem[];\n}'
    );
  });

  it('interface 名の衝突は数字サフィックス', () => {
    expect(generateTypeScript({ a_b: { x: 1 }, 'a-b': { y: 2 } })).toBe(
      'interface AB {\n  x: number;\n}\n\ninterface AB2 {\n  y: number;\n}\n\n' +
        'interface Root {\n  a_b: AB;\n  "a-b": AB2;\n}'
    );
  });

  it('空 object は interface Root {}', () => {
    expect(generateTypeScript({})).toBe('interface Root {}');
  });

  it('ネスト配列は余分な括弧を付けない（union のときのみ括弧）', () => {
    // 要素が配列 → 括弧不要（レビュー#516-🟡1）
    expect(generateTypeScript({ grid: [[1], [2, 3]] })).toBe(
      'interface Root {\n  grid: number[][];\n}'
    );
    // 要素が union → 括弧必要
    expect(generateTypeScript({ grid: [[1], [2, 'x']] })).toBe(
      'interface Root {\n  grid: (number | string)[][];\n}'
    );
  });
});
