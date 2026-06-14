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

/**
 * 既にプレースホルダ化済みの値を検出する正規表現（前後完全一致）。
 * makeTokenizer の冪等化（#690 L-3）に使用する。
 */
const PLACEHOLDER_EXACT_RE = /^\[REDACTED:[A-Z_]+_\d+\]$/;

/** 一貫トークン発行器。カテゴリ別カウンタと値→トークンの Map を保持する。 */
function makeTokenizer(counts: Record<HarRedactCategory, number>) {
  const map = new Map<string, string>();
  const counter: Partial<Record<HarRedactCategory, number>> = {};
  return (category: HarRedactCategory, value: string): string => {
    // 既にプレースホルダ化済みの値は再サニタイズで二重計上しない（#690 L-3・冪等性）
    if (PLACEHOLDER_EXACT_RE.test(value)) return value;
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

/**
 * `name=value&...` 形式の各 value 部のみに scrubText を適用する。
 * クエリ/フラグメント全体を scrubText に渡すと CREDENTIAL_ASSIGN の値クラスが
 * 区切り `&` を越えて隣の param まで飲み込む（非機密 param を破壊する）ため、
 * value 単位で走査して取りこぼし無く・破壊無く redact する。
 * カテゴリは PATH_SCAN（URL自由走査）で計上する（#694: QUERY から分離）。
 */
function scrubPairValues(s: string, counts: Record<HarRedactCategory, number>): string {
  return s
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return scrubInto(pair, counts, 'PATH_SCAN');
      return pair.slice(0, eq + 1) + scrubInto(pair.slice(eq + 1), counts, 'PATH_SCAN');
    })
    .join('&');
}

/**
 * URL の scheme://authority（host・port・basic-auth）を保持しつつ、パス以降に
 * scrubText を適用する。host を潰さず URL の可読性を保ったまま、パス内トークンや
 * 辞書外クエリ名の JWT/API キーを redact する。
 * - path: そのまま scrubText（`key=value&` 構造を持たないため安全）
 * - query / fragment: param value 単位で scrubText（`&` 越えの飲み込みを防ぐ）
 * カテゴリは PATH_SCAN で計上する（#694: QUERY から分離）。
 */
