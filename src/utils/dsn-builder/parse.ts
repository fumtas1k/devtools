import { DIALECTS, SUPPORTED_SCHEMES } from './dialects';
import { validateModel } from './validate';
import type { DsnHost, DsnModel, DsnParam, DsnScheme, ParseResult } from './types';

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** decodeURIComponent の安全版（不正な percent-encoding は null を返す） */
function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** `host[:port]`（IPv6 は `[...]` ブラケット）を分解する。形式不正は null */
function splitHostPort(raw: string): { host: string; port: string } | null {
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end < 0) return null;
    const host = raw.slice(1, end);
    const rest = raw.slice(end + 1);
    if (rest === '') return { host, port: '' };
    if (!rest.startsWith(':')) return null;
    return { host, port: rest.slice(1) };
  }
  const colon = raw.indexOf(':');
  if (colon < 0) return { host: raw, port: '' };
  return { host: raw.slice(0, colon), port: raw.slice(colon + 1) };
}

/**
 * 接続文字列を DsnModel に分解する。
 * `URL` API は mongodb のカンマ区切り複数ホストを解釈できないため自前で分解する。
 * 構文: `scheme://[userinfo@]authority[/path][?query]`
 */
export function parseDsn(input: string): ParseResult {
  const uri = input.trim();

  // `jdbc:postgresql://` のような JDBC 亜種も 1 トークンの scheme として捕捉する
  const schemeMatch = /^(jdbc:[a-z][a-z0-9+.-]*|[a-z][a-z0-9+.-]*):\/\//i.exec(uri);
  if (!schemeMatch) {
    return fail('「スキーム://」で始まる接続文字列を入力してください');
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (!(scheme in DIALECTS)) {
    return fail(`未対応のスキームです: ${scheme}（対応: ${SUPPORTED_SCHEMES.join(' / ')}）`);
  }

  const rest = uri.slice(schemeMatch[0].length);
  const qIdx = rest.indexOf('?');
  const queryStr = qIdx >= 0 ? rest.slice(qIdx + 1) : '';
  const beforeQuery = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
  const slashIdx = beforeQuery.indexOf('/');
  const authorityRaw = slashIdx >= 0 ? beforeQuery.slice(0, slashIdx) : beforeQuery;
  const pathRaw = slashIdx >= 0 ? beforeQuery.slice(slashIdx + 1) : '';

  // userinfo（パスワード中の raw `@` は RFC 3986 で禁止のため lastIndexOf で安全に分割できる）
  const atIdx = authorityRaw.lastIndexOf('@');
  const userinfoRaw = atIdx >= 0 ? authorityRaw.slice(0, atIdx) : '';
  const hostsRaw = atIdx >= 0 ? authorityRaw.slice(atIdx + 1) : authorityRaw;

  let user = '';
  let password = '';
  if (userinfoRaw !== '') {
    const colon = userinfoRaw.indexOf(':');
    const userRaw = colon >= 0 ? userinfoRaw.slice(0, colon) : userinfoRaw;
    const passRaw = colon >= 0 ? userinfoRaw.slice(colon + 1) : '';
    const decodedUser = safeDecode(userRaw);
    const decodedPass = safeDecode(passRaw);
    if (decodedUser === null || decodedPass === null) {
      return fail('ユーザー情報の percent-encoding が不正です');
    }
    user = decodedUser;
    password = decodedPass;
  }

  // hosts（authority 全体が空のときは「未入力」として空ホスト 1 件にする）
  let hosts: DsnHost[];
  if (hostsRaw === '') {
    hosts = [{ host: '', port: '' }];
  } else {
    hosts = [];
    for (const part of hostsRaw.split(',')) {
      if (part === '') return fail('ホストの区切り（,）の前後が空です');
      const hp = splitHostPort(part);
      if (hp === null) return fail(`ホストの形式が不正です: ${part}`);
      const host = safeDecode(hp.host);
      if (host === null) return fail('ホストの percent-encoding が不正です');
      hosts.push({ host, port: hp.port });
    }
  }

  const database = safeDecode(pathRaw);
  if (database === null) return fail('パス部の percent-encoding が不正です');

  const params: DsnParam[] = [];
  if (queryStr !== '') {
    for (const pair of queryStr.split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      const key = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
      const value = safeDecode(eq >= 0 ? pair.slice(eq + 1) : '');
      if (key === null || value === null) {
        return fail('クエリパラメータの percent-encoding が不正です');
      }
      params.push({ key, value });
    }
  }

  // JDBC は credential を `?user=&password=` プロパティに持つ。専用フィールドへ移し、
  // 残りのパラメータだけをクエリとして保持する（userinfo が併記されていればそれを優先）。
  let finalParams = params;
  if (DIALECTS[scheme as DsnScheme].jdbc) {
    const remaining: DsnParam[] = [];
    for (const p of params) {
      if (p.key === 'user' && user === '') user = p.value;
      else if (p.key === 'password' && password === '') password = p.value;
      else remaining.push(p);
    }
    finalParams = remaining;
  }

  const model: DsnModel = {
    scheme: scheme as DsnScheme,
    user,
    password,
    hosts,
    database,
    params: finalParams,
  };
  const validationError = validateModel(model);
  if (validationError !== null) return fail(validationError);
  return { ok: true, model };
}
