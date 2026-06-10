import { CopyButton } from '@/components/ui/CopyButton';
import type { TreeNode } from '@/utils/json-formatter';

/** JSON 値型 → 構文色 class（JsonTreeView / JsonTreeViewVirtual 共用）。 */
export const VALUE_CLASS: Record<string, string> = {
  string: 'json-string',
  number: 'json-number',
  boolean: 'json-boolean',
  null: 'json-null',
};

/** キー名（または配列インデックス）部分。ルート（key=null）は何も描画しない。 */
export function KeyPart({ node }: { node: TreeNode }) {
  if (node.key === null) return null;
  if (typeof node.key === 'number') {
    return <span className="json-index">{node.key}: </span>;
  }
  return (
    <>
      <span className="json-key">&quot;{node.key}&quot;</span>
      <span className="json-punct">: </span>
    </>
  );
}

/** 行末のコピー操作（パスコピー + プリミティブの値コピー）。 */
export function RowActions({ node }: { node: TreeNode }) {
  return (
    <span className="json-row-actions">
      <CopyButton compact text={node.path} ariaLabel={`パスをコピー (${node.path})`} />
      {node.raw !== undefined && (
        <CopyButton compact text={node.raw} ariaLabel={`値をコピー (${node.path})`} />
      )}
    </span>
  );
}
