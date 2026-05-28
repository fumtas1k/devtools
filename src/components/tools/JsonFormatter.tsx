import { useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ClearButton } from '@/components/ui/ClearButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { JsonTreeView } from '@/components/tools/JsonTreeView';
import { processJson, type IndentStyle, type TreeNode } from '@/utils/json-formatter';
import { downloadText } from '@/utils/download';
import { useCodecWithMeta } from '@/hooks/useCodec';

type Mode = 'format' | 'minify';
type View = 'text' | 'tree';

interface Meta {
  tree: TreeNode | null;
}

// useCodecWithMeta は安定参照を推奨（空入力 / error 時にこの参照へリセットされる）。
const INITIAL_META: Meta = { tree: null };

const SAMPLE = `{
  "name": "東京タワー",
  "open": true,
  "height_m": 333,
  "id": 1234567890123456789,
  "tags": ["観光", "電波塔"],
  "location": { "lat": 35.6586, "lng": 139.7454 },
  "renovated": null
}`;

export function JsonFormatter() {
  const [indent, setIndent] = useState<IndentStyle>('2');
  const [mode, setMode] = useState<Mode>('format');
  const [view, setView] = useState<View>('text');

  // ツリーの全展開/全折りたたみ。key を変えて再マウントすることで全行の
  // 開閉状態を defaultOpen にリセットする。
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeKey, setTreeKey] = useState(0);

  const { input, setInput, output, error, isPending, reset, meta } = useCodecWithMeta<Meta>(
    (text) => {
      const result = processJson(text, { mode, indent });
      return { output: result.output, meta: { tree: result.tree } };
    },
    INITIAL_META,
    [mode, indent]
  );

  const hasResult = output !== '';

  const handleClear = () => {
    reset();
    setView('text');
  };

  const handleDownload = () => {
    if (!output) return;
    downloadText(output, 'data.json', 'application/json');
  };

  const expandAll = () => {
    setTreeOpen(true);
    setTreeKey((k) => k + 1);
  };
  const collapseAll = () => {
    setTreeOpen(false);
    setTreeKey((k) => k + 1);
  };

  // 入力欄（InputField）と結果欄（OutputField / ツリー）はどちらも min-h-8 + mb-3 の
  // 単一行ヘッダを持たせ、入力前後で上端がずれない（がたつかない）ようにする。
  // 表示切替・全展開/全折りたたみはヘッダではなく上部のオプション行に置く。
  const downloadButton = (
    <DownloadButton
      onClick={handleDownload}
      label="ダウンロード"
      variant="secondary"
      disabled={isPending || !output}
    />
  );

  return (
    <div className="space-y-6">
      {/* オプション行（上端配置。表示切替・ツリー操作もここに集約してヘッダ高さを固定する） */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="caption text-muted">インデント</span>
          <ToggleGroup
            options={[
              { value: '2', label: '2' },
              { value: '4', label: '4' },
              { value: 'tab', label: 'タブ' },
            ]}
            value={indent}
            onChange={setIndent}
            ariaLabel="インデント"
            size="sm"
            layout="wrap"
          />
        </div>
        <ToggleGroup
          options={[
            { value: 'format', label: '整形' },
            { value: 'minify', label: '最小化' },
          ]}
          value={mode}
          onChange={setMode}
          ariaLabel="出力モード"
          size="sm"
          layout="wrap"
        />
        <div className="flex items-center gap-2">
          <span className="caption text-muted">表示</span>
          <ToggleGroup
            options={[
              { value: 'text', label: 'テキスト' },
              { value: 'tree', label: 'ツリー' },
            ]}
            value={view}
            onChange={setView}
            ariaLabel="表示形式"
            size="sm"
            layout="wrap"
          />
        </div>
        {view === 'tree' && hasResult && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="caption text-link-color btn-link-plain"
              onClick={expandAll}
            >
              全展開
            </button>
            <button
              type="button"
              className="caption text-link-color btn-link-plain"
              onClick={collapseAll}
            >
              全折りたたみ
            </button>
          </div>
        )}
      </div>

      {/* 入力・結果（PC 横並び・モバイル縦並び） */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="json-formatter-input"
            label="入力"
            value={input}
            onChange={setInput}
            placeholder='{"hello": "world"}'
            multiline
            rows={18}
            error={error || undefined}
            onSampleClick={() => setInput(SAMPLE)}
            mono
            resize
          />
        </div>

        <div className="w-full md:flex-1 min-w-0">
          {view === 'text' ? (
            <OutputField
              id="json-formatter-output"
              label="結果"
              value={output}
              rows={18}
              ariaLabel="整形結果"
              rightSlot={downloadButton}
            />
          ) : (
            <div className="w-full">
              <div className="flex items-center justify-between mb-3 min-h-8 gap-2">
                <span className="body-emphasis text-default">結果</span>
                {hasResult && (
                  <div className="flex items-center gap-2">
                    {downloadButton}
                    <CopyButton text={output} ariaLabel="整形結果をコピー" />
                  </div>
                )}
              </div>
              <div className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2">
                {meta.tree ? (
                  <JsonTreeView key={treeKey} node={meta.tree} defaultOpen={treeOpen} />
                ) : (
                  <p className="caption text-muted">
                    有効な JSON を入力するとツリーが表示されます。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
