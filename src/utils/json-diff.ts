import type { Node } from 'jsonc-parser';
import { formatErrorLabel } from './json-formatter/errors';
import { parseJson } from './json-formatter/parse';

export const MAX_JSON_DIFF_INPUT = 262_144;
const MAX_DEPTH = 128;
const MAX_VISIBLE_CHANGES = 200;
const MAX_PREVIEW = 500;

export type JsonChange = {
  kind: 'added' | 'removed' | 'changed';
  path: string;
  before?: string;
  after?: string;
};

type Document = {
  root: Node;
  text: string;
  objects: WeakMap<Node, Map<string, Node>>;
};

export type JsonDiffRange = { start: number; end: number };

type CompareResult =
  | { ok: false; beforeError?: string; afterError?: string }
  | {
      ok: true;
      total: number;
      changes: JsonChange[];
      beforeRanges: JsonDiffRange[];
      afterRanges: JsonDiffRange[];
    };

function prepare(text: string): Document | string {
  if (text.length > MAX_JSON_DIFF_INPUT) {
    return '入力が長すぎます。262,144 UTF-16コード単位以下にしてください。';
  }

  try {
    const result = parseJson(text);
    if (!result.ok) return formatErrorLabel(result.error);
    const objects: Document['objects'] = new WeakMap();
    function visit(node: Node, depth: number): string | undefined {
      if (node.type !== 'object' && node.type !== 'array') return;
      if (depth >= MAX_DEPTH) return 'JSONのネストが深すぎます。128階層以下にしてください。';

      if (node.type === 'object') {
        const members = new Map<string, Node>();
        for (const property of node.children ?? []) {
          const [key, value] = property.children!;
          if (members.has(key.value)) return '同じオブジェクト内に重複するキーがあります。';
          members.set(key.value, value);
          const error = visit(value, depth + 1);
          if (error) return error;
        }
        objects.set(node, members);
      } else {
        for (const child of node.children ?? []) {
          const error = visit(child, depth + 1);
          if (error) return error;
        }
      }
    }
    const error = visit(result.root, 0);
    return error ?? { root: result.root, text, objects };
  } catch (error) {
    if (error instanceof RangeError) return 'JSONのネストが深すぎます。128階層以下にしてください。';
    throw error;
  }
}

function numberParts(raw: string) {
  const [mantissa, exponent = '0'] = raw.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const [integer, fraction = ''] = (negative ? mantissa.slice(1) : mantissa).split('.');
  const digits = integer + fraction;
  let start = 0;
  while (start < digits.length && digits[start] === '0') start++;
  let end = digits.length;
  while (end > start && digits[end - 1] === '0') end--;
  return {
    coefficient: digits.slice(start, end),
    negative,
    exponent,
    shift: digits.length - end - fraction.length,
  };
}

// IEEE 754 に変換せず、有効桁と10進指数を比較する。指数分のゼロは展開しない。
function sameNumber(a: string, b: string): boolean {
  if (a === b) return true;
  const left = numberParts(a);
  const right = numberParts(b);
  if (!left.coefficient && !right.coefficient) return true;
  return (
    left.coefficient === right.coefficient &&
    left.negative === right.negative &&
    BigInt(left.exponent) + BigInt(left.shift) === BigInt(right.exponent) + BigInt(right.shift)
  );
}

const source = (doc: Document, node: Node, length = node.length) =>
  doc.text.slice(node.offset, node.offset + length);

function preview(doc: Document, node: Node, from = 0): string {
  const start = node.offset + from;
  const nodeEnd = node.offset + node.length;
  const first = doc.text.charCodeAt(start);
  const offset = from > 0 && first >= 0xdc00 && first <= 0xdfff ? start - 1 : start;
  const end = Math.min(offset + MAX_PREVIEW, nodeEnd);
  if (end === nodeEnd) return (from > 0 ? '…' : '') + doc.text.slice(offset, end);
  const last = doc.text.charCodeAt(end - 1);
  return (
    (from > 0 ? '…' : '') +
    doc.text.slice(offset, last >= 0xd800 && last <= 0xdbff ? end - 1 : end) +
    '…'
  );
}

