/**
 * CsrGenerator.tsx
 *
 * CSR（証明書署名要求）・鍵ペアジェネレータ。
 * - 生成モード: RSA / ECDSA の鍵ペアを生成し PKCS#10 CSR を出力する。
 * - 解析モード: 既存 CSR を解析して Subject/SAN/公開鍵/署名検証結果を表示する。
 * 秘密鍵はブラウザ外に一切送信しない。
 */
import { useState, useCallback, useId } from 'react';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { generateCsr, parseCsr } from '@/utils/csr';
import type { GenerateParams, GenerateResult, CsrParseResult, SanEntry, SubjectDn } from '@/utils/csr';
import { SAMPLE_CSR } from './csrGeneratorSample';

// ---- ダウンロードヘルパー ----

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- 状態型 ----

type Mode = 'generate' | 'parse';
type KeyAlg = 'RSA' | 'ECDSA';
type RsaLen = '2048' | '4096';
type EcCurve = 'P-256' | 'P-384';

type GenerateState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: GenerateResult }
  | { status: 'error'; message: string };

type ParseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: CsrParseResult }
  | { status: 'error'; message: string };

// ---- SAN エントリ入力コンポーネント ----

interface SanRowProps {
  entry: SanEntry & { id: string };
  onChange: (id: string, field: 'type' | 'value', val: string) => void;
  onRemove: (id: string) => void;
}

function SanRow({ entry, onChange, onRemove }: SanRowProps) {
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        options={[
          { value: 'dns', label: 'DNS' },
          { value: 'ip', label: 'IP' },
          { value: 'email', label: 'Email' },
        ]}
        value={entry.type}
        onChange={(v) => onChange(entry.id, 'type', v)}
        ariaLabel="SAN タイプ"
        size="sm"
      />
      <input
        type="text"
        value={entry.value}
        onChange={(e) => onChange(entry.id, 'value', e.target.value)}
        placeholder={
          entry.type === 'dns'
            ? 'example.com'
            : entry.type === 'ip'
              ? '192.0.2.1'
              : 'user@example.com'
        }
        className="caption flex-1 min-w-0 rounded-lg px-3 py-2 border border-input bg-default text-default"
        aria-label="SAN 値"
      />
      <button
        type="button"
        className="caption btn-remove-card shrink-0"
        onClick={() => onRemove(entry.id)}
        aria-label="この SAN エントリを削除"
      >
        ✕
      </button>
    </div>
  );
}

// ---- メインコンポーネント ----

