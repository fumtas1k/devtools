export type ToolCategory = 'generate' | 'convert';

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
  /** 並び替え用の読み仮名（ひらがな）。category 内を五十音順にソートするのに使う */
  yomi: string;
}

// ソース上は追加順のまま（可読性維持）。表示順は末尾で yomi 五十音順にソートして export する
const toolEntries: Tool[] = [
  {
    slug: 'url-encode',
    name: 'URLエンコード/デコード',
    description: 'テキストとURLエンコード形式を相互変換します',
    category: 'convert',
    yomi: 'ゆーあーるえるえんこーど',
  },
  {
    slug: 'jwt-decoder',
    name: 'JWTデコーダー',
    description: 'JWTトークンのHeader・Payload・署名を分解表示します',
    category: 'convert',
    yomi: 'じょっとでこーだー',
  },
  {
    slug: 'ulid-generator',
    name: 'ULID生成',
    description: 'ULIDを一括生成します。タイムスタンプ表示付き',
    category: 'generate',
    yomi: 'ゆーえるあいでぃーせいせい',
  },
  {
    slug: 'uuid-v7',
    name: 'UUID v7 生成',
    description: 'UUID v7を一括生成します。タイムスタンプ・フィールド分解表示付き',
    category: 'generate',
    yomi: 'ゆーゆーあいでぃーせいせい',
  },
  {
    slug: 'dummy-text',
    name: 'ダミーテキスト生成',
    description: '文字種と文字数を指定してダミーテキストを生成します',
    category: 'generate',
    yomi: 'だみーてきすとせいせい',
  },
  {
    slug: 'qr-code',
    name: 'QRコード生成',
    description: 'テキスト/URLからQRコード画像を生成します',
    category: 'generate',
    yomi: 'きゅーあーるこーどせいせい',
  },
  {
    slug: 'jan-code',
    name: 'JANコード生成',
    description: '12桁からチェックディジットを計算してバーコードを生成します',
    category: 'generate',
    yomi: 'じゃんこーどせいせい',
  },
  {
    slug: 'gs1-databar',
    name: 'GS1 DataBar 生成',
    description: 'GTIN-14からGS1 DataBar Limited合成シンボルを生成します',
    category: 'generate',
    yomi: 'じーえすわんでーたばーせいせい',
  },
  {
    slug: 'base64',
    name: 'Base64 エンコード/デコード',
    description: 'テキストと Base64 を相互変換します。標準・URL-safe 両形式に対応',
    category: 'convert',
    yomi: 'べーすろくじゅうよんえんこーど',
  },
  {
    slug: 'json-xml',
    name: 'JSON / XML 変換',
    description: 'JSONとXMLを相互変換します。ルートタグは root 固定',
    category: 'convert',
    yomi: 'じぇいそんえっくすえむえるへんかん',
  },
  {
    slug: 'json-csv',
    name: 'JSON / CSV 変換',
    description: 'JSONとCSVを相互変換します。ネストオブジェクトはドット記法でフラット化',
    category: 'convert',
    yomi: 'じぇいそんしーえすぶいへんかん',
  },
  {
    slug: 'encoding-converter',
    name: '文字コード判定・変換',
    description:
      'ファイルやテキストの文字コードを自動判定し、UTF-8・Shift_JIS・EUC-JP 等へ変換します',
    category: 'convert',
    yomi: 'もじこーどはんていへんかん',
  },
  {
    slug: 'qr-ticket',
    name: 'QRチケット',
    description: 'ECDSA署名付きQRチケットを生成し、公開鍵でオフライン検証します',
    category: 'generate',
    yomi: 'きゅーあーるちけっと',
  },
  {
    slug: 'config-converter',
    name: '設定ファイル相互変換',
    description: 'YAML・JSON・TOML・.env を相互変換します。コメント保持・JSON Schema 検証対応',
    category: 'convert',
    yomi: 'せっていふぁいるそうごへんかん',
  },
  {
    slug: 'qr-reader',
    name: 'QRリーダー',
    description: 'カメラまたは画像ファイルからQRコードを読み取り、テキストを表示します',
    category: 'convert',
    yomi: 'きゅーあーるりーだー',
  },
  {
    slug: 'char-count',
    name: '文字カウント',
    description:
      '文字数・エンコーディング互換性・行数・SNS文字数制限・原稿枚数を集計します。絵文字のDBエラー予測に対応',
    category: 'convert',
    yomi: 'もじかうんと',
  },
  {
    slug: 'totp-hotp',
    name: 'TOTP/HOTP ジェネレータ',
    description:
      'TOTP（RFC 6238）・HOTP（RFC 4226）のワンタイムコードを生成・検証します。シークレット鍵はブラウザ外に送信しません',
    category: 'generate',
    yomi: 'てぃーおーてぃーぴーじぇねれーた',
  },
];

// 表示順は yomi（読み仮名）の五十音順。category 内 filter でも相対順序が保たれる
export const tools: Tool[] = [...toolEntries].sort((a, b) => a.yomi.localeCompare(b.yomi, 'ja'));

export const categoryLabel: Record<ToolCategory, string> = {
  generate: '生成',
  convert: '変換・解析',
};

export const categories: ToolCategory[] = ['generate', 'convert'];
