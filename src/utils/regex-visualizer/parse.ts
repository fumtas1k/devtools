import { parse as parseRegExpTree } from 'regexp-tree';
import { getErrorMessage } from '@/utils/errors';
import { stripUnsupportedFlags } from './flags';

export interface RegexAstNode {
  /** regexp-tree のノード種別（'Char' | 'Repetition' | 'Group' | 'Disjunction' | 'Alternative' | 'CharacterClass' | 'Assertion' | 'Backreference' | 'Root' 等） */
  type: string;
  /** 日本語の表示ラベル */
  label: string;
  /** pattern 文字列基準の位置（recheck hotspot との突き合わせ用、offset-1 補正済み） */
  loc?: { start: number; end: number };
  children: RegexAstNode[];
}

interface RegExpTreeNode {
  type: string;
  loc?: { start: { offset: number }; end: { offset: number } };
  [key: string]: unknown;
}

function quantifierLabel(q: {
  kind?: string;
  from?: number;
  to?: number;
  greedy?: boolean;
}): string {
  const lazy = q.greedy === false ? '（最短一致）' : '';
  switch (q.kind) {
    case '+':
      return `1 回以上の繰り返し${lazy}`;
    case '*':
      return `0 回以上の繰り返し${lazy}`;
    case '?':
      return `0 回または 1 回${lazy}`;
    case 'Range':
      if (q.to == null) return `${q.from} 回以上の繰り返し${lazy}`;
      if (q.to === q.from) return `ちょうど ${q.from} 回${lazy}`;
      return `${q.from}〜${q.to} 回の繰り返し${lazy}`;
    default:
      return `繰り返し${lazy}`;
  }
}

function labelFor(node: Record<string, any>): string {
  switch (node.type) {
    case 'Char':
      return node.kind === 'meta' ? `メタ文字 ${node.value}` : `文字 "${node.value}"`;
    case 'CharacterClass':
      return node.negative ? '文字クラス（否定）' : '文字クラス';
    case 'ClassRange':
      return `範囲 ${node.from?.value}-${node.to?.value}`;
    case 'Alternative':
      return '連結';
    case 'Disjunction':
      return '選択肢 (|)';
    case 'Group':
      return node.capturing
        ? node.name
          ? `グループ（名前付き: ${node.name}）`
          : `キャプチャグループ #${node.number}`
        : 'グループ（非キャプチャ）';
    case 'Repetition':
      return quantifierLabel(node.quantifier ?? {});
    case 'Assertion':
      return `アサーション ${node.kind}`;
    case 'Backreference':
      return `後方参照 \\${node.reference}`;
    default:
      return node.type;
  }
}

/** regexp-tree ノードの子を一様に取り出す */
function childrenOf(node: Record<string, any>): RegExpTreeNode[] {
  if (node.type === 'Alternative') return node.expressions ?? [];
  if (node.type === 'Disjunction') return [node.left, node.right].filter(Boolean);
  if (node.type === 'Group' || node.type === 'Repetition') {
    return node.expression ? [node.expression] : [];
  }
  if (node.type === 'Assertion') {
    // 先読み/後読みの内部式は node.assertion（node.expression ではない）。単純アンカー（^ $ \b \B）は子なし。
    return node.assertion ? [node.assertion] : [];
  }
  if (node.type === 'CharacterClass') return node.expressions ?? [];
  return [];
}

function toRenderNode(node: RegExpTreeNode): RegexAstNode {
  return {
    type: node.type,
    label: labelFor(node),
    // offset-1: regexp-tree は /pattern/ リテラル基準なので先頭 '/' 分を引き pattern 基準へ
    loc: node.loc ? { start: node.loc.start.offset - 1, end: node.loc.end.offset - 1 } : undefined,
    children: childrenOf(node).map(toRenderNode),
  };
}

/**
 * railroad など他モジュールと regexp-tree parse を共有するためのヘルパー。
 * native `new RegExp` で構文・フラグを検証（不正なら throw）し、captureLocations 付き AST を返す。
 */
export function parseToRegExpTree(pattern: string, flags: string) {
  void new RegExp(pattern, flags); // 構文・フラグ検証（d フラグも含む完全フラグで）
  const re = new RegExp(pattern, stripUnsupportedFlags(flags));
  return parseRegExpTree(re, { captureLocations: true });
}

/**
 * engine の英語 SyntaxError を日本語見出し付きのエラーへ整形する。
 * 例: `Invalid regular expression: /(/: Unterminated group`
 *   → `正規表現が不正です: /(/: Unterminated group`
 * V8 系の `Invalid regular expression: ` 接頭辞は日本語見出しと重複するため除去し、
 * 不正箇所・理由を示す英語詳細は情報量があるため残す（他ツールの ErrorMessage 表示と一貫）。
 */
function toJapaneseRegexError(e: unknown): Error {
  const raw = getErrorMessage(e, '構文を確認してください');
  const detail = raw.replace(/^Invalid regular expression:\s*/i, '');
  return new Error(`正規表現が不正です: ${detail}`);
}

/**
 * pattern + flags を描画用 AST へ変換する。
 * native `new RegExp` で構文・フラグを検証（不正なら SyntaxError を投げる）し、
 * regexp-tree で位置情報付き AST を得る。ルートは body を Root ノードに包んで返す。
 * 不正時は engine の英語メッセージを日本語見出し付きへ変換して throw する（#489）。
 */
export function parseRegex(pattern: string, flags: string): RegexAstNode {
  let ast: ReturnType<typeof parseToRegExpTree>;
  try {
    ast = parseToRegExpTree(pattern, flags);
  } catch (e) {
    throw toJapaneseRegexError(e);
  }
  const body = ast.body as unknown as RegExpTreeNode;
  const rendered = toRenderNode(body);
  return {
    type: 'Root',
    label: '正規表現',
    children: rendered.type === 'Alternative' ? rendered.children : [rendered],
  };
}