export function CsrGenerator() {
  const uid = useId();

  // ---- モード ----
  const [mode, setMode] = useState<Mode>('generate');

  // ---- 生成モード ----
  const [keyAlg, setKeyAlg] = useState<KeyAlg>('RSA');
  const [rsaLen, setRsaLen] = useState<RsaLen>('2048');
  const [ecCurve, setEcCurve] = useState<EcCurve>('P-256');
  const [subject, setSubject] = useState<SubjectDn>({
    commonName: '',
    organization: '',
    organizationalUnit: '',
    country: '',
    state: '',
    locality: '',
    email: '',
  });
  const [sanEntries, setSanEntries] = useState<Array<SanEntry & { id: string }>>([
    { id: `san-0`, type: 'dns', value: '' },
  ]);
  const [genState, setGenState] = useState<GenerateState>({ status: 'idle' });

  // ---- 解析モード ----
  const [parseInput, setParseInput] = useState('');
  const [parseState, setParseState] = useState<ParseState>({ status: 'idle' });

  // ---- SAN 操作 ----
  const handleSanChange = useCallback(
    (id: string, field: 'type' | 'value', val: string) => {
      setSanEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, [field]: val as SanEntry['type'] } : e))
      );
    },
    []
  );

  const handleSanAdd = useCallback(() => {
    setSanEntries((prev) => [
      ...prev,
      { id: `san-${Date.now()}`, type: 'dns', value: '' },
    ]);
  }, []);

  const handleSanRemove = useCallback((id: string) => {
    setSanEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ---- 生成 ----
  const handleGenerate = useCallback(async () => {
    setGenState({ status: 'loading' });
    try {
      const params: GenerateParams = {
        algorithm: keyAlg,
        rsaModulusLength: Number(rsaLen) as 2048 | 4096,
        ecCurve: ecCurve as 'P-256' | 'P-384',
        subject,
        san: sanEntries.map(({ type, value }) => ({ type, value })),
      };
      const result = await generateCsr(params);
      setGenState({ status: 'done', result });
    } catch (err) {
      setGenState({
        status: 'error',
        message: err instanceof Error ? err.message : 'CSR の生成中にエラーが発生しました',
      });
    }
  }, [keyAlg, rsaLen, ecCurve, subject, sanEntries]);

  // ---- 解析 ----
  const handleParse = useCallback(async (pem?: string) => {
    const input = pem ?? parseInput;
    if (!input.trim()) {
      setParseState({ status: 'error', message: 'CSR を入力してください。' });
      return;
    }
    if (pem !== undefined) setParseInput(pem);
    setParseState({ status: 'loading' });
    try {
      const result = await parseCsr(input);
      if (result.error) {
        setParseState({ status: 'error', message: result.error });
      } else {
        setParseState({ status: 'done', result });
      }
    } catch (err) {
      setParseState({
        status: 'error',
        message: err instanceof Error ? err.message : 'CSR の解析中にエラーが発生しました',
      });
    }
  }, [parseInput]);

  const genResult = genState.status === 'done' ? genState.result : null;
  const parseResult = parseState.status === 'done' ? parseState.result : null;

  return (
    <div className="space-y-6">
      {/* モード切り替え */}
      <ToggleGroup
        options={[
          { value: 'generate', label: '生成' },
          { value: 'parse', label: '解析' },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setGenState({ status: 'idle' });
          setParseState({ status: 'idle' });
        }}
        ariaLabel="動作モード"
      />

      {/* ========== 生成モード ========== */}
      {mode === 'generate' && (
        <div className="space-y-6">
          {/* アルゴリズム選択 */}
          <div className="space-y-3">
            <p className="body-emphasis text-default">鍵アルゴリズム</p>
            <ToggleGroup
              options={[
                { value: 'RSA', label: 'RSA' },
                { value: 'ECDSA', label: 'ECDSA' },
              ]}
              value={keyAlg}
              onChange={(v) => setKeyAlg(v)}
              ariaLabel="鍵アルゴリズム"
            />
            {keyAlg === 'RSA' && (
              <ToggleGroup
                options={[
                  { value: '2048', label: '2048 bit' },
                  { value: '4096', label: '4096 bit' },
                ]}
                value={rsaLen}
                onChange={(v) => setRsaLen(v)}
                ariaLabel="RSA 鍵長"
                size="sm"
              />
            )}
            {keyAlg === 'ECDSA' && (
              <ToggleGroup
                options={[
                  { value: 'P-256', label: 'P-256' },
                  { value: 'P-384', label: 'P-384' },
                ]}
                value={ecCurve}
                onChange={(v) => setEcCurve(v)}
                ariaLabel="EC 曲線"
                size="sm"
              />
            )}
          </div>

          {/* Subject DN */}
          <div className="space-y-3">
            <p className="body-emphasis text-default">Subject（識別名）</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InputField
                id={`${uid}-cn`}
                label="CN（コモンネーム）"
                value={subject.commonName}
                onChange={(v) => setSubject((s) => ({ ...s, commonName: v }))}
                placeholder="example.com"
                hint="ドメイン名・サービス名など。SAN を指定する場合はオプション。"
              />
              <InputField
                id={`${uid}-o`}
                label="O（組織名）"
                value={subject.organization}
                onChange={(v) => setSubject((s) => ({ ...s, organization: v }))}
                placeholder="Example Corp."
              />
              <InputField
                id={`${uid}-ou`}
                label="OU（組織単位）"
                value={subject.organizationalUnit}
                onChange={(v) => setSubject((s) => ({ ...s, organizationalUnit: v }))}
                placeholder="Engineering"
              />
              <InputField
                id={`${uid}-c`}
                label="C（国コード）"
                value={subject.country}
                onChange={(v) => setSubject((s) => ({ ...s, country: v }))}
                placeholder="JP"
                maxLength={2}
              />
              <InputField
                id={`${uid}-st`}
                label="ST（都道府県）"
                value={subject.state}
                onChange={(v) => setSubject((s) => ({ ...s, state: v }))}
                placeholder="Tokyo"
              />
              <InputField
                id={`${uid}-l`}
                label="L（市区町村）"
                value={subject.locality}
                onChange={(v) => setSubject((s) => ({ ...s, locality: v }))}
                placeholder="Chiyoda-ku"
              />
              <InputField
                id={`${uid}-email`}
                label="emailAddress"
                value={subject.email}
                onChange={(v) => setSubject((s) => ({ ...s, email: v }))}
                placeholder="admin@example.com"
                inputMode="email"
              />
            </div>
          </div>

          {/* SAN */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="body-emphasis text-default">SAN（Subject Alternative Name）</p>
              <button
                type="button"
                className="caption text-link-plain btn-link-plain"
                onClick={handleSanAdd}
              >
                + 追加
              </button>
            </div>
            {sanEntries.length > 0 ? (
              <div className="space-y-2">
                {sanEntries.map((entry) => (
                  <SanRow
                    key={entry.id}
                    entry={entry}
                    onChange={handleSanChange}
                    onRemove={handleSanRemove}
                  />
                ))}
              </div>
            ) : (
              <p className="caption text-muted">
                SAN なし（CN のみが識別子になります）
              </p>
            )}
          </div>

          {/* 生成ボタン */}
          <ActionButton
            variant="primary"
            onClick={handleGenerate}
            loading={genState.status === 'loading'}
          >
            {genState.status === 'loading' ? '生成中…' : 'CSR・鍵ペアを生成'}
          </ActionButton>

          {/* エラー */}
          {genState.status === 'error' && (
            <ErrorMessage message={genState.message} variant="block" />
          )}

          {/* 生成結果 */}
          {genResult && (
            <div className="space-y-4">
              <OutputField
                id={`${uid}-csr-output`}
                label="CSR（PKCS#10 / PEM）"
                value={genResult.csrPem}
                rows={8}
                mono
                rightSlot={
                  <DownloadButton
                    onClick={() => downloadText('csr.pem', genResult.csrPem)}
                    label="ダウンロード"
                    aria-label="CSR PEM をダウンロード"
                  />
                }
              />
              <OutputField
                id={`${uid}-privkey-output`}
                label="秘密鍵（PKCS#8 / PEM）"
                value={genResult.privateKeyPem}
                rows={8}
                mono
                rightSlot={
                  <DownloadButton
                    onClick={() => downloadText('private_key.pem', genResult.privateKeyPem)}
                    label="ダウンロード"
                    aria-label="秘密鍵 PEM をダウンロード"
                  />
                }
              />
              <NotificationBanner variant="warning" title="秘密鍵の取り扱いに注意">
                秘密鍵はブラウザ外に送信されていません。ダウンロード後は安全な場所に保管し、
                他者と共有しないでください。
              </NotificationBanner>
            </div>
          )}
        </div>
      )}

      {/* ========== 解析モード ========== */}
      {mode === 'parse' && (
        <div className="space-y-6">
          <InputField
            id={`${uid}-csr-input`}
            label="CSR（PEM）"
            value={parseInput}
            onChange={(v) => {
              setParseInput(v);
              setParseState({ status: 'idle' });
            }}
            placeholder={'-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----'}
            multiline
            rows={8}
            mono
            resize
            headerRight={
              <button
                type="button"
                className="caption text-link-plain btn-link-plain"
                onClick={() => handleParse(SAMPLE_CSR)}
              >
                サンプルを入力
              </button>
            }
          />

          <ActionButton
            variant="primary"
            onClick={() => handleParse()}
            loading={parseState.status === 'loading'}
          >
            {parseState.status === 'loading' ? '解析中…' : '解析'}
          </ActionButton>

          {/* エラー */}
          {parseState.status === 'error' && (
            <ErrorMessage message={parseState.message} variant="block" />
          )}

          {/* 解析結果 */}
          {parseResult && (
            <div className="space-y-4">
              {/* 署名検証バナー */}
              {parseResult.signatureValid === true && (
                <NotificationBanner variant="success" title="署名検証: 正常">
                  CSR の自己署名が検証されました。改竄は検出されていません。
                </NotificationBanner>
              )}
              {parseResult.signatureValid === false && (
                <NotificationBanner variant="error" title="署名検証: 失敗">
                  CSR の署名が不正です。CSR が改竄されているか、破損している可能性があります。
                </NotificationBanner>
              )}
              {parseResult.signatureValid === null && (
                <NotificationBanner variant="warning" title="署名検証: 不可">
                  署名アルゴリズムが未対応のため検証できませんでした。
                </NotificationBanner>
              )}

              {/* Subject */}
              <div className="space-y-2">
                <p className="body-emphasis text-default">Subject</p>
                {parseResult.subjectAttributes.length > 0 ? (
                  <table className="caption text-default w-full border-collapse">
                    <tbody>
                      {parseResult.subjectAttributes.map((attr, i) => (
                        <tr key={i} className="border-b border-default last:border-0">
                          <td className="py-1.5 pr-4 font-semibold text-muted w-24 shrink-0">
                            {attr.type}
                          </td>
                          <td className="py-1.5 break-all">{attr.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="caption text-muted">Subject なし</p>
                )}
              </div>

              {/* SAN */}
              <div className="space-y-2">
                <p className="body-emphasis text-default">SAN（Subject Alternative Name）</p>
                {parseResult.san.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {parseResult.san.map((s, i) => (
                      <ChipLabel key={i} tone="info">
                        {s}
                      </ChipLabel>
                    ))}
                  </div>
                ) : (
                  <p className="caption text-muted">SAN なし</p>
                )}
              </div>

              {/* 公開鍵情報 */}
              <div className="space-y-2">
                <p className="body-emphasis text-default">公開鍵</p>
                <div className="flex flex-wrap gap-2">
                  <ChipLabel tone="neutral">{parseResult.publicKey.algorithm}</ChipLabel>
                  {parseResult.publicKey.keySizeBits && (
                    <ChipLabel tone="neutral">
                      {parseResult.publicKey.keySizeBits} bit
                    </ChipLabel>
                  )}
                  {parseResult.publicKey.namedCurve && (
                    <ChipLabel tone="neutral">{parseResult.publicKey.namedCurve}</ChipLabel>
                  )}
                </div>
              </div>

              {/* 署名アルゴリズム */}
              <div className="space-y-2">
                <p className="body-emphasis text-default">署名アルゴリズム</p>
                <ChipLabel tone="neutral">{parseResult.signatureAlgorithm}</ChipLabel>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
