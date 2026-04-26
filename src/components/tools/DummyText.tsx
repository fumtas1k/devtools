import { useState, useEffect, useCallback } from 'react';
import { useClampedInput } from '@/hooks/useClampedInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { ToggleGroup } from '@/components/ui/ToggleGroup';

type CharType = 'hiragana' | 'katakana' | 'japanese' | 'alphanumeric' | 'lorem';

const CHAR_TYPES: { value: CharType; label: string }[] = [
  { value: 'hiragana', label: 'ひらがな' },
  { value: 'katakana', label: 'カタカナ' },
  { value: 'japanese', label: '漢字混じり日本語' },
  { value: 'alphanumeric', label: '英数字' },
  { value: 'lorem', label: 'Lorem Ipsum' },
];

const HIRAGANA =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const KATAKANA =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
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

export function DummyTextTool() {
  const [charType, setCharType] = useState<CharType>('japanese');
  const {
    value: length,
    inputStr: lengthInput,
    handleChange: handleLengthChange,
    handleBlur: handleLengthBlur,
  } = useClampedInput(10, 1, 5000);
  const [lineBreak, setLineBreak] = useState(false);
  const {
    value: chunkSize,
    inputStr: chunkInput,
    handleChange: handleChunkChange,
    handleBlur: handleChunkBlur,
  } = useClampedInput(40, 1, 1000);
  const [result, setResult] = useState('');

  const generate = useCallback(() => {
    const raw = generateText(charType, length);
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

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <div className="space-y-6">
      {/* 文字種 */}
      <div>
        <p style={{ ...bodyEmphasis, color: colors.text, marginBottom: '0.75rem' }}>文字種</p>
        <ToggleGroup
          options={CHAR_TYPES}
          value={charType}
          onChange={setCharType}
          ariaLabel="文字種"
          layout="wrap"
        />
      </div>

      {/* 文字数 */}
      <div>
        <label
          htmlFor="dummy-length"
          style={{ ...bodyEmphasis, color: colors.text, display: 'block', marginBottom: '0.25rem' }}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleLengthBlur();
            }
          }}
          className="rounded-lg px-3 py-2"
          style={{
            ...caption,
            width: '8rem',
            border: `1px solid ${colors.borderInput}`,
            outline: 'none',
            background: colors.bg,
            color: colors.text,
          }}
        />
        <p style={{ ...caption, color: colors.muted, marginTop: '0.25rem' }}>1〜5000文字</p>
      </div>

      {/* 改行 */}
      <div>
        <p style={{ ...bodyEmphasis, color: colors.text, marginBottom: '0.25rem' }}>改行</p>
        <div className="flex items-center gap-3 flex-wrap">
          <ToggleGroup<'false' | 'true'>
            options={[
              { value: 'false', label: 'なし' },
              { value: 'true', label: 'あり' },
            ]}
            value={String(lineBreak) as 'false' | 'true'}
            onChange={(v) => setLineBreak(v === 'true')}
            ariaLabel="改行設定"
          />
          {lineBreak && (
            <div className="flex items-center gap-2">
              <label htmlFor="chunk-size" style={{ ...caption, color: colors.muted }}>
                間隔
              </label>
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
                  border: `1px solid ${colors.borderInput}`,
                  outline: 'none',
                  background: colors.bg,
                  color: colors.text,
                }}
              />
              <span style={{ ...caption, color: colors.muted }}>文字ごと（1〜1000）</span>
            </div>
          )}
        </div>
      </div>

      {/* 結果 */}
      {result && (
        <div
          className="rounded-lg"
          style={{ border: `1px solid ${colors.border}`, overflow: 'hidden' }}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-3"
            style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}` }}
          >
            <span style={{ ...bodyEmphasis, color: colors.text }}>{result.length} 文字</span>
            <div className="flex items-center gap-2">
              <CopyButton text={result} label="コピー" />
              <ClearButton onClick={() => setResult('')} />
            </div>
          </div>
          <div className="px-4 py-4" style={{ background: colors.bg }}>
            <p
              style={{
                ...caption,
                color: colors.text,
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
