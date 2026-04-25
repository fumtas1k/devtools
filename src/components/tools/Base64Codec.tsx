import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { caption, colors } from '@/utils/styles';
import { encodeBase64, decodeBase64 } from '@/utils/base64';
import { useCodec } from '@/hooks/useCodec';
import { useState } from 'react';

type Mode = 'encode' | 'decode';
type Format = 'standard' | 'urlsafe';

const SAMPLE_ENCODE = 'Hello, DevTools! 🎉\nこんにちは世界';
const SAMPLE_DECODE_STANDARD = 'SGVsbG8sIERldlRvb2xzISDwn46JCuOBk+OCk+OBq+OBoeOBr+S4lueVjA==';
const SAMPLE_DECODE_URLSAFE  = 'SGVsbG8sIERldlRvb2xzISDwn46JCuOBk-OCk-OBq-OBoeOBr-S4lueVjA';

export function Base64CodecTool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [format, setFormat] = useState<Format>('standard');

  const { input, setInput, output, error, reset } = useCodec(
    (text) => {
      const urlSafe = format === 'urlsafe';
      return mode === 'encode' ? encodeBase64(text, urlSafe) : decodeBase64(text, urlSafe);
    },
    [mode, format],
  );

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
        onChange={setMode}
        ariaLabel="変換モード"
      />

      {/* 形式切替 */}
      <div className="flex items-center gap-3">
        <span style={{ ...caption, color: colors.muted }}>形式:</span>
        <ToggleGroup
          options={[
            { value: 'standard', label: '標準' },
            { value: 'urlsafe', label: 'URL-safe' },
          ]}
          value={format}
          onChange={setFormat}
          ariaLabel="Base64 形式"
        />
      </div>

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>
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

        <div className="w-full md:flex-1 min-w-0">
          <OutputField
            id="base64-output"
            label="出力"
            value={output}
            rows={12}
            mono={mode === 'encode'}
            ariaLabel="変換結果"
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end">
        <button
          onClick={reset}
          className="rounded-lg px-3 py-1.5 transition-colors"
          style={{ ...caption, color: colors.muted }}
        >
          クリア
        </button>
      </div>
    </div>
  );
}
