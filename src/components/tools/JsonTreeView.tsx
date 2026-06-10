import { useState } from 'react';
import { KeyPart, RowActions, VALUE_CLASS } from '@/components/tools/JsonTreeRowParts';
import type { TreeNode } from '@/utils/json-formatter';

function TreeRow({ node, defaultOpen }: { node: TreeNode; defaultOpen: boolean }) {
  const isContainer = node.type === 'object' || node.type === 'array';
  const [open, setOpen] = useState(defaultOpen);

  if (!isContainer) {
    return (
      <li className="json-row">
        <span className="json-line">
          <span className="json-toggle-spacer" aria-hidden="true" />
          <KeyPart node={node} />
          <span className={VALUE_CLASS[node.type] ?? ''}>{node.raw}</span>
          <RowActions node={node} />
        </span>
      </li>
    );
  }

  const openBracket = node.type === 'array' ? '[' : '{';
  const closeBracket = node.type === 'array' ? ']' : '}';
  const count = node.children?.length ?? 0;

  return (
    <li className="json-row">
      <span className="json-line">
        <button
          type="button"
          className="json-toggle"
          aria-expanded={open}
          aria-label={open ? '折りたたむ' : '展開する'}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <KeyPart node={node} />
        <span className="json-punct">{openBracket}</span>
        {!open && (
          <>
            <span className="json-collapsed">…</span>
            <span className="json-punct">{closeBracket}</span>
            <span className="json-count">{count} 項目</span>
          </>
        )}
        <RowActions node={node} />
      </span>
      {open && (
        <>
          <ul className="json-tree">
            {node.children?.map((child, i) => (
              <TreeRow key={i} node={child} defaultOpen={defaultOpen} />
            ))}
          </ul>
          <span className="json-line json-close-line">
            <span className="json-toggle-spacer" aria-hidden="true" />
            <span className="json-punct">{closeBracket}</span>
          </span>
        </>
      )}
    </li>
  );
}

interface Props {
  node: TreeNode;
  defaultOpen: boolean;
}

/**
 * JSON を折りたたみ可能なツリーで表示する。
 * 表示専用のため role="tree"/"treeitem" は付けず、入れ子リストの意味論に留める
 * （RegexAstTree と同方針。トグルは button + aria-expanded で操作可能）。
 */
export function JsonTreeView({ node, defaultOpen }: Props) {
  return (
    <div className="json-tree-root caption font-mono" role="group" aria-label="JSON ツリー">
      <ul className="json-tree json-tree--root">
        <TreeRow node={node} defaultOpen={defaultOpen} />
      </ul>
    </div>
  );
}
