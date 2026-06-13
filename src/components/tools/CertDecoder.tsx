import { useState, useEffect, useCallback, useRef } from 'react';
import { InputField } from '@/components/ui/InputField';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { OutputField } from '@/components/ui/OutputField';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import {
  parseCertificates,
  parseDerCertificates,
  parsePkcs12,
  looksLikePkcs12,
  buildChain,
} from '@/utils/cert';
import type { ParsedCert, ChainResult, ParseResult, Pkcs12KeyInfo } from '@/utils/cert';
import { SAMPLE_CERT_CHAIN_PEM } from './certDecoderSample';

// ---- 内部ユーティリティ ----

function formatDate(d: Date): string {
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

function isExpired(d: Date): boolean {
  return d.getTime() < Date.now();
}

/** PEM -----BEGIN PKCS12----- の本文を base64 デコードして Uint8Array に変換する */
function pemPkcs12ToBytes(pem: string): Uint8Array {
  const match = /-----BEGIN PKCS12-----([\s\S]*?)-----END PKCS12-----/i.exec(pem);
  if (!match) return new Uint8Array(0);
  const b64 = match[1].replace(/\s/g, '');
  return base64ToBytesSafe(b64) ?? new Uint8Array(0);
}

/** try/catch 付き atob ヘルパー */
function base64ToBytesSafe(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** テキストファイルをダウンロードする */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- 証明書カード ----

interface CertCardProps {
  cert: ParsedCert;
  /** チェーンリンク情報（順序付き表示用） */
  signatureValid: boolean | null;
  expired: boolean;
  /** チェーン表示順での位置（0 = 先頭）*/
  chainPosition: number;
  totalInChain: number;
}

/**
 * 証明書のチェーン上の役割ラベルを返す。
 * 自己署名（subject == issuer）のみ「ルート CA」とし、root 未添付時に
 * 先頭の中間証明書を誤って「ルート CA」と表示しないようにする。
 */
function certRoleLabel(cert: ParsedCert, chainPosition: number, totalInChain: number): string {
  if (cert.subject.full === cert.issuer.full) return 'ルート CA（自己署名）';
  if (chainPosition === totalInChain - 1) return 'リーフ（サーバ証明書）';
  return chainPosition === 0 ? '中間 CA' : `中間 CA (${chainPosition})`;
}

/**
 * 証明書カード内のアコーディオンセクション（DADS Accordion 準拠）。
 * 左側に円形ボーダー付き chevron アイコンを置き、開閉時に 180° 回転させる。
 */
interface CertSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CertSection({ title, defaultOpen = false, children }: CertSectionProps) {
  return (
    <details open={defaultOpen}>
      <summary className="px-4 py-3 cursor-pointer hover-bg-subtle summary-no-marker flex items-center gap-2">
        <span
          className="cert-chevron shrink-0 inline-flex items-center justify-center size-5 rounded-full border border-current bg-default text-primary"
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path
              d="M16.668 5.5L10.0013 12.1667L3.33464 5.5L2.16797 6.66667L10.0013 14.5L17.8346 6.66667L16.668 5.5Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="body-emphasis text-default">{title}</span>
      </summary>
      {children}
    </details>
  );
}

function CertCard({ cert, signatureValid, expired, chainPosition, totalInChain }: CertCardProps) {
  const positionLabel = certRoleLabel(cert, chainPosition, totalInChain);

  if (cert.error) {
    return (
      <div className="rounded-xl border border-default overflow-hidden">
        <div className="bg-subtle px-4 py-3 border-b border-default flex items-center gap-2">
          <span className="body-emphasis text-default">証明書 #{chainPosition + 1}</span>
          <ChipLabel tone="error">パース失敗</ChipLabel>
        </div>
        <div className="bg-default p-4">
          <ErrorMessage message={cert.error} variant="block" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-default overflow-hidden">
      {/* カードヘッダー */}
      <div className="bg-subtle px-4 py-3 border-b border-default flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="body-emphasis text-default">
            {cert.subject.attributes.find((a) => a.type === 'CN')?.value ?? cert.subject.full}
          </span>
          <ChipLabel tone="neutral">{positionLabel}</ChipLabel>
          {expired && <ChipLabel tone="error">期限切れ</ChipLabel>}
          {!expired && cert.isCa && <ChipLabel tone="info">CA</ChipLabel>}
        </div>
        {signatureValid !== null && (
          <span
            className={`caption font-medium px-2 py-0.5 rounded-full ${
              signatureValid ? 'bg-success-tint text-success' : 'bg-error-tint text-error-text'
            }`}
          >
            {signatureValid ? '✓ 署名有効' : '✗ 署名無効'}
          </span>
        )}
      </div>

      {/* カード本体 */}
      <div className="bg-default divide-y divide-subtle">
        {/* 基本情報 */}
        <CertSection title="基本情報" defaultOpen>
          <div className="px-4 pb-4 pt-2 space-y-2">
            <CertField label="サブジェクト (Subject)" value={cert.subject.full} copyable />
            <CertField label="発行者 (Issuer)" value={cert.issuer.full} copyable />
            <CertField label="シリアル番号" value={cert.serialNumberHex} mono />
            <CertField
              label="有効期限（開始）"
              value={formatDate(cert.notBefore)}
              tone={cert.notBefore > new Date() ? 'error' : undefined}
            />
            <CertField
              label="有効期限（終了）"
              value={formatDate(cert.notAfter)}
              tone={isExpired(cert.notAfter) ? 'error' : undefined}
            />
            <CertField
              label="フィンガープリント (SHA-256)"
              value={cert.fingerprintSha256}
              mono
              copyable
            />
          </div>
        </CertSection>

        {/* SAN */}
        {cert.san.length > 0 && (
          <CertSection title="サブジェクト代替名 (SAN)" defaultOpen>
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-start gap-2">
                <div className="font-mono caption text-default break-all flex-1">
                  {cert.san.join('\n')}
                </div>
                <CopyButton text={cert.san.join('\n')} label="コピー" />
              </div>
            </div>
          </CertSection>
        )}

        {/* 拡張 */}
        {(cert.keyUsage.length > 0 ||
          cert.extKeyUsage.length > 0 ||
          cert.pathLen !== undefined) && (
          <CertSection title="拡張">
            <div className="px-4 pb-4 pt-2 space-y-2">
              {cert.keyUsage.length > 0 && (
                <CertField label="KeyUsage" value={cert.keyUsage.join(', ')} />
              )}
              {cert.extKeyUsage.length > 0 && (
                <CertField label="ExtKeyUsage" value={cert.extKeyUsage.join(', ')} />
              )}
              {cert.isCa && (
                <CertField
                  label="BasicConstraints"
                  value={`cA=true${cert.pathLen !== undefined ? `, pathLen=${cert.pathLen}` : ''}`}
                />
              )}
              {cert.subjectKeyId && (
                <CertField label="SubjectKeyIdentifier" value={cert.subjectKeyId} mono />
              )}
              {cert.authorityKeyId && (
                <CertField label="AuthorityKeyIdentifier" value={cert.authorityKeyId} mono />
              )}
            </div>
          </CertSection>
        )}

        {/* 公開鍵 */}
        <CertSection title="公開鍵">
          <div className="px-4 pb-4 pt-2 space-y-2">
            <CertField label="アルゴリズム" value={cert.publicKey.algorithm} />
            {cert.publicKey.keySizeBits && (
              <CertField label="鍵長" value={`${cert.publicKey.keySizeBits} bit`} />
            )}
            {cert.publicKey.namedCurve && (
              <CertField label="曲線" value={cert.publicKey.namedCurve} />
            )}
          </div>
        </CertSection>

        {/* 署名 */}
        <CertSection title="署名">
          <div className="px-4 pb-4 pt-2">
            <CertField label="署名アルゴリズム" value={cert.signatureAlgorithm} />
          </div>
        </CertSection>

        {/* SCT */}
        {cert.sct.length > 0 && (
          <CertSection title="SCT（証明書透明性）">
            <div className="px-4 pb-4 pt-2 space-y-3">
              {cert.sct.map((sct, i) => (
                <div key={i} className="rounded-lg bg-subtle p-3 space-y-1">
                  <CertField label="バージョン" value={String(sct.version)} />
                  <CertField label="タイムスタンプ" value={formatDate(new Date(sct.timestamp))} />
                  <CertField label="Log ID" value={sct.logId} mono />
                </div>
              ))}
            </div>
          </CertSection>
        )}
      </div>
    </div>
  );
}

interface CertFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  /** 'error' = 赤テキスト */
  tone?: 'error';
}

function CertField({ label, value, mono, copyable, tone }: CertFieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="caption text-muted">{label}</dt>
      <dd
        className={`flex items-start gap-2 ${mono ? 'font-mono' : ''} caption ${tone === 'error' ? 'text-error' : 'text-default'} break-all`}
      >
        <span className="flex-1">{value}</span>
        {copyable && <CopyButton text={value} label="コピー" />}
      </dd>
    </div>
  );
}

// ---- チェーンステータスバナー ----

interface ChainBannerProps {
  chainResult: ChainResult;
  certs: ParsedCert[];
}

function ChainBanner({ chainResult, certs }: ChainBannerProps) {
  const { order, links } = chainResult;
  const verifiableLinks = links.filter((l) => l.signatureValid !== null);
  const allValid = verifiableLinks.length > 0 && verifiableLinks.every((l) => l.signatureValid);
  const anyInvalid = verifiableLinks.some((l) => l.signatureValid === false);
  const anyExpired = links.some((l) => l.expired);
  const certCount = order.length;

  if (certCount <= 1 && !anyExpired && !anyInvalid) return null;

  const variant = anyInvalid ? 'error' : anyExpired ? 'warning' : 'success';
  const title = anyInvalid
    ? 'チェーン署名検証: 無効なリンクがあります'
    : anyExpired
      ? 'チェーン: 期限切れの証明書があります'
      : allValid
        ? 'チェーン署名検証: すべて有効'
        : `チェーン: ${certCount} 枚の証明書を検出`;

  return (
    <NotificationBanner variant={variant} title={title}>
      <div className="mt-2 space-y-1">
        {order.map((certIdx, pos) => {
          const cert = certs[certIdx];
          const link = links.find((l) => l.subjectIndex === certIdx);
          const cn =
            cert.subject.attributes.find((a) => a.type === 'CN')?.value ?? cert.subject.full;
          return (
            <div key={certIdx} className="flex items-center gap-2 caption text-default">
              <span className="text-muted">
                {cert.subject.full === cert.issuer.full
                  ? 'Root'
                  : pos === order.length - 1
                    ? 'Leaf'
                    : 'Int.'}
              </span>
              <span className="font-mono truncate">{cn}</span>
              {link?.signatureValid !== null && (
                <span
                  className={
                    link?.signatureValid ? 'text-success font-medium' : 'text-error font-medium'
                  }
                >
                  {link?.signatureValid ? '✓' : '✗'}
                </span>
              )}
              {link?.expired && <span className="text-error caption">期限切れ</span>}
            </div>
          );
        })}
      </div>
    </NotificationBanner>
  );
}

// ---- 秘密鍵セクション ----

interface PrivateKeySectionProps {
  privateKeys: Pkcs12KeyInfo[];
}

function PrivateKeySection({ privateKeys }: PrivateKeySectionProps) {
  if (privateKeys.length === 0) return null;
  return (
    <div className="space-y-3">
      <NotificationBanner variant="info" title="秘密鍵はブラウザ外に送信されません">
        このツールの全処理はブラウザ内で完結します。入力した PKCS#12
        と抽出した秘密鍵は外部サーバーに送信されません。
      </NotificationBanner>
      {privateKeys.map((key, i) => (
        <div key={i} className="rounded-xl border border-default overflow-hidden">
          <div className="bg-subtle px-4 py-3 border-b border-default flex flex-wrap items-center gap-2">
            <span className="body-emphasis text-default">秘密鍵 #{i + 1}</span>
            <ChipLabel tone="error">秘密鍵</ChipLabel>
            <ChipLabel tone="neutral">{key.algorithm}</ChipLabel>
            {key.keySizeBits && <ChipLabel tone="neutral">{key.keySizeBits} bit</ChipLabel>}
            {key.namedCurve && <ChipLabel tone="neutral">{key.namedCurve}</ChipLabel>}
          </div>
          <div className="bg-default p-4">
            <details>
              <summary className="cursor-pointer body-emphasis text-default">
                秘密鍵（PKCS#8 PEM）を表示
              </summary>
              <div className="mt-3">
                <OutputField
                  id={`pkcs12-key-${i}`}
                  label="PKCS#8 PEM"
                  value={key.pkcs8Pem}
                  rows={8}
                  rightSlot={
                    <DownloadButton
                      label="保存"
                      aria-label="秘密鍵 PEM をダウンロード"
                      onClick={() => downloadText(`private_key_${i + 1}.pem`, key.pkcs8Pem)}
                    />
                  }
                />
              </div>
            </details>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- メインコンポーネント ----

type DecodeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'awaiting-password'; bytes: Uint8Array; error?: string }
  | { status: 'decrypting' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; message: string }
  | {
      status: 'done';
      parseResult: ParseResult;
      chainResult: ChainResult;
      privateKeys?: Pkcs12KeyInfo[];
    };

export function CertDecoder() {
  const [input, setInput] = useState('');
  const [decodeState, setDecodeState] = useState<DecodeState>({ status: 'idle' });
  const [password, setPassword] = useState('');
  // awaiting-password 状態の bytes を useRef で保持（再レンダー時も安定）
  const pendingBytesRef = useRef<Uint8Array | null>(null);
  // 最新の decodeState を effect から参照するための ref（依存配列に入れずに現在値を読む）
  const decodeStateRef = useRef<DecodeState>(decodeState);
  decodeStateRef.current = decodeState;

  // デバウンス + 非同期パース
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      // PKCS#12 ファイル選択時は handleFileChange が input を '' にクリアしつつ
      // awaiting-password へ遷移する。この effect が idle で上書きすると
      // パスワード入力 UI が消えるため、PKCS#12 フロー中は idle 化しない。
      const status = decodeStateRef.current.status;
      if (status !== 'awaiting-password' && status !== 'decrypting' && status !== 'unsupported') {
        setDecodeState({ status: 'idle' });
      }
      return;
    }

    setDecodeState({ status: 'loading' });
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const parseResult = await parseCertificates(trimmed);

        if (cancelled) return;

        // PKCS#12（PEM ラベル検出 or Base64 貼り付け）
        const stripped = trimmed.replace(/\s/g, '');
        const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(stripped);
        if (parseResult.unsupported === 'pkcs12') {
          const bytes = pemPkcs12ToBytes(trimmed);
          pendingBytesRef.current = bytes;
          setPassword('');
          setDecodeState({ status: 'awaiting-password', bytes });
          return;
        }
        // Base64 貼り付けが PKCS#12（PFX）構造に見える場合はパスワード UI へ。
        // p12 は先頭 0x30 のため detect では DER 証明書扱いになりパース失敗
        // （error 付き cert 1 件）となる。certs.length ではなく構造判定で振り分ける。
        if (isBase64) {
          const bytes = base64ToBytesSafe(stripped);
          if (bytes && looksLikePkcs12(bytes)) {
            pendingBytesRef.current = bytes;
            setPassword('');
            setDecodeState({ status: 'awaiting-password', bytes });
            return;
          }
        }

        if (parseResult.topLevelError && parseResult.certs.length === 0) {
          setDecodeState({ status: 'error', message: parseResult.topLevelError });
          return;
        }

        const chainResult = await buildChain(parseResult.certs);
        if (cancelled) return;

        setDecodeState({ status: 'done', parseResult, chainResult });
      } catch (err) {
        if (!cancelled) {
          setDecodeState({
            status: 'error',
            message: err instanceof Error ? err.message : '解析中にエラーが発生しました',
          });
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  // PKCS#12 パスワード復号ハンドラ
  const handleDecryptPkcs12 = useCallback(async (bytes: Uint8Array, pwd: string) => {
    setDecodeState({ status: 'decrypting' });
    const result = await parsePkcs12(bytes, pwd);
    if (result.errorKind === 'wrong-password') {
      setDecodeState({
        status: 'awaiting-password',
        bytes,
        error: result.error ?? 'パスワードが正しくありません。',
      });
      return;
    }
    if (result.errorKind === 'unsupported-encryption') {
      setDecodeState({ status: 'unsupported', reason: result.error! });
      return;
    }
    if (result.error) {
      setDecodeState({ status: 'error', message: result.error });
      return;
    }
    const parseResult = await parseDerCertificates(result.certs);
    const chainResult = await buildChain(parseResult.certs);
    setDecodeState({ status: 'done', parseResult, chainResult, privateKeys: result.privateKeys });
  }, []);

  // ファイル読み込み
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // PKCS#12（.p12/.pfx）の場合はパスワード入力モードへ
    const isPkcs12 = ['.p12', '.pfx'].some((ext) => file.name.toLowerCase().endsWith(ext));
    if (isPkcs12) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      pendingBytesRef.current = bytes;
      setInput(''); // text 経路の解析を止める
      setPassword('');
      setDecodeState({ status: 'awaiting-password', bytes });
      e.target.value = '';
      return;
    }

    const binaryExtensions = ['.der', '.cer'];
    const isBinary = binaryExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (isBinary) {
      const buf = await file.arrayBuffer();
      // バイナリファイルは Base64 PEM に変換してテキスト入力欄に渡す。
      // String.fromCharCode(...bytes) の spread は巨大ファイルでスタック超過の恐れがあるため
      // チャンク単位で連結する。
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const b64 = btoa(binary);
      const lines = b64.match(/.{1,64}/g) ?? [];
      setInput(`-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`);
    } else {
      const text = await file.text();
      setInput(text);
    }

    // input をリセットして同じファイルを再選択可能にする
    e.target.value = '';
  }, []);

  return (
    <div className="space-y-6">
      {/* 入力エリア */}
      <div className="space-y-3">
        <InputField
          id="cert-input"
          label="証明書を貼り付け"
          value={input}
          onChange={setInput}
          onSampleClick={() => setInput(SAMPLE_CERT_CHAIN_PEM)}
          placeholder={'-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----'}
          hint="対応形式: PEM / DER（Base64）/ PKCS#7（.p7b）/ PKCS#12（.p12/.pfx）"
          multiline
          rows={6}
          mono
          resize
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <FileInputButton accept=".pem,.crt,.cer,.der,.p7b,.p12,.pfx" onChange={handleFileChange}>
            ファイルを選択
          </FileInputButton>
          <span className="caption text-muted">.pem / .crt / .cer / .der / .p7b / .p12 / .pfx</span>
        </div>
      </div>

      {/* PKCS#12 パスワード入力 UI */}
      {decodeState.status === 'awaiting-password' && (
        <div className="space-y-3">
          <NotificationBanner variant="info" title="PKCS#12 ファイルが検出されました">
            パスワードを入力して証明書・秘密鍵を解析します。入力したデータはブラウザ外に送信されません。
          </NotificationBanner>
          {decodeState.error && <ErrorMessage message={decodeState.error} variant="block" />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="pkcs12-password" className="body-emphasis text-default block mb-1">
                パスワード
              </label>
              <input
                id="pkcs12-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password.length > 0) {
                    handleDecryptPkcs12(decodeState.bytes, password);
                  }
                }}
                placeholder="PKCS#12 のパスワード"
                className="caption w-full rounded-lg border border-default bg-default text-default px-3 py-2"
                autoComplete="current-password"
              />
            </div>
            <ActionButton
              variant="primary"
              onClick={() => handleDecryptPkcs12(decodeState.bytes, password)}
              disabled={password.length === 0}
            >
              解析
            </ActionButton>
          </div>
        </div>
      )}

      {/* 復号中 */}
      {decodeState.status === 'decrypting' && (
        <p className="caption text-muted" aria-live="polite">
          復号中…
        </p>
      )}

      {/* レガシー暗号バナー */}
      {decodeState.status === 'unsupported' && (
        <NotificationBanner
          variant="warning"
          title="この PKCS#12 はブラウザで復号できません（レガシー暗号）"
        >
          {decodeState.reason}
        </NotificationBanner>
      )}

      {/* 入力エラー */}
      {decodeState.status === 'error' && (
        <ErrorMessage message={decodeState.message} variant="block" />
      )}

      {/* デコード結果 */}
      {decodeState.status === 'done' && (
        <div className="space-y-4" role="status" aria-live="polite">
          {/* 秘密鍵セクション（証明書カードの前） */}
          {decodeState.privateKeys && decodeState.privateKeys.length > 0 && (
            <PrivateKeySection privateKeys={decodeState.privateKeys} />
          )}

          {/* チェーンバナー（複数枚・問題あり時） */}
          <ChainBanner
            chainResult={decodeState.chainResult}
            certs={decodeState.parseResult.certs}
          />

          {/* 証明書カード列（チェーン順） */}
          {decodeState.chainResult.order.map((certIdx, pos) => {
            const cert = decodeState.parseResult.certs[certIdx];
            const link = decodeState.chainResult.links.find((l) => l.subjectIndex === certIdx);
            return (
              <CertCard
                key={certIdx}
                cert={cert}
                signatureValid={link?.signatureValid ?? null}
                expired={link?.expired ?? isExpired(cert.notAfter)}
                chainPosition={pos}
                totalInChain={decodeState.chainResult.order.length}
              />
            );
          })}

          {/* チェーンに含まれない証明書（孤立）があれば末尾に追加 */}
          {decodeState.parseResult.certs
            .map((cert, idx) => ({ cert, idx }))
            .filter(({ idx }) => !decodeState.chainResult.order.includes(idx))
            .map(({ cert, idx }, pos) => {
              const link = decodeState.chainResult.links.find((l) => l.subjectIndex === idx);
              return (
                <CertCard
                  key={idx}
                  cert={cert}
                  signatureValid={link?.signatureValid ?? null}
                  expired={link?.expired ?? isExpired(cert.notAfter)}
                  chainPosition={decodeState.chainResult.order.length + pos}
                  totalInChain={decodeState.parseResult.certs.length}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
