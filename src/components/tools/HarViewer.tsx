import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ClearButton } from '@/components/ui/ClearButton';
import { ActionButton } from '@/components/ui/ActionButton';
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
  computeWaterfall,
} from '@/utils/har';

// メモリ防御ガード。読み込み時のフリーズ（同期 sanitize）は Web Worker 化で解消したため
// バイト数は「処理能力の指標」ではなくメモリ確保の上限として残す。大きな HAR は
// worker 上で時間がかかるが、処理段階を表示しメインスレッドは固まらない（issue #677）。
const MAX_BYTES = 25 * 1024 * 1024;

export function HarViewer() {
  const { result, busy, progress, error, load, resanitize, reset } = useHarSanitizer();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<Record<HarRedactCategory, boolean>>({
    ...HAR_REDACT_DEFAULT,
  });
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [operation, setOperation] = useState(0);
  const fileSeq = useRef(0);
  useEffect(
    () => () => {
      fileSeq.current += 1;
    },
    []
  );

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
      setOperation((n) => n + 1);
      const next = { ...enabled, [cat]: !enabled[cat] };
      setEnabled(next);
      resanitize(next);
    },
    [enabled, resanitize]
  );

  const handleFile = useCallback(
    async (file: File) => {
      const seq = ++fileSeq.current;
      setOperation((n) => n + 1);
      reset();
      setReading(true);
      setFileError(null);
      try {
        const v = await validateFile(file, {
          maxBytes: MAX_BYTES,
          kind: 'text',
          acceptExtensions: ['.har', '.json'],
        });
        if (seq !== fileSeq.current) return;
        if (!v.ok) {
          setFileError(v.message);
          return;
        }
        const text = await v.file.text();
        if (seq === fileSeq.current) load(text, enabled);
      } catch {
        if (seq === fileSeq.current) setFileError('ファイルを読み込めませんでした');
      } finally {
        if (seq === fileSeq.current) setReading(false);
      }
    },
    [enabled, load, reset]
  );

  const handleReset = useCallback(() => {
    fileSeq.current += 1;
    setReading(false);
    reset();
    setSelectedIndex(null);
    setFileError(null);
  }, [reset]);

  const waterfall = useMemo(() => computeWaterfall(result ? result.har.log.entries : []), [result]);

  const totalRedacted = result ? Object.values(result.counts).reduce((a, b) => a + b, 0) : 0;
  const selectedEntry =
    result && selectedIndex != null ? result.har.log.entries[selectedIndex] : null;
  const displayError = fileError ?? error;

  return (
    <div className="space-y-6">
      {/* ファイル入力エリア */}
      <div
        className="rounded-lg border border-dashed border-default p-6 text-center"
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
            e.target.value = '';
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

      {/* 秒刻みの経過時間は live region の外に置く。 */}
      {(busy || reading) && (
        <div className="rounded-lg border border-default bg-subtle p-4">
          <div role="status" aria-live="polite">
            <p className="caption mb-2 text-muted">
              {reading
                ? 'ファイルを読み込み中…'
                : progress === 'parse'
                  ? 'HAR を解析中…'
                  : progress === 'sanitize'
                    ? 'サニタイズ処理中…'
                    : '処理を開始中…'}
              （ブラウザ内で完結します）
            </p>
            <span role="progressbar" aria-label="処理中" className="har-busy-indicator" />
          </div>
          <ElapsedTime key={operation} />
          <ActionButton onClick={handleReset}>キャンセル</ActionButton>
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

          {/* エントリ一覧（全件描画。フリーズの主因は sanitize でありそれは Worker 化で解消済み） */}
          <HarEntryList
            entries={result.har.log.entries}
            waterfall={waterfall}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />

          {/* 詳細パネル */}
          {/* selectedIndex があれば（entry が null/壊れていても）プレースホルダを描画し、
              {} ケースとの UX 非対称を解消する（issue #684） */}
          {selectedIndex != null && <HarEntryDetail entry={selectedEntry} />}

          {/* 出力ボタン群（JSON.stringify はコピー/DL 押下時のみ遅延生成）。
              再計算中（busy）は result が前回の redact 設定のままなので、変更前の
              （未マスクかもしれない）結果を出力させないよう無効化する（issue #780） */}
          <div className="flex flex-wrap justify-end gap-2">
            <CopyButton
              text={() => JSON.stringify(result.har, null, 2)}
              label="サニタイズ済み HAR をコピー"
              disabled={busy}
            />
            <DownloadButton
              onClick={() => {
                if (busy) return;
                downloadText(
                  JSON.stringify(result.har, null, 2),
                  'sanitized.har',
                  'application/json'
                );
              }}
              disabled={busy}
              label="サニタイズ済み HAR をダウンロード"
            />
            <ClearButton onClick={handleReset} />
          </div>
        </>
      )}
    </div>
  );
}

/** 経過時間は進捗量や残り時間を意味しない。 */
function ElapsedTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((performance.now() - started) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="caption my-2 text-muted">
      操作開始からの経過時間: {seconds} 秒（進捗量や残り時間ではありません）
    </p>
  );
}
