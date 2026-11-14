import { decryptPlan } from '@/utils/saml/decryption-crypto';
import type { DecryptionPlan } from '@/utils/saml/decryption-profile';

self.onmessage = async (
  event: MessageEvent<{ plan: DecryptionPlan; keyDer: Uint8Array<ArrayBuffer> }>
) => {
  let plaintext: Uint8Array<ArrayBuffer> | undefined;
  try {
    plaintext = await decryptPlan(event.data.plan, event.data.keyDer);
    self.postMessage({ plaintext }, { transfer: [plaintext.buffer] });
  } catch {
    self.postMessage({ error: '復号に失敗しました。鍵と方式、暗号文を確認してください。' });
  } finally {
    // 転送成功時は detach 済み。転送できなかった場合のみ手元の平文を消す。
    if (plaintext?.byteLength) plaintext.fill(0);
  }
};
