export * from './errors';
export * from './parse';
export * from './format';
export * from './tree';
export * from './query';

import { parseJson } from './parse';
import { formatJson, minifyJson, type IndentStyle } from './format';
import { buildTree, type TreeNode } from './tree';
import { formatErrorLabel } from './errors';
import { getNodeValue } from 'jsonc-parser';

export interface ProcessOptions {
  mode: 'format' | 'minify';
  indent: IndentStyle;
}

export interface ProcessResult {
  output: string;
  tree: TreeNode;
  value: unknown;
}

/**
 * 入力 JSON を検証し、整形/最小化テキストとツリーを返す。
 * 不正な場合は「3行5列: メッセージ」形式の Error を throw する
 * （useCodecWithMeta が message を error 表示に反映する）。
 */
export function processJson(text: string, opts: ProcessOptions): ProcessResult {
  try {
    const result = parseJson(text);
    if (!result.ok) {
      throw new Error(formatErrorLabel(result.error));
    }
    const output =
      opts.mode === 'minify'
        ? minifyJson(text, result.root)
        : formatJson(text, result.root, opts.indent);
    return { output, tree: buildTree(result.root, text), value: getNodeValue(result.root) };
  } catch (e) {
    // 整形・ツリー構築は再帰実装のため、極端に深いネストで RangeError
    // （Maximum call stack size exceeded）になる。生の英語メッセージを出さず
    // 日本語の説明に変換する。構文エラー等の通常 Error はそのまま再 throw。
    if (e instanceof RangeError) {
      throw new Error('JSON のネストが深すぎて処理できません（再帰の上限を超過しました）');
    }
    throw e;
  }
}
