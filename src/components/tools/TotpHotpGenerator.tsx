import { useState, useEffect, useMemo } from 'react';
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
  hotp,
  totp,
  verifyTotp,
  buildOtpauthUri,
  type HashAlgo,
  type Digits,
  type Period,
} from '@/utils/totp-hotp';

export const SAMPLE_SECRET_BASE32 = 'JBSWY3DPEB3W64TMMQ';

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

  const [secretError, setSecretError] = useState('');

  const issuerHasColon = issuer.includes(':');

  useEffect(() => {
    if (mode !== 'totp') return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const secretBytes = base32Decode(secretBase32.trim());
        setSecretError('');
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
      } catch {
        if (!cancelled) {
          setSecretError('有効な Base32 形式で入力してください（A-Z, 2-7 のみ）');
          setCurrentCode('');
          setNextCode('');
        }
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode, secretBase32, algorithm, digits, period]);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setVerificationResult(null);
    setHotpCode('');
  };

  const handleGenerateHotp = async () => {
    try {
      const secretBytes = base32Decode(secretBase32.trim());
      setSecretError('');
      const counter = BigInt(Math.max(0, parseInt(counterStr, 10) || 0));
      const code = await hotp(secretBytes, counter, { algorithm, digits });
      setHotpCode(code);
    } catch {
      setSecretError('有効な Base32 形式で入力してください（A-Z, 2-7 のみ）');
      setHotpCode('');
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerificationResult(null);
    try {
      const secretBytes = base32Decode(secretBase32.trim());
      setSecretError('');
      const result = await verifyTotp(verificationInput.trim(), secretBytes, {
        algorithm,
        digits,
        period,
      });
      setVerificationResult(result);
    } catch {
      setSecretError('有効な Base32 形式で入力してください（A-Z, 2-7 のみ）');
    } finally {
      setVerifying(false);
    }
  };

  const otpauthUri = useMemo(() => {
    if (issuerHasColon || !secretBase32.trim()) return '';
    try {
      base32Decode(secretBase32.trim());
      return buildOtpauthUri({
        type: (mode === 'verify' ? 'totp' : mode) as 'totp' | 'hotp',
        issuer: issuer.trim() || 'MyApp',
        account: accountLabel.trim() || 'user@example.com',
        secretBase32: secretBase32.trim(),
        algorithm,
        digits,
        period: mode !== 'hotp' ? period : undefined,
        counter: mode === 'hotp' ? BigInt(Math.max(0, parseInt(counterStr, 10) || 0)) : undefined,
      });
    } catch {
      return '';
    }
  }, [
    mode,
    secretBase32,
    issuer,
    accountLabel,
    algorithm,
    digits,
    period,
    counterStr,
    issuerHasColon,
  ]);

  const handleClear = () => {
    setSecretBase32('');
    setCurrentCode('');
    setNextCode('');
    setHotpCode('');
    setVerificationInput('');
    setVerificationResult(null);
    setSecretError('');
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
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="caption text-link-color btn-link-plain"
                aria-label={showSecret ? 'シークレットを隠す' : 'シークレットを表示する'}
              >
                {showSecret ? '隠す' : '表示'}
              </button>
            </div>
            <BareInput
              id="totp-secret"
              type={showSecret ? 'text' : 'password'}
              value={secretBase32}
              onChange={(v) => {
                setSecretBase32(v);
                setCurrentCode('');
                setHotpCode('');
                setVerificationResult(null);
              }}
              placeholder="JBSWY3DPEB3W64TMMQ"
              mono
              aria-label="Base32 シークレット"
              error={!!secretError}
            />
            {secretError && <ErrorMessage message={secretError} />}
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
              />
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
              />
              <ActionButton
                onClick={handleVerify}
                variant="primary"
                loading={verifying}
                disabled={!verificationInput.trim()}
              >
                {verifying ? '検証中…' : '検証する'}
              </ActionButton>
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
          {otpauthUri && (
            <p className="caption text-muted">
              このURIをコピーして{' '}
              <a href="/tools/qr-code" className="text-link-color hover:underline">
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
