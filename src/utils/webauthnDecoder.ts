/** この段階では clientDataJSON のみを読み取り、認証の成否は検証しない。 */
export interface ClientDataSummary {
  type: 'webauthn.create' | 'webauthn.get';
  origin: string;
}

export const MAX_RESPONSE_CHARS = 262_144;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error('clientDataJSON はパディングなしの base64url で指定してください。');
  }
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('clientDataJSON の base64url をデコードできません。');
  }
  // 末尾の未使用ビットを含め、正規の base64url 表現だけを受け付ける。
  if (btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') !== value) {
    throw new Error('clientDataJSON の base64url が不正です。');
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** 登録・認証レスポンスの clientDataJSON をローカルで読み取る。 */
export function decodeClientData(input: string): ClientDataSummary {
  if (input.length > MAX_RESPONSE_CHARS) throw new Error('入力が上限を超えています。');
  let response: unknown;
  try {
    response = JSON.parse(input);
  } catch {
    throw new Error('レスポンス JSON が不正です。');
  }
  if (
    !object(response) ||
    !object(response.response) ||
    typeof response.response.clientDataJSON !== 'string'
  ) {
    throw new Error('response.clientDataJSON が必要です。');
  }
  const bytes = decodeBase64Url(response.response.clientDataJSON);
  let clientData: unknown;
  try {
    clientData = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('clientDataJSON は UTF-8 の JSON で指定してください。');
  }
  if (
    !object(clientData) ||
    (clientData.type !== 'webauthn.create' && clientData.type !== 'webauthn.get') ||
    typeof clientData.origin !== 'string' ||
    clientData.origin.length === 0
  ) {
    throw new Error('clientDataJSON の type または origin が不正です。');
  }
  return { type: clientData.type, origin: clientData.origin };
}
