import { useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { caption, colors } from '@/utils/styles';
import { jsonToCsv, csvToJson } from '@/utils/json-csv';
import { downloadText } from '@/utils/download';
import { useCodec } from '@/hooks/useCodec';

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

  const { input, setInput, output, error, reset } = useCodec(
    (text) => (mode === 'json2csv' ? jsonToCsv(text) : csvToJson(text)),
    [mode],
  );

  const handleModeChange = (next: Mode) => {
    setMode(next);
    reset();
  };

  const handleDownloadCsv = () => {
    if (!output) return;
    downloadText(output, 'output.csv', 'text/csv');
  };

  const downloadButton =
    mode === 'json2csv' ? (
      <button
        onClick={handleDownloadCsv}
        className="rounded-lg px-3 py-1.5 transition-colors"
        style={{
          ...caption,
          lineHeight: 1,
          color: colors.primary,
          border: `1px solid ${colors.primary}`,
          background: colors.bg,
        }}
      >
        CSVダウンロード
      </button>
    ) : null;

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

      {/* 入力・出力（PC横並び・モバイル縦並び） */}
      <div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>
        <div className="w-full md:flex-1 min-w-0">
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

        <div className="w-full md:flex-1 min-w-0">
          <OutputField
            id="json-csv-output"
            label="出力"
            value={output}
            rows={16}
            ariaLabel="変換結果"
            rightSlot={downloadButton}
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
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
