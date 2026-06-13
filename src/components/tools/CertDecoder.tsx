import { useState, useEffect, useCallback } from 'react';
import { InputField } from '@/components/ui/InputField';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { parseCertificates, buildChain } from '@/utils/cert';
import type { ParsedCert, ChainResult, ParseResult } from '@/utils/cert';

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

// ---- 証明書カード ----

interface CertCardProps {
  cert: ParsedCert;
  index: number;
  /** チェーンリンク情報（順序付き表示用） */
  signatureValid: boolean | null;
  expired: boolean;
  /** ルートから何番目か（0 = ルート）*/
  chainPosition: number;
  totalInChain: number;
}

function CertCard({ cert, signatureValid, expired, chainPosition, totalInChain }: CertCardProps) {
  const positionLabel =
    chainPosition === 0
      ? 'ルート CA'
      : chainPosition === totalInChain - 1
        ? 'リーフ（サーバ証明書）'
        : `中間 CA (${chainPosition})`;

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
              signatureValid
                ? 'bg-success-tint text-success'
                : 'bg-error-tint text-error-text'
            }`}
          >
            {signatureValid ? '✓ 署名有効' : '✗ 署名無効'}
          </span>
        )}
      </div>

      {/* カード本体 */}
      <div className="bg-default divide-y divide-default">
        {/* 基本情報 */}
        <details open>
          <summary className="px-4 py-3 body-emphasis text-default cursor-pointer hover-bg-subtle list-none flex items-center justify-between">
            <span>基本情報</span>
            <span className="caption text-muted cert-chevron" aria-hidden="true">▾</span>
          </summary>
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
        </details>

        {/* SAN */}
        {cert.san.length > 0 && (
          <details open>
            <summary className="px-4 py-3 body-emphasis text-default cursor-pointer hover-bg-subtle list-none flex items-center justify-between">
              <span>サブジェクト代替名 (SAN)</span>
              <span className="caption text-muted" aria-hidden="true">▾</span>
            </summary>
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-start gap-2">
                <div className="font-mono caption text-default break-all flex-1">
                  {cert.san.join('\n')}
                </div>
                <CopyButton text={cert.san.join('\n')} label="コピー" />
              </div>
            </div>
          </details>
        )}

        {/* 拡張 */}
        {(cert.keyUsage.length > 0 || cert.extKeyUsage.length > 0 || cert.pathLen !== undefined) && (
          <details>
            <summary className="px-4 py-3 body-emphasis text-default cursor-pointer hover-bg-subtle list-none flex items-center justify-between">
              <span>拡張</span>
              <span className="caption text-muted" aria-hidden="true">▾</span>
            </summary>
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
          </details>
        )}

        {/* 公開鍵 */}
        <details>
          <summary className="px-4 py-3 body-emphasis text-default cursor-pointer hover-bg-subtle list-none flex items-center justify-between">
            <span>公開鍵</span>
            <span className="caption text-muted" aria-hidden="true">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 space-y-2">
            <CertField label="アルゴリズム" value={cert.publicKey.algorithm} />
            {cert.publicKey.keySizeBits && (
              <CertField label="鍵長" value={`${cert.publicKey.keySizeBits} bit`} />
            )}
            {cert.publicKey.namedCurve && (
              <CertField label="曲線" value={cert.publicKey.namedCurve} />
            )}
          </div>
        </details>

        {/* 署名 */}
        <details>
          <summary className="px-4 py-3 body-emphasis text-default cursor-pointer hover-bg-subtle list-none flex items-center justify-between">
            <span>署名</span>
            <span className="caption text-muted" aria-hidden="true">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2">
            <CertField label="署名アルゴリズム" value={cert.signatureAlgorithm} />
          </div>
        </details>

        {/* SCT */}
        {cert.sct.length > 0 && (
          <details>
            <summary className="px-4 py-3 body-emphasis text-default cursor-pointer hover-bg-subtle list-none flex items-center justify-between">
              <span>SCT（証明書透明性）</span>
              <span className="caption text-muted" aria-hidden="true">▾</span>
            </summary>
            <div className="px-4 pb-4 pt-2 space-y-3">
              {cert.sct.map((sct, i) => (
                <div key={i} className="rounded-lg bg-subtle p-3 space-y-1">
                  <CertField label="バージョン" value={String(sct.version)} />
                  <CertField label="タイムスタンプ" value={formatDate(new Date(sct.timestamp))} />
                  <CertField label="Log ID" value={sct.logId} mono />
                </div>
              ))}
            </div>
          </details>
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
      <dd className={`flex items-start gap-2 ${mono ? 'font-mono' : ''} caption ${tone === 'error' ? 'text-error' : 'text-default'} break-all`}>
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
                {pos === 0 ? 'Root' : pos === order.length - 1 ? 'Leaf' : `Int.${pos}`}
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

// ---- メインコンポーネント ----

type DecodeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'pkcs12' }
  | { status: 'error'; message: string }
  | { status: 'done'; parseResult: ParseResult; chainResult: ChainResult };

export function CertDecoder() {
  const [input, setInput] = useState('');
  const [decodeState, setDecodeState] = useState<DecodeState>({ status: 'idle' });

  // デバウンス + 非同期パース
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setDecodeState({ status: 'idle' });
      return;
    }

    setDecodeState({ status: 'loading' });
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const parseResult = await parseCertificates(trimmed);

        if (cancelled) return;

        if (parseResult.unsupported === 'pkcs12') {
          setDecodeState({ status: 'pkcs12' });
          return;
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

  // ファイル読み込み
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const binaryExtensions = ['.der', '.cer'];
    const isBinary = binaryExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (isBinary) {
      const buf = await file.arrayBuffer();
      // バイナリファイルは Base64 PEM に変換してテキスト入力欄に渡す
      const bytes = new Uint8Array(buf);
      const b64 = btoa(String.fromCharCode(...bytes));
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
          label="証明書を貼り付け（PEM / Base64 DER）"
          value={input}
          onChange={setInput}
          placeholder={
            '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----'
          }
          multiline
          rows={6}
          mono
          resize
        />
        <div className="flex items-center gap-3">
          <FileInputButton
            accept=".pem,.crt,.cer,.der,.p7b"
            onChange={handleFileChange}
          >
            ファイルを選択
          </FileInputButton>
          <span className="caption text-muted">.pem / .crt / .cer / .der / .p7b</span>
        </div>
      </div>

      {/* PKCS#12 未対応バナー */}
      {decodeState.status === 'pkcs12' && (
        <NotificationBanner variant="warning" title="PKCS#12（.pfx / .p12）は v1 非対応です">
          秘密鍵を含む PKCS#12 ファイルのパースは別ツールで対応予定です。PEM / DER /
          PKCS#7 形式の証明書をご利用ください。
        </NotificationBanner>
      )}

      {/* 入力エラー */}
      {decodeState.status === 'error' && (
        <ErrorMessage message={decodeState.message} variant="block" />
      )}

      {/* デコード結果 */}
      {decodeState.status === 'done' && (
        <div className="space-y-4" role="status" aria-live="polite">
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
                index={certIdx}
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
                  index={idx}
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
