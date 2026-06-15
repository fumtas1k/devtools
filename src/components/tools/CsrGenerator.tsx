// src/components/tools/CsrGenerator.tsx
import { useState, useCallback } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { generateCsr } from '@/utils/csr/generate';
import { parseCsr } from '@/utils/csr/parse';
import type {
  GenerateParams,
  GenerateResult,
  CsrParseResult,
  SubjectDn,
  SanEntry,
  KeyAlgorithm,
} from '@/utils/csr/types';
import { SAMPLE_CSR } from './csrGeneratorSample';

type Mode = 'generate' | 'parse';

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/x-pem-file' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_SUBJECT: SubjectDn = {
  commonName: '',
  organization: '',
  organizationalUnit: '',
  country: '',
  state: '',
  locality: '',
  email: '',
};

const SUBJECT_FIELDS: { key: keyof SubjectDn; label: string; placeholder?: string }[] = [
  { key: 'commonName', label: 'CN（コモンネーム）', placeholder: 'example.jp' },
  { key: 'organization', label: 'O（組織名）' },
  { key: 'organizationalUnit', label: 'OU（部門名）' },
  { key: 'country', label: 'C（国コード・2文字）', placeholder: 'JP' },
  { key: 'state', label: 'ST（都道府県）' },
  { key: 'locality', label: 'L（市区町村）' },
  { key: 'email', label: 'emailAddress' },
];

