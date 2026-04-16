export type ToolCategory = 'generate' | 'convert';

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
}

export const tools: Tool[] = [
  {
    slug: 'url-encode',
    name: 'URLエンコード/デコード',
    description: 'テキストとURLエンコード形式を相互変換します',
    category: 'convert',
  },
  {
    slug: 'jwt-decoder',
    name: 'JWTデコーダー',
    description: 'JWTトークンのHeader・Payload・署名を分解表示します',
    category: 'convert',
  },
  {
    slug: 'ulid-generator',
    name: 'ULID生成',
    description: 'ULIDを一括生成します。タイムスタンプ表示付き',
    category: 'generate',
  },
  {
    slug: 'uuid-v7',
    name: 'UUID v7 生成',
    description: 'UUID v7を一括生成します。タイムスタンプ・フィールド分解表示付き',
    category: 'generate',
  },
  {
    slug: 'dummy-text',
    name: 'ダミーテキスト生成',
    description: '文字種と文字数を指定してダミーテキストを生成します',
    category: 'generate',
  },
  {
    slug: 'qr-code',
    name: 'QRコード生成',
    description: 'テキスト/URLからQRコード画像を生成します',
    category: 'generate',
  },
  {
    slug: 'jan-code',
    name: 'JANコード生成',
    description: '12桁からチェックディジットを計算してバーコードを生成します',
    category: 'generate',
  },
  {
    slug: 'gs1-databar',
    name: 'GS1 DataBar 生成',
    description: 'GTIN-14からGS1 DataBar Limited合成シンボルを生成します',
    category: 'generate',
  },
  {
    slug: 'base64',
    name: 'Base64 エンコード/デコード',
    description: 'テキストと Base64 を相互変換します。標準・URL-safe 両形式に対応',
    category: 'convert',
  },
  {
    slug: 'json-xml',
    name: 'JSON / XML 変換',
    description: 'JSONとXMLを相互変換します。ルートタグは root 固定',
    category: 'convert',
  },
  {
    slug: 'json-csv',
    name: 'JSON / CSV 変換',
    description: 'JSONとCSVを相互変換します。ネストオブジェクトはドット記法でフラット化',
    category: 'convert',
  },
];

export const categoryLabel: Record<ToolCategory, string> = {
  generate: '生成',
  convert: '変換・解析',
};
