import { DIALECTS } from './dialects';
import type { DsnModel, DsnParam } from './types';

/**
 * userinfo / パス / クエリ用の percent-encode。
 * encodeURIComponent は区切り記号（: @ / ? # & = ,）をすべてエンコードするため DSN 構成要素として安全。
 */
function enc(raw: string): string {
  return encodeURIComponent(raw);
}

/** IPv6 アドレス（コロン含有ホスト）はブラケットで囲む */
function formatHost(host: string, port: string): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return port === '' ? h : `${h}:${port}`;
}

interface SerializeOptions {
  /** パスワードと認証情報キーのクエリパラメータ値を **** に置換する（共有用マスク） */
  maskPassword?: boolean;
}

/** 末尾一致で認証情報とみなすキー（`sslpassword` / `client_secret` / `access_token` 等を含む） */
const CREDENTIAL_KEY_SUFFIXES = ['password', 'passwd', 'pwd', 'secret', 'token'];

/** 完全一致で認証情報とみなすキー。authmechanismproperties は MongoDB で AWS_SESSION_TOKEN を運ぶ */
const CREDENTIAL_KEYS = new Set(['pass', 'authmechanismproperties']);

/** クエリパラメータのキーが認証情報を表すか（大文字小文字を区別しない） */
function isCredentialParamKey(key: string): boolean {
  const k = key.toLowerCase();
  return CREDENTIAL_KEYS.has(k) || CREDENTIAL_KEY_SUFFIXES.some((suffix) => k.endsWith(suffix));
}

/** 認証情報キーの値を **** に置換した params を返す（新しい配列。空値は伏せる対象がないためそのまま） */
function maskParams(params: DsnParam[]): DsnParam[] {
  return params.map((p) =>
    p.value !== '' && isCredentialParamKey(p.key) ? { key: p.key, value: '****' } : p
  );
}

/** key=value 列を percent-encode してクエリ文字列にする（空なら ''） */
function formatQuery(params: DsnParam[]): string {
  return params.length === 0
    ? ''
    : '?' + params.map((p) => `${enc(p.key)}=${enc(p.value)}`).join('&');
}

/** DsnModel から接続文字列を再構成する（percent-encode を内包） */
export function serializeDsn(model: DsnModel, options: SerializeOptions = {}): string {
  const { scheme, user, password, hosts, database } = model;
  // 共有用マスク時は、クエリ形式で指定された認証情報の値も伏せる（model は変更しない）
  const params = options.maskPassword ? maskParams(model.params) : model.params;
  const authority = hosts.map((h) => formatHost(h.host, h.port)).join(',');
  const path = database === '' ? '' : '/' + enc(database);
  const maskedPassword = options.maskPassword ? '****' : password;

  // JDBC は credential を userinfo でなく `?user=&password=` プロパティに置く。
  // scheme 自体が `jdbc:postgresql` 等なので `${scheme}://` でプレフィックスを満たす。
  if (DIALECTS[scheme].jdbc) {
    const credParams: DsnParam[] = [];
    if (user !== '') credParams.push({ key: 'user', value: user });
    if (password !== '') credParams.push({ key: 'password', value: maskedPassword });
    // credParams が担当するキー（user/password）が params 側にも残っていると
    // `?user=...&password=...&user=...` と重複するため除外する。専用フィールドが空で
    // params 側にのみ存在する場合は credParams に積まれないため、ここでも保持される。
    const credKeys = new Set(credParams.map((p) => p.key));
    const rest = params.filter((p) => !credKeys.has(p.key));
    return `${scheme}://${authority}${path}${formatQuery([...credParams, ...rest])}`;
  }

  let userinfo = '';
  if (user !== '' || password !== '') {
    userinfo = enc(user);
    if (password !== '') {
      userinfo += ':' + (options.maskPassword ? '****' : enc(password));
    }
    userinfo += '@';
  }

  return `${scheme}://${userinfo}${authority}${path}${formatQuery(params)}`;
}

/** パスワードと認証情報とみなすクエリパラメータの値を **** に置換した共有用 URI を返す */
export function maskDsn(model: DsnModel): string {
  return serializeDsn(model, { maskPassword: true });
}
