import { useState, useEffect } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { jsonToCsv, csvToJson } from '@/utils/json-csv';
import { downloadText } from '@/utils/download';

type Mode = 'json2csv' | 'csv2json';

const SAMPLE: Record<Mode, string> = {
  json2csv: JSON.stringify(
    [
      { id: 1, name: '山田太郎', address: { city: '東京', zip: '100-0001' } },
      { id: 2, name: '鈴木花子', address: { city: '大阪', zip: '530-0001' } },
    ],
    null,
    2,
  ),
  csv2json: `id,name,address.city,address.zip
1,山田太郎,東京,100-0001
2,鈴木花子,大阪,530-0001`,
};

export function JsonCsvTool() {
  const [mode, setMode] = useState<Mode>('json2csv');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    const timer = setTimeout(() => {
      try {
        const result = mode === 'json2csv' ? jsonToCsv(input) : csvToJson(input);
        setOutput(result);
        setError('');
      } catch (e) {
        setOutput('');
        setError(e instanceof Error ? e.message : '変換に失敗しました');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, mode]);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setInput('');
    setOutput('');
    setError('');
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const handleDownloadCsv = () => {
    if (!output) return;
    downloadText(output, 'output.csv', 'text/csv');
  };

  return (
    <div className="space-y-4">
      {/* モード切替 */}
      <ToggleGroup
        options={[
          { value: 'json2csv', label: 'JSON → CSV' },
          { value: 'csv2json', label: 'CSV → JSON' },
        ]}
        value={mode}
        onChange={handleModeChange}
        ariaLabel="変換モード"
      />

      {/* 入力・出力（横並び） */}
      <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
        {/* 入力 */}
        <div className="flex-1 min-w-0">
          <InputField
            id="json-csv-input"
            label="入力"
            value={input}
            onChange={setInput}
            placeholder={
              mode === 'json2csv'
                ? '[{"id": 1, "name": "example"}]'
                : 'id,name\n1,example'
            }
            multiline
            rows={16}
            error={error || undefined}
            onSampleClick={() => setInput(SAMPLE[mode])}
            mono
            resize
          />
        </div>

        {/* 出力 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between" style={{ marginBottom: '0.25rem' }}>
            <label htmlFor="json-csv-output" style={{ ...bodyEmphasis, color: colors.text }}>出力</label>
            <div className="flex gap-2">
              {output && <CopyButton text={output} label="コピー" />}
              {output && mode === 'json2csv' && (
                <button
                  onClick={handleDownloadCsv}
                  className="rounded-lg px-3 py-1.5 transition-colors"
                  style={{
                    ...caption,
                    color: colors.primary,
                    border: `1px solid ${colors.primary}`,
                    background: colors.bg,
                  }}
                >
                  CSVダウンロード
                </button>
              )}
            </div>
          </div>
          <textarea
            id="json-csv-output"
            readOnly
            value={output}
            rows={16}
            className="w-full rounded-lg px-3 py-2 font-mono"
            style={{
              ...caption,
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
      <div className="flex justify-end gap-2">
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
