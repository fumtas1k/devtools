import type { Tool, ToolCategory } from '@/data/tools';

/**
 * カタカナをひらがなへ変換する。
 * 変換対象は U+30A1〜U+30F6（ァ〜ヶ）のみ。長音符「ー」(U+30FC) や
 * 中黒「・」などは共通記号のため変換せずそのまま残す。
 */
export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * 検索クエリ・検索対象文字列を比較可能な形へ正規化する。
 * 前後空白除去 + 小文字化 + カタカナ→ひらがな統一。
 * これにより「JSON」「json」「ジェイソン」「じぇいそん」が同一視される。
 */
export function normalizeQuery(s: string): string {
  return kataToHira(s.trim().toLowerCase());
}

/**
 * ツール 1 件の検索対象文字列（haystack）を組み立てる。
 * 名前・説明・slug・読み仮名・カテゴリ名を連結し、クエリと同じ正規化を適用する。
 * ビルド時に算出して DOM の data 属性へ載せ、実行時は includes() でマッチさせる。
 */
export function buildSearchText(tool: Tool, categoryLabel: Record<ToolCategory, string>): string {
  return normalizeQuery(
    [tool.name, tool.description, tool.slug, tool.yomi, categoryLabel[tool.category]].join(' ')
  );
}

/**
 * クエリを正規化し、空白で分割したトークン配列を返す（空トークンは除外）。
 * 複数語クエリ（例: 「json csv」）を AND マッチさせるための前処理。
 */
export function queryTokens(query: string): string[] {
  return normalizeQuery(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * haystack（buildSearchText 済みの検索対象文字列）が全トークンを含むか判定する。
 * 全トークン AND マッチ。空クエリ（トークン 0 件）は常に false。
 */
export function matchesSearchText(searchText: string, query: string): boolean {
  const tokens = queryTokens(query);
  return tokens.length > 0 && tokens.every((token) => searchText.includes(token));
}
