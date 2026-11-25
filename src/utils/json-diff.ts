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

type CompareResult =
  | { ok: false; beforeError?: string; afterError?: string }
  | { ok: true; total: number; changes: JsonChange[] };

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

function preview(doc: Document, node: Node): string {
  if (node.length <= MAX_PREVIEW) return source(doc, node);
  const prefix = source(doc, node, MAX_PREVIEW);
  const last = prefix.charCodeAt(prefix.length - 1);
  return (last >= 0xd800 && last <= 0xdbff ? prefix.slice(0, -1) : prefix) + '…';
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
  const parts: string[] = [];
  function emit(kind: JsonChange['kind'], a?: Node, b?: Node) {
    total++;
    if (changes.length >= MAX_VISIBLE_CHANGES) return;
    const path = displayPath(parts);
    changes.push({ kind, path, before: a && preview(left, a), after: b && preview(right, b) });
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
  return { ok: true, total, changes };
}
