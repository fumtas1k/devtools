import { useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { encodeUrl, decodeUrl, validateDecodeInput } from '@/utils/url-encode';

type Mode = 'encode' | 'decode';

export function UrlEncoderTool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const convert = (value: string, currentMode: Mode): string =>
    currentMode === 'encode' ? encodeUrl(value) : decodeUrl(value);

  const validate = (value: string, currentMode: Mode): string =>
    currentMode === 'decode' ? validateDecodeInput(value) : '';

  const output = convert(input, mode);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setInput('');
    setError('');
  };

  const handleInput = (value: string) => {
    setInput(value);
    setError(validate(value, mode));
  };

  const handleClear = () => {
    setInput('');
    setError('');
  };

  const SAMPLE: Record<Mode, string> = {
    encode: 'https://example.com/検索?q=テスト&lang=ja',
    decode:
      'https%3A%2F%2Fexample.com%2F%E6%A4%9C%E7%B4%A2%3Fq%3D%E3%83%86%E3%82%B9%E3%83%88%26lang%3Dja',
  };

  return (
    <div className="space-y-6">
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

      {/* 入力 */}
      <InputField
        id="url-input"
        label="入力"
        value={input}
        onChange={handleInput}
        placeholder={
          mode === 'encode'
            ? 'https://example.com/検索?q=テスト'
            : 'https%3A%2F%2Fexample.com%2F...'
        }
        multiline
        rows={4}
        error={error || undefined}
        onSampleClick={() => handleInput(SAMPLE[mode])}
        mono
      />

      {/* 出力 */}
      <OutputField
        id="url-output"
        label="出力"
        value={output}
        rows={4}
        ariaLabel="変換結果"
        resize={false}
      />

      {/* アクション */}
      <div className="flex justify-end gap-2">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
