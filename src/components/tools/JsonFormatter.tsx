import { useState, useMemo } from 'react';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ClearButton } from '@/components/ui/ClearButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { JsonTreeView } from '@/components/tools/JsonTreeView';
import {
  processJson,
  runQuery,
  maskValue,
  MASK_CATEGORIES,
  generateTypeScript,
  type IndentStyle,
  type TreeNode,
  type MaskCategory,
} from '@/utils/json-formatter';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { downloadText } from '@/utils/download';
import { useCodecWithMeta } from '@/hooks/useCodec';

type Mode = 'format' | 'minify';
type View = 'text' | 'tree' | 'mask' | 'type';

interface Meta {
  tree: TreeNode | null;
  value: unknown;
}

// useCodecWithMeta は安定参照を推奨（空入力 / error 時にこの参照へリセットされる）。
const INITIAL_META: Meta = { tree: null, value: undefined };

const SAMPLE = `{
  "name": "東京タワー",
  "open": true,
  "height_m": 333,
  "id": 1234567890123456789,
  "tags": ["観光", "電波塔"],
  "location": { "lat": 35.6586, "lng": 139.7454 },
  "renovated": null
}`;

const CATEGORY_LABEL: Record<MaskCategory, string> = {
  SECRET: 'キー名',
  EMAIL: 'メール',
  JWT: 'JWT',
  IP: 'IP',
  CREDIT_CARD: 'カード番号',
  PHONE_JP: '電話番号',
};

const ALL_CATEGORIES_ON: Record<MaskCategory, boolean> = {
  SECRET: true,
  EMAIL: true,
  JWT: true,
  IP: true,
  CREDIT_CARD: true,
  PHONE_JP: true,
};

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
      return { output: result.output, meta: { tree: result.tree, value: result.value } };
    },
    INITIAL_META,
    [mode, indent]
  );

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const queryActive = debouncedQuery.trim() !== '';

  // クエリは codec の外で評価（入力の debounce とは独立）。
  // 結果は JSON 文字列化して既存 processJson に通し、整形/ツリー経路を再利用する。
  const queryEval = useMemo(() => {
    if (!queryActive || meta.value === undefined) return null;
    const qr = runQuery(meta.value, debouncedQuery);
    if (!qr.ok)
      return {
        error: qr.error,
        output: '',
        tree: null as TreeNode | null,
        resultValue: undefined as unknown,
      };
    try {
      const resultText = JSON.stringify(qr.result) ?? 'null';
      const processed = processJson(resultText, { mode, indent });
      return {
        error: null as string | null,
        output: processed.output,
        tree: processed.tree,
        resultValue: qr.result as unknown,
      };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'クエリ結果の整形に失敗しました',
        output: '',
        tree: null as TreeNode | null,
        resultValue: undefined as unknown,
      };
    }
  }, [queryActive, meta.value, debouncedQuery, mode, indent]);

  const queryError = queryEval?.error ?? null;
  const displayOutput = queryActive ? (queryEval?.output ?? '') : output;
  const displayTree = queryActive ? (queryEval?.tree ?? null) : meta.tree;

  // 入力 JSON が不正な間（error あり）にクエリが入っていると評価できないため、
  // 結果欄を無言でブランクにせずクエリ欄で修正を案内する。それ以外は構文ヒント。
  const queryHint =
    error && queryActive
      ? '入力 JSON を修正するとクエリを実行できます。'
      : '空にすると全体を表示。JMESPath 構文（フィルタ・射影対応）。例: location.lat / items[?price > `1000`].name';

  const [maskEnabled, setMaskEnabled] = useState<Record<MaskCategory, boolean>>(ALL_CATEGORIES_ON);

  // マスク / 型生成の元値: クエリ有効なら抽出結果、無効なら入力全体。
  const baseValue = queryActive ? queryEval?.resultValue : meta.value;

  const maskEval = useMemo(() => {
    if (view !== 'mask' || baseValue === undefined) return null;
    const { masked, counts } = maskValue(baseValue, { enabled: maskEnabled });
    try {
      const processed = processJson(JSON.stringify(masked) ?? 'null', { mode, indent });
      return { output: processed.output, counts };
    } catch {
      return { output: '', counts };
    }
  }, [view, baseValue, maskEnabled, mode, indent]);

  const toggleCategory = (cat: MaskCategory) =>
    setMaskEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const maskOutput = maskEval?.output ?? '';

  const typeOutput = useMemo(() => {
    if (view !== 'type' || baseValue === undefined) return '';
    try {
      return generateTypeScript(baseValue);
    } catch {
      return '';
    }
  }, [view, baseValue]);

  const effectiveOutput =
    view === 'type' ? typeOutput : view === 'mask' ? maskOutput : displayOutput;
  const hasResult = effectiveOutput !== '';

  const handleClear = () => {
    reset();
    setQuery('');
    setView('text');
  };

  const handleDownload = () => {
    if (!effectiveOutput) return;
    if (view === 'type') {
      downloadText(effectiveOutput, 'types.ts', 'text/plain');
    } else {
      downloadText(effectiveOutput, 'data.json', 'application/json');
    }
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
      disabled={isPending || !effectiveOutput}
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
              { value: 'mask', label: 'マスク' },
              { value: 'type', label: '型' },
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

      {/* クエリ欄（JMESPath） */}
      <InputField
        id="json-formatter-query"
        label="クエリ (JMESPath)"
        value={query}
        onChange={setQuery}
        placeholder="例: location.lat ／ items[?price > `1000`].name"
        error={queryError || undefined}
        hint={queryHint}
        mono
      />

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
          {view === 'mask' ? (
            <div className="w-full">
              {/* マスク対象の種別トグル */}
              <fieldset className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <legend className="caption text-muted">マスク対象</legend>
                {MASK_CATEGORIES.map((cat) => (
                  <label key={cat} className="caption inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="accent-link"
                      checked={maskEnabled[cat]}
                      onChange={() => toggleCategory(cat)}
                    />
                    {CATEGORY_LABEL[cat]}
                  </label>
                ))}
              </fieldset>

              {/* 検出内訳バッジ */}
              {maskEval && (
                <p className="caption text-muted mb-2" role="status" aria-live="polite">
                  {MASK_CATEGORIES.filter((c) => maskEval.counts[c] > 0).length === 0
                    ? '検出された機密データはありません。'
                    : '検出: ' +
                      MASK_CATEGORIES.filter((c) => maskEval.counts[c] > 0)
                        .map((c) => `${CATEGORY_LABEL[c]} ${maskEval.counts[c]}`)
                        .join(' ・ ')}
                </p>
              )}

              {/* 出力は共通 OutputField を再利用（aria-live ラップ・コピー内蔵）。CLAUDE.md §5 */}
              <OutputField
                id="json-formatter-mask-output"
                label="結果（マスク済み）"
                value={effectiveOutput}
                rows={16}
                ariaLabel="マスク済み結果"
                rightSlot={downloadButton}
              />
            </div>
          ) : view === 'type' ? (
            <OutputField
              id="json-formatter-type-output"
              label="結果（TypeScript）"
              value={effectiveOutput}
              rows={18}
              ariaLabel="生成された型"
              rightSlot={downloadButton}
            />
          ) : view === 'text' ? (
            <OutputField
              id="json-formatter-output"
              label="結果"
              value={displayOutput}
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
                    <CopyButton text={displayOutput} ariaLabel="整形結果をコピー" />
                  </div>
                )}
              </div>
              <div className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2">
                {displayTree ? (
                  <JsonTreeView key={treeKey} node={displayTree} defaultOpen={treeOpen} />
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
