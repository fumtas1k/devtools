/**
 * HAR を構造的に redact し、scrubText で本文の取りこぼしを拾うサニタイザ。
 * 純関数・入力非破壊（structuredClone でコピーしてから処理する）。
 *
 * 一貫トークン化: カテゴリ × 値 → [REDACTED:<CAT>_<n>]。同一値は同一プレースホルダ。
 */
import type { Har, HarNameValue } from './types';
import {
  type HarRedactCategory,
  COOKIE_HEADER_NAMES,
  AUTH_HEADER_NAMES,
  URL_HEADER_NAMES,
  SENSITIVE_PARAM_NAMES,
  emptyRedactCounts,
} from './rules';
// 相対 import で統一する理由: このモジュールは Web Worker（harSanitizer.worker.ts）の
// 依存グラフに含まれる。Vite の worker Rollup サブビルドには tsconfig paths / `@/` エイリアス
// が伝播せず、`@/utils/...` 形式だと worker ビルドが解決に失敗する（issue #677）。
import { scrubText } from '../secret-scrubber/scrub';
import { DEFAULT_ENABLED } from '../secret-scrubber/rules';
import { makeUrlCredentialRegex } from '../secret-scrubber/url-credential';

export interface SanitizeResult {
  har: Har;
  counts: Record<HarRedactCategory, number>;
}

/** 一貫トークン発行器。カテゴリ別カウンタと値→トークンの Map を保持する。 */
function makeTokenizer(counts: Record<HarRedactCategory, number>) {
  const map = new Map<string, string>();
  const counter: Partial<Record<HarRedactCategory, number>> = {};
  return (category: HarRedactCategory, value: string): string => {
    const key = `${category}:${value}`;
    let token = map.get(key);
    if (!token) {
      const n = (counter[category] ?? 0) + 1;
      counter[category] = n;
      token = `[REDACTED:${category}_${n}]`;
      map.set(key, token);
    }
    counts[category]++;
    return token;
  };
}

/**
 * `name=value` 形式（Cookie ヘッダ "a=1; b=2" / クエリ文字列）の value 部のみを
 * 指定 names にマッチするとき redact する。COOKIE ヘッダは全 value を redact する。
 */
function redactPairString(
  raw: string,
  pairSep: string,
  redactAll: boolean,
  names: Set<string>,
  category: HarRedactCategory,
  tokenize: (c: HarRedactCategory, v: string) => string
): string {
  return raw
    .split(pairSep)
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq).trim().toLowerCase();
      const before = pair.slice(0, eq + 1);
      const value = pair.slice(eq + 1);
      if (redactAll || names.has(name)) {
        return before + tokenize(category, value);
      }
      return pair;
    })
    .join(pairSep);
}

/** request.url の basic-auth と機密クエリパラメータを redact する。 */
function redactUrl(
  url: string,
  enabled: Record<HarRedactCategory, boolean>,
  tokenize: (c: HarRedactCategory, v: string) => string
): string {
  let result = url;

  // basic-auth: scheme://user:pass@host → pass を redact（QUERY 扱いで件数計上）。
  // 共有ビルダーで scrub.ts の CREDENTIAL_URL と一本化。HAR の URL フィールドは
  // protocol-relative も正当なため requireScheme: false。
  if (enabled.QUERY) {
    result = result.replace(
      makeUrlCredentialRegex({ flags: 'g', requireScheme: false }),
      (_m, pre, pass, post) => pre + tokenize('QUERY', pass) + post
    );
  }

  if (enabled.QUERY) {
    const qIndex = result.indexOf('?');
    if (qIndex !== -1) {
      const base = result.slice(0, qIndex + 1);
      const queryPart = result.slice(qIndex + 1);
      const hashIndex = queryPart.indexOf('#');
      const query = hashIndex !== -1 ? queryPart.slice(0, hashIndex) : queryPart;
      const hash = hashIndex !== -1 ? queryPart.slice(hashIndex) : '';
      const newQuery = redactPairString(
        query,
        '&',
        false,
        SENSITIVE_PARAM_NAMES,
        'QUERY',
        tokenize
      );
      result = base + newQuery + hash;
    }
  }
  return result;
}

/**
 * value に scrubText を適用し、findings 件数を counts[category] に加算して
 * redact 済み文字列を返す（findings が無ければ原文を返す）。
 */
function scrubInto(
  value: string,
  counts: Record<HarRedactCategory, number>,
  category: HarRedactCategory
): string {
  const r = scrubText(value, DEFAULT_ENABLED);
  if (r.findings.length > 0) {
    counts[category] += r.findings.length;
    return r.output;
  }
  return value;
}

