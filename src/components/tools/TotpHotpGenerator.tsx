import { useState, useEffect, useMemo, useRef } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { InputField } from '@/components/ui/InputField';
import { BareInput } from '@/components/ui/BareInput';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ActionButton } from '@/components/ui/ActionButton';
import { OutputField } from '@/components/ui/OutputField';
import {
  base32Decode,
  generateRandomBase32Secret,
  hotp,
  totp,
  verifyTotp,
  buildOtpauthUri,
  type HashAlgo,
  type Digits,
  type Period,
} from '@/utils/totp-hotp';

// RFC 6238 Appendix B SHA-1 テストベクタの secret (ASCII "12345678901234567890") を Base32 化したもの。
// 32 文字 = 160 bit で RFC 4226 §4 R6 強推奨を満たし、ツール自身の「ランダム生成は 160 bit」
// 方針とも整合する。テストベクタの secret なのでサンプルで生成される OTP は実装の正しさの
// 視覚的確認にもなる (RFC 6238 公式値 94287082 など)。
export const SAMPLE_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

export const DEFAULTS = {
  algorithm: 'SHA-1' as HashAlgo,
  digits: 6 as Digits,
  period: 30 as Period,
} as const;

type Mode = 'totp' | 'hotp' | 'verify';
type VerifyResult = { valid: boolean; offset: number | null } | null;

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'totp', label: 'TOTP' },
  { value: 'hotp', label: 'HOTP' },
  { value: 'verify', label: '検証' },
];

const ALGORITHM_OPTIONS: { value: HashAlgo; label: string }[] = [
  { value: 'SHA-1', label: 'SHA-1' },
  { value: 'SHA-256', label: 'SHA-256' },
  { value: 'SHA-512', label: 'SHA-512' },
];

const DIGITS_OPTIONS: { value: string; label: string }[] = [
  { value: '6', label: '6桁' },
  { value: '7', label: '7桁' },
  { value: '8', label: '8桁' },
];

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30秒' },
  { value: '60', label: '60秒' },
];

