import { useState, useEffect, useCallback } from 'react';
import { CopyButton } from '../ui/CopyButton';
import { bodyEmphasis, caption, micro } from '../../utils/styles';

type CharType = 'hiragana' | 'katakana' | 'japanese' | 'alphanumeric' | 'lorem';

const CHAR_TYPES: { value: CharType; label: string }[] = [
  { value: 'hiragana', label: 'ひらがな' },
  { value: 'katakana', label: 'カタカナ' },
  { value: 'japanese', label: '漢字混じり日本語' },
  { value: 'alphanumeric', label: '英数字' },
  { value: 'lorem', label: 'Lorem Ipsum' },
];

const HIRAGANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const KANJI = '日本語文字漢字生成変換表示入力出力処理実行結果確認設定管理操作画面機能利用提供情報';
const PARTICLES = 'はがをにでともやのへ';
const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';

function randomChar(chars: string) {
  return chars[Math.floor(Math.random() * chars.length)];
}

function generateText(type: CharType, length: number): string {
  if (type === 'lorem') {
    const repeated = LOREM.repeat(Math.ceil(length / LOREM.length));
    return repeated.slice(0, length).trimEnd();
  }

  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    if (type === 'hiragana') {
      result.push(randomChar(HIRAGANA));
    } else if (type === 'katakana') {
      result.push(randomChar(KATAKANA));
    } else if (type === 'alphanumeric') {
      result.push(randomChar(ALPHANUMERIC));
    } else {
      // 漢字混じり日本語: 漢字2〜3文字 + 助詞 を繰り返す
      const r = Math.random();
      if (r < 0.55) {
        result.push(randomChar(KANJI));
      } else if (r < 0.8) {
        result.push(randomChar(HIRAGANA));
      } else {
        result.push(randomChar(PARTICLES));
      }
    }
  }
  return result.join('');
}

