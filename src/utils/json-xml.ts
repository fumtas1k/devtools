import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
};

const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  indentBy: '  ',
};

/** JSON文字列 → XML文字列。失敗時は Error を投げる */
export function jsonToXml(jsonStr: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('有効なJSONではありません');
  }

  const builder = new XMLBuilder(BUILDER_OPTIONS);
  const xml: string = builder.build({ root: parsed });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

/** XML文字列 → JSON文字列（整形済み）。失敗時は Error を投げる */
export function xmlToJson(xmlStr: string): string {
  const parser = new XMLParser(PARSER_OPTIONS);
  let result: unknown;
  try {
    result = parser.parse(xmlStr);
  } catch {
    throw new Error('有効なXMLではありません');
  }
  return JSON.stringify(result, null, 2);
}
