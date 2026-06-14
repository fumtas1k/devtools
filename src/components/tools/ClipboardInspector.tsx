import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/utils/cx';
import { Section } from '@/components/ui/Section';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { downloadBlob } from '@/utils/download';
import { snapshotDataTransfer } from '@/utils/dataTransferSnapshot';
import type { CaptureSource, DataTransferSnapshot, FileFlavor } from '@/utils/dataTransferSnapshot';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

const SOURCE_LABEL: Record<CaptureSource, string> = {
  paste: '貼り付け',
  drop: 'ドロップ',
};

type HtmlView = 'source' | 'preview';

const HTML_VIEW_OPTIONS: { value: HtmlView; label: string }[] = [
  { value: 'source', label: '生ソース' },
  { value: 'preview', label: 'サニタイズ後プレビュー' },
];

/** フレーバー本文の共通 pre 表示 */
function FlavorPre({ content }: { content: string }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-subtle p-3 font-mono text-sm text-default">
      {content}
    </pre>
  );
}

function HtmlFlavorBody({
  html,
  view,
  onViewChange,
}: {
  html: string;
  view: HtmlView;
  onViewChange: (view: HtmlView) => void;
}) {
  // MB 級 HTML のフルパース再実行を避けるため、サニタイズ結果は html 単位で memo 化する
  // （preview 表示中の親再レンダー＝dragover の isDragOver トグル等で毎回再計算されるのを防ぐ）
  const sanitized = useMemo(() => sanitizeHtml(html), [html]);

  return (
    <div className="space-y-3">
      <ToggleGroup
        options={HTML_VIEW_OPTIONS}
        value={view}
        onChange={onViewChange}
        ariaLabel="HTML の表示方法"
        size="sm"
        layout="wrap"
      />
      {view === 'source' ? (
        <FlavorPre content={html} />
      ) : (
        <div>
          {/* サニタイズ + sandbox（allow-scripts なし）の二重防御で描画する */}
          <iframe
            title="サニタイズ後プレビュー"
            sandbox=""
            srcDoc={sanitized}
            className="h-64 w-full rounded-lg border border-default bg-default"
          />
          <p className="caption text-muted m-0 mt-2">
            スクリプト・危険な属性は除去済み。セキュリティポリシー（CSP）によりインラインスタイルは反映されず、構造とテキスト中心の表示になります。
          </p>
        </div>
      )}
    </div>
  );
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt={`${file.name} のプレビュー`}
      className="mt-3 max-h-64 max-w-full rounded-lg border border-default"
    />
  );
}

function FileFlavorCard({ entry }: { entry: FileFlavor }) {
  return (
    <Section
      title={<code className="font-mono">{entry.type || '(type 不明)'}</code>}
      headerSlot={
        <div className="flex flex-wrap items-center gap-2">
          <ChipLabel tone="neutral">ファイル</ChipLabel>
          <DownloadButton
            variant="secondary"
            label="ダウンロード"
            aria-label={`${entry.name} をダウンロード`}
            onClick={() => downloadBlob(entry.file, entry.name)}
          />
        </div>
      }
    >
      <dl className="caption m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">ファイル名</dt>
        <dd className="m-0 break-all font-mono">{entry.name}</dd>
        <dt className="text-muted">サイズ</dt>
        <dd className="m-0">{entry.size.toLocaleString('ja-JP')} バイト</dd>
        <dt className="text-muted">更新日時</dt>
        <dd className="m-0">{new Date(entry.lastModified).toLocaleString('ja-JP')}</dd>
      </dl>
      {entry.type.startsWith('image/') && <ImagePreview file={entry.file} />}
    </Section>
  );
}

