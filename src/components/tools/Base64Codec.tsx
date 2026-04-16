import { useState, useEffect } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { encodeBase64, decodeBase64 } from '@/utils/base64';

type Mode = 'encode' | 'decode';
type Format = 'standard' | 'urlsafe';

const SAMPLE_ENCODE = 'Hello, DevTools! 🎉\nこんにちは世界';
const SAMPLE_DECODE_STANDARD = 'SGVsbG8sIERldlRvb2xzISA477+9Cgrjgb3jgpPjgavjgaHjga/kuJbnlYw=';
const SAMPLE_DECODE_URLSAFE  = 'SGVsbG8sIERldlRvb2xzISA477-9Cgrjgb3jgpPjgavjgaHjga_kuJbnlYw';

export function Base64CodecTool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [format, setFormat] = useState<Format>('standard');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!input) {
      setOutput('');
      setError('');
      return;
    }
    const timer = setTimeout(() => {
      try {
        const urlSafe = format === 'urlsafe';
        const result =
          mode === 'encode' ? encodeBase64(input, urlSafe) : decodeBase64(input, urlSafe);
        setOutput(result);
        setError('');
      } catch (e) {
        setOutput('');
        setError(e instanceof Error ? e.message : '変換に失敗しました');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, mode, format]);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setInput('');
    setOutput('');
    setError('');
  };

  const handleFormatChange = (next: Format) => {
    setFormat(next);
    setInput('');
    setOutput('');
    setError('');
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const sampleValue =
    mode === 'encode'
      ? SAMPLE_ENCODE
      : format === 'urlsafe'
        ? SAMPLE_DECODE_URLSAFE
        : SAMPLE_DECODE_STANDARD;

  return (
    <div className="space-y-4">
      {/* モード切替 */}
      <ToggleGroup
        options={[
          { value: 'encode', label: 'エンコード' },
          { value: 'decode', label: 'デコード' },
        ]}
        value={mode}
        onChange={handleModeChange}
        ariaLabel="変換モード"
      />

      {/* 形式切替 */}
      <div className="flex items-center gap-3">
        <span style={{ ...caption, color: colors.muted }}>形式:</span>
        <ToggleGroup
          options={[
            { value: 'standard', label: '標準 Base64' },
            { value: 'urlsafe', label: 'URL-safe' },
          ]}
          value={format}
          onChange={handleFormatChange}
          ariaLabel="Base64 形式"
        />
      </div>

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>
        {/* 入力 */}
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="base64-input"
            label="入力"
            value={input}
            onChange={setInput}
            placeholder={
              mode === 'encode'
                ? 'エンコードするテキストを入力'
                : 'Base64 文字列を入力'
            }
            multiline
            rows={12}
            error={error || undefined}
            onSampleClick={() => setInput(sampleValue)}
            mono={mode === 'decode'}
            resize
          />
        </div>

        {/* 出力 */}
        <div className="w-full md:flex-1 min-w-0">
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: '0.75rem', minHeight: '2rem' }}
          >
            <label htmlFor="base64-output" style={{ ...bodyEmphasis, color: colors.text }}>
              出力
            </label>
            <span style={{ visibility: output ? 'visible' : 'hidden' }}>
              <CopyButton text={output} label="コピー" />
            </span>
          </div>
          <textarea
            id="base64-output"
            readOnly
            value={output}
            rows={12}
            className="w-full rounded-lg px-3 py-2"
            style={{
              ...caption,
              fontFamily: mode === 'encode' ? 'monospace' : 'inherit',
              letterSpacing: '0.02em',
              border: `1px solid ${colors.border}`,
              background: colors.bgSubtle,
              color: colors.text,
              resize: 'vertical',
            }}
            aria-label="変換結果"
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end">
        <button
          onClick={handleClear}
          className="rounded-lg px-3 py-1.5 transition-colors"
          style={{ ...caption, color: colors.muted }}
        >
          クリア
        </button>
      </div>
    </div>
  );
}