export function DummyText() {
  const [charType, setCharType] = useState<CharType>('japanese');
  const [length, setLength] = useState(10);
  const [lengthInput, setLengthInput] = useState('10');
  const [lineBreak, setLineBreak] = useState(false);
  const [chunkSize, setChunkSize] = useState(40);
  const [chunkInput, setChunkInput] = useState('40');
  const [result, setResult] = useState('');

  const generate = useCallback(() => {
    const n = Math.min(5000, Math.max(1, length));
    const raw = generateText(charType, n);
    if (lineBreak) {
      const lines: string[] = [];
      for (let i = 0; i < raw.length; i += chunkSize) {
        lines.push(raw.slice(i, i + chunkSize));
      }
      setResult(lines.join('\n'));
    } else {
      setResult(raw);
    }
  }, [charType, length, lineBreak, chunkSize]);

  useEffect(() => { generate(); }, [generate]);

  const handleChunkChange = (value: string) => {
    setChunkInput(value);
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= 1000) setChunkSize(n);
  };

  const handleChunkBlur = () => {
    const n = parseInt(chunkInput, 10);
    if (isNaN(n) || n < 1) { setChunkSize(1); setChunkInput('1'); }
    else if (n > 1000) { setChunkSize(1000); setChunkInput('1000'); }
    else { setChunkSize(n); setChunkInput(String(n)); }
  };

  const handleLengthChange = (value: string) => {
    setLengthInput(value);
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= 5000) setLength(n);
  };

  const handleLengthBlur = () => {
    const n = parseInt(lengthInput, 10);
    if (isNaN(n) || n < 1) { setLength(1); setLengthInput('1'); }
    else if (n > 5000) { setLength(5000); setLengthInput('5000'); }
    else { setLength(n); setLengthInput(String(n)); }
  };

  return (
    <div className="space-y-6">
      {/* 文字種 */}
      <div>
        <p style={{ ...bodyEmphasis, color: '#1d1d1f', marginBottom: '0.75rem' }}>文字種</p>
        <div className="flex flex-wrap gap-2">
          {CHAR_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setCharType(value)}
              style={{
                ...caption,
                padding: '0.5rem 1rem',
                borderRadius: '999px',
                border: charType === value ? '1.5px solid #0071e3' : '1.5px solid rgba(0,0,0,0.2)',
                background: charType === value ? '#e8f1fb' : '#ffffff',
                color: charType === value ? '#0071e3' : 'rgba(0,0,0,0.6)',
                cursor: 'pointer',
                fontWeight: charType === value ? 600 : 400,
              }}
              aria-pressed={charType === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 文字数 */}
      <div>
        <label
          htmlFor="dummy-length"
          style={{ ...bodyEmphasis, color: '#1d1d1f', display: 'block', marginBottom: '0.25rem' }}
        >
          文字数
        </label>
        <input
          id="dummy-length"
          type="number"
          min={1}
          max={5000}
          value={lengthInput}
          onChange={(e) => handleLengthChange(e.target.value)}
          onBlur={handleLengthBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') { handleLengthBlur(); } }}
          className="rounded-lg px-3 py-2"
          style={{
            ...caption,
            width: '8rem',
            border: '1px solid rgba(0,0,0,0.2)',
            outline: 'none',
            background: '#ffffff',
            color: '#1d1d1f',
          }}
          onFocus={(e) => { e.target.style.outline = '2px solid #0071e3'; e.target.style.outlineOffset = '2px'; }}
          onBlurCapture={(e) => { e.target.style.outline = 'none'; }}
        />
        <p style={{ ...micro, color: 'rgba(0,0,0,0.48)', marginTop: '0.25rem' }}>1〜5000文字</p>
      </div>

      {/* 改行 */}
      <div>
        <p style={{ ...bodyEmphasis, color: '#1d1d1f', marginBottom: '0.25rem' }}>改行</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid rgba(0,0,0,0.2)', display: 'inline-flex' }}
            role="group"
            aria-label="改行設定"
          >
            {([false, true] as const).map((val) => (
              <button
                key={String(val)}
                onClick={() => setLineBreak(val)}
                style={{
                  ...caption,
                  padding: '0.5rem 1.25rem',
                  background: lineBreak === val ? '#0071e3' : '#ffffff',
                  color: lineBreak === val ? '#ffffff' : 'rgba(0,0,0,0.6)',
                  border: 'none',
                  borderRight: !val ? '1px solid rgba(0,0,0,0.2)' : 'none',
                  cursor: 'pointer',
                  fontWeight: lineBreak === val ? 600 : 400,
                }}
                aria-pressed={lineBreak === val}
              >
                {val ? 'あり' : 'なし'}
              </button>
            ))}
          </div>
          {lineBreak && (
            <div className="flex items-center gap-2">
              <label htmlFor="chunk-size" style={{ ...caption, color: 'rgba(0,0,0,0.6)' }}>間隔</label>
              <input
                id="chunk-size"
                type="number"
                min={1}
                max={1000}
                value={chunkInput}
                onChange={(e) => handleChunkChange(e.target.value)}
                onBlur={handleChunkBlur}
                className="rounded-lg px-3 py-2"
                style={{
                  ...caption,
                  width: '5rem',
                  border: '1px solid rgba(0,0,0,0.2)',
                  outline: 'none',
                  background: '#ffffff',
                  color: '#1d1d1f',
                }}
                onFocus={(e) => { e.target.style.outline = '2px solid #0071e3'; e.target.style.outlineOffset = '2px'; }}
                onBlurCapture={(e) => { e.target.style.outline = 'none'; }}
              />
              <span style={{ ...micro, color: 'rgba(0,0,0,0.48)' }}>文字ごと（1〜1000）</span>
            </div>
          )}
        </div>
      </div>



      {/* 結果 */}
      {result && (
        <div className="rounded-lg" style={{ border: '1px solid rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          <div
            className="flex items-center justify-between gap-2 px-4 py-3"
            style={{ background: '#f5f5f7', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
          >
            <span style={{ ...bodyEmphasis, color: '#1d1d1f' }}>{result.length} 文字</span>
            <div className="flex items-center gap-2">
              <CopyButton text={result} label="コピー" />
              <button
                onClick={() => setResult('')}
                className="rounded-lg px-3 py-1.5 transition-colors hover:bg-apple-light"
                style={{ ...caption, color: 'rgba(0,0,0,0.48)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                クリア
              </button>
            </div>
          </div>
          <div className="px-4 py-4" style={{ background: '#ffffff' }}>
            <p
              style={{
                ...caption,
                color: '#1d1d1f',
                lineHeight: 1.8,
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {result}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
