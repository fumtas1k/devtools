import { useState, useEffect, useRef } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Select } from '@/components/ui/Select';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ClearButton } from '@/components/ui/ClearButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { caption, colors } from '@/utils/styles';
import { getErrorMessage } from '@/utils/errors';
import { downloadBytes } from '@/utils/download';
import { validateFile } from '@/utils/file-validation';
import {
  detectEncoding,
  decodeToText,
  convertBytes,
  normalizeNewlines,
  textToUtf8Bytes,
  ENCODING_LABELS,
  BOM_ENCODINGS,
  UTF16_ENCODINGS,
  SOURCE_ENCODINGS,
  TARGET_ENCODINGS,
  NEWLINE_OPTIONS,
  type EncodingName,
  type SourceEncoding,
  type DetectionResult,
  type NewlineMode,
} from '@/utils/encoding';

type Mode = 'detect' | 'convert';
type InputMethod = 'text' | 'file';

const ACCEPTED_EXTENSIONS = [
  '.txt',
  '.csv',
  '.tsv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.md',
  '.html',
  '.css',
  '.js',
  '.ts',
] as const;

const ACCEPT_ATTR = `${ACCEPTED_EXTENSIONS.join(',')},text/*`;

const SAMPLE_TEXT = 'カラム名,値\nテキスト,あいうえお\n名前,山田 太郎\n住所,東京都渋谷区';

