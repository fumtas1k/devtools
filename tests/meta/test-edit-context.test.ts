import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// test-edit-context hook (PreToolUse) の陽性 / 陰性対照テスト。
//
// このフックはテストファイル編集を検知して test-gates 参照を additionalContext として
// 注入する「検知機構 (ガード)」。陰性対照 (非テスト編集で無出力) だけでは「検知能力ゼロでも
// green」と区別できないため、陽性対照 (テスト編集で確かに注入される) を必須で併設する。
// PR #542 レビューで .codex 側の本フックに陽性対照が無いと指摘されたのを受けて追加。
//
// あわせて、JSON parse を jq から node に置き換えたことの回帰防止も兼ねる (jq 欠落環境で
// hook が黙って no-op になる検知漏れを防ぐ)。

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runHook(script: string, payload: unknown, pathPrefix?: string): string {
  const env = pathPrefix
    ? { ...process.env, PATH: `${pathPrefix}:${process.env.PATH ?? ''}` }
    : process.env;
  return execFileSync('bash', [resolve(repoRoot, script)], {
    cwd: repoRoot,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env,
  });
}

// jq を「壊れている (= 実質欠落)」状態にする stub を PATH 先頭に差し込んで実行する。
// 旧実装は `jq ... || true` で file_path が空になり no-op (検知漏れ) になるため、
// この経路を通すと旧実装では陽性対照が fail し、node 化した新実装でのみ pass する。
function runHookWithoutJq(script: string, payload: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'test-edit-context-nojq-'));
  try {
    const stub = join(dir, 'jq');
    writeFileSync(stub, '#!/bin/sh\nexit 127\n');
    chmodSync(stub, 0o755);
    return runHook(script, payload, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const scripts = [
  { label: '.claude', path: '.claude/scripts/test-edit-context.sh' },
  { label: '.codex', path: '.codex/scripts/test-edit-context.sh' },
];

describe.each(scripts)('$label test-edit-context hook', ({ path }) => {
  it('陽性対照: テストファイル編集で additionalContext を注入する', () => {
    const out = runHook(path, {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/components/tools/__tests__/Foo.test.tsx' },
    });

    expect(out).toContain('テストファイル編集を検知');

    // 出力が valid JSON で、Hook 仕様の形になっていること。
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string');
  });

  it('陽性対照: tests/ 配下の .spec ファイルでも注入する', () => {
    const out = runHook(path, {
      tool_name: 'Write',
      tool_input: { file_path: 'tests/e2e/example.spec.ts' },
    });
    expect(out).toContain('テストファイル編集を検知');
  });

  // 陽性対照 (jq→node 化の証明): jq が壊れている / 欠落していても検知できること。
  // 旧 jq 実装にこのテストを当てると file_path が空になり no-op → fail する = 修正の意味の証明。
  it('陽性対照: jq が無くてもテストファイル編集を検知する', () => {
    const out = runHookWithoutJq(path, {
      tool_name: 'Edit',
      tool_input: { file_path: 'tests/e2e/example.spec.ts' },
    });
    expect(out).toContain('テストファイル編集を検知');
  });

  it('陰性対照: 非テストファイル編集では何も出力しない', () => {
    const out = runHook(path, {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/components/tools/Foo.tsx' },
    });
    expect(out.trim()).toBe('');
  });

  it('陰性対照: file_path が無い入力では何も出力しない', () => {
    const out = runHook(path, { tool_name: 'Edit', tool_input: {} });
    expect(out.trim()).toBe('');
  });
});

// apply_patch 経由のテスト編集は .codex フックのみが扱う (Codex 固有 tool)。
describe('.codex test-edit-context hook (apply_patch)', () => {
  const path = '.codex/scripts/test-edit-context.sh';

  it('陽性対照: apply_patch でテストファイルを編集すると注入する', () => {
    const out = runHook(path, {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Update File: tests/e2e/example.spec.ts\n*** End Patch',
      },
    });
    expect(out).toContain('テストファイル編集を検知');
  });

  it('陰性対照: apply_patch で非テストファイルなら無出力', () => {
    const out = runHook(path, {
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Update File: src/components/tools/Foo.tsx\n*** End Patch',
      },
    });
    expect(out.trim()).toBe('');
  });
});
