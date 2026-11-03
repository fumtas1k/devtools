import { parseTree, getNodeValue, type Node, type ParseError } from 'jsonc-parser';
import { checkBounds } from './bounds';
import { record, refs } from './shared';
const stringMap = (x: unknown, key: RegExp): x is Record<string, string> =>
  record(x) &&
  Object.keys(x).length <= 100 &&
  Object.entries(x).every(([k, v]) => key.test(k) && typeof v === 'string' && v.length <= 8192);

function validTree(tree: Node): boolean {
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === 'object') {
      const seen = new Set<string>();
      for (const p of n.children ?? []) {
        const k = p.children?.[0]?.value;
        if (
          typeof k !== 'string' ||
          k.length > 128 ||
          ['__proto__', 'constructor', 'prototype'].includes(k) ||
          seen.has(k)
        )
          return false;
        seen.add(k);
      }
    }
    if (n.type === 'string' && typeof n.value === 'string' && n.value.length > 8192) return false;
    if (n.type === 'string' && typeof n.value === 'string' && /\$\{[^}]*\$\{/.test(n.value))
      return false;
    stack.push(...(n.children ?? []));
  }
  return true;
}

export function parseConfig(
  input: string
): { entries: [string, unknown][]; secrets: Set<string> } | null {
  if (!checkBounds(input)) return null;
  const errors: ParseError[] = [];
  const tree = parseTree(input, errors, { allowTrailingComma: false, disallowComments: true });
  if (!tree || errors.length || !validTree(tree)) return null;
  const root: unknown = getNodeValue(tree);
  if (!record(root) || Object.keys(root).join() !== 'mcpServers' || !record(root.mcpServers))
    return null;
  const entries = Object.entries(root.mcpServers);
  if (!entries.length || entries.length > 100) return null;
  const secrets = new Set<string>();
  for (const [name, raw] of entries) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name) || !record(raw)) return null;
    const remote = raw.type === 'http' || raw.type === 'sse';
    const allowed = remote ? ['type', 'url', 'headers'] : ['type', 'command', 'args', 'env'];
    if (Object.keys(raw).some((k) => !allowed.includes(k))) return null;
    if (remote) {
      if (
        typeof raw.url !== 'string' ||
        !raw.url ||
        (raw.headers !== undefined && !stringMap(raw.headers, /^[A-Za-z0-9-]{1,128}$/))
      )
        return null;
      if (!raw.url.includes('${')) {
        try {
          const url = new URL(raw.url);
          if (!['http:', 'https:'].includes(url.protocol)) return null;
        } catch {
          return null;
        }
      } else if (
        !/^(?:https?:\/\/|\$\{[A-Za-z_][A-Za-z0-9_]*(?::-.*?)?\})/.test(raw.url) ||
        /\$\{[^}]*$/.test(raw.url)
      )
        return null;
    } else {
      if (raw.type !== undefined && raw.type !== 'stdio') return null;
      if (
        typeof raw.command !== 'string' ||
        !raw.command ||
        (raw.args !== undefined &&
          (!Array.isArray(raw.args) ||
            raw.args.length > 128 ||
            raw.args.some((x) => typeof x !== 'string'))) ||
        (raw.env !== undefined && !stringMap(raw.env, /^[A-Za-z_][A-Za-z0-9_]{0,127}$/))
      )
        return null;
    }
    for (const map of [raw.env, raw.headers])
      if (record(map))
        for (const value of Object.values(map))
          if (typeof value === 'string' && value) {
            if (!value.includes('${')) secrets.add(value);
            else for (const part of value.split(/\$\{[^}]*\}/)) if (part) secrets.add(part);
            for (const match of value.matchAll(refs)) if (match[2]) secrets.add(match[2]);
          }
    if (typeof raw.url === 'string' && !raw.url.includes('${')) {
      const url = new URL(raw.url);
      if (url.username) secrets.add(url.username);
      if (url.password) secrets.add(url.password);
      for (const value of url.searchParams.values()) if (value) secrets.add(value);
    }
    for (const value of [raw.command, raw.url, ...(Array.isArray(raw.args) ? raw.args : [])])
      if (typeof value === 'string')
        for (const match of value.matchAll(refs)) if (match[2]) secrets.add(match[2]);
    const args = Array.isArray(raw.args) ? (raw.args as string[]) : [];
    for (let i = 0; i < args.length; i++) {
      if (/^--(?:token|api-key|password|secret|authorization)=/i.test(args[i]))
        secrets.add(args[i].slice(args[i].indexOf('=') + 1));
      else if (/^--(?:token|api-key|password|secret|authorization)$/i.test(args[i]) && args[i + 1])
        secrets.add(args[i + 1]);
    }
  }
  return { entries, secrets };
}
