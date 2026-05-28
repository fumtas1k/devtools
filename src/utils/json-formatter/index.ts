export * from './errors';
export * from './parse';
export * from './format';
export * from './tree';

import { parseJson } from './parse';
import { formatJson, minifyJson, type IndentStyle } from './format';
import { buildTree, type TreeNode } from './tree';
import { formatErrorLabel } from './errors';

export interface ProcessOptions {
  mode: 'format' | 'minify';
  indent: IndentStyle;
}

export interface ProcessResult {
  output: string;
  tree: TreeNode;
}

/**
 * 入力 JSON を検証し、整形/最小化テキストとツリーを返す。
 * 不正な場合は「3行5列: メッセージ」形式の Error を throw する
 * （useCodecWithMeta が message を error 表示に反映する）。
 */
export function processJson(text: string, opts: ProcessOptions): ProcessResult {
  const result = parseJson(text);
  if (!result.ok) {
    throw new Error(formatErrorLabel(result.error));
  }
  const output =
    opts.mode === 'minify'
      ? minifyJson(text, result.root)
      : formatJson(text, result.root, opts.indent);
  return { output, tree: buildTree(result.root, text) };
}
