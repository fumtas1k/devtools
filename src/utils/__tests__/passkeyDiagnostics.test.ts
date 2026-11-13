import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnosePasskeyEnvironment, PASSKEY_QUERY_TIMEOUT_MS } from '../passkeyDiagnostics';

afterEach(() => vi.useRealTimers());
const signal = () => new AbortController().signal;
describe('パスキー環境診断', () => {
  it('対応する環境を確認する', async () => {
    const credential = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
    };
    const report = await diagnosePasskeyEnvironment({ secure: true, credential }, signal());
    expect(Object.values(report).every((value) => value.state === 'supported')).toBe(true);
    expect(credential.isConditionalMediationAvailable).toHaveBeenCalledTimes(1);
  });
  it('明示的な false を判定不可と区別する', async () => {
    const report = await diagnosePasskeyEnvironment(
      {
        secure: true,
        credential: {
          isUserVerifyingPlatformAuthenticatorAvailable: async () => false,
        },
      },
      signal()
    );
    expect(report.platform.state).toBe('unsupported');
    expect(report.autofill).toEqual({ state: 'unknown', reason: 'missing-api' });
  });
  it('API 不在とセキュアでない環境を区別し、問い合わせない', async () => {
    expect((await diagnosePasskeyEnvironment({ secure: true }, signal())).webauthn.state).toBe(
      'unsupported'
    );
    const call = vi.fn();
    const result = await diagnosePasskeyEnvironment(
      { secure: false, credential: { isConditionalMediationAvailable: call } },
      signal()
    );
    expect(result.secure.state).toBe('unsupported');
    expect(result.autofill.reason).toBe('insecure');
    expect(call).not.toHaveBeenCalled();
  });
  it('reject・同期例外を非対応と誤判定しない（陽性対照）', async () => {
    const result = await diagnosePasskeyEnvironment(
      {
        secure: true,
        credential: {
          isUserVerifyingPlatformAuthenticatorAvailable: () => {
            throw new Error('test');
          },
          isConditionalMediationAvailable: async () => {
            throw new Error('test');
          },
        },
      },
      signal()
    );
    expect(result.platform).toEqual({ state: 'unknown', reason: 'error' });
    expect(result.autofill).toEqual({ state: 'unknown', reason: 'error' });
  });
  it('タイムアウトしても遅い応答から結果を書き換えず timer を片付ける', async () => {
    vi.useFakeTimers();
    let finish!: (value: boolean) => void;
    const promise = diagnosePasskeyEnvironment(
      {
        secure: true,
        credential: {
          isConditionalMediationAvailable: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        },
      },
      signal()
    );
    await vi.advanceTimersByTimeAsync(PASSKEY_QUERY_TIMEOUT_MS);
    const result = await promise;
    expect(result.autofill).toEqual({ state: 'unknown', reason: 'timeout' });
    finish(true);
    expect(result.autofill.reason).toBe('timeout');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('中断時も timer を片付ける', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const promise = diagnosePasskeyEnvironment(
      {
        secure: true,
        credential: {
          isConditionalMediationAvailable: () => new Promise(() => {}),
        },
      },
      controller.signal
    );
    controller.abort();
    expect((await promise).autofill.state).toBe('unknown');
    expect(vi.getTimerCount()).toBe(0);
  });
});
