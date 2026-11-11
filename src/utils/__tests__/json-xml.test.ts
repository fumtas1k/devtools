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

  it('特殊文字を含む値は round-trip で保持される', () => {
    const input = {
      text: `A & B < C > D "quote" 'apostrophe'`,
    };

    const xml = jsonToXml(JSON.stringify(input));
    const result = JSON.parse(xmlToJson(xml));

    expect(result.root.text).toBe(input.text);
  });

  it('不正なJSONでエラーを投げる', () => {
    expect(() => jsonToXml('{invalid}')).toThrow('有効なJSONではありません');
  });
});

describe('xmlToJson', () => {
  it('stopNodes を指定しない製品設定では入れ子をオブジェクトに変換する', () => {
    const xml = '<root><raw><child id="1">value</child></raw></root>';

    expect(JSON.parse(xmlToJson(xml))).toEqual({
      root: { raw: { child: { '#text': 'value', '@_id': 1 } } },
    });
  });

  it('stopNodes を指定した陽性対照では入れ子が生の文字列になる', () => {
    const xml = '<root><raw><child id="1">value</child></raw></root>';
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      processEntities: false,
      stopNodes: ['root.raw'],
    });

    expect(parser.parse(xml)).toEqual({ root: { raw: '<child id="1">value</child>' } });
  });

  it('数値・真偽値・名前空間・Unicode の既存変換を保持する', () => {
    const xml =
      '<r i="001" f="1.25" b="true" n="9007199254740993" e="1e3">' +
      '<a>001</a><b>1.25</b><c>true</c><d>9007199254740993</d><e>1e3</e>' +
      '<ns:item ns:id="42">日本語</ns:item></r>';

    expect(JSON.parse(xmlToJson(xml))).toEqual({
      r: {
        a: 1,
        b: 1.25,
        c: true,
        d: '9007199254740993',
        e: 1000,
        'ns:item': { '#text': '日本語', '@_ns:id': 42 },
        '@_i': 1,
        '@_f': 1.25,
        '@_b': true,
        '@_n': '9007199254740993',
        '@_e': 1000,
      },
    });
  });

  it('先行ゼロ付きの指数表記を本文と属性の両方で数値に変換する', () => {
    const xml = '<root><value n="00.e0">000.e5</value></root>';

    expect(JSON.parse(xmlToJson(xml))).toEqual({
      root: { value: { '#text': 0, '@_n': 0 } },
    });
  });

  it('途中で切れた入力の既存の結果とエラーを保持する', () => {
    expect(JSON.parse(xmlToJson('<root><a>unfinished'))).toEqual({ root: { a: '' } });
    expect(() => xmlToJson('<root><a x="unfinished')).toThrow('有効なXMLではありません');
  });

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

  it('定義済みXML実体と数値文字参照は復元される', () => {
    const xml = `<root><value>&amp;&lt;&gt;&quot;&apos;&#65;&#x41;</value></root>`;
    const result = JSON.parse(xmlToJson(xml));

    expect(result.root.value).toBe(`&<>"'AA`);
  });

  it('範囲外の数値文字参照は literal のまま保持される', () => {
    const xml = `<root><value>&#x110000;</value></root>`;
    const result = JSON.parse(xmlToJson(xml));

    expect(result.root.value).toBe('&#x110000;');
  });
});