function scrubUrlPath(url: string, counts: Record<HarRedactCategory, number>): string {
  // data: URL は base64/テキストの自己完結ペイロードを持ち、scrubText（特に
  // HIGH_ENTROPY_BASE64）がペイロードを破壊してデコード不能にする（#695）。
  // #690 M-2 で本文に対し回避した破壊クラスと同型。原文を返して破壊を防ぐ。
  if (/^data:/i.test(url)) return url;

  const schemeMatch = url.match(/^[a-z][a-z0-9+.-]{0,31}:\/\//i);
  let authorityEnd: number;
  if (schemeMatch) {
    const after = schemeMatch[0].length;
    const sepIndex = url.slice(after).search(/[/?#]/);
    authorityEnd = sepIndex === -1 ? url.length : after + sepIndex;
  } else if (url.startsWith('//')) {
    const sepIndex = url.slice(2).search(/[/?#]/);
    authorityEnd = sepIndex === -1 ? url.length : 2 + sepIndex;
  } else {
    // scheme/authority 無しの相対 URL 等は全体を対象にする
    authorityEnd = 0;
  }
  const head = url.slice(0, authorityEnd);
  const rest = url.slice(authorityEnd);
  if (rest === '') return url;

  // path? query # fragment に分解する
  const hashIndex = rest.indexOf('#');
  const fragment = hashIndex !== -1 ? rest.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex !== -1 ? rest.slice(0, hashIndex) : rest;
  const qIndex = beforeHash.indexOf('?');
  const path = qIndex !== -1 ? beforeHash.slice(0, qIndex) : beforeHash;
  const query = qIndex !== -1 ? beforeHash.slice(qIndex + 1) : '';

  let result = head + scrubInto(path, counts, 'PATH_SCAN');
  if (qIndex !== -1) result += '?' + scrubPairValues(query, counts);
  if (hashIndex !== -1) result += '#' + scrubPairValues(fragment, counts);
  return result;
}

/** request.url の basic-auth と機密クエリパラメータを redact する。 */
function redactUrl(
  url: string,
  enabled: Record<HarRedactCategory, boolean>,
  counts: Record<HarRedactCategory, number>,
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

  // パス以降（path?query#fragment）に scrubText を適用（host は保持）。
  // 構造的クエリ redact（SENSITIVE_PARAM_NAMES）の後に走らせ、placeholder は再マッチしない。
  // PATH_SCAN（自由走査）で独立制御する（#694: QUERY から分離）。
  if (enabled.PATH_SCAN) {
    result = scrubUrlPath(result, counts);
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

/**
 * 本文走査をスキップすべきバイナリ系 mimeType か判定する。
 * base64 でエンコードされがちで、scrubText（特に HIGH_ENTROPY_BASE64）が
 * 本文を破壊しデコード不能にするのを防ぐ。
 */
function isBinaryMimeType(mimeType: unknown): boolean {
  if (typeof mimeType !== 'string') return false;
  const m = mimeType.toLowerCase().split(';')[0].trim();
  if (
    m.startsWith('image/') ||
    m.startsWith('audio/') ||
    m.startsWith('video/') ||
    m.startsWith('font/')
  ) {
    return true;
  }
  return [
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/gzip',
    'application/x-protobuf',
    'application/wasm',
  ].includes(m);
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
    } else if ((enabled.QUERY || enabled.PATH_SCAN) && URL_HEADER_NAMES.has(lower)) {
      // Referer / Origin / Location 等は URL を運ぶため URL と同じ redact を適用する。
      // （URL のクエリだけ redact しても同じ秘密値がこれらのヘッダに残るのを防ぐ）
      // 構造的 redact（QUERY）・自由走査（PATH_SCAN）のどちらかが ON なら URL 処理に入れる
      // （redactUrl 内部で各ステップが個別ゲートされるため安全）。#694
      h.value = redactUrl(h.value, enabled, counts, tokenize);
    } else if (enabled.HEADER_SCAN && !AUTH_HEADER_NAMES.has(lower)) {
      // 辞書外ヘッダ値に含まれる機密（JWT / API キー等）を scrubText で自由走査する。
      // AUTH_HEADER_NAMES に一致するヘッダは辞書ベース（AUTH_HEADER）の担当なので除外する。
      // AUTH_HEADER が OFF でも HEADER_SCAN が意図せず辞書内ヘッダを処理しないよう分離する（#694）。
      h.value = scrubInto(h.value, counts, 'HEADER_SCAN');
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
        request.url = redactUrl(request.url, enabled, counts, tokenize);
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
      if (Array.isArray(response.headers))
        redactHeaders(response.headers, enabled, counts, tokenize);

      if (enabled.COOKIE && Array.isArray(response.cookies)) {
        for (const c of response.cookies) {
          if (c && typeof c.value === 'string') c.value = tokenize('COOKIE', c.value);
        }
      }

      // リダイレクト先 URL（Location ヘッダと同じく URL を運ぶ独立フィールド）。
      // 構造的 redact（QUERY）・自由走査（PATH_SCAN）のどちらかが ON なら URL 処理に入れる（#694）。
      if (
        (enabled.QUERY || enabled.PATH_SCAN) &&
        typeof response.redirectURL === 'string' &&
        response.redirectURL
      ) {
        response.redirectURL = redactUrl(response.redirectURL, enabled, counts, tokenize);
      }

      // レスポンスボディスキャン。
      // base64 本文・バイナリ系 mimeType は scrubText にかけない:
      //  - 秘密は base64 文字列内にありパターン検出が効かない（false confidence）。
      //  - HIGH_ENTROPY_BASE64 ルールが base64 ブロック自体にマッチし、本文を破壊して
      //    デコード不能な HAR を出力してしまう。
      // encoding === 'base64' に加え、encoding 欄が無くても mimeType がバイナリ系なら
      // スキップする（多くの HAR は画像等で encoding を省略するため）。
      const content = response.content;
      if (
        enabled.BODY_SCAN &&
        content &&
        typeof content === 'object' &&
        typeof content.text === 'string' &&
        content.encoding !== 'base64' &&
        !isBinaryMimeType(content.mimeType)
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
