import type { Node } from 'jsonc-parser';

export type IndentStyle = '2' | '4' | 'tab';

const INDENT_UNIT: Record<IndentStyle, string> = {
  '2': '  ',
  '4': '    ',
  tab: '\t',
};

function raw(node: Node, text: string): string {
  return text.slice(node.offset, node.offset + node.length);
}

/**
 * AST ノードを直列化する。プリミティブは元ソース表記をそのまま使うため、
 * 大きな数値の精度や数値表記（1.0, 1e3）・文字列エスケープを欠落させない（lossless）。
 * unit が null のときは最小化（空白なし）。
 */
function serialize(node: Node, text: string, unit: string | null, depth: number): string {
  if (node.type === 'object' || node.type === 'array') {
    const children = node.children ?? [];
    const open = node.type === 'object' ? '{' : '[';
    const close = node.type === 'object' ? '}' : ']';
    if (children.length === 0) return open + close;

    const parts = children.map((child) => {
      if (node.type === 'object') {
        // child は property ノード: children[0]=キー(string), children[1]=値
        const keyNode = child.children?.[0] as Node;
        const valueNode = child.children?.[1] as Node;
        const keyText = raw(keyNode, text);
        const valueText = serialize(valueNode, text, unit, depth + 1);
        return unit === null ? `${keyText}:${valueText}` : `${keyText}: ${valueText}`;
      }
      return serialize(child, text, unit, depth + 1);
    });

    if (unit === null) {
      return open + parts.join(',') + close;
    }
    const pad = unit.repeat(depth + 1);
    const closePad = unit.repeat(depth);
    return `${open}\n${pad}${parts.join(`,\n${pad}`)}\n${closePad}${close}`;
  }

  return raw(node, text);
}

/** インデント整形（pretty）。 */
export function formatJson(text: string, root: Node, indent: IndentStyle): string {
  return serialize(root, text, INDENT_UNIT[indent], 0);
}

/** 空白を除去した最小化。 */
export function minifyJson(text: string, root: Node): string {
  return serialize(root, text, null, 0);
}
