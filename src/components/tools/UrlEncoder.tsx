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

  /* Body: 17px, weight 400, line-height 1.47, tracking -0.374px */
  const bodyStyle = { fontSize: '1.06rem', fontWeight: 400, lineHeight: 1.47, letterSpacing: '-0.374px' } as const;
  /* Body Emphasis: 17px, weight 600, line-height 1.24 */
  const bodyEmphasisStyle = { fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px' } as const;
  /* Caption: 14px, weight 400, line-height 1.29, tracking -0.224px */
  const captionStyle = { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.29, letterSpacing: '-0.224px' } as const;

  return (
    <div className="space-y-4">
      {/* モード切替: Filter/Search Button style */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: '#f5f5f7' }}>
        {(['encode', 'decode'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            aria-pressed={mode === m}
            className="flex-1 rounded-lg py-1.5 transition-colors"
            style={{
              ...captionStyle,
              fontWeight: 500,
              background: mode === m ? '#ffffff' : 'transparent',
              color: mode === m ? '#1d1d1f' : 'rgba(0,0,0,0.48)',
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {m === 'encode' ? 'エンコード' : 'デコード'}
          </button>
        ))}
      </div>

      {/* 入力 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          {/* Body Emphasis */}
          <label htmlFor="url-input" style={{ ...bodyEmphasisStyle, color: '#1d1d1f' }}>
            入力
          </label>
          {/* Link: 14px, color #0066cc */}
          <button
            onClick={() => handleInput(SAMPLE[mode])}
            style={{ ...captionStyle, color: '#0066cc' }}
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
            ...captionStyle,
            border: `1px solid ${error ? '#dc2626' : 'rgba(0,0,0,0.2)'}`,
            outline: 'none',
            background: '#ffffff',
            color: '#1d1d1f',
          }}
          onFocus={(e) => { e.target.style.outline = '2px solid #0071e3'; e.target.style.outlineOffset = '2px'; }}
          onBlur={(e) => { e.target.style.outline = 'none'; }}
          aria-describedby={error ? 'url-error' : undefined}
        />
        {error && (
          <p id="url-error" role="alert" style={{ ...captionStyle, color: '#dc2626', marginTop: '0.25rem' }}>
            {error}
          </p>
        )}
      </div>

      {/* 出力 */}
      <div>
        <label className="mb-1 block" style={{ ...bodyEmphasisStyle, color: '#1d1d1f' }}>
          出力
        </label>
        <textarea
          readOnly
          value={output}
          rows={4}
          className="w-full rounded-lg px-3 py-2 font-mono"
          style={{
            ...captionStyle,
            border: '1px solid rgba(0,0,0,0.12)',
            background: '#f5f5f7',
            color: '#1d1d1f',
          }}
          aria-label="変換結果"
        />
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        {output && <CopyButton text={output} label="出力をコピー" />}
        <button
          onClick={handleClear}
          className="rounded-lg px-3 py-1.5 transition-colors hover:bg-[#f5f5f7]"
          style={{ ...captionStyle, color: 'rgba(0,0,0,0.48)' }}
        >
          クリア
        </button>
      </div>
    </div>
  );
}