export function CsrGenerator() {
  const [mode, setMode] = useState<Mode>('generate');

  // --- 生成モードの状態 ---
  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('RSA');
  const [rsaBits, setRsaBits] = useState<GenerateParams['rsaModulusLength']>(2048);
  const [ecCurve, setEcCurve] = useState<GenerateParams['ecCurve']>('P-256');
  const [subject, setSubject] = useState<SubjectDn>(EMPTY_SUBJECT);
  const [san, setSan] = useState<SanEntry[]>([{ type: 'dns', value: '' }]);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // --- 解析モードの状態 ---
  const [parseInput, setParseInput] = useState('');
  const [parseResult, setParseResult] = useState<CsrParseResult | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    // モード切替で入力・結果をリセット（操作種別が変わるため。ui-conventions.md 2.4）
    setGenResult(null);
    setGenError(null);
    setParseResult(null);
    setParseInput('');
  };

  const canGenerate =
    subject.commonName.trim() !== '' || san.some((e) => e.value.trim() !== '');

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    setGenResult(null);
    try {
      const params: GenerateParams = {
        algorithm,
        rsaModulusLength: rsaBits,
        ecCurve,
        subject,
        san: san.filter((e) => e.value.trim() !== ''),
      };
      const result = await generateCsr(params);
      setGenResult(result);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '生成中にエラーが発生しました。');
    } finally {
      setGenerating(false);
    }
  }, [algorithm, rsaBits, ecCurve, subject, san]);

  const handleParse = useCallback(async (text: string) => {
    setParseInput(text);
    if (!text.trim()) {
      setParseResult(null);
      return;
    }
    const result = await parseCsr(text);
    setParseResult(result);
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await handleParse(text);
      e.target.value = '';
    },
    [handleParse]
  );

  const updateSan = (index: number, patch: Partial<SanEntry>) => {
    setSan((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  return (
    <div className="space-y-6">
      {/* モード切替 */}
      <ToggleGroup<Mode>
        ariaLabel="動作モード"
        options={[
          { value: 'generate', label: 'CSR を生成' },
          { value: 'parse', label: '既存 CSR を解析' },
        ]}
        value={mode}
        onChange={switchMode}
      />

      {mode === 'generate' && (
        <div className="space-y-5">
          {/* アルゴリズム選択 */}
          <div className="space-y-2">
            <span className="caption font-semibold">鍵アルゴリズム</span>
            <ToggleGroup<KeyAlgorithm>
              ariaLabel="鍵アルゴリズム"
              layout="wrap"
              options={[
                { value: 'RSA', label: 'RSA' },
                { value: 'ECDSA', label: 'ECDSA' },
              ]}
              value={algorithm}
              onChange={setAlgorithm}
            />
            {algorithm === 'RSA' ? (
              <ToggleGroup<string>
                ariaLabel="RSA 鍵長"
                layout="wrap"
                options={[
                  { value: '2048', label: '2048 bit' },
                  { value: '3072', label: '3072 bit' },
                  { value: '4096', label: '4096 bit' },
                ]}
                value={String(rsaBits)}
                onChange={(v) => setRsaBits(Number(v) as GenerateParams['rsaModulusLength'])}
              />
            ) : (
              <ToggleGroup<GenerateParams['ecCurve']>
                ariaLabel="ECDSA 曲線"
                layout="wrap"
                options={[
                  { value: 'P-256', label: 'P-256' },
                  { value: 'P-384', label: 'P-384' },
                  { value: 'P-521', label: 'P-521' },
                ]}
                value={ecCurve}
                onChange={setEcCurve}
              />
            )}
          </div>

          {/* Subject DN */}
          <div className="grid gap-3 md:grid-cols-2">
            {SUBJECT_FIELDS.map((f) => (
              <InputField
                key={f.key}
                id={`csr-subject-${f.key}`}
                label={f.label}
                value={subject[f.key]}
                onChange={(v) => setSubject((prev) => ({ ...prev, [f.key]: v }))}
                placeholder={f.placeholder}
                maxLength={f.key === 'country' ? 2 : undefined}
              />
            ))}
          </div>

          {/* SAN */}
          <fieldset className="space-y-2">
            <legend className="caption font-semibold">SAN（Subject Alternative Name）</legend>
            {san.map((entry, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <ToggleGroup<SanEntry['type']>
                  ariaLabel="SAN 種別"
                  size="sm"
                  layout="wrap"
                  options={[
                    { value: 'dns', label: 'DNS' },
                    { value: 'ip', label: 'IP' },
                    { value: 'email', label: 'email' },
                  ]}
                  value={entry.type}
                  onChange={(t) => updateSan(i, { type: t })}
                />
                <div className="w-full md:flex-1 min-w-0">
                  <InputField
                    id={`csr-san-${i}`}
                    label={`SAN ${i + 1}`}
                    value={entry.value}
                    onChange={(v) => updateSan(i, { value: v })}
                    placeholder={entry.type === 'ip' ? '10.0.0.1' : 'example.jp'}
                  />
                </div>
                {san.length > 1 && (
                  <button
                    type="button"
                    className="caption btn-remove-card leading-none"
                    aria-label={`SAN ${i + 1} を削除`}
                    onClick={() => setSan((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    削除
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="caption text-link-plain btn-link-plain"
              onClick={() => setSan((prev) => [...prev, { type: 'dns', value: '' }])}
            >
              ＋ SAN を追加
            </button>
          </fieldset>

          <ActionButton
            variant="primary"
            onClick={handleGenerate}
            disabled={!canGenerate}
            loading={generating}
          >
            {generating ? '生成中…' : 'CSR と鍵ペアを生成'}
          </ActionButton>
          {!canGenerate && (
            <p className="caption text-muted">CN または SAN を1つ以上入力してください。</p>
          )}

          {genError && <ErrorMessage message={genError} variant="block" />}

          {genResult && (
            <div className="space-y-4">
              <NotificationBanner variant="info" title="秘密鍵はブラウザ外に送信されません">
                このツールの全処理はブラウザ内で完結します。生成した秘密鍵データは外部サーバーに送信されません。
              </NotificationBanner>
              <OutputField
                id="csr-output"
                label="CSR（PKCS#10 / PEM）"
                value={genResult.csrPem}
                rows={8}
                mono
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="CSR をダウンロード"
                    onClick={() => downloadText('request.csr', genResult.csrPem)}
                  />
                }
              />
              <OutputField
                id="csr-key-output"
                label="秘密鍵（PKCS#8 / PEM）"
                value={genResult.privateKeyPem}
                rows={8}
                mono
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="秘密鍵をダウンロード"
                    onClick={() => downloadText('private.key', genResult.privateKeyPem)}
                  />
                }
              />
            </div>
          )}
        </div>
      )}

      {mode === 'parse' && (
        <div className="space-y-4">
          <InputField
            id="csr-parse-input"
            label="CSR を貼り付け"
            value={parseInput}
            onChange={handleParse}
            placeholder={
              '-----BEGIN CERTIFICATE REQUEST-----\nMIIC...\n-----END CERTIFICATE REQUEST-----'
            }
            hint="対応形式: PEM（CERTIFICATE REQUEST）/ DER の Base64"
            multiline
            rows={7}
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
          <div className="flex flex-wrap items-center gap-3">
            <FileInputButton accept=".csr,.pem,.der" onChange={handleFile}>
              ファイルを選択
            </FileInputButton>
            <span className="caption text-muted">.csr / .pem / .der</span>
          </div>

          {parseResult?.error && <ErrorMessage message={parseResult.error} variant="block" />}

          {parseResult && !parseResult.error && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <ChipLabel tone="neutral">{parseResult.publicKey.algorithm}</ChipLabel>
                {parseResult.publicKey.keySizeBits && (
                  <ChipLabel tone="neutral">{parseResult.publicKey.keySizeBits} bit</ChipLabel>
                )}
                {parseResult.publicKey.namedCurve && (
                  <ChipLabel tone="neutral">{parseResult.publicKey.namedCurve}</ChipLabel>
                )}
                <ChipLabel tone="neutral">{parseResult.signatureAlgorithm}</ChipLabel>
                <ChipLabel tone={parseResult.signatureValid ? 'info' : 'error'}>
                  {parseResult.signatureValid === null
                    ? '署名検証: 不能'
                    : parseResult.signatureValid
                      ? '署名検証: OK'
                      : '署名検証: NG'}
                </ChipLabel>
              </div>
              <OutputField
                id="csr-parse-subject"
                label="Subject"
                value={parseResult.subjectFull}
                rows={2}
                mono
              />
              {parseResult.san.length > 0 && (
                <OutputField
                  id="csr-parse-san"
                  label="SAN"
                  value={parseResult.san.join('\n')}
                  rows={Math.min(parseResult.san.length + 1, 6)}
                  mono
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