function formatCodeDisplay(code: string): string {
  if (!code) return '';
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

export function TotpHotpGeneratorTool() {
  const [mode, setMode] = useState<Mode>('totp');
  const [secretBase32, setSecretBase32] = useState(SAMPLE_SECRET_BASE32);
  const [showSecret, setShowSecret] = useState(false);
  const [algorithm, setAlgorithm] = useState<HashAlgo>(DEFAULTS.algorithm);
  const [digits, setDigits] = useState<Digits>(DEFAULTS.digits);
  const [period, setPeriod] = useState<Period>(DEFAULTS.period);
  const [counterStr, setCounterStr] = useState('0');
  const [issuer, setIssuer] = useState('');
  const [accountLabel, setAccountLabel] = useState('');

  const [currentCode, setCurrentCode] = useState('');
  const [nextCode, setNextCode] = useState('');
  const [remainingSec, setRemainingSec] = useState<number>(DEFAULTS.period);

  const [hotpCode, setHotpCode] = useState('');

  const [verificationInput, setVerificationInput] = useState('');
  const [verificationResult, setVerificationResult] = useState<VerifyResult>(null);
  const [verifying, setVerifying] = useState(false);

  const issuerHasColon = issuer.includes(':');

  // 250ms 間隔の tick で毎回再デコードしないよう secret bytes をキャッシュ。
  // null = 入力が空 or Base32 として不正。
  const secretBytes = useMemo<Uint8Array<ArrayBuffer> | null>(() => {
    if (!secretBase32.trim()) return null;
    try {
      return base32Decode(secretBase32.trim());
    } catch {
      return null;
    }
  }, [secretBase32]);

  const secretInvalid = secretBase32.trim() !== '' && secretBytes === null;
  const secretError = secretInvalid
    ? '有効な Base32 形式で入力してください（A-Z, 2-7 のみ、長さ 2/4/5/7 文字 または 8 の倍数）'
    : '';

  // HOTP counter: 空欄は 0 として扱い、それ以外は非負整数のみ受け付ける。
  // 旧実装の `parseInt(counterStr) || 0` だと "abc" や "-5" を silent に 0 へ
  // 丸めて user 側で「コードが認証側と一致しない」原因を特定しづらかった。
  const counterError = useMemo(() => {
    const t = counterStr.trim();
    if (t === '') return '';
    return /^\d+$/.test(t) ? '' : 'カウンタは 0 以上の整数を入力してください';
  }, [counterStr]);

  const parsedCounter = useMemo<bigint>(() => {
    const t = counterStr.trim();
    if (counterError || t === '') return 0n;
    return BigInt(t);
  }, [counterStr, counterError]);

  useEffect(() => {
    if (mode !== 'totp' || !secretBytes) {
      setCurrentCode('');
      setNextCode('');
      return;
    }
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const now = Date.now();
      const remaining = period - Math.floor((now / 1000) % period);
      setRemainingSec(remaining);
      const nextPeriodStart = (Math.floor(now / 1000 / period) + 1) * period * 1000;
      const [code, next] = await Promise.all([
        totp(secretBytes, { algorithm, digits, period, timestamp: now }),
        totp(secretBytes, { algorithm, digits, period, timestamp: nextPeriodStart }),
      ]);
      if (!cancelled) {
        setCurrentCode(code);
        setNextCode(next);
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode, secretBytes, algorithm, digits, period]);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setVerificationResult(null);
    setHotpCode('');
  };

  // secret 自体に紐づく派生 state リセットを 1 箇所に集約。
  // 入力欄編集とランダム生成ボタンの両経路から呼ばれる。
  // counter のリセットは「ランダム生成時のみ」という別軸の責務なので呼び出し側で行う。
  const replaceSecret = (next: string) => {
    setSecretBase32(next);
    setCurrentCode('');
    setHotpCode('');
    setVerificationResult(null);
  };

  // ランダム生成時の視覚 / SR フィードバック (#426)。マスク状態 (type="password") では
  // 値が dots 表示で変化が分かりにくいため、入力欄を一時ハイライトしつつ aria-live で announce する。
  const [regenFlash, setRegenFlash] = useState(false);
  const regenTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (regenTimerRef.current !== null) window.clearTimeout(regenTimerRef.current);
    };
  }, []);

  const handleRegenerateSecret = () => {
    replaceSecret(generateRandomBase32Secret());
    setCounterStr('0');
    // 連打時もハイライトを再生させるため、一旦解除してから次フレームで再付与する。
    setRegenFlash(false);
    if (regenTimerRef.current !== null) window.clearTimeout(regenTimerRef.current);
    requestAnimationFrame(() => {
      setRegenFlash(true);
      // flash state の寿命を .input-flash の animation 長 (1.2s) に揃える。
      // ズレると animation 終了後も class が残り「ring 消失だが付与中」状態や、
      // reduced-motion 環境での static ring 持続時間がアニメと食い違う。
      regenTimerRef.current = window.setTimeout(() => setRegenFlash(false), 1200);
    });
  };

  const handleGenerateHotp = async () => {
    if (!secretBytes || counterError) {
      setHotpCode('');
      return;
    }
    const code = await hotp(secretBytes, parsedCounter, { algorithm, digits });
    setHotpCode(code);
  };

  const handleVerify = async () => {
    if (!secretBytes) return;
    setVerifying(true);
    setVerificationResult(null);
    try {
      const result = await verifyTotp(verificationInput.trim(), secretBytes, {
        algorithm,
        digits,
        period,
      });
      setVerificationResult(result);
    } finally {
      setVerifying(false);
    }
  };

  const otpauthUri = useMemo(() => {
    if (issuerHasColon || !secretBytes) return '';
    if (mode === 'hotp' && counterError) return '';
    // 発行者名 / アカウントが未入力のときに 'MyApp' / 'user@example.com' を fallback で
    // 埋めると、ユーザーが入力忘れに気付かずコピー → 認証アプリで「MyApp / user@example.com」
    // として登録される事故を招くため、両方入力されるまで URI を生成しない。
    if (!issuer.trim() || !accountLabel.trim()) return '';
    try {
      return buildOtpauthUri({
        type: (mode === 'verify' ? 'totp' : mode) as 'totp' | 'hotp',
        issuer: issuer.trim(),
        account: accountLabel.trim(),
        secretBase32: secretBase32.trim(),
        algorithm,
        digits,
        period: mode !== 'hotp' ? period : undefined,
        counter: mode === 'hotp' ? parsedCounter : undefined,
      });
    } catch {
      return '';
    }
  }, [
    mode,
    secretBytes,
    secretBase32,
    issuer,
    accountLabel,
    algorithm,
    digits,
    period,
    parsedCounter,
    counterError,
    issuerHasColon,
  ]);

  const handleClear = () => {
    setSecretBase32('');
    setCurrentCode('');
    setNextCode('');
    setHotpCode('');
    setVerificationInput('');
    setVerificationResult(null);
    setCounterStr('0');
    setIssuer('');
    setAccountLabel('');
    setRemainingSec(period);
  };

  const displayCode = mode === 'hotp' ? hotpCode : currentCode;

  return (
    <div className="space-y-4">
      {/* ─── Section 1: Secret + Settings ─── */}
      <div className="rounded-xl border border-default overflow-hidden">
        <div className="body-emphasis text-default bg-subtle border-b border-default px-4 py-3">
          シークレット鍵と設定
        </div>
        <div className="bg-default p-4 space-y-4">
          <div>
            <p className="body-emphasis text-default mb-2">モード</p>
            <ToggleGroup
              options={MODE_OPTIONS}
              value={mode}
              onChange={handleModeChange}
              ariaLabel="モード"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 min-h-8">
              <label htmlFor="totp-secret" className="body-emphasis text-default">
                Base32 シークレット
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRegenerateSecret}
                  className="caption text-link-plain btn-link-plain"
                  aria-label="ランダム生成（新しいシークレット）"
                >
                  ランダム生成
                </button>
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="caption text-link-plain btn-link-plain"
                  aria-label={showSecret ? 'シークレットを隠す' : 'シークレットを表示する'}
                >
                  {showSecret ? '隠す' : '表示'}
                </button>
              </div>
            </div>
            <BareInput
              id="totp-secret"
              type={showSecret ? 'text' : 'password'}
              value={secretBase32}
              onChange={replaceSecret}
              placeholder="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
              mono
              aria-label="Base32 シークレット"
              error={!!secretError}
              className={regenFlash ? 'input-flash' : undefined}
            />
            {secretError && <ErrorMessage message={secretError} />}
            {/* ランダム生成の SR 通知 (#426)。条件付き mount で連打時も再 announce される。 */}
            {regenFlash && (
              <span role="status" aria-live="polite" className="sr-only">
                シークレットを再生成しました
              </span>
            )}
          </div>

          <div>
            <p className="body-emphasis text-default mb-2">アルゴリズム</p>
            <ToggleGroup
              options={ALGORITHM_OPTIONS}
              value={algorithm}
              onChange={setAlgorithm}
              ariaLabel="アルゴリズム"
            />
          </div>

          <div>
            <p className="body-emphasis text-default mb-2">桁数</p>
            <ToggleGroup
              options={DIGITS_OPTIONS}
              value={String(digits)}
              onChange={(v) => setDigits(parseInt(v, 10) as Digits)}
              ariaLabel="桁数"
            />
          </div>

          {mode !== 'hotp' && (
            <div>
              <p className="body-emphasis text-default mb-2">周期</p>
              <ToggleGroup
                options={PERIOD_OPTIONS}
                value={String(period)}
                onChange={(v) => setPeriod(parseInt(v, 10) as Period)}
                ariaLabel="周期"
              />
            </div>
          )}

          {mode === 'hotp' && (
            <div>
              <label htmlFor="hotp-counter" className="body-emphasis text-default block mb-2">
                カウンタ
              </label>
              <BareInput
                id="hotp-counter"
                type="number"
                inputMode="numeric"
                value={counterStr}
                onChange={setCounterStr}
                aria-label="カウンタ"
                error={!!counterError}
              />
              {counterError && <ErrorMessage message={counterError} />}
            </div>
          )}
        </div>
      </div>

      {/* ─── Section 2: Code Output ─── */}
      <div className="rounded-xl border border-default overflow-hidden">
        <div className="body-emphasis text-default bg-subtle border-b border-default px-4 py-3">
          {mode === 'totp'
            ? 'ワンタイムコード（TOTP）'
            : mode === 'hotp'
              ? 'ワンタイムコード（HOTP）'
              : 'コード検証（TOTP）'}
        </div>
        <div className="bg-default p-4 space-y-3">
          {(mode === 'totp' || mode === 'hotp') && (
            <>
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between min-h-10"
              >
                <span
                  className="font-mono text-3xl font-bold tracking-widest text-default select-all"
                  aria-label={`現在のコード: ${displayCode || '未生成'}`}
                >
                  {displayCode ? formatCodeDisplay(displayCode) : '─'.repeat(digits)}
                </span>
                {displayCode && <CopyButton text={displayCode} label="コードをコピー" />}
              </div>

              {mode === 'totp' && currentCode && (
                <div className="space-y-1">
                  <ProgressBar current={remainingSec} max={period} />
                  <p className="caption text-muted">
                    残り {remainingSec} 秒 / {period} 秒
                    {nextCode && (
                      <span className="ml-3">
                        次のコード:{' '}
                        <span className="font-mono text-default">
                          {formatCodeDisplay(nextCode)}
                        </span>
                      </span>
                    )}
                  </p>
                </div>
              )}

              {mode === 'hotp' && (
                <ActionButton onClick={handleGenerateHotp} variant="primary">
                  コードを生成
                </ActionButton>
              )}
            </>
          )}

          {mode === 'verify' && (
            <div className="space-y-3">
              <InputField
                id="verify-code-input"
                label="検証するコードを入力"
                value={verificationInput}
                onChange={(v) => {
                  setVerificationInput(v);
                  setVerificationResult(null);
                }}
                placeholder={'0'.repeat(digits)}
                inputMode="numeric"
                mono
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    // 将来 <form> 化したとき空入力 Cmd+Enter が submit に流れる silent regression を
                    // 防ぐため guard より前に preventDefault する。
                    e.preventDefault();
                    if (!verificationInput.trim() || verifying || !secretBytes) return;
                    handleVerify();
                  }
                }}
              />
              <div className="flex items-center gap-3">
                <ActionButton
                  onClick={handleVerify}
                  variant="primary"
                  loading={verifying}
                  disabled={!verificationInput.trim()}
                  aria-keyshortcuts="Meta+Enter Control+Enter"
                >
                  {verifying ? '検証中…' : '検証する'}
                </ActionButton>
                <kbd className="caption text-muted font-mono" aria-hidden="true">
                  Cmd/Ctrl+Enter
                </kbd>
              </div>
              {verificationResult !== null && (
                <div aria-live="assertive">
                  {verificationResult.valid ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 caption font-medium bg-success-tint text-success">
                      ✓ 有効
                      {verificationResult.offset === 0
                        ? '（現在の期間）'
                        : verificationResult.offset! > 0
                          ? `（+${verificationResult.offset} 期間先）`
                          : `（${verificationResult.offset} 期間前）`}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 caption font-medium bg-error-tint text-error-text">
                      ✗ 無効
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Section 3: otpauth URI ─── */}
      <div className="rounded-xl border border-default overflow-hidden">
        <div className="body-emphasis text-default bg-subtle border-b border-default px-4 py-3">
          otpauth:// URI（QRコード生成用）
        </div>
        <div className="bg-default p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField
              id="totp-issuer"
              label="発行者名"
              value={issuer}
              onChange={setIssuer}
              placeholder="MyApp"
              error={issuerHasColon ? '発行者名にコロンは使用できません' : undefined}
            />
            <InputField
              id="totp-account"
              label="アカウント"
              value={accountLabel}
              onChange={setAccountLabel}
              placeholder="user@example.com"
            />
          </div>
          <OutputField
            id="totp-uri-output"
            label="otpauth:// URI"
            value={otpauthUri}
            rows={3}
            mono
            resize={false}
            copyLabel="URIをコピー"
            ariaLabel="otpauth URI"
          />
          {secretBytes &&
            !issuerHasColon &&
            !(mode === 'hotp' && counterError) &&
            (!issuer.trim() || !accountLabel.trim()) && (
              <p className="caption text-muted" role="status">
                発行者名とアカウントを両方入力すると otpauth URI が生成されます。
              </p>
            )}
          {otpauthUri && (
            <p className="caption text-muted">
              このURIをコピーして{' '}
              <a href="/tools/qr-code" className="text-link-plain hover:underline">
                QRコード生成ツール
              </a>{' '}
              に貼り付けると、Google Authenticator 等で読み取れます。
            </p>
          )}
        </div>
      </div>

      {secretBase32 && (
        <div className="flex justify-end">
          <ClearButton onClick={handleClear} />
        </div>
      )}
    </div>
  );
}
