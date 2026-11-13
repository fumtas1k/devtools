import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decryptPlan } from '@/utils/saml/decryption-crypto';
import type { DecryptionPlan } from '@/utils/saml/decryption-profile';

vi.mock('@/utils/saml/decryption-crypto', () => ({ decryptPlan: vi.fn() }));

type Output = { plaintext: Uint8Array<ArrayBuffer> } | { error: string };
type Scope = {
  postMessage: ReturnType<
    typeof vi.fn<(message: Output, options?: { transfer: ArrayBuffer[] }) => void>
  >;
  onmessage:
    | ((
        event: MessageEvent<{ plan: DecryptionPlan; keyDer: Uint8Array<ArrayBuffer> }>
      ) => Promise<void>)
    | null;
};

let scope: Scope;
const request = () =>
  ({ data: { plan: {} as DecryptionPlan, keyDer: new Uint8Array([1]) } }) as MessageEvent<{
    plan: DecryptionPlan;
    keyDer: Uint8Array<ArrayBuffer>;
  }>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(decryptPlan).mockReset();
  scope = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', scope);
  await import('../saml-decryption.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('未転送の平文は postMessage 例外時にゼロ化し、安全なエラーを返す', async () => {
  const plaintext = new Uint8Array([3, 7, 9]);
  vi.mocked(decryptPlan).mockResolvedValue(plaintext);
  scope.postMessage.mockImplementation((message) => {
    if ('plaintext' in message) throw new Error('synthetic transfer error');
  });
  await scope.onmessage!(request());
  expect(plaintext.every((byte) => byte === 0)).toBe(true);
  expect(scope.postMessage).toHaveBeenLastCalledWith({
    error: '復号に失敗しました。鍵と方式、暗号文を確認してください。',
  });
});

it('正常転送では受信側に平文を渡し、送信元は detach される', async () => {
  const plaintext = new Uint8Array([3, 7, 9]);
  vi.mocked(decryptPlan).mockResolvedValue(plaintext);
  let received: Output | undefined;
  scope.postMessage.mockImplementation((message, options) => {
    received = structuredClone(message, { transfer: options?.transfer });
  });
  await scope.onmessage!(request());
  expect(plaintext.byteLength).toBe(0);
  expect(received && 'plaintext' in received && Array.from(received.plaintext)).toEqual([3, 7, 9]);
});

it('detach 後に合成例外が起きても二次例外を出さずエラーを返す', async () => {
  const plaintext = new Uint8Array([3, 7, 9]);
  vi.mocked(decryptPlan).mockResolvedValue(plaintext);
  scope.postMessage.mockImplementation((message, options) => {
    if ('plaintext' in message) {
      structuredClone(message, { transfer: options?.transfer });
      throw new Error('synthetic error after transfer');
    }
  });
  await expect(scope.onmessage!(request())).resolves.toBeUndefined();
  expect(plaintext.byteLength).toBe(0);
  expect(scope.postMessage).toHaveBeenLastCalledWith({
    error: '復号に失敗しました。鍵と方式、暗号文を確認してください。',
  });
});

it('復号失敗は平文を返さず定型エラーだけを返す', async () => {
  vi.mocked(decryptPlan).mockRejectedValue(new Error('secret-like internal detail'));
  await scope.onmessage!(request());
  expect(scope.postMessage).toHaveBeenCalledOnce();
  expect(scope.postMessage).toHaveBeenCalledWith({
    error: '復号に失敗しました。鍵と方式、暗号文を確認してください。',
  });
});

it('平文送信とエラー返信の両方が失敗しても未転送平文をゼロ化する', async () => {
  const plaintext = new Uint8Array([3, 7, 9]);
  vi.mocked(decryptPlan).mockResolvedValue(plaintext);
  scope.postMessage.mockImplementation(() => {
    throw new Error('synthetic send failure');
  });
  await expect(scope.onmessage!(request())).rejects.toThrow('synthetic send failure');
  expect(plaintext.every((byte) => byte === 0)).toBe(true);
});
