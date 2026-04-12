import { useState } from 'react';
import { CopyButton } from '../ui/CopyButton';
import { bodyEmphasis, caption, colors, shadows } from '../../utils/styles';
import { encodeUrl, decodeUrl, validateDecodeInput } from '../../utils/url-encode';

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
    decode: 'https%3A%2F%2Fexample.com%2F%E6%A4%9C%E7%B4%A2%3Fq%3D%E3%83%86%E3%82%B9%E3%83%88%26lang%3Dja',
  };

  return (
    <div className="space-y-4">
      {/* モード切替: Filter/Search Button style */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: colors.bgSubtle }}>
        {(['encode', 'decode'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            aria-pressed={mode === m}
            className="flex-1 rounded-lg py-1.5 transition-colors"
            style={{
              ...caption,
              fontWeight: 500,
              background: mode === m ? colors.bg : 'transparent',
              color: mode === m ? colors.text : colors.muted,
              boxShadow: mode === m ? shadows.tab : 'none',
            }}
          >
            {m === 'encode' ? 'エンコード' : 'デコード'}
          </button>
        ))}
      </div>

      {/* 入力 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="url-input" style={{ ...bodyEmphasis, color: colors.text }}>
            入力
          </label>
          <button
            onClick={() => handleInput(SAMPLE[mode])}
            style={{ ...caption, color: colors.link }}
            className="hover:underline"
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
          className="w-full rounded-lg px-3 py-2 font-mono"
          style={{
            ...caption,
            border: `1px solid ${error ? colors.error : colors.borderInput}`,
            outline: 'none',
            background: colors.bg,
            color: colors.text,
          }}
          onFocus={(e) => { e.target.style.outline = `2px solid ${colors.link}`; e.target.style.outlineOffset = '2px'; }}
          onBlur={(e) => { e.target.style.outline = 'none'; }}
          aria-describedby={error ? 'url-error' : undefined}
        />
        {error && (
          <p id="url-error" role="alert" style={{ ...caption, color: colors.error, marginTop: '0.25rem' }}>
            {error}
          </p>
        )}
      </div>

      {/* 出力 */}
      <div>
        <label className="mb-1 block" style={{ ...bodyEmphasis, color: colors.text }}>
          出力
        </label>
        <textarea
          readOnly
          value={output}
          rows={4}
          className="w-full rounded-lg px-3 py-2 font-mono"
          style={{
            ...caption,
            border: `1px solid ${colors.border}`,
            background: colors.bgSubtle,
            color: colors.text,
          }}
          aria-label="変換結果"
        />
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        {output && <CopyButton text={output} label="出力をコピー" />}
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
