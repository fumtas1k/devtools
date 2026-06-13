// src/components/tools/JsonTreeResult.tsx
import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { JsonTreeView } from '@/components/tools/JsonTreeView';
import { JsonTreeViewVirtual } from '@/components/tools/JsonTreeViewVirtual';
import { countRows } from '@/utils/json-formatter';
import type { TreeNode } from '@/utils/json-formatter';

/**
 * 全展開換算の総行数がこの値を超えたら仮想化ビューへ切り替える（issue #512）。
 * 以下では従来の入れ子ツリー（DOM・見た目とも不変）、超えたら可視範囲のみ DOM 化する。
 */
export const TREE_VIRTUALIZE_THRESHOLD = 2_000;

interface Props {
  /** 表示するツリー。null のときは案内文を出す。 */
  tree: TreeNode | null;
  /** このモードの実効出力（整形テキスト）。コピー対象・結果有無判定に使う。 */
  output: string;
  /** key を変えて全行の開閉状態をリセットするための再マウントキー。 */
  treeKey: number;
  /** 各行の初期開閉状態（全展開/全折りたたみ）。 */
  defaultOpen: boolean;
  /** ラベル右に並べる要素（ダウンロードボタン）。 */
  rightSlot: ReactNode;
  /** 大入力ガード発動中（ツリーを自動構築せず案内を出す）。 */
  tooLarge?: boolean;
  /** 「ツリーを表示」押下時（ガードを解除して構築させる）。 */
  onForceRender?: () => void;
}

/**
 * ツリーモードの結果パネル。ヘッダ（ラベル＋DL＋コピー）＋折りたたみツリーを描画する。
 * 総行数が TREE_VIRTUALIZE_THRESHOLD を超える場合は仮想化ビューに切り替える。
 */
export function JsonTreeResult({
  tree,
  output,
  treeKey,
  defaultOpen,
  rightSlot,
  tooLarge,
  onForceRender,
}: Props) {
  const hasResult = output !== '';
  const boxRef = useRef<HTMLDivElement>(null);
  // 仮想化判定は tree ごとに 1 回。開閉状態に依存しないため経路がフリッカしない。
  const virtualize = useMemo(
    () => (tree ? countRows(tree) > TREE_VIRTUALIZE_THRESHOLD : false),
    [tree]
  );
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
      <div
        ref={boxRef}
        className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2"
      >
        {tooLarge ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="caption text-muted">
              JSON が大きいため、ツリー描画を保留しています（重い処理を避けるため）。
            </p>
            <button
              type="button"
              className="caption text-link-plain btn-link-plain"
              onClick={onForceRender}
            >
              ツリーを表示
            </button>
          </div>
        ) : tree ? (
          virtualize ? (
            <JsonTreeViewVirtual
              key={treeKey}
              node={tree}
              defaultOpen={defaultOpen}
              scrollRef={boxRef}
            />
          ) : (
            <JsonTreeView key={treeKey} node={tree} defaultOpen={defaultOpen} />
          )
        ) : (
          <p className="caption text-muted">有効な JSON を入力するとツリーが表示されます。</p>
        )}
      </div>
    </div>
  );
}
