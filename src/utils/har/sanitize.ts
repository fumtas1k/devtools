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
  SENSITIVE_PARAM_NAMES,
  emptyRedactCounts,
} from './rules';
import { scrubText } from '@/utils/secret-scrubber/scrub';
import { DEFAULT_ENABLED } from '@/utils/secret-scrubber/rules';

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

  // basic-auth: scheme://user:pass@host → pass を redact（QUERY 扱いで件数計上）
  if (enabled.QUERY) {
    result = result.replace(/(:\/\/[^/@:]+:)([^@]+)(@)/, (_m, pre, pass, post) => {
      return pre + tokenize('QUERY', pass) + post;
    });
  }

  if (enabled.QUERY) {
    const qIndex = result.indexOf('?');
    if (qIndex !== -1) {
      const base = result.slice(0, qIndex + 1);
      const queryPart = result.slice(qIndex + 1);
      const hashIndex = queryPart.indexOf('#');
      const query = hashIndex !== -1 ? queryPart.slice(0, hashIndex) : queryPart;
      const hash = hashIndex !== -1 ? queryPart.slice(hashIndex) : '';
      const newQuery = redactPairString(query, '&', false, SENSITIVE_PARAM_NAMES, 'QUERY', tokenize);
      result = base + newQuery + hash;
    }
  }
  return result;
}

function redactHeaders(
  headers: HarNameValue[],
  enabled: Record<HarRedactCategory, boolean>,
  tokenize: (c: HarRedactCategory, v: string) => string
): void {
  for (const h of headers) {
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
    }
  }
}

export function sanitizeHar(input: Har, enabled: Record<HarRedactCategory, boolean>): SanitizeResult {
  const har: Har = structuredClone(input);
  const counts = emptyRedactCounts();
  const tokenize = makeTokenizer(counts);

  for (const entry of har.log.entries) {
    const { request, response } = entry;

    // ヘッダ
    if (request.headers) redactHeaders(request.headers, enabled, tokenize);
    if (response.headers) redactHeaders(response.headers, enabled, tokenize);

    // Cookie 配列
    if (enabled.COOKIE) {
      for (const c of request.cookies ?? []) c.value = tokenize('COOKIE', c.value);
      for (const c of response.cookies ?? []) c.value = tokenize('COOKIE', c.value);
    }

    // クエリ（配列 + URL）
    if (enabled.QUERY) {
      for (const q of request.queryString ?? []) {
        if (SENSITIVE_PARAM_NAMES.has(q.name.toLowerCase())) {
          q.value = tokenize('QUERY', q.value);
        }
      }
    }
    request.url = redactUrl(request.url, enabled, tokenize);

    // POST ボディ
    if (enabled.BODY && request.postData) {
      for (const p of request.postData.params ?? []) {
        if (SENSITIVE_PARAM_NAMES.has(p.name.toLowerCase())) {
          p.value = tokenize('BODY', p.value);
        }
      }
      if (typeof request.postData.text === 'string') {
        const r = scrubText(request.postData.text, DEFAULT_ENABLED);
        if (r.findings.length > 0) {
          request.postData.text = r.output;
          counts.BODY += r.findings.length;
        }
      }
    }

    // レスポンスボディスキャン
    if (enabled.BODY_SCAN && typeof response.content?.text === 'string') {
      const r = scrubText(response.content.text, DEFAULT_ENABLED);
      if (r.findings.length > 0) {
        response.content.text = r.output;
        counts.BODY_SCAN += r.findings.length;
      }
    }
  }

  return { har, counts };
}
