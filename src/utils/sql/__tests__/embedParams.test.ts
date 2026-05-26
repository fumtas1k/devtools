import { describe, it, expect } from 'vitest';
import { embedParams } from '../embedParams';

describe('embedParams（正常系 / 陰性対照）', () => {
  it('? を出現順に配列値で置換する', () => {
    expect(embedParams('SELECT * FROM t WHERE a = ? AND b = ?', '[1, "x"]', 'mysql')).toBe(
      "SELECT * FROM t WHERE a = 1 AND b = 'x'"
    );
  });

  it('$n を番号で参照し、同番号の再利用もできる', () => {
    expect(embedParams('WHERE id = $1 OR ref = $1 OR p = $2', '[5, 9]', 'postgresql')).toBe(
      'WHERE id = 5 OR ref = 5 OR p = 9'
    );
  });

  it(':name をキーで参照する', () => {
    expect(embedParams('WHERE id = :id AND name = :name', '{"id": 1, "name": "x"}', 'mysql')).toBe(
      "WHERE id = 1 AND name = 'x'"
    );
  });

  it('文字列はシングルクォートで囲み内部の単一引用符を二重化する', () => {
    expect(embedParams('WHERE name = :n', '{"n": "O\'Brien"}', 'mysql')).toBe(
      "WHERE name = 'O''Brien'"
    );
  });

  it('null は NULL に、数値はそのまま埋め込む', () => {
    expect(embedParams('WHERE a = ? AND b = ?', '[null, 42]', 'mysql')).toBe(
      'WHERE a = NULL AND b = 42'
    );
  });

  it('真偽値は方言依存（PostgreSQL は TRUE/FALSE、他は 1/0）', () => {
    expect(embedParams('WHERE active = ?', '[true]', 'postgresql')).toBe('WHERE active = TRUE');
    expect(embedParams('WHERE active = ?', '[true]', 'mysql')).toBe('WHERE active = 1');
    expect(embedParams('WHERE active = ?', '[false]', 'sqlite')).toBe('WHERE active = 0');
  });

  it('プレースホルダが無ければ SQL をそのまま返す', () => {
    expect(embedParams('SELECT 1', '[]', 'mysql')).toBe('SELECT 1');
  });
});

describe('embedParams（検知 / 陽性対照）', () => {
  // スキャナ陽性対照: 文字列リテラル内の ? は置換されない。
  // 単純 regex 実装ならこの ? も置換し、プレースホルダ 2 個と誤認 → 件数不一致 error になり fail する。
  it('文字列リテラル内の ? を置換せず、外側の ? のみ置換する', () => {
    expect(embedParams("WHERE note = 'why?' AND id = ?", '[7]', 'mysql')).toBe(
      "WHERE note = 'why?' AND id = 7"
    );
  });

  it('行コメント内の ? を置換しない', () => {
    expect(embedParams('-- ignore ?\nWHERE id = ?', '[7]', 'mysql')).toBe(
      '-- ignore ?\nWHERE id = 7'
    );
  });

  it('文字列リテラル内の $1 を置換せず、外側の $1 のみ置換する', () => {
    expect(embedParams("WHERE s = '$1' AND id = $1", '[7]', 'mysql')).toBe(
      "WHERE s = '$1' AND id = 7"
    );
  });

  it(':: キャスト演算子を名前付きプレースホルダと誤認しない', () => {
    expect(embedParams('SELECT id::text WHERE v = :v', '{"v": 1}', 'postgresql')).toBe(
      'SELECT id::text WHERE v = 1'
    );
  });

  it('記法混在はエラー', () => {
    expect(() => embedParams('WHERE a = ? AND b = :name', '[1]', 'mysql')).toThrow('混在');
  });

  it('? の件数とパラメータ数の不一致はエラー', () => {
    expect(() => embedParams('WHERE a = ?', '[1, 2]', 'mysql')).toThrow(
      'プレースホルダ 1 個に対しパラメータ 2 個'
    );
  });

  it('パラメータが JSON として不正ならエラー', () => {
    expect(() => embedParams('WHERE a = ?', 'not json', 'mysql')).toThrow('JSON');
  });

  it('配列・オブジェクトの値は埋め込めない', () => {
    expect(() => embedParams('WHERE a = ?', '[[1, 2]]', 'mysql')).toThrow('配列・オブジェクト');
  });

  it('名前付きキーの欠落はキー名付きでエラー', () => {
    expect(() => embedParams('WHERE id = :id', '{"name": 1}', 'mysql')).toThrow(':id');
  });

  it('番号指定の範囲外参照はエラー', () => {
    expect(() => embedParams('WHERE id = $3', '[1]', 'mysql')).toThrow('範囲外');
  });

  it('? 記法にオブジェクトを渡すとエラー', () => {
    expect(() => embedParams('WHERE a = ?', '{"a": 1}', 'mysql')).toThrow('配列');
  });

  it(':name 記法に配列を渡すとエラー', () => {
    expect(() => embedParams('WHERE a = :a', '[1]', 'mysql')).toThrow('オブジェクト');
  });

  it('ブロックコメント内の ? を置換しない', () => {
    expect(embedParams('SELECT /* ? */ FROM t WHERE id = ?', '[7]', 'mysql')).toBe(
      'SELECT /* ? */ FROM t WHERE id = 7'
    );
  });

  it('ダブルクォート識別子内の ? を置換しない', () => {
    expect(embedParams('WHERE "why?" = 1 AND id = ?', '[7]', 'mysql')).toBe(
      'WHERE "why?" = 1 AND id = 7'
    );
  });

  it('バッククォート識別子内の ? を置換しない', () => {
    expect(embedParams('WHERE `col?` = 1 AND id = ?', '[7]', 'mysql')).toBe(
      'WHERE `col?` = 1 AND id = 7'
    );
  });
});

// 現状の挙動を固定するテスト（既知の制約。decisions.md [087] に記録）。
// 将来の改善時にここが赤くなれば「制約を解消した」シグナルになる。
describe('embedParams（既知の制約 / 現状固定）', () => {
  it("バックスラッシュエスケープ \\' は解釈せず無変換で返す（MySQL 既定の \\' は未対応）", () => {
    // 'can\'t' の \' を閉じクォートと誤認 → 後続が文字列扱いになり ? が飲み込まれ 0 件検出。
    expect(embedParams("WHERE note = 'can\\'t' AND id = ?", '[5]', 'mysql')).toBe(
      "WHERE note = 'can\\'t' AND id = ?"
    );
  });

  it('識別子内の $ 直後の数字を番号プレースホルダと誤検出する（col$1）', () => {
    // col$1 の $1 を番号指定と誤認 → ? と混在しエラーになる。
    expect(() => embedParams('SELECT col$1 FROM t WHERE id = ?', '[1]', 'mysql')).toThrow('混在');
  });

  it('パラメータ空欄は JSON 不正でなく未入力エラーにする', () => {
    expect(() => embedParams('WHERE id = ?', '', 'mysql')).toThrow('入力してください');
  });
});
