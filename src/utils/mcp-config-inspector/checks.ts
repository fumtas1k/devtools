import { record, refs } from './shared';
import type { DisplayServer, Finding } from './index';
const sensitive = /(?:token|secret|password|api[_-]?key|authorization|cookie)/i;
export function inspectServers(
  entries: [string, unknown][],
  safe: (s: string) => string
): { servers: DisplayServer[]; findings: Finding[] } | null {
  const servers: DisplayServer[] = [];
  const findings: Finding[] = [];
  for (const [index, [name, rawValue]] of entries.entries()) {
    const raw = rawValue as Record<string, unknown>;
    const id = String(index + 1);
    const args = Array.isArray(raw.args) ? (raw.args as string[]) : [];
    const env = record(raw.env) ? raw.env : {};
    const headers = record(raw.headers) ? raw.headers : {};
    const references = new Set<string>();
    const collect = (s: string) => {
      for (const m of s.matchAll(refs)) references.add(safe(m[1]));
      if (
        s.includes('${') &&
        (/\$\{(?![A-Za-z_][A-Za-z0-9_]*(?::-|\}))/.test(s) || /\$\{[^}]*$/.test(s))
      )
        references.add('未対応の式');
    };
    for (const v of [
      raw.command,
      raw.url,
      ...args,
      ...Object.values(env),
      ...Object.values(headers),
    ])
      if (typeof v === 'string') collect(v);
    const add = (ruleId: string, pointer: string, reason: string, advice: string) =>
      findings.push({ ruleId, serverId: id, pointer, reason, advice });
    const base = `/mcpServers/${safe(name)}`;
    const cmd = typeof raw.command === 'string' ? raw.command : '';
    const binary =
      cmd
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.exe$/i, '')
        .toLowerCase() ?? '';
    const shell =
      /^(sh|bash|zsh|cmd|powershell|pwsh)$/.test(binary) &&
      args.some((a) => /^(?:-c|\/c|-command|-encodedcommand)$/i.test(a));
    if (shell)
      add(
        'shell-execution',
        `${base}/args`,
        'シェルの実行文字列が指定されています。',
        '配布元と実行文字列を確認してください。'
      );
    if (/^(npx|uvx)(?:\.cmd)?$/.test(binary)) {
      const pkg = args.find((a) => !a.startsWith('-'));
      const ambiguous = args.some((a) => a.startsWith('-') && !['-y', '--yes'].includes(a));
      if (
        ambiguous ||
        !pkg ||
        !(
          binary === 'uvx' ? /==\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/ : /@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/
        ).test(pkg)
      )
        add(
          'package-version-review',
          `${base}/args`,
          'パッケージの版を確認できません。',
          '配布元と固定版を確認してください。'
        );
    }
    let destination: string | undefined;
    if (typeof raw.url === 'string') {
      if (raw.url.includes('${')) destination = '接続先は未解決です';
      else {
        const url = new URL(raw.url);
        destination = safe(url.origin);
        if (url.protocol === 'http:')
          add(
            'remote-http',
            `${base}/url`,
            '暗号化されない接続先が指定されています。',
            '接続経路を確認してください。'
          );
        if (url.username || url.password)
          add(
            'url-credentials',
            `${base}/url`,
            'URL に認証情報が含まれています。',
            '認証情報の管理方法を確認してください。'
          );
      }
    }
    for (const [key, value] of [...Object.entries(env), ...Object.entries(headers)])
      if (
        sensitive.test(key) &&
        typeof value === 'string' &&
        value &&
        (!value.includes('${') ||
          /\$\{[^}]+:-[^}]+\}/.test(value) ||
          value.replace(refs, '').length > 0)
      )
        add(
          'inline-sensitive-value',
          base,
          '認証情報が直接含まれる可能性があります。',
          '認証情報の管理方法を確認してください。'
        );
    if (references.size)
      add(
        'unresolved-reference',
        base,
        '環境変数の参照は未解決です。',
        '実行環境の設定を確認してください。'
      );
    servers.push({
      id,
      name: safe(name),
      transport: String(raw.type ?? 'stdio'),
      command: cmd ? safe(cmd) : undefined,
      args: args.map((a, i) => (shell && i > 0 ? '[実行文字列を非表示]' : safe(a))),
      destination,
      envKeys: Object.keys(env).map(safe),
      headerKeys: Object.keys(headers).map(safe),
      references: [...references],
    });
  }
  if (findings.length > 1000) return null;
  return { servers, findings };
}
