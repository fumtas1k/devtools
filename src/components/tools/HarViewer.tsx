import { useState, useEffect, useCallback, useRef } from 'react';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ClearButton } from '@/components/ui/ClearButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { HarEntryList } from './HarEntryList';
import { HarEntryDetail } from './HarEntryDetail';
import { useHarSanitizer } from '@/hooks/useHarSanitizer';
import { validateFile } from '@/utils/file-validation';
import { downloadText } from '@/utils/download';
import {
  HAR_REDACT_CATEGORIES,
  HAR_REDACT_LABEL,
  HAR_REDACT_DEFAULT,
  type HarRedactCategory,
} from '@/utils/har';

// メモリ防御ガード。読み込み時のフリーズ（同期 sanitize）は Web Worker 化で解消したため
// バイト数は「処理能力の指標」ではなくメモリ確保の上限として残す。大きな HAR は
// worker 上で時間がかかるが、進捗バーを表示しメインスレッドは固まらない（issue #677）。
const MAX_BYTES = 25 * 1024 * 1024;

export function HarViewer() {
  const { result, busy, progress, error, load, resanitize, reset } = useHarSanitizer();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<Record<HarRedactCategory, boolean>>({
    ...HAR_REDACT_DEFAULT,
  });
  const [fileError, setFileError] = useState<string | null>(null);

  // 新規ファイル読込（loadSeq 変化）のときだけ選択をリセットする。
  // redact トグル（loadSeq 不変の再 sanitize）では選択・ページを保持する。
  // entryCount は ref 経由で最新値を読み、effect の依存は loadSeq のみに保つ
  // （result を依存に含めるとトグル再 sanitize でも発火してしまうため）。
  const resultRef = useRef(result);
  resultRef.current = result;
  const loadSeq = result?.loadSeq;
  useEffect(() => {
    if (loadSeq == null) return;
    const r = resultRef.current;
    setSelectedIndex(r && r.entryCount > 0 ? 0 : null);
  }, [loadSeq]);

  const handleToggle = useCallback(
    (cat: HarRedactCategory) => {
      const next = { ...enabled, [cat]: !enabled[cat] };
      setEnabled(next);
      resanitize(next);
    },
    [enabled, resanitize]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setFileError(null);
      const v = await validateFile(file, {
        maxBytes: MAX_BYTES,
        kind: 'text',
        acceptExtensions: ['.har', '.json'],
      });
      if (!v.ok) {
        setFileError(v.message);
        return;
      }
      load(await v.file.text(), enabled);
    },
    [enabled, load]
  );

  const handleReset = useCallback(() => {
    reset();
    setSelectedIndex(null);
    setFileError(null);
  }, [reset]);

  const totalRedacted = result ? Object.values(result.counts).reduce((a, b) => a + b, 0) : 0;
  const selectedEntry =
    result && selectedIndex != null ? result.har.log.entries[selectedIndex] : null;
  const displayError = fileError ?? error;

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
        <p className="caption mt-2 text-muted">
          ファイルはブラウザ外に送信されません（最大 25MB）。大きな HAR
          はサニタイズに時間がかかりますが、Web Worker
          で処理するため画面は固まりません（進捗を表示します）。
        </p>
      </div>

      {displayError && <ErrorMessage message={displayError} />}

      {/* 処理中インジケータ（初回 load / トグル再計算 共通） */}
      {busy && (
        <div
          className="rounded border border-default bg-subtle p-4"
          role="status"
          aria-live="polite"
        >
          <p className="caption mb-2 text-muted">サニタイズ処理中…（ブラウザ内で完結します）</p>
          {progress && progress.total > 0 && (
            <ProgressBar current={progress.processed} max={progress.total} />
          )}
        </div>
      )}

      {result && (
        <>
          {/* サマリ */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              リクエスト: <strong>{result.entryCount}</strong> 件
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
              count: result.counts[cat],
            }))}
            selected={(c) => enabled[c]}
            onToggle={handleToggle}
          />

          {/* エントリ一覧（key={loadSeq} で新規読込時のみ remount → ページ状態リセット） */}
          <HarEntryList
            key={result.loadSeq}
            entries={result.har.log.entries}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />

          {/* 詳細パネル */}
          {selectedEntry && <HarEntryDetail entry={selectedEntry} />}

          {/* 出力ボタン群（JSON.stringify はコピー/DL 押下時のみ遅延生成） */}
          <div className="flex flex-wrap justify-end gap-2">
            <CopyButton
              text={() => JSON.stringify(result.har, null, 2)}
              label="サニタイズ済み HAR をコピー"
            />
            <DownloadButton
              onClick={() =>
                downloadText(
                  JSON.stringify(result.har, null, 2),
                  'sanitized.har',
                  'application/json'
                )
              }
              label="サニタイズ済み HAR をダウンロード"
            />
            <ClearButton onClick={handleReset} />
          </div>
        </>
      )}
    </div>
  );
}
