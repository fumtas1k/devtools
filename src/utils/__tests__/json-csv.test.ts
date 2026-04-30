import { describe, it, expect } from 'vitest';
import { jsonToCsv, csvToJson } from '../json-csv';

describe('jsonToCsv', () => {
  it('フラットなオブジェクト配列をCSVに変換する', () => {
    const json = '[{"id":1,"name":"太郎"},{"id":2,"name":"花子"}]';
    const result = jsonToCsv(json);
    const lines = result.split(/\r?\n/);
    expect(lines[0]).toBe('id,name');
    expect(lines[1]).toContain('1');
    expect(lines[1]).toContain('太郎');
  });

  it('ネストオブジェクトをドット記法でフラット化する', () => {
    const json = '[{"name":"太郎","address":{"city":"東京","zip":"100-0001"}}]';
    const result = jsonToCsv(json);
    expect(result).toContain('address.city');
    expect(result).toContain('address.zip');
    expect(result).toContain('東京');
  });

  it('配列値はJSON文字列としてシリアライズする', () => {
    const json = '[{"tags":["a","b","c"]}]';
    const result = jsonToCsv(json);
    expect(result).toContain('tags');
    // CSVではダブルクォートが""にエスケープされる
    expect(result).toContain('""a""');
  });

  it('単一オブジェクトも1行として変換する', () => {
    const json = '{"id":1,"name":"太郎"}';
    const result = jsonToCsv(json);
    const lines = result.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('id,name');
  });

  it('空配列は空文字を返す', () => {
    expect(jsonToCsv('[]')).toBe('');
  });

  it('不正なJSONでエラーを投げる', () => {
    expect(() => jsonToCsv('{invalid}')).toThrow('有効なJSONではありません');
  });

  it('配列でもオブジェクトでもない入力でエラーを投げる', () => {
    expect(() => jsonToCsv('"just a string"')).toThrow(
      'オブジェクトまたはオブジェクトの配列を入力してください'
    );
  });

  describe('CSVフォーミュラインジェクション対策', () => {
    it('= で始まる文字列セルはシングルクォートでエスケープされる', () => {
      const json = '[{"formula":"=SUM(A1:A10)"}]';
      const result = jsonToCsv(json);
      // 先頭にシングルクォートが付加され、Excel が数式として解釈しない
      expect(result).toContain(`'=SUM(A1:A10)`);
      // エスケープ前の生 `=SUM` が行頭にあるとエクセルで数式実行される
      expect(result).not.toMatch(/^formula\r?\n=SUM/);
    });

    it('+ で始まる文字列セルはエスケープされる', () => {
      const json = '[{"v":"+1+1"}]';
      const result = jsonToCsv(json);
      expect(result).toContain(`'+1+1`);
    });

    it('- で始まる文字列セルはエスケープされる', () => {
      const json = '[{"v":"-1+2"}]';
      const result = jsonToCsv(json);
      expect(result).toContain(`'-1+2`);
    });

    it('@ で始まる文字列セルはエスケープされる', () => {
      const json = '[{"v":"@SUM(1,2)"}]';
      const result = jsonToCsv(json);
      expect(result).toContain(`'@SUM(1,2)`);
    });

    it('タブ文字で始まる文字列セルはエスケープされる', () => {
      const json = '[{"v":"\\tHello"}]';
      const result = jsonToCsv(json);
      expect(result).toContain(`'\tHello`);
    });

    it('CR で始まる文字列セルはエスケープされる', () => {
      const json = '[{"v":"\\rOK"}]';
      const result = jsonToCsv(json);
      expect(result).toContain(`'\rOK`);
    });

    it('通常の文字列はエスケープされない', () => {
      const json = '[{"name":"太郎","msg":"hello"}]';
      const result = jsonToCsv(json);
      expect(result).toContain('太郎');
      expect(result).toContain('hello');
      expect(result).not.toContain(`'太郎`);
      expect(result).not.toContain(`'hello`);
    });

    it('数値・真偽値・null は影響を受けない', () => {
      const json = '[{"n":42,"b":true,"x":null}]';
      const result = jsonToCsv(json);
      const lines = result.split(/\r?\n/);
      expect(lines[0]).toBe('n,b,x');
      // 値はそのまま、シングルクォートは付かない
      expect(lines[1]).toBe('42,true,');
    });

    it('配列値は JSON 文字列化されるため先頭が [ になりエスケープされない', () => {
      // 配列の中身が = で始まっても、JSON.stringify でラップされた結果は ["=..."] となるため対象外
      const json = '[{"tags":["=evil","ok"]}]';
      const result = jsonToCsv(json);
      // 先頭が [ なのでシングルクォートは前置されない（JSON.stringify 経由）
      expect(result).not.toMatch(/'\[/);
      // CSV 出力では JSON 文字列がダブルクォート二重化されてセル化される
      expect(result).toContain('[""=evil""');
    });

    it('ネストオブジェクト内の危険値もエスケープされる', () => {
      const json = '[{"u":{"name":"=cmd|\' /C calc\'!A1"}}]';
      const result = jsonToCsv(json);
      expect(result).toContain('u.name');
      expect(result).toMatch(/'=cmd/);
    });
  });
});

describe('csvToJson', () => {
  it('ヘッダー付きCSVをオブジェクト配列に変換する', () => {
    const csv = 'id,name\n1,太郎\n2,花子';
    const result = JSON.parse(csvToJson(csv));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, name: '太郎' });
    expect(result[1]).toEqual({ id: 2, name: '花子' });
  });

  it('数値は自動型変換される', () => {
    const csv = 'value\n42\n3.14';
    const result = JSON.parse(csvToJson(csv));
    expect(result[0].value).toBe(42);
    expect(result[1].value).toBe(3.14);
  });

  it('真偽値は自動型変換される', () => {
    const csv = 'flag\ntrue\nfalse';
    const result = JSON.parse(csvToJson(csv));
    expect(result[0].flag).toBe(true);
    expect(result[1].flag).toBe(false);
  });

  it('整形済みJSON文字列を返す', () => {
    const csv = 'id\n1';
    const result = csvToJson(csv);
    expect(result).toContain('\n');
  });
});
