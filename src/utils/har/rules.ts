/**
 * HAR 構造的 redact のカテゴリ定義と機密フィールド名辞書。
 * scrubText（自由テキスト走査）とは独立した、フィールド名ベースの確実な redact 用。
 */

export type HarRedactCategory =
  | 'COOKIE' // request/response の cookies[] と Cookie/Set-Cookie ヘッダ
  | 'AUTH_HEADER' // Authorization 等の認証ヘッダ辞書（AUTH_HEADER_NAMES）に一致するヘッダ値のトークン化
  | 'QUERY' // 機密クエリパラメータ辞書（SENSITIVE_PARAM_NAMES）一致 + URL basic-auth の構造的 redact
  | 'BODY' // postData（params 機密名 + text への scrubText）
  | 'BODY_SCAN' // レスポンスボディ等への scrubText 適用
  | 'HEADER_SCAN' // 辞書外ヘッダ値への scrubText 自由走査（#694: AUTH_HEADER から分離）
  | 'PATH_SCAN'; // URL パス以降（path/query/fragment）への scrubText 自由走査（#694: QUERY から分離）

export const HAR_REDACT_CATEGORIES: HarRedactCategory[] = [
  'COOKIE',
  'AUTH_HEADER',
  'QUERY',
  'BODY',
  'BODY_SCAN',
  'HEADER_SCAN',
  'PATH_SCAN',
];

export const HAR_REDACT_LABEL: Record<HarRedactCategory, string> = {
  COOKIE: 'Cookie',
  AUTH_HEADER: '認証ヘッダ',
  QUERY: '機密クエリ',
  BODY: 'POSTボディ',
  BODY_SCAN: '本文スキャン',
  HEADER_SCAN: 'ヘッダ走査',
  PATH_SCAN: 'URL走査',
};

export const HAR_REDACT_DEFAULT: Record<HarRedactCategory, boolean> = {
  COOKIE: true,
  AUTH_HEADER: true,
  QUERY: true,
  BODY: true,
  BODY_SCAN: true,
  HEADER_SCAN: true,
  PATH_SCAN: true,
};

export function emptyRedactCounts(): Record<HarRedactCategory, number> {
  return Object.fromEntries(HAR_REDACT_CATEGORIES.map((c) => [c, 0])) as Record<
    HarRedactCategory,
    number
  >;
}

/** Cookie を運ぶヘッダ名（小文字比較）。COOKIE カテゴリで redact する。 */
export const COOKIE_HEADER_NAMES = new Set(['cookie', 'set-cookie', 'cookie2', 'set-cookie2']);

/** 認証系ヘッダ名（小文字比較）。AUTH_HEADER カテゴリで redact する。 */
export const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
  'x-amz-credential',
  'x-session-token',
  'x-access-token',
  'x-refresh-token',
  'x-functions-key',
  'www-authenticate',
  'proxy-authenticate',
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
  'next',
  'redirect',
  'continue',
  'return_to',
  'assertion',
  'saml_response',
  'jwt',
  'auth',
  'session_state',
]);

/** `_` と `-` を取り除く（camelCase / kebab-case / snake_case を同一視するための正規化）。 */
function stripSeparators(s: string): string {
  return s.replace(/[_-]/g, '');
}

/** SENSITIVE_PARAM_NAMES を区切り文字なしに正規化した辞書。モジュール初期化時に 1 度だけ作る。 */
const SENSITIVE_PARAM_NAMES_COMPACT = new Set([...SENSITIVE_PARAM_NAMES].map(stripSeparators));

/**
 * percent-decode する。不正なエンコード（`%zz` 等）なら例外を握りつぶさず null を返す。
 * 戻り値を必ず使う形にしてあるのは、戻り値を捨てた decodeURIComponent が本番ビルドの
 * minifier に副作用なしとみなされて削除されるのを避けるため。
 */
function tryDecodeURIComponent(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/**
 * パラメータ名が機密名かを判定する（クエリ / queryString[] / postData.params[] / form・JSON 本文で共用）。
 * - `+` を空白、percent-encoding を復号してから照合する（`%74oken` / `access%5Ftoken` 対策）。
 *   復号に失敗した名前は復号前の文字列で照合する。
 * - 辞書と一致しなければ `_` `-` を除いた形でも照合する（`accessToken` / `clientSecret` /
 *   `returnTo` 等の camelCase 対策）。
 */
export function isSensitiveParamName(rawName: unknown): boolean {
  if (typeof rawName !== 'string') return false;
  const plusAsSpace = rawName.replace(/\+/g, ' ');
  const decoded = tryDecodeURIComponent(plusAsSpace);
  const name = (decoded === null ? plusAsSpace : decoded).trim().toLowerCase();
  if (SENSITIVE_PARAM_NAMES.has(name)) return true;
  return SENSITIVE_PARAM_NAMES_COMPACT.has(stripSeparators(name));
}
