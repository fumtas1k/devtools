/**
 * HAR 構造的 redact のカテゴリ定義と機密フィールド名辞書。
 * scrubText（自由テキスト走査）とは独立した、フィールド名ベースの確実な redact 用。
 */

export type HarRedactCategory =
  | 'COOKIE' // request/response の cookies[] と Cookie/Set-Cookie ヘッダ
  | 'AUTH_HEADER' // Authorization 等の認証ヘッダ
  | 'QUERY' // 機密クエリパラメータ
  | 'BODY' // postData（params 機密名 + text への scrubText）
  | 'BODY_SCAN'; // レスポンスボディ等への scrubText 適用

export const HAR_REDACT_CATEGORIES: HarRedactCategory[] = [
  'COOKIE',
  'AUTH_HEADER',
  'QUERY',
  'BODY',
  'BODY_SCAN',
];

export const HAR_REDACT_LABEL: Record<HarRedactCategory, string> = {
  COOKIE: 'Cookie',
  AUTH_HEADER: '認証ヘッダ',
  QUERY: '機密クエリ',
  BODY: 'POSTボディ',
  BODY_SCAN: '本文スキャン',
};

export const HAR_REDACT_DEFAULT: Record<HarRedactCategory, boolean> = {
  COOKIE: true,
  AUTH_HEADER: true,
  QUERY: true,
  BODY: true,
  BODY_SCAN: true,
};

export function emptyRedactCounts(): Record<HarRedactCategory, number> {
  return Object.fromEntries(HAR_REDACT_CATEGORIES.map((c) => [c, 0])) as Record<
    HarRedactCategory,
    number
  >;
}

/** Cookie を運ぶヘッダ名（小文字比較）。COOKIE カテゴリで redact する。 */
export const COOKIE_HEADER_NAMES = new Set(['cookie', 'set-cookie']);

/** 認証系ヘッダ名（小文字比較）。AUTH_HEADER カテゴリで redact する。 */
export const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
]);

/**
 * 値に URL を運ぶヘッダ名（小文字比較）。QUERY カテゴリで URL と同じ redact 処理に通す。
 * Referer / Origin はリクエスト URL（クエリ込み）を、Location / Content-Location は
 * レスポンスのリダイレクト先 URL を運ぶため、URL 内の basic-auth・機密クエリが残存しうる。
 */
export const URL_HEADER_NAMES = new Set([
  'referer',
  'referrer',
  'origin',
  'location',
  'content-location',
]);

/** 機密クエリ/POST パラメータ名（小文字比較）。QUERY / BODY カテゴリで redact する。 */
export const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'client_secret',
  'sig',
  'signature',
  'password',
  'passwd',
  'pwd',
  'code',
]);
