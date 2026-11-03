import { describe, expect, it } from 'vitest';
import { inspectMcpConfig } from '../index';

const input = (server: unknown) => JSON.stringify({ mcpServers: { demo: server } });

describe('MCP設定の静的検査', () => {
  it('stdio と remote を表示する', () => {
    expect(inspectMcpConfig(input({ command: 'node', args: ['server.js'] })).ok).toBe(true);
    expect(inspectMcpConfig(input({ type: 'http', url: 'https://example.com/mcp' })).ok).toBe(true);
  });

  it('不正、重複、未対応の構造を拒否する', () => {
    for (const value of [
      '{',
      '{"mcpServers":{},"mcpServers":{}}',
      input({ command: 'node', extra: 1 }),
      input({ url: 'https://example.com' }),
      input({ type: 'http', url: 'javascript:alert(1)' }),
    ]) {
      expect(inspectMcpConfig(value).ok).toBe(false);
    }
  });

  it('上限超過を拒否する', () => {
    expect(inspectMcpConfig(' '.repeat(256 * 1024 + 1)).ok).toBe(false);
    expect(inspectMcpConfig(input({ command: 'node', args: Array(129).fill('a') })).ok).toBe(false);
  });

  it('shell 実行を検出し普通の node は検出しない', () => {
    const positive = inspectMcpConfig(input({ command: 'bash', args: ['-c', 'echo ok'] }));
    const negative = inspectMcpConfig(input({ command: 'node', args: ['server.js'] }));
    expect(positive.ok).toBe(true);
    expect(negative.ok).toBe(true);
    expect(positive.ok && positive.findings.some((f) => f.ruleId === 'shell-execution')).toBe(true);
    expect(negative.ok && negative.findings.some((f) => f.ruleId === 'shell-execution')).toBe(
      false
    );
  });

  it('機密値を結果全体から隠す', () => {
    const fake = 'DUMMY_NOT_A_SECRET';
    const result = inspectMcpConfig(
      JSON.stringify({
        mcpServers: { [fake]: { command: fake, args: ['--token', fake], env: { TOKEN: fake } } },
      })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fake);
  });

  it('URL の認証・パス・クエリ値を表示しない', () => {
    const result = inspectMcpConfig(
      input({
        type: 'http',
        url: 'http://dummy:dummy@example.com/private?token=DUMMY_NOT_A_SECRET',
      })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('DUMMY_NOT_A_SECRET');
    expect(JSON.stringify(result)).not.toContain('/private');
    expect(result.ok && result.findings.some((f) => f.ruleId === 'url-credentials')).toBe(true);
  });
});

describe('静的ルールの対照', () => {
  const has = (server: unknown, id: string) => {
    const result = inspectMcpConfig(input(server));
    expect(result.ok).toBe(true);
    return result.ok && result.findings.some((f) => f.ruleId === id);
  };
  it('未固定パッケージを検出し、固定版は検出しない', () => {
    expect(has({ command: 'npx', args: ['pkg@latest'] }, 'package-version-review')).toBe(true);
    expect(has({ command: 'npx', args: ['pkg@1.2.3'] }, 'package-version-review')).toBe(false);
  });
  it('HTTP を検出し HTTPS を検出しない', () => {
    expect(has({ type: 'http', url: 'http://example.com' }, 'remote-http')).toBe(true);
    expect(has({ type: 'http', url: 'https://example.com' }, 'remote-http')).toBe(false);
  });
  it('認証情報を含む URL を検出する', () => {
    expect(has({ type: 'http', url: 'https://dummy:dummy@example.com' }, 'url-credentials')).toBe(
      true
    );
    expect(has({ type: 'http', url: 'https://example.com' }, 'url-credentials')).toBe(false);
  });
  it('認証名の固定値を検出し普通の変数は検出しない', () => {
    expect(has({ command: 'node', env: { TOKEN: 'DUMMY' } }, 'inline-sensitive-value')).toBe(true);
    expect(has({ command: 'node', env: { MODE: 'test' } }, 'inline-sensitive-value')).toBe(false);
  });
  it('変数参照を検出し通常の文字列は検出しない', () => {
    expect(has({ command: 'node', env: { TOKEN: '${MY_TOKEN}' } }, 'unresolved-reference')).toBe(
      true
    );
    expect(has({ command: 'node' }, 'unresolved-reference')).toBe(false);
  });
  it('default値の他のフィールドへの再出現を隠す', () => {
    const fake = 'DUMMY_DEFAULT_NOT_SECRET';
    const result = inspectMcpConfig(
      input({ command: 'node', args: [fake], env: { TOKEN: '${TOKEN:-' + fake + '}' } })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fake);
  });
  it('URL認証値の他のフィールドへの再出現を隠す', () => {
    const fake = 'DUMMY_URL_NOT_SECRET';
    const result = inspectMcpConfig(
      JSON.stringify({
        mcpServers: {
          a: { type: 'http', url: 'https://' + fake + '@example.com' },
          b: { command: 'node', args: [fake] },
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fake);
  });
});

describe('未解決の式と固定値', () => {
  it('未対応の式を表示せず未解決として示す', () => {
    const result = inspectMcpConfig(input({ command: 'node', args: ['${DUMMY:unsafe}'] }));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('DUMMY:unsafe');
    expect(result.ok && result.findings.some((f) => f.ruleId === 'unresolved-reference')).toBe(
      true
    );
  });
  it('参照と混在する固定値が他の引数に再出現しても隠す', () => {
    const fake = 'DUMMY_LITERAL_NOT_SECRET';
    const result = inspectMcpConfig(
      input({ command: 'node', args: [fake], env: { TOKEN: fake + '${TOKEN}' } })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fake);
  });
  it('オプション値をパッケージ名として固定版と誤認しない', () => {
    const result = inspectMcpConfig(
      input({ command: 'npx', args: ['--registry', 'pkg@1.2.3', 'other@latest'] })
    );
    expect(result.ok && result.findings.some((f) => f.ruleId === 'package-version-review')).toBe(
      true
    );
  });
});

describe('安全な引数表示', () => {
  it('参照を含む機密引数はすべて隠す', () => {
    const result = inspectMcpConfig(
      input({ command: 'node', args: ['--token', 'prefix${VALUE:-DUMMY}suffix'] })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('prefix');
    expect(JSON.stringify(result)).not.toContain('suffix');
  });
  it('閉じていない URL 式を拒否する', () => {
    expect(inspectMcpConfig(input({ type: 'http', url: 'not-an-url${' })).ok).toBe(false);
  });
  it('uvx の固定版を認識する', () => {
    const result = inspectMcpConfig(input({ command: 'uvx', args: ['pkg==1.2.3'] }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.ruleId === 'package-version-review')).toBe(
      false
    );
  });
});

describe('レビュー指摘の対照', () => {
  it('変数と混在した機密設定値を検出する', () => {
    const result = inspectMcpConfig(input({ command: 'node', env: { TOKEN: 'DUMMY${VALUE}' } }));
    expect(result.ok && result.findings.some((f) => f.ruleId === 'inline-sensitive-value')).toBe(
      true
    );
  });
  it('閉じていない変数式を未解決として扱う', () => {
    const result = inspectMcpConfig(input({ command: 'node', args: ['${VALUE:-DUMMY'] }));
    expect(result.ok && result.findings.some((f) => f.ruleId === 'unresolved-reference')).toBe(
      true
    );
  });
  it('根拠は実際のサーバ名の位置を示す', () => {
    const result = inspectMcpConfig(input({ command: 'bash', args: ['-c', 'echo ok'] }));
    expect(result.ok && result.findings.some((f) => f.pointer === '/mcpServers/demo/args')).toBe(
      true
    );
  });
  it('空白はtoken上限に数えない', () => {
    expect(inspectMcpConfig(' \n'.repeat(16400) + input({ command: 'node' })).ok).toBe(true);
  });
});

describe('不正入力と伏せ字の境界', () => {
  it('設定外の重複キーやコメント・末尾カンマを拒否する', () => {
    for (const value of [
      '{"mcpServers":{"x":{"command":"node","command":"bash"}}}',
      '{/*x*/"mcpServers":{}}',
      '{"mcpServers":{"x":{"command":"node",}}}',
    ])
      expect(inspectMcpConfig(value).ok).toBe(false);
  });
  it('入力バイト数の上限は受け付け、その次を拒否する', () => {
    const valid = input({ command: 'node' });
    const padding = ' '.repeat(256 * 1024 - valid.length);
    expect(inspectMcpConfig(padding + valid).ok).toBe(true);
    expect(inspectMcpConfig(' ' + padding + valid).ok).toBe(false);
  });
  it('URL形式の引数にある認証情報を隠す', () => {
    const fake = 'DUMMY_PASSWORD_NOT_SECRET';
    const result = inspectMcpConfig(
      input({ command: 'node', args: ['https://dummy:' + fake + '@example.com/path'] })
    );
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fake);
  });
});

it('入れ子の変数式を未対応として拒否し値を表示しない', () => {
  const result = inspectMcpConfig(
    input({ command: 'node', args: ['${VAR:-${INNER}DUMMY_PRIVATE}'] })
  );
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain('DUMMY_PRIVATE');
});

it('多数の環境変数を上限内で処理する', () => {
  const servers: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    const env: Record<string, string> = {};
    for (let j = 0; j < 100; j++) env[`MODE${j}`] = `value-${i}-${j}`;
    servers[`server${i}`] = { command: 'node', env };
  }
  const start = performance.now();
  const result = inspectMcpConfig(JSON.stringify({ mcpServers: servers }));
  console.info('5000環境変数の処理時間(ms):', Math.round(performance.now() - start));
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.servers).toHaveLength(50);
});

it('空の機密引数が通常の値を破壊しない', () => {
  const result = inspectMcpConfig(input({ command: 'node', args: ['--token='] }));
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.servers[0].command).toBe('node');
});

describe('件数と文字列の上限', () => {
  it('args 128件を受け付け129件を拒否する', () => {
    expect(inspectMcpConfig(input({ command: 'node', args: Array(128).fill('x') })).ok).toBe(true);
    expect(inspectMcpConfig(input({ command: 'node', args: Array(129).fill('x') })).ok).toBe(false);
  });
  it('環境変数100件を受け付け101件を拒否する', () => {
    const env = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`KEY${i}`, 'x']));
    expect(inspectMcpConfig(input({ command: 'node', env })).ok).toBe(true);
    expect(inspectMcpConfig(input({ command: 'node', env: { ...env, MORE: 'x' } })).ok).toBe(false);
  });
  it('サーバ100件を受け付け101件を拒否する', () => {
    const servers = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`server${i}`, { command: 'node' }])
    );
    expect(inspectMcpConfig(JSON.stringify({ mcpServers: servers })).ok).toBe(true);
    expect(
      inspectMcpConfig(JSON.stringify({ mcpServers: { ...servers, extra: { command: 'node' } } }))
        .ok
    ).toBe(false);
  });
  it('文字列8192文字を受け付け8193文字を拒否する', () => {
    expect(inspectMcpConfig(input({ command: 'node', args: ['a'.repeat(8192)] })).ok).toBe(true);
    expect(inspectMcpConfig(input({ command: 'node', args: ['a'.repeat(8193)] })).ok).toBe(false);
  });
});