export function ClipboardInspectorTool() {
  const [snapshot, setSnapshot] = useState<DataTransferSnapshot | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [htmlViews, setHtmlViews] = useState<Record<number, HtmlView>>({});
  // SR 向けアナウンス。snapshot 派生にするとクリア時に空文字になるだけで SR に通知されないため独立 state にする
  const [announcement, setAnnouncement] = useState('');
  // 連続キャプチャの race 対策: 最新キャプチャの連番。stale な resolve を破棄する
  const captureSeqRef = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 受付領域（contenteditable）の編集阻止。
  // React の onBeforeInput は native beforeinput ではなく textInput / keypress / compositionend 等から
  // 合成されるため、IME 入力等が通る native beforeinput 経路は ref で直接 preventDefault する
  // （JSX の onBeforeInput と二段構えで全編集経路を阻止）。
  // さらに insertCompositionText の beforeinput は仕様上 non-cancelable（W3C Input Events）のため、
  // 貫通した編集（IME 変換・autocorrect 等）は input イベント時に mount 時の内容へ復元する。
  // - 保存は deep clone 必須: 実 IME はキャレット位置 = 既存ノード「内部」のテキストノードを
  //   直接変異させるため、同一ノード参照の保存では保存内容ごと汚染され復元が no-op になる
  // - 復元毎の再クローンも必須: master を直接装着すると次の IME 貫通で master 自体が汚染される
  // - 復元で React 生成の元ノードは detach されるが、zone の children は静的 JSX で
  //   React が以後触らない（再レンダーの diff 対象にならない）ため実害なし
  useEffect(() => {
    const zone = dropZoneRef.current;
    if (!zone) return;
    const savedChildren = [...zone.childNodes].map((n) => n.cloneNode(true));
    const blockEdit = (e: Event) => e.preventDefault();
    const restoreContent = () =>
      zone.replaceChildren(...savedChildren.map((n) => n.cloneNode(true)));
    zone.addEventListener('beforeinput', blockEdit);
    zone.addEventListener('input', restoreContent);
    return () => {
      zone.removeEventListener('beforeinput', blockEdit);
      zone.removeEventListener('input', restoreContent);
    };
  }, []);

  const capture = useCallback((dt: DataTransfer | null, source: CaptureSource) => {
    if (!dt) return;
    const seq = ++captureSeqRef.current;
    // getAsString の発行はイベントハンドラの同期パスで行う必要がある
    // （ハンドラ終了後は DataTransferItemList が無効化されるため await を挟まない）
    void snapshotDataTransfer(dt, source).then((snap) => {
      // 後発のキャプチャが先に resolve していたら、この古い結果は破棄する
      if (seq !== captureSeqRef.current) return;
      setSnapshot(snap);
      setHtmlViews({});
      setAnnouncement(`${snap.strings.length + snap.files.length} 件のフレーバーを捕捉しました`);
    });
  }, []);

  // ページ内のどこで Cmd/Ctrl+V しても捕捉できるよう document に listener を張る
  // （本ページには他に貼り付け先となる入力欄がないため競合しない）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      capture(e.clipboardData, 'paste');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [capture]);

  const flavorCount = snapshot ? snapshot.strings.length + snapshot.files.length : 0;

  return (
    <div className="space-y-6">
      {/* 受付領域（paste は document 全体で捕捉、ここは案内と drop の的）。
          モバイルの OS ペーストメニューは編集可能要素の長押しでしか出ないため contenteditable 化（issue #636）。
          編集は beforeinput で全阻止（貼り付け自体は document の paste listener が preventDefault + 捕捉するため二重に安全）。
          inputMode="none" はフォーカス時のソフトキーボード表示を抑制する（実機で長押しメニューが出ない場合はこの属性を外す） */}
      <div
        ref={dropZoneRef}
        data-testid="clipboard-drop-zone"
        contentEditable
        suppressContentEditableWarning
        inputMode="none"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="textbox"
        aria-label="貼り付け受付領域。長押しまたは Ctrl+V で貼り付けるとクリップボードの内容を検査します"
        onBeforeInput={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          capture(e.dataTransfer, 'drop');
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        className={cx(
          'caret-transparent rounded-xl border-2 border-dashed border-default p-8 text-center',
          isDragOver && 'bg-subtle'
        )}
      >
        <p className="body-emphasis text-default m-0">
          このページで Ctrl+V / Cmd+V
          で貼り付け（スマホはここを長押ししてペースト）、またはここにドラッグ&ドロップ
        </p>
        <p className="caption text-muted m-0 mt-2">
          クリップボード・ドラッグデータの内容はブラウザ内でのみ処理され、外部に送信されません
        </p>
      </div>

      {/* SR 向け捕捉アナウンス（常設 live region） */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="clipboard-announcement">
        {announcement}
      </p>

      {snapshot && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ChipLabel tone="info">{SOURCE_LABEL[snapshot.source]}</ChipLabel>
              <span className="caption text-muted leading-none">
                {flavorCount} 件のフレーバーを捕捉
              </span>
            </div>
            <ClearButton
              onClick={() => {
                // in-flight キャプチャの resolve を破棄する（クリア後に古い getAsString が
                // 解決して snapshot を復活させるのを防ぐ）。capture の seq ガードと一貫させる
                captureSeqRef.current++;
                setSnapshot(null);
                setAnnouncement('クリアしました');
              }}
            />
          </div>

          {flavorCount === 0 && (
            <p className="caption text-muted m-0">
              フレーバーが見つかりませんでした。コピー元によっては空の DataTransfer
              になることがあります。
            </p>
          )}

          {snapshot.strings.map((flavor, i) => (
            <Section
              key={`${flavor.type}-${i}`}
              title={<code className="font-mono">{flavor.type || '(type 不明)'}</code>}
              headerSlot={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="caption text-muted leading-none">
                    {[...flavor.content].length.toLocaleString('ja-JP')} 文字 /{' '}
                    {flavor.byteSize.toLocaleString('ja-JP')} バイト
                  </span>
                  <CopyButton text={flavor.content} ariaLabel={`${flavor.type} の内容をコピー`} />
                </div>
              }
            >
              {flavor.type === 'text/html' ? (
                <HtmlFlavorBody
                  html={flavor.content}
                  view={htmlViews[i] ?? 'source'}
                  onViewChange={(v) => setHtmlViews((prev) => ({ ...prev, [i]: v }))}
                />
              ) : (
                <FlavorPre content={flavor.content} />
              )}
            </Section>
          ))}

          {snapshot.files.map((entry, i) => (
            <FileFlavorCard key={`${entry.name}-${i}`} entry={entry} />
          ))}
        </>
      )}
    </div>
  );
}
