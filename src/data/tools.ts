export type ToolCategory = 'generate' | 'code' | 'encode' | 'convert';

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
  /** 並び替え用の読み仮名（ひらがな）。全体（index「すべて」/ about）＋ category 内の表示順を五十音順に駆動する */
  yomi: string;
}

// ソース上は追加順のまま（可読性維持）。表示順は末尾で yomi 五十音順にソートして export する
const toolEntries: Tool[] = [
  {
    slug: 'url-encode',
    name: 'URLエンコード/デコード',
    description: 'テキストとURLエンコード形式を相互変換します',
    category: 'encode',
    yomi: 'ゆーあーるえるえんこーど',
  },
  {
    slug: 'jwt-decoder',
    name: 'JWTデコーダー',
    description: 'JWTトークンのHeader・Payload・署名を分解表示します',
    category: 'encode',
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
    category: 'code',
    yomi: 'きゅーあーるこーどせいせい',
  },
  {
    slug: 'jan-code',
    name: 'JANコード生成',
    description: '12桁からチェックディジットを計算してバーコードを生成します',
    category: 'code',
    yomi: 'じゃんこーどせいせい',
  },
  {
    slug: 'gs1-databar',
    name: 'GS1 DataBar 生成',
    description: 'GTIN-14からGS1 DataBar Limited合成シンボルを生成します',
    category: 'code',
    yomi: 'じーえすわんでーたばーせいせい',
  },
  {
    slug: 'base64',
    name: 'Base64 エンコード/デコード',
    description: 'テキストと Base64 を相互変換します。標準・URL-safe 両形式に対応',
    category: 'encode',
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
    category: 'code',
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
    category: 'code',
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
  {
    slug: 'sql-formatter',
    name: 'SQL整形・パラメータ埋め込み',
    description:
      '汚いSQLを方言別に整形し、プレースホルダ（? / $n / :name）にJSONパラメータを埋め込みます。MySQL / PostgreSQL / SQLite / SQL Server 対応',
    category: 'convert',
    yomi: 'えすきゅーえるせいけい',
  },
  {
    slug: 'regex-visualizer',
    name: '正規表現ビジュアライザ＆ReDoS検出',
    description:
      '正規表現を構造ツリー・鉄道図で可視化し、ReDoS 脆弱性を検出。テスト文字列に対するマッチ箇所のハイライトとキャプチャグループ表示も行います',
    category: 'convert',
    yomi: 'せいきひょうげんびじゅあらいざ',
  },
  {
    slug: 'json-formatter',
    name: 'JSON整形・ビューア',
    description:
      'JSONを整形・最小化し、折りたたみツリーで閲覧します。構文エラーは行・列付きで表示。大きな数値の精度も保持し、データはブラウザ外に送信しません',
    category: 'convert',
    yomi: 'じぇいそんせいけい',
  },
  {
    slug: 'cidr-calculator',
    name: 'CIDR/サブネット計算機',
    description: 'ネットワーク情報・サブネット分割・重複検出を計算します。IPv4/IPv6 対応',
    category: 'convert',
    yomi: 'しーあいでぃーあーるさぶねっとけいさんき',
  },
  {
    slug: 'secret-scrubber',
    name: 'シークレットスクラバー',
    description:
      'ログ・コード・設定からAPIキー・トークン・メール・IP等の機密情報を検出して一括マスク。同一値は同一プレースホルダに置換',
    category: 'convert',
    yomi: 'しーくれっとすくらばー',
  },
];

// 表示順は yomi（読み仮名）の五十音順。category 内 filter でも相対順序が保たれる
export const tools: Tool[] = [...toolEntries].sort((a, b) => a.yomi.localeCompare(b.yomi, 'ja'));

export const categoryLabel: Record<ToolCategory, string> = {
  generate: '生成',
  code: 'コード・バーコード',
  encode: 'エンコード・デコード',
  convert: '変換・解析',
};

export const categories: ToolCategory[] = ['generate', 'code', 'encode', 'convert'];
