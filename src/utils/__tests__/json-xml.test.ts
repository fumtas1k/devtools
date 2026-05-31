import { XMLParser } from 'fast-xml-parser';
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

  it('processEntities を有効にした正の対照では内部実体が展開される', () => {
    // Positive control: this proves the entity-expansion path exists in fast-xml-parser.
    // If this test is removed, the security regression check below would no longer
    // demonstrate that the old behavior expands custom entities.
    const xml = `<!DOCTYPE note [<!ENTITY greeting "expanded">]><note><value>&greeting;</value></note>`;
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      processEntities: true,
    });

    const result = parser.parse(xml);

    expect(result.note.value).toBe('expanded');
  });

  it('xmlToJson は内部実体を展開しない', () => {
    const xml = `<!DOCTYPE note [<!ENTITY greeting "expanded">]><note><value>&greeting;</value></note>`;
    const result = JSON.parse(xmlToJson(xml));

    expect(result.note.value).toBe('&greeting;');
  });
});
