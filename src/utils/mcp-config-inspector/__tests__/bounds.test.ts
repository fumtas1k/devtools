import { describe, expect, it } from 'vitest';
import { createScanner } from 'jsonc-parser';
import { checkBounds } from '../bounds';
import { inspectMcpConfig } from '../index';

describe('JSON構造の上限', () => {
  it('深さ16を受け付け17を拒否する（形式検証前のガード）', () => {
    expect(checkBounds('['.repeat(16) + '0' + ']'.repeat(16))).toBe(true);
    expect(checkBounds('['.repeat(17) + '0' + ']'.repeat(17))).toBe(false);
  });
  it('非空白token 32768を受け付け32769を拒否する（形式検証前のガード）', () => {
    const atLimit = '[' + Array(16382).fill('0').join(',') + ',[]]';
    const overLimit = '[' + Array(16384).fill('0').join(',') + ']';
    expect(checkBounds(atLimit)).toBe(true);
    expect(checkBounds(overLimit)).toBe(false);
  });
  it('文字列内の括弧や空白は構造に数えない', () => {
    expect(checkBounds(JSON.stringify('['.repeat(30) + ' \n'.repeat(17000)))).toBe(true);
  });
});

describe('検査結果の件数上限', () => {
  const makeConfig = (extra: boolean) => {
    const servers: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      const env = Object.fromEntries(
        Array.from({ length: 100 }, (_, n) => [`TOKEN_${n}`, 'DUMMY'])
      );
      servers[`server_${i}`] = { command: 'node', env };
    }
    if (extra) servers.extra = { command: 'node', env: { TOKEN_EXTRA: 'DUMMY' } };
    return JSON.stringify({ mcpServers: servers });
  };
  it('1000件の確認事項は返す', () => {
    const result = inspectMcpConfig(makeConfig(false));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.findings).toHaveLength(1000);
  });
  it('1001件は部分結果を返さず拒否する', () => {
    const result = inspectMcpConfig(makeConfig(true));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('findings');
  });
});

describe('対応設定で到達するtoken上限', () => {
  const env = (length: number) =>
    Object.fromEntries(Array.from({ length }, (_, i) => [`KEY_${i}`, 'x']));
  const input = (extra: boolean) => {
    const servers: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 48 }, (_, i) => [
        `server_${i}`,
        { command: 'node', args: Array(128).fill('x'), env: env(100) },
      ])
    );
    servers.server_48 = { command: 'node', args: Array(extra ? 128 : 121).fill('x'), env: env(59) };
    if (!extra) servers.server_49 = { command: 'node', args: [] };
    return JSON.stringify({ mcpServers: servers });
  };
  it('32768 token の対応設定は受け付け32769 token は拒否する', () => {
    const atLimit = input(false);
    const overLimit = input(true);
    const tokenCount = (value: string) => {
      const scanner = createScanner(value, true);
      let count = 0;
      while (scanner.scan() !== 17) count++;
      return count;
    };
    expect(tokenCount(atLimit)).toBe(32768);
    expect(tokenCount(overLimit)).toBe(32769);
    expect(new TextEncoder().encode(overLimit).length).toBeLessThan(256 * 1024);
    expect(inspectMcpConfig(atLimit).ok).toBe(true);
    expect(inspectMcpConfig(overLimit).ok).toBe(false);
  });
});
