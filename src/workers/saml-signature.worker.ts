import { verifySignatures } from '../utils/saml/signature-verify';

self.onmessage = async (event: MessageEvent<{ xml: string; snapshot: string; pem: string }>) => {
  try {
    self.postMessage({
      results: await verifySignatures(event.data.xml, event.data.snapshot, event.data.pem),
    });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '署名検証に失敗しました' });
  }
};
