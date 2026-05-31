import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  processEntities: false,
};

const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  indentBy: '  ',
};

const PREDEFINED_XML_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

function decodeXmlEntity(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (entity) => {
    const namedEntity = entity.slice(1, -1);

    if (PREDEFINED_XML_ENTITIES.has(namedEntity)) {
      return PREDEFINED_XML_ENTITIES.get(namedEntity) ?? entity;
    }

    if (namedEntity.startsWith('#x')) {
      const codePoint = Number.parseInt(namedEntity.slice(2), 16);
      return Number.isNaN(codePoint) || codePoint > 0x10ffff
        ? entity
        : String.fromCodePoint(codePoint);
    }

    if (namedEntity.startsWith('#')) {
      const codePoint = Number.parseInt(namedEntity.slice(1), 10);
      return Number.isNaN(codePoint) || codePoint > 0x10ffff
        ? entity
        : String.fromCodePoint(codePoint);
    }

    return entity;
  });
}

function restoreXmlEntities(value: unknown): unknown {
  if (typeof value === 'string') {
    return decodeXmlEntity(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => restoreXmlEntities(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, restoreXmlEntities(child)])
    );
  }

  return value;
}

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
  return JSON.stringify(restoreXmlEntities(result), null, 2);
}
