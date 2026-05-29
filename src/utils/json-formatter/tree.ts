import type { Node } from 'jsonc-parser';

export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/** ツリービュー用のノード。プリミティブは value（パース値）と raw（元表記）を持つ。 */
export interface TreeNode {
  /** プロパティ名 / 配列インデックス / ルートは null。 */
  key: string | number | null;
  /** ルートからのパス（例: `$.user.tags[0]`）。コピー用。 */
  path: string;
  type: JsonValueType;
  /** プリミティブのパース値。object/array では undefined。 */
  value?: string | number | boolean | null;
  /** プリミティブの元ソース表記（大きな数値の精度欠落を避けるため保持）。 */
  raw?: string;
  children?: TreeNode[];
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function appendKey(parent: string, key: string): string {
  return IDENTIFIER.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function appendIndex(parent: string, index: number): string {
  return `${parent}[${index}]`;
}

function build(node: Node, key: string | number | null, path: string, text: string): TreeNode {
  const type = node.type as JsonValueType;

  const raw = text.slice(node.offset, node.offset + node.length);

  if (type === 'object') {
    const children = (node.children ?? []).map((prop) => {
      const keyNode = prop.children?.[0];
      const valueNode = prop.children?.[1];
      const k = String(keyNode?.value ?? '');
      return build(valueNode as Node, k, appendKey(path, k), text);
    });
    return { key, path, type, raw, children };
  }

  if (type === 'array') {
    const children = (node.children ?? []).map((el, i) => build(el, i, appendIndex(path, i), text));
    return { key, path, type, raw, children };
  }

  return {
    key,
    path,
    type,
    value: node.value as string | number | boolean | null,
    raw,
  };
}

/** parseTree のルートノードから表示用ツリーを構築する。 */
export function buildTree(root: Node, text: string): TreeNode {
  return build(root, null, '$', text);
}
