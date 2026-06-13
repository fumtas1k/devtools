/**
 * key/types.ts
 *
 * 鍵フォーマット変換ツール（key-converter）の共通型定義。
 */

/** 公開鍵か秘密鍵かの区別 */
export type KeyVisibility = 'public' | 'private';

/** 鍵アルゴリズム（RSA / EC のみ v1 対応） */
export type KeyAlgorithm = 'RSA' | 'EC';

/** 入力の検出結果が未対応のときの理由 */
export type UnsupportedReason =
  /** RSA/EC 以外のアルゴリズム（Ed25519/Ed448 等） */
  | 'unknown-algorithm'
  /** PKCS#1 (RSA PUBLIC KEY / RSA PRIVATE KEY) または SEC1 (EC PRIVATE KEY) レガシー PEM */
  | 'legacy-pem'
  /** 暗号化秘密鍵 (ENCRYPTED PRIVATE KEY) */
  | 'encrypted'
  /** 入力が空 */
  | 'empty'
  /** 解析できない入力 */
  | 'invalid-input';

/**
 * `detectKeyInput` が返す検出結果。
 * kind が 'unsupported' / 'empty' の場合は reason と reason に応じた日本語メッセージを持つ。
 * kind が 'ok' の場合は visibility / algorithm / derBytes または jwkObject を持つ。
 */
export type KeyDetection =
  | {
      kind: 'ok';
      visibility: KeyVisibility;
      algorithm: KeyAlgorithm;
      /** EC のみ。P-256 / P-384 / P-521 */
      namedCurve?: string;
      /** DER 入力 / PEM 入力の場合にセット */
      derBytes?: Uint8Array;
      /** JWK 入力の場合にセット */
      jwkObject?: JsonWebKey;
      /** 由来の入力形式 */
      source: 'pem' | 'der' | 'jwk';
    }
  | {
      kind: 'unsupported';
      reason: UnsupportedReason;
      /** UI に表示する日本語メッセージ */
      message: string;
    }
  | {
      kind: 'empty';
    };

/**
 * `convertKey` が返す変換結果。
 * error がある場合は他のフィールドは未定義。
 */
export interface ConvertResult {
  visibility?: KeyVisibility;
  algorithm?: KeyAlgorithm;
  /** RSA の場合の鍵長（ビット） */
  keySizeBits?: number;
  /** EC の場合の曲線名 */
  namedCurve?: string;
  /** PEM テキスト（PUBLIC KEY / PRIVATE KEY ヘッダ） */
  pem?: string;
  /** DER を base64 エンコードした文字列 */
  derBase64?: string;
  /** DER バイナリ（ダウンロード用） */
  derBytes?: Uint8Array;
  /** JWK を JSON.stringify(jwk, null, 2) したテキスト */
  jwk?: string;
  /** 変換失敗時の日本語エラーメッセージ */
  error?: string;
  /** 未対応形式の理由（UI での分岐表示用） */
  unsupportedReason?: UnsupportedReason;
}
