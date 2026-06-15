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
  /** パスワードを **** に置換する（共有用マスク） */
  maskPassword?: boolean;
}

/** key=value 列を percent-encode してクエリ文字列にする（空なら ''） */
function formatQuery(params: DsnParam[]): string {
  return params.length === 0
    ? ''
    : '?' + params.map((p) => `${enc(p.key)}=${enc(p.value)}`).join('&');
}

/** DsnModel から接続文字列を再構成する（percent-encode を内包） */
export function serializeDsn(model: DsnModel, options: SerializeOptions = {}): string {
  const { scheme, user, password, hosts, database, params } = model;
  const authority = hosts.map((h) => formatHost(h.host, h.port)).join(',');
  const path = database === '' ? '' : '/' + enc(database);
  const maskedPassword = options.maskPassword ? '****' : password;

  // JDBC は credential を userinfo でなく `?user=&password=` プロパティに置く。
  // scheme 自体が `jdbc:postgresql` 等なので `${scheme}://` でプレフィックスを満たす。
  if (DIALECTS[scheme].jdbc) {
    const credParams: DsnParam[] = [];
    if (user !== '') credParams.push({ key: 'user', value: user });
    if (password !== '') credParams.push({ key: 'password', value: maskedPassword });
    return `${scheme}://${authority}${path}${formatQuery([...credParams, ...params])}`;
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

/** パスワードを **** に置換した共有用 URI を返す */
export function maskDsn(model: DsnModel): string {
  return serializeDsn(model, { maskPassword: true });
}
