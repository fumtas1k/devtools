import { useRef, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { hashFile, sha256 } from '@/utils/sha256';

type Mode = 'text' | 'file';
const options: { value: Mode; label: string }[] = [
  { value: 'text', label: 'テキスト' },
  { value: 'file', label: 'ファイル' },
];

export function HashCalculator() {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const revision = useRef(0);
  const inFlight = useRef(false);

  function invalidate() {
    revision.current++;
    setResult('');
    setError('');
  }

  function clear() {
    invalidate();
    setText('');
    setFile(null);
  }

  function editText(value: string) {
    invalidate();
    setText(value);
  }

  async function calculate() {
    if (inFlight.current || (mode === 'file' && !file)) return;
    invalidate();
    const started = revision.current;
    inFlight.current = true;
    setRunning(true);
    try {
      if (mode === 'text' && text.length > 1_000_000) {
        throw new RangeError('テキストが長すぎます。短くするか、ファイルで入力してください。');
      }
      const digest =
        mode === 'file' && file
          ? await hashFile(file)
          : await sha256(new TextEncoder().encode(text));
      if (started === revision.current) setResult(digest);
    } catch (cause) {
      if (started === revision.current) {
        setError(
          cause instanceof RangeError
            ? cause.message
            : 'ハッシュを計算できませんでした。もう一度お試しください。'
        );
      }
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <ToggleGroup
        value={mode}
        options={options}
        ariaLabel="入力形式"
        onChange={(next) => {
          if (next !== mode) {
            clear();
            setMode(next);
          }
        }}
      />
      {mode === 'text' ? (
        <InputField
          id="hash-text"
          label="テキスト"
          value={text}
          multiline
          rows={4}
          onChange={editText}
          onSampleClick={() => editText('abc')}
          autoComplete="off"
          spellCheck={false}
          hint="UTF-8で計算します。空白・改行は削除しません。空の入力も計算できます。"
        />
      ) : (
        <div className="space-y-3">
          <p className="body-emphasis">ファイル（32 MiB以下）</p>
          <FileInputButton
            onChange={(event) => {
              const next = event.currentTarget.files?.[0];
              if (!next) return;
              invalidate();
              setFile(next);
              event.currentTarget.value = '';
            }}
          >
            ファイルを選択
          </FileInputButton>
          {file && <p className="wrap-anywhere">{file.name}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          variant="primary"
          loading={running}
          disabled={mode === 'file' && !file}
          onClick={() => {
            void calculate();
          }}
        >
          {running ? '計算中…' : 'ハッシュを生成'}
        </ActionButton>
        <ClearButton onClick={clear} />
      </div>
      {error && <ErrorMessage message={error} />}
      <OutputField
        id="hash-result"
        label="SHA-256（16進数）"
        value={result}
        rows={3}
        resize={false}
      />
    </div>
  );
}
