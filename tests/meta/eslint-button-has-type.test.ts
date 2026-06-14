import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// プロジェクトルート（このファイルは tests/meta/ 配下）
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// src/ 配下の filePath を与えて flat config の files パターンにマッチさせる
async function lintTsx(code: string) {
  const eslint = new ESLint({ cwd: projectRoot });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(projectRoot, 'src/__eslint_positive_control__.tsx'),
  });
  return result;
}

describe('eslint react/button-has-type ガード', () => {
  it('陽性対照: type 無し button を検出して error にする', async () => {
    const result = await lintTsx(
      'export const A = () => <button>x</button>;\n',
    );
    const hits = result.messages.filter(
      (m) => m.ruleId === 'react/button-has-type',
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it('陰性対照: type 付き button は検出しない', async () => {
    const result = await lintTsx(
      'export const A = () => <button type="button">x</button>;\n',
    );
    const hits = result.messages.filter(
      (m) => m.ruleId === 'react/button-has-type',
    );
    expect(hits.length).toBe(0);
  });
});