function hexPreview(bytes: Uint8Array, limit = 32): string {
  const end = Math.min(bytes.length, limit);
  const parts: string[] = [];
  for (let i = 0; i < end; i++) {
    parts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(' ') + (bytes.length > limit ? ' ...' : '');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function EncodingConverterTool() {
  const [mode, setMode] = useState<Mode>('detect');
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [textInput, setTextInput] = useState('');
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');

  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [decodedPreview, setDecodedPreview] = useState('');

  const [sourceEnc, setSourceEnc] = useState<SourceEncoding>('AUTO');
  const [targetEnc, setTargetEnc] = useState<EncodingName>('UTF8');
  const [withBom, setWithBom] = useState(false);
  const [newlineMode, setNewlineMode] = useState<NewlineMode>('keep');

  const [outputBytes, setOutputBytes] = useState<Uint8Array | null>(null);
  const [outputPreview, setOutputPreview] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeBytes: Uint8Array | null =
    inputMethod === 'file' ? fileBytes : textInput ? textToUtf8Bytes(textInput) : null;

  // 判定処理
  useEffect(() => {
    if (!activeBytes) {
      setDetection(null);
      setDecodedPreview('');
      setError('');
      return;
    }
    if (inputMethod === 'file') {
      runDetect(activeBytes);
      return;
    }
    const timer = setTimeout(() => runDetect(activeBytes), 300);
    return () => clearTimeout(timer);
  }, [activeBytes, inputMethod]);

  function runDetect(bytes: Uint8Array) {
    try {
      const result = detectEncoding(bytes);
      setDetection(result);
      setError('');
      if (result.encoding !== 'UNKNOWN') {
        const preview = decodeToText(bytes, result.encoding);
        setDecodedPreview(preview.slice(0, 500));
      } else {
        setDecodedPreview('');
      }
    } catch (e) {
      setDetection(null);
      setDecodedPreview('');
      setError(getErrorMessage(e, '判定に失敗しました'));
    }
  }

  // 変換処理
  useEffect(() => {
    if (mode !== 'convert' || !activeBytes) {
      setOutputBytes(null);
      setOutputPreview('');
      return;
    }
    if (inputMethod === 'file') {
      runConvert(activeBytes);
      return;
    }
    const timer = setTimeout(() => runConvert(activeBytes), 300);
    return () => clearTimeout(timer);
  }, [activeBytes, inputMethod, mode, sourceEnc, targetEnc, withBom, newlineMode]);

  function runConvert(bytes: Uint8Array) {
    try {
      const converted = convertBytes(bytes, sourceEnc, targetEnc, withBom);
      const effectiveMode: NewlineMode = UTF16_ENCODINGS.has(targetEnc) ? 'keep' : newlineMode;
      const normalized = normalizeNewlines(converted, effectiveMode);
      setOutputBytes(normalized);
      setError('');
      // プレビューは変換後バイトを UTF-8 デコード (SJIS/EUC-JP → UNICODE 経由)
      if (targetEnc === 'UTF8') {
        setOutputPreview(new TextDecoder('utf-8').decode(normalized).slice(0, 500));
      } else {
        const preview = decodeToText(normalized, targetEnc);
        setOutputPreview(preview.slice(0, 500));
      }
    } catch (e) {
      setOutputBytes(null);
      setOutputPreview('');
      setError(getErrorMessage(e, '変換に失敗しました'));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validation = validateFile(file, {
      kind: 'text',
      maxBytes: 10 * 1024 * 1024,
      acceptExtensions: ACCEPTED_EXTENSIONS,
    });
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    file.arrayBuffer().then((buf) => {
      setFileBytes(new Uint8Array(buf));
      setFileName(file.name);
      setError('');
      setOutputBytes(null);
      setOutputPreview('');
    });
  }

  function handleClear() {
    setTextInput('');
    setFileBytes(null);
    setFileName('');
    setDetection(null);
    setDecodedPreview('');
    setOutputBytes(null);
    setOutputPreview('');
    setError('');
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    setOutputBytes(null);
    setOutputPreview('');
    setError('');
  }

  function handleInputMethodChange(next: InputMethod) {
    setInputMethod(next);
    handleClear();
  }

  function handleDownload() {
    if (!outputBytes) return;
    const match = fileName.match(/\.([^.]+)$/);
    const ext = match ? match[1] : 'txt';
    const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'converted';
    downloadBytes(outputBytes, `${baseName}_${targetEnc.toLowerCase()}.${ext}`);
  }

  const bomActive = BOM_ENCODINGS.has(targetEnc);

  return (
    <div className="space-y-6">
      {/* モード切替 */}
      <ToggleGroup
        options={[
          { value: 'detect', label: '判定' },
          { value: 'convert', label: '変換' },
        ]}
        value={mode}
        onChange={handleModeChange}
        ariaLabel="動作モード"
      />

      {/* 入力方式 */}
      <div className="flex items-center gap-3">
        <span style={{ ...caption, color: colors.muted }}>入力:</span>
        <ToggleGroup
          options={[
            { value: 'text', label: 'テキスト' },
            { value: 'file', label: 'ファイル' },
          ]}
          value={inputMethod}
          onChange={handleInputMethodChange}
          ariaLabel="入力方式"
        />
      </div>

      {/* テキスト入力 */}
      {inputMethod === 'text' && (
        <InputField
          id="enc-text-input"
          label="入力テキスト"
          value={textInput}
          onChange={setTextInput}
          placeholder="テキストを貼り付け（ブラウザ内では UTF-8 として扱われます）"
          multiline
          rows={8}
          mono
          resize
          onSampleClick={() => setTextInput(SAMPLE_TEXT)}
        />
      )}

      {/* ファイル入力 */}
      {inputMethod === 'file' && (
        <div>
          <div style={{ ...caption, color: colors.text, fontWeight: 700, marginBottom: '0.75rem' }}>
            ファイルを選択
          </div>
          <label
            className="flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors"
            style={{
              border: `1px dashed ${colors.border}`,
              background: colors.bgSubtle,
              color: colors.muted,
              ...caption,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{fileName || 'クリックしてファイルを選択'}</span>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              aria-label="ファイルを選択"
              accept={ACCEPT_ATTR}
            />
          </label>
          <p style={{ fontSize: '0.75rem', color: colors.muted, marginTop: '0.25rem' }}>
            対応形式: テキストファイル（.txt / .csv / .json / .xml / .yaml / .toml 等）・最大 10 MB
          </p>
          {fileBytes && (
            <div
              className="mt-2 rounded-lg px-3 py-2 font-mono"
              style={{
                ...caption,
                color: colors.muted,
                background: colors.bgSubtle,
                border: `1px solid ${colors.border}`,
                wordBreak: 'break-all',
              }}
            >
              <span style={{ color: colors.text }}>{formatBytes(fileBytes.length)}</span>
              {'　'}
              {hexPreview(fileBytes)}
            </div>
          )}
        </div>
      )}

      {/* エラー */}
      {error && <ErrorMessage message={error} />}

      {/* 判定結果カード */}
      {detection && (
        <div
          data-testid="detection-result"
          className="rounded-lg px-4 py-3 space-y-1"
          style={{ border: `1px solid ${colors.border}`, background: colors.bgSubtle }}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span data-testid="detection-encoding" style={{ ...caption, color: colors.muted }}>
              文字コード:{' '}
              <strong style={{ color: colors.text }}>{ENCODING_LABELS[detection.encoding]}</strong>
            </span>
            <span data-testid="detection-bom" style={{ ...caption, color: colors.muted }}>
              BOM:{' '}
              <strong style={{ color: colors.text }}>{detection.hasBom ? 'あり' : 'なし'}</strong>
            </span>
            <span style={{ ...caption, color: colors.muted }}>
              サイズ:{' '}
              <strong style={{ color: colors.text }}>{formatBytes(detection.byteLength)}</strong>
            </span>
          </div>
          {decodedPreview && (
            <div
              className="mt-2 font-mono rounded px-2 py-1.5 overflow-auto"
              style={{
                ...caption,
                color: colors.text,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                maxHeight: '6rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {decodedPreview}
            </div>
          )}
        </div>
      )}

      {/* 変換設定 */}
      {mode === 'convert' && (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="enc-source"
              style={{ ...caption, color: colors.muted, marginBottom: '0.5rem', display: 'block' }}
            >
              元の文字コード:
            </label>
            <Select
              id="enc-source"
              options={SOURCE_ENCODINGS}
              value={sourceEnc}
              onChange={(v) => setSourceEnc(v as SourceEncoding)}
            />
          </div>

          <div>
            <label
              htmlFor="enc-target"
              style={{ ...caption, color: colors.muted, marginBottom: '0.5rem', display: 'block' }}
            >
              変換後の文字コード:
            </label>
            <Select
              id="enc-target"
              options={TARGET_ENCODINGS}
              value={targetEnc}
              onChange={(v) => setTargetEnc(v as EncodingName)}
            />
          </div>

          {UTF16_ENCODINGS.has(targetEnc) ? (
            <div style={{ ...caption, color: colors.muted }}>
              改行コード: UTF-16 では改行コード正規化は適用されません
            </div>
          ) : (
            <div>
              <div style={{ ...caption, color: colors.muted, marginBottom: '0.5rem' }}>
                改行コード:
              </div>
              <ToggleGroup
                options={NEWLINE_OPTIONS}
                value={newlineMode}
                onChange={(v) => setNewlineMode(v as NewlineMode)}
                ariaLabel="改行コード"
              />
            </div>
          )}

          {bomActive && (
            <label
              className="flex items-center gap-2 cursor-pointer"
              style={{ ...caption, color: colors.text }}
            >
              <input
                type="checkbox"
                checked={withBom}
                onChange={(e) => setWithBom(e.target.checked)}
                aria-label="BOM を付与する"
              />
              BOM を付与する
            </label>
          )}
        </div>
      )}

      {/* 変換出力 */}
      {mode === 'convert' && (
        <div>
          <OutputField
            id="enc-output"
            label="変換結果プレビュー"
            value={outputPreview}
            rows={8}
            // クリップボードは Unicode テキストのみ保持できるため UTF-8 変換時のみ表示
            showCopy={targetEnc === 'UTF8'}
            rightSlot={
              <DownloadButton
                onClick={handleDownload}
                label="ダウンロード"
                variant="secondary"
                aria-label="変換後ファイルをダウンロード"
              />
            }
          />
          {outputBytes && (
            <div
              data-testid="output-hex-preview"
              style={{ ...caption, color: colors.muted, marginTop: '0.25rem' }}
            >
              {formatBytes(outputBytes.length)}　先頭: {hexPreview(outputBytes, 16)}
            </div>
          )}
        </div>
      )}

      {/* アクション */}
      <div className="flex justify-end">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
