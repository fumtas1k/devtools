import { useState } from 'react';
import { CopyButton } from '../ui/CopyButton';

type Mode = 'encode' | 'decode';

export function UrlEncoder() {
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const convert = (value: string, currentMode: Mode): string => {
    if (!value) return '';
    try {
      if (currentMode === 'encode') {
        return encodeURIComponent(value);
      } else {
        return decodeURIComponent(value);
      }
    } catch {
      return '';
    }
  };

  const validate = (value: string, currentMode: Mode): string => {
    if (!value) return '';
    if (currentMode === 'decode') {
      try {
        decodeURIComponent(value);
        return '';
      } catch {
        return '不正なURLエンコード文字列です';
      }
    }
    return '';
  };

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
    decode: 'https%3A%2F%2Fexample.com%2F%E6%A4%9C%E7%B4%A2%3Fq%3D%E3%83%86%E3%82%B9%E3%83%88%26lang%3Dja',
  };

  return (
    <div class="space-y-4">
      {/* モード切替 */}
      <div class="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(['encode', 'decode'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            aria-pressed={mode === m}
            class={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors
              ${mode === m
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
          >
            {m === 'encode' ? 'エンコード' : 'デコード'}
          </button>
        ))}
      </div>

      {/* 入力 */}
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label for="url-input" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            入力
          </label>
          <button
            onClick={() => handleInput(SAMPLE[mode])}
            class="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            サンプル入力
          </button>
        </div>
        <textarea
          id="url-input"
          value={input}
          onInput={(e) => handleInput((e.target as HTMLTextAreaElement).value)}
          placeholder={mode === 'encode' ? 'https://example.com/検索?q=テスト' : 'https%3A%2F%2Fexample.com%2F...'}
          rows={4}
          class={`w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-white
            ${error
              ? 'border-red-400 dark:border-red-600'
              : 'border-gray-300 dark:border-gray-700'
            }`}
          aria-describedby={error ? 'url-error' : undefined}
        />
        {error && (
          <p id="url-error" role="alert" class="mt-1 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {/* 出力 */}
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          出力
        </label>
        <textarea
          readOnly
          value={output}
          rows={4}
          class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          aria-label="変換結果"
        />
      </div>

      {/* アクション */}
      <div class="flex justify-end gap-2">
        {output && <CopyButton text={output} label="出力をコピー" />}
        <button
          onClick={handleClear}
          class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          クリア
        </button>
      </div>
    </div>
  );
}