function redactHeaders(
  headers: HarNameValue[],
  enabled: Record<HarRedactCategory, boolean>,
  counts: Record<HarRedactCategory, number>,
  tokenize: (c: HarRedactCategory, v: string) => string
): void {
  for (const h of headers) {
    if (!h || typeof h.name !== 'string' || typeof h.value !== 'string') continue;
    const lower = h.name.toLowerCase();
    if (enabled.COOKIE && COOKIE_HEADER_NAMES.has(lower)) {
      // Cookie ヘッダは "a=1; b=2" を value だけ redact、Set-Cookie は全体 redact
      if (lower === 'cookie') {
        h.value = redactPairString(h.value, ';', true, COOKIE_HEADER_NAMES, 'COOKIE', tokenize);
      } else {
        h.value = tokenize('COOKIE', h.value);
      }
    } else if (enabled.AUTH_HEADER && AUTH_HEADER_NAMES.has(lower)) {
      h.value = tokenize('AUTH_HEADER', h.value);
    } else if (enabled.QUERY && URL_HEADER_NAMES.has(lower)) {
      // Referer / Origin / Location 等は URL を運ぶため URL と同じ redact を適用する。
      // （URL のクエリだけ redact しても同じ秘密値がこれらのヘッダに残るのを防ぐ）
      h.value = redactUrl(h.value, enabled, tokenize);
    } else if (enabled.AUTH_HEADER) {
      // 辞書外ヘッダ値に含まれる機密（JWT / API キー等）を scrubText で拾う。
      // 認証ヘッダトグルの意味的拡張（ヘッダ値の機密走査）として AUTH_HEADER で計上。
      h.value = scrubInto(h.value, counts, 'AUTH_HEADER');
    }
  }
}

export function sanitizeHar(
  input: Har,
  enabled: Record<HarRedactCategory, boolean>,
  /**
   * 進捗コールバック。処理済みエントリ数を一定間隔で通知する。
   * Web Worker から呼び、メインスレッドに進捗バーを表示するために使う。
   * 純粋な計算には影響しない（省略可）。
   */
  onProgress?: (processed: number) => void
): SanitizeResult {
  const har: Har = structuredClone(input);
  const counts = emptyRedactCounts();
  const tokenize = makeTokenizer(counts);

  // 進捗通知の間隔（エントリ数）。細かすぎると postMessage が増えてかえって遅くなる。
  const PROGRESS_INTERVAL = 100;
  let processed = 0;

  // entries が配列でも各要素が壊れている（request/response 欠落・型不正）ことは
  // 手編集・切り詰めた HAR で起こりうる。Web Worker 内で走るため例外で worker が
  // 落ちないよう、各 entry を防御的に扱う。
  for (const entry of har.log.entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const request = entry.request;
    const response = entry.response;

    // ── リクエスト ──
    if (typeof request === 'object' && request !== null) {
      // ヘッダ
      if (Array.isArray(request.headers)) redactHeaders(request.headers, enabled, counts, tokenize);

      // Cookie 配列
      if (enabled.COOKIE && Array.isArray(request.cookies)) {
        for (const c of request.cookies) {
          if (c && typeof c.value === 'string') c.value = tokenize('COOKIE', c.value);
        }
      }

      // クエリ（配列）
      if (enabled.QUERY && Array.isArray(request.queryString)) {
        for (const q of request.queryString) {
          if (
            q &&
            typeof q.value === 'string' &&
            SENSITIVE_PARAM_NAMES.has(q.name?.toLowerCase())
          ) {
            q.value = tokenize('QUERY', q.value);
          }
        }
      }

      // URL
      if (typeof request.url === 'string') {
        request.url = redactUrl(request.url, enabled, tokenize);
      }

      // POST ボディ
      if (enabled.BODY && request.postData && typeof request.postData === 'object') {
        if (Array.isArray(request.postData.params)) {
          for (const p of request.postData.params) {
            if (
              p &&
              typeof p.value === 'string' &&
              SENSITIVE_PARAM_NAMES.has(p.name?.toLowerCase())
            ) {
              p.value = tokenize('BODY', p.value);
            }
          }
        }
        if (typeof request.postData.text === 'string') {
          request.postData.text = scrubInto(request.postData.text, counts, 'BODY');
        }
      }
    }

    // ── レスポンス ──
    if (typeof response === 'object' && response !== null) {
      if (Array.isArray(response.headers)) redactHeaders(response.headers, enabled, counts, tokenize);

      if (enabled.COOKIE && Array.isArray(response.cookies)) {
        for (const c of response.cookies) {
          if (c && typeof c.value === 'string') c.value = tokenize('COOKIE', c.value);
        }
      }

      // レスポンスボディスキャン。
      // base64 エンコードされた本文は scrubText にかけない:
      //  - 秘密は base64 文字列内にありパターン検出が効かない（false confidence）。
      //  - HIGH_ENTROPY_BASE64 ルールが base64 ブロック自体にマッチし、本文を破壊して
      //    デコード不能な HAR を出力してしまう。
      // よって encoding === 'base64' のときはスキップし、本文を素通しで保持する。
      const content = response.content;
      if (
        enabled.BODY_SCAN &&
        content &&
        typeof content === 'object' &&
        typeof content.text === 'string' &&
        content.encoding !== 'base64'
      ) {
        content.text = scrubInto(content.text, counts, 'BODY_SCAN');
      }
    }

    processed++;
    if (onProgress && processed % PROGRESS_INTERVAL === 0) {
      onProgress(processed);
    }
  }

  // 端数（最後の PROGRESS_INTERVAL に満たない分）を最終通知する。
  // 総数が INTERVAL の倍数のときはループ内で同値を通知済みのため重複させない。
  // ただし 0 件のときは進捗 0 を 1 度だけ通知する。
  if (onProgress && (processed === 0 || processed % PROGRESS_INTERVAL !== 0)) {
    onProgress(processed);
  }

  return { har, counts };
}
