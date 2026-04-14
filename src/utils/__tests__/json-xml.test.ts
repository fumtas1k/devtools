import { describe, it, expect } from 'vitest';
import { jsonToXml, xmlToJson } from '../json-xml';

describe('jsonToXml', () => {
  it('シンプルなオブジェクトをXMLに変換する', () => {
    const result = jsonToXml('{"name":"太郎","age":30}');
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<root>');
    expect(result).toContain('<name>太郎</name>');
    expect(result).toContain('<age>30</age>');
    expect(result).toContain('</root>');
  });

  it('ルートタグは常に root になる', () => {
    const result = jsonToXml('{"key":"value"}');
    expect(result).toContain('<root>');
  });

  it('@_プレフィックスのキーは属性として出力される', () => {
    const result = jsonToXml('{"item":{"@_id":"1","#text":"テスト"}}');
    expect(result).toContain('id="1"');
    expect(result).toContain('テスト');
  });

  it('不正なJSONでエラーを投げる', () => {
    expect(() => jsonToXml('{invalid}')).toThrow('有効なJSONではありません');
  });
});

describe('xmlToJson', () => {
  it('シンプルなXMLをJSONに変換する', () => {
    const xml = `<?xml version="1.0"?><user><name>太郎</name><age>30</age></user>`;
    const result = JSON.parse(xmlToJson(xml));
    expect(result.user.name).toBe('太郎');
    expect(result.user.age).toBe(30);
  });

  it('属性は@_プレフィックスで格納される', () => {
    const xml = `<items><item id="1">テスト</item></items>`;
    const result = JSON.parse(xmlToJson(xml));
    expect(result.items.item['@_id']).toBe(1);
  });

  it('整形済みJSON文字列を返す', () => {
    const xml = `<root><key>value</key></root>`;
    const result = xmlToJson(xml);
    expect(result).toContain('\n');
  });
});
