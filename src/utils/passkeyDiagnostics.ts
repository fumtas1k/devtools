export type DiagnosticState = 'supported' | 'unsupported' | 'unknown';
export type DiagnosticReason = 'result' | 'missing-api' | 'insecure' | 'error' | 'timeout';
export interface DiagnosticResult {
  state: DiagnosticState;
  reason: DiagnosticReason;
}
export interface PasskeyEnvironment {
  secure: boolean;
  credential?: {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    isConditionalMediationAvailable?: () => Promise<boolean>;
  };
}

export const PASSKEY_QUERY_TIMEOUT_MS = 3000;

function fromBoolean(value: boolean): DiagnosticResult {
  return { state: value ? 'supported' : 'unsupported', reason: 'result' };
}

async function query(
  call: (() => Promise<boolean>) | undefined,
  signal: AbortSignal
): Promise<DiagnosticResult> {
  if (!call) return { state: 'unknown', reason: 'missing-api' };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DiagnosticResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => finish({ state: 'unknown', reason: 'error' });
    // 診断 UI の待機上限であり、ブラウザ内部の問い合わせを取り消すものではない。
    const timer = setTimeout(
      () => finish({ state: 'unknown', reason: 'timeout' }),
      PASSKEY_QUERY_TIMEOUT_MS
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    Promise.resolve()
      .then(call)
      .then(
        (value) =>
          finish(
            typeof value === 'boolean' ? fromBoolean(value) : { state: 'unknown', reason: 'error' }
          ),
        () => finish({ state: 'unknown', reason: 'error' })
      );
  });
}

export async function diagnosePasskeyEnvironment(env: PasskeyEnvironment, signal: AbortSignal) {
  const unavailable: DiagnosticResult = {
    state: 'unknown',
    reason: env.secure ? 'missing-api' : 'insecure',
  };
  const credential = env.credential;
  const [platform, autofill] =
    env.secure && credential
      ? await Promise.all([
          query(credential.isUserVerifyingPlatformAuthenticatorAvailable?.bind(credential), signal),
          query(credential.isConditionalMediationAvailable?.bind(credential), signal),
        ])
      : [unavailable, unavailable];
  return {
    secure: fromBoolean(env.secure),
    webauthn: env.secure ? fromBoolean(!!credential) : unavailable,
    platform,
    autofill,
  };
}

export type PasskeyReport = Awaited<ReturnType<typeof diagnosePasskeyEnvironment>>;
