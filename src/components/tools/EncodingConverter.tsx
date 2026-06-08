import { useState, useRef, useMemo } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Select } from '@/components/ui/Select';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ClearButton } from '@/components/ui/ClearButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { getErrorMessage } from '@/utils/errors';
import { downloadBytes } from '@/utils/download';
import { validateFile } from '@/utils/file-validation';
import { sanitizeFilename } from '@/utils/filename';
import { formatBytes } from '@/utils/format';
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
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';

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

// ──────────────────────────────────────────────
// タスク 2-B: pure function 抽出（モジュールスコープ）
//
// EncodingConverter.tsx のモジュールスコープに置くことで、
// テストの vi.mock('@/utils/encoding', ...) による
// detectEncoding / convertBytes の mock が正常に効く。
// （utils/encoding 内部に置くと intra-module call となり mock が無効になる）
// ──────────────────────────────────────────────

interface DetectResult {
  detection: DetectionResult | null;
  decodedPreview: string;
}

interface ConvertResult {
  outputBytes: Uint8Array | null;
  outputPreview: string;
}

/** detectEncoding + デコードプレビュー生成の純粋変換。throw はそのまま伝播させ hook の catch で拾う。 */
function detectFromBytes(bytes: Uint8Array): DetectResult {
  const result = detectEncoding(bytes);
  let decodedPreview = '';
  if (result.encoding !== 'UNKNOWN') {
    const preview = decodeToText(bytes, result.encoding);
    decodedPreview = preview.slice(0, 500);
  }
  return { detection: result, decodedPreview };
}

/** convertBytes + 改行正規化 + プレビュー生成の純粋変換。throw はそのまま伝播させ hook の catch で拾う。 */
function convertFromBytes(
  bytes: Uint8Array,
  sourceEnc: SourceEncoding,
  targetEnc: EncodingName,
  withBom: boolean,
  newlineMode: NewlineMode
): ConvertResult {
  const converted = convertBytes(bytes, sourceEnc, targetEnc, withBom);
  const effectiveMode: NewlineMode = UTF16_ENCODINGS.has(targetEnc) ? 'keep' : newlineMode;
  const normalized = normalizeNewlines(converted, effectiveMode);
  // プレビューは変換後バイトを UTF-8 デコード (SJIS/EUC-JP → UNICODE 経由)
  let outputPreview: string;
  if (targetEnc === 'UTF8') {
    outputPreview = new TextDecoder('utf-8').decode(normalized).slice(0, 500);
  } else {
    const preview = decodeToText(normalized, targetEnc);
    outputPreview = preview.slice(0, 500);
  }
  return { outputBytes: normalized, outputPreview };
}

// ──────────────────────────────────────────────
// emptyResult 定数（安定参照。useDebouncedTransform の要件）
// ──────────────────────────────────────────────
const EMPTY_DETECT: DetectResult = { detection: null, decodedPreview: '' };
const EMPTY_CONVERT: ConvertResult = { outputBytes: null, outputPreview: '' };

