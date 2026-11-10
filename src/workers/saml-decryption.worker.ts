import { decryptPlan } from '@/utils/saml/decryption-crypto';
import type { DecryptionPlan } from '@/utils/saml/decryption-profile';

self.onmessage = async (
  event: MessageEvent<{ plan: DecryptionPlan; keyDer: Uint8Array<ArrayBuffer> }>
) => {
  try {
    const plaintext = await decryptPlan(event.data.plan, event.data.keyDer);
    self.postMessage({ plaintext }, { transfer: [plaintext.buffer] });
  } catch {
    self.postMessage({ error: '復号に失敗しました。鍵と方式、暗号文を確認してください。' });
  }
};
