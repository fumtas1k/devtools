import { useState, useMemo, useCallback } from 'react';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ClearButton } from '@/components/ui/ClearButton';
import { HarEntryList } from './HarEntryList';
import { HarEntryDetail } from './HarEntryDetail';
import { validateFile } from '@/utils/file-validation';
import { downloadText } from '@/utils/download';
import {
  parseHar,
  sanitizeHar,
  HAR_REDACT_CATEGORIES,
  HAR_REDACT_LABEL,
  HAR_REDACT_DEFAULT,
  type HarRedactCategory,
  type Har,
} from '@/utils/har';

const MAX_BYTES = 25 * 1024 * 1024;

export function HarViewer() {
  const [har, setHar] = useState<Har | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<Record<HarRedactCategory, boolean>>({
    ...HAR_REDACT_DEFAULT,
  });

  const handleToggle = useCallback((cat: HarRedactCategory) => {
    setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const loadText = useCallback((text: string) => {
    const result = parseHar(text);
    if (!result.ok) {
      setError(result.message);
      setHar(null);
      setSelectedIndex(null);
      return;
    }
    setError(null);
    setHar(result.har);
    setSelectedIndex(result.har.log.entries.length > 0 ? 0 : null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const v = await validateFile(file, {
        maxBytes: MAX_BYTES,
        kind: 'text',
        acceptExtensions: ['.har', '.json'],
      });
      if (!v.ok) {
        setError(v.message);
        return;
      }
      loadText(await v.file.text());
    },
    [loadText]
  );

  // サニタイズ結果（トグル変更で再計算）
  const sanitized = useMemo(() => (har ? sanitizeHar(har, enabled) : null), [har, enabled]);

  const outputJson = useMemo(
    () => (sanitized ? JSON.stringify(sanitized.har, null, 2) : ''),
    [sanitized]
  );

  const totalRedacted = sanitized ? Object.values(sanitized.counts).reduce((a, b) => a + b, 0) : 0;

  const selectedEntry =
    sanitized && selectedIndex != null ? sanitized.har.log.entries[selectedIndex] : null;

  const handleReset = useCallback(() => {
    setHar(null);
    setError(null);
    setSelectedIndex(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* ファイル入力エリア */}
      <div
        className="rounded border border-dashed border-default p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <p className="mb-3 text-muted">HAR ファイルをドラッグ&ドロップ、または選択</p>
        <FileInputButton
          accept=".har,.json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          ファイルを選択
        </FileInputButton>
        <p className="caption mt-2 text-muted">ファイルはブラウザ外に送信されません（最大 25MB）</p>
      </div>

      {error && <ErrorMessage message={error} />}

      {sanitized && har && (
        <>
          {/* サマリ */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              リクエスト: <strong>{har.log.entries.length}</strong> 件
            </span>
            <span>
              redact: <strong>{totalRedacted}</strong> 件
            </span>
          </div>

          {/* redact トグル */}
          <ToggleChips
            legend="redact 対象"
            options={HAR_REDACT_CATEGORIES.map((cat) => ({
              value: cat,
              label: HAR_REDACT_LABEL[cat],
              count: sanitized.counts[cat],
            }))}
            selected={(c) => enabled[c]}
            onToggle={handleToggle}
          />

          {/* エントリ一覧 */}
          <HarEntryList
            entries={sanitized.har.log.entries}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />

          {/* 詳細パネル */}
          {selectedEntry && <HarEntryDetail entry={selectedEntry} />}

          {/* 出力ボタン群 */}
          <div className="flex flex-wrap justify-end gap-2">
            <CopyButton text={outputJson} label="サニタイズ済み HAR をコピー" />
            <DownloadButton
              onClick={() => downloadText(outputJson, 'sanitized.har', 'application/json')}
              label="サニタイズ済み HAR をダウンロード"
            />
            <ClearButton onClick={handleReset} />
          </div>
        </>
      )}
    </div>
  );
}