export function EncodingConverterTool() {
  const [mode, setMode] = useState<Mode>('detect');
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [textInput, setTextInput] = useState('');
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');

  const [sourceEnc, setSourceEnc] = useState<SourceEncoding>('AUTO');
  const [targetEnc, setTargetEnc] = useState<EncodingName>('UTF8');
  const [withBom, setWithBom] = useState(false);
  const [newlineMode, setNewlineMode] = useState<NewlineMode>('keep');

  // file I/O 用エラー（handleFileChange の validation 失敗 / arrayBuffer reject で使用）
  const [fileError, setFileError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // activeBytes をメモ化し、テキスト入力中のキー入力ごとに新しい Uint8Array 参照が
  // 生成されないようにする。これにより依存配列が安定し、effect の過剰スケジュールを防ぐ。
  const activeBytes = useMemo<Uint8Array | null>(() => {
    if (inputMethod === 'file') return fileBytes;
    if (textInput) return textToUtf8Bytes(textInput);
    return null;
  }, [inputMethod, fileBytes, textInput]);

  // 判定処理（file 入力は即時、text 入力は 300ms debounce）
  const { result: detectResult, error: detectError } = useDebouncedTransform(
    activeBytes,
    detectFromBytes,
    EMPTY_DETECT,
    [],
    { immediate: inputMethod === 'file' }
  );

  // 変換処理（convert モード以外は source を null にして結果をクリア）
  const { result: convertResult, error: convertError } = useDebouncedTransform(
    mode === 'convert' ? activeBytes : null,
    (b) => convertFromBytes(b, sourceEnc, targetEnc, withBom, newlineMode),
    EMPTY_CONVERT,
    [mode, sourceEnc, targetEnc, withBom, newlineMode],
    { immediate: inputMethod === 'file' }
  );

  // エラーの合流: file I/O を最優先、次に detect、convert の順
  const error = fileError || detectError || convertError;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validation = validateFile(file, {
      kind: 'text',
      maxBytes: 10 * 1024 * 1024,
      acceptExtensions: ACCEPTED_EXTENSIONS,
    });
    if (!validation.ok) {
      setFileError(validation.message);
      return;
    }

    try {
      const buf = await file.arrayBuffer();
      setFileBytes(new Uint8Array(buf));
      setFileName(file.name);
      setFileError('');
    } catch (e) {
      setFileError(getErrorMessage(e, 'ファイルの読み込みに失敗しました'));
    }
  }

  function handleClear() {
    setTextInput('');
    setFileBytes(null);
    setFileName('');
    setFileError('');
    // hook が管理する detection/decodedPreview/outputBytes/outputPreview は
    // source が null になることで自動リセットされる
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    // hook が管理する outputBytes/outputPreview は mode === 'convert' ? activeBytes : null
    // という source 制御により自動リセットされる
  }

  function handleInputMethodChange(next: InputMethod) {
    setInputMethod(next);
    handleClear();
  }

  function handleDownload() {
    if (!convertResult.outputBytes) return;
    // OS 由来のファイル名は信頼できないため、許可拡張子のホワイトリストで
    // サニタイズする。拡張子が不正・欠落した場合は txt にフォールバック。
    const safeSource = sanitizeFilename(fileName || 'converted.txt', ACCEPTED_EXTENSIONS);
    const match = safeSource.match(/\.([^.]+)$/);
    const ext = match ? match[1] : 'txt';
    const baseName = safeSource.replace(/\.[^.]+$/, '');
    const composed = `${baseName}_${targetEnc.toLowerCase()}.${ext}`;
    // 念のため再度サニタイズ（baseName 末尾連結の安全保証）
    downloadBytes(convertResult.outputBytes, sanitizeFilename(composed, ACCEPTED_EXTENSIONS));
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
        <span className="caption text-muted">入力:</span>
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
          <div className="caption text-default font-bold mb-3">ファイルを選択</div>
          <label className="flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors caption border border-dashed border-default bg-subtle text-muted">
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
          <p className="hint-xs text-muted mt-1">
            対応形式: テキストファイル（.txt / .csv / .json / .xml / .yaml / .toml 等）・最大 10 MB
          </p>
          {fileBytes && (
            <div className="mt-2 rounded-lg px-3 py-2 font-mono caption text-muted bg-subtle border border-default break-all">
              <span className="text-default">{formatBytes(fileBytes.length)}</span>
              {'　'}
              {hexPreview(fileBytes)}
            </div>
          )}
        </div>
      )}

      {/* エラー */}
      {error && <ErrorMessage message={error} />}

      {/* 判定結果カード */}
      {detectResult.detection && (
        <div
          data-testid="detection-result"
          className="rounded-lg px-4 py-3 space-y-1 border border-default bg-subtle"
        >
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span data-testid="detection-encoding" className="caption text-muted">
              文字コード:{' '}
              <strong className="text-default">
                {ENCODING_LABELS[detectResult.detection.encoding]}
              </strong>
            </span>
            <span data-testid="detection-bom" className="caption text-muted">
              BOM:{' '}
              <strong className="text-default">
                {detectResult.detection.hasBom ? 'あり' : 'なし'}
              </strong>
            </span>
            <span className="caption text-muted">
              サイズ:{' '}
              <strong className="text-default">
                {formatBytes(detectResult.detection.byteLength)}
              </strong>
            </span>
          </div>
          {detectResult.decodedPreview && (
            <div className="mt-2 font-mono rounded px-2 py-1.5 overflow-auto caption text-default bg-default border border-default max-h-24 whitespace-pre-wrap break-all">
              {detectResult.decodedPreview}
            </div>
          )}
        </div>
      )}

      {/* 変換設定 */}
      {mode === 'convert' && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:flex-1 min-w-0">
              <label htmlFor="enc-source" className="caption text-muted mb-2 block">
                元の文字コード:
              </label>
              <Select
                id="enc-source"
                options={SOURCE_ENCODINGS}
                value={sourceEnc}
                onChange={(v) => setSourceEnc(v as SourceEncoding)}
              />
            </div>

            <div className="w-full md:flex-1 min-w-0">
              <label htmlFor="enc-target" className="caption text-muted mb-2 block">
                変換後の文字コード:
              </label>
              <Select
                id="enc-target"
                options={TARGET_ENCODINGS}
                value={targetEnc}
                onChange={(v) => setTargetEnc(v as EncodingName)}
              />
            </div>
          </div>

          {UTF16_ENCODINGS.has(targetEnc) ? (
            <div className="caption text-muted">
              改行コード: UTF-16 では改行コード正規化は適用されません
            </div>
          ) : (
            <div>
              <div className="caption text-muted mb-2">改行コード:</div>
              <ToggleGroup
                options={NEWLINE_OPTIONS}
                value={newlineMode}
                onChange={(v) => setNewlineMode(v as NewlineMode)}
                ariaLabel="改行コード"
              />
            </div>
          )}

          {bomActive && (
            <label className="flex items-center gap-2 cursor-pointer caption text-default">
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
            value={convertResult.outputPreview}
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
          {convertResult.outputBytes && (
            <div data-testid="output-hex-preview" className="caption text-muted mt-1">
              {formatBytes(convertResult.outputBytes.length)}　先頭:{' '}
              {hexPreview(convertResult.outputBytes, 16)}
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