function displayPath(parts: string[]): string {
  let output = '';
  for (const part of parts) {
    if (output.length === MAX_PREVIEW) return output + '…';
    output += '/';
    for (const char of part) {
      const escaped = char === '~' ? '~0' : char === '/' ? '~1' : char;
      if (output.length + escaped.length > MAX_PREVIEW) return output + '…';
      output += escaped;
    }
  }
  return output;
}

export function compareJson(before: string, after: string): CompareResult {
  const left = prepare(before);
  const right = prepare(after);
  if (typeof left === 'string' || typeof right === 'string') {
    return {
      ok: false,
      beforeError: typeof left === 'string' ? left : undefined,
      afterError: typeof right === 'string' ? right : undefined,
    };
  }

  return compareDocuments(left, right);
}

function compareDocuments(left: Document, right: Document): CompareResult {
  let total = 0;
  const changes: JsonChange[] = [];
  const beforeRanges: JsonDiffRange[] = [];
  const afterRanges: JsonDiffRange[] = [];
  const parts: string[] = [];
  const range = (node: Node, wholeProperty: boolean): JsonDiffRange => {
    // 追加・削除時は値と一緒にプロパティ名も表示上の差分に含める。
    const target = wholeProperty && node.parent?.type === 'property' ? node.parent : node;
    return { start: target.offset, end: target.offset + target.length };
  };
  function emit(kind: JsonChange['kind'], a?: Node, b?: Node) {
    total++;
    if (a) beforeRanges.push(range(a, kind === 'removed'));
    if (b) afterRanges.push(range(b, kind === 'added'));
    if (changes.length >= MAX_VISIBLE_CHANGES) return;
    const path = displayPath(parts);
    let before = a && preview(left, a);
    let after = b && preview(right, b);
    if (a && b && before === after && a.length > MAX_PREVIEW && b.length > MAX_PREVIEW) {
      // 先頭の抜粋が同じなら、最初に異なる文字の少し手前から表示する。
      const limit = Math.min(a.length, b.length);
      let at = MAX_PREVIEW - 1;
      while (at < limit && left.text[a.offset + at] === right.text[b.offset + at]) at++;
      before = preview(left, a, at - 32);
      after = preview(right, b, at - 32);
    }
    changes.push({ kind, path, before, after });
  }

  function walk(a?: Node, b?: Node) {
    if (!a) return emit('added', undefined, b);
    if (!b) return emit('removed', a);
    if (a.type !== b.type) return emit('changed', a, b);

    if (a.type === 'object') {
      const old = left.objects.get(a)!;
      const next = right.objects.get(b)!;
      for (const [key, value] of old) {
        parts.push(key);
        walk(value, next.get(key));
        parts.pop();
      }
      for (const [key, value] of next) {
        if (old.has(key)) continue;
        parts.push(key);
        walk(undefined, value);
        parts.pop();
      }
    } else if (a.type === 'array') {
      const old = a.children ?? [];
      const next = b.children ?? [];
      for (let i = 0; i < Math.max(old.length, next.length); i++) {
        parts.push(String(i));
        walk(old[i], next[i]);
        parts.pop();
      }
    } else if (
      a.type === 'number' ? !sameNumber(source(left, a), source(right, b)) : a.value !== b.value
    ) {
      emit('changed', a, b);
    }
  }
  walk(left.root, right.root);
  // 後のJSONのキー順が異なる場合も、表示には各原文の順序を使う。
  const byStart = (a: JsonDiffRange, b: JsonDiffRange) => a.start - b.start;
  return {
    ok: true,
    total,
    changes,
    beforeRanges: beforeRanges.sort(byStart),
    afterRanges: afterRanges.sort(byStart),
  };
}
