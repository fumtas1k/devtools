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

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="w-full md:flex-1 min-w-0" data-testid="url-input-column">
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
            rows={12}
            error={error || undefined}
            onSampleClick={() => handleInput(SAMPLE[mode])}
            mono
            resize
          />
        </div>

        <div className="w-full md:flex-1 min-w-0" data-testid="url-output-column">
          <OutputField
            id="url-output"
            label="出力"
            value={output}
            rows={12}
            ariaLabel="変換結果"
            resize={false}
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
