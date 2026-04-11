export type ToolCategory = 'generate' | 'convert';

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
}

export const tools: Tool[] = [
  {
    slug: 'url-encode',
    name: 'URLエンコード/デコード',
    description: 'テキストとURLエンコード形式を相互変換します',
    category: 'convert',
    icon: '🔗',
  },
  {
    slug: 'jwt-decoder',
    name: 'JWTデコーダー',
    description: 'JWTトークンのHeader・Payload・署名を分解表示します',
    category: 'convert',
    icon: '🔐',
  },
  {
    slug: 'ulid-generator',
    name: 'ULID生成',
    description: 'ULIDを一括生成します。タイムスタンプ表示付き',
    category: 'generate',
    icon: '🆔',
  },
  {
    slug: 'dummy-text',
    name: 'ダミーテキスト生成',
    description: '文字種と文字数を指定してダミーテキストを生成します',
    category: 'generate',
    icon: '📝',
  },
  {
    slug: 'qr-code',
    name: 'QRコード生成',
    description: 'テキスト/URLからQRコード画像を生成します',
    category: 'generate',
    icon: '📷',
  },
  {
    slug: 'jan-code',
    name: 'JANコード生成',
    description: '12桁からチェックディジットを計算してバーコードを生成します',
    category: 'generate',
    icon: '🏷️',
  },
];

export const categoryLabel: Record<ToolCategory, string> = {
  generate: '生成',
  convert: '変換・解析',
};

export const categoryColor: Record<ToolCategory, string> = {
  generate: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950',
  convert: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950',
};
