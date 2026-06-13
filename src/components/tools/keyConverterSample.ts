/**
 * key-converter のサンプル鍵。
 *
 * いずれも動作確認用に生成したサンプル用の鍵であり、実在のホストや
 * 実際の秘密鍵とは無関係なサンプル用データです。
 * 秘密鍵サンプルは仕様検討・UI 動作確認のためだけに使用し、本番利用しないこと。
 */

/** RSA 2048bit 公開鍵（SPKI/PEM 形式） */
export const SAMPLE_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqThnC5xAlWGNkX6HVCsp
klAtUbo5YQCFfRertmVyi4Tgk5pf8jwStjWfZ9r5UBiIFUbYG2LHnC3xJ1U/V4sd
695GzUjRCvsY4wHmBq/OM85pFPLSM1sTIn5DXPLLFbTQzcPERIOKlT5QbkNjdXyE
R80MCG8Ww/SkwWKRpcq1GTdp5owF/uWCvwez6FOPOnO3F84mEi4c4hfFFmv8YIJ2
32mIZaTJv5jVdUnAXZ+WgIcBaOrG3vJCoO9yWOqNQQ2oodXDg8MZ2DalCdTjqpDy
kZUpu6UFfK53lylyaPiHqCW3httPhs0UAZIk23Nxcn3ks/yGWF5vtnG0QKMb2ChL
tQIDAQAB
-----END PUBLIC KEY-----`;

/** EC P-256 秘密鍵（PKCS#8/PEM 形式） */
export const SAMPLE_EC_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTk5EM3e02Rsm/1TB
W8TMqN4CxqRWN5Q2dHr4QIY//EChRANCAARuh90rzbIIoyuWUcDuGofQp12ym6Jo
K96UTDCQCRnqLceKfIgmqQ/7akd338Rj1lKWaxiKshElLwxAJXv+55/n
-----END PRIVATE KEY-----`;
