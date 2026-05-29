import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { JsonTreeView } from '@/components/tools/JsonTreeView';
import type { TreeNode } from '@/utils/json-formatter';

interface Props {
  /** 表示するツリー。null のときは案内文を出す。 */
  tree: TreeNode | null;
  /** コピー対象の整形テキスト（ヘッダのコピーボタン用）。 */
  output: string;
  /** key を変えて全行の開閉状態をリセットするための再マウントキー。 */
  treeKey: number;
  /** 各行の初期開閉状態（全展開/全折りたたみ）。 */
  defaultOpen: boolean;
  /** ラベル右に並べる要素（ダウンロードボタン）。 */
  rightSlot: ReactNode;
}

/**
 * ツリーモードの結果パネル。ヘッダ（ラベル＋DL＋コピー）＋折りたたみツリーを描画する。
 */
export function JsonTreeResult({ tree, output, treeKey, defaultOpen, rightSlot }: Props) {
  const hasResult = output !== '';
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 min-h-8 gap-2">
        <span className="body-emphasis text-default">結果</span>
        {hasResult && (
          <div className="flex items-center gap-2">
            {rightSlot}
            <CopyButton text={output} ariaLabel="整形結果をコピー" />
          </div>
        )}
      </div>
      <div className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2">
        {tree ? (
          <JsonTreeView key={treeKey} node={tree} defaultOpen={defaultOpen} />
        ) : (
          <p className="caption text-muted">有効な JSON を入力するとツリーが表示されます。</p>
        )}
      </div>
    </div>
  );
}
