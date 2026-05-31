import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Codex の loader は各 prefix_rule の `not_match` 例が、その rule 自身の `pattern`
// プレフィックスに「一致しない」ことを検証する。一致する例を書くと codex が
// `.codex/rules/default.rules` の読み込みに失敗する(過去に rm-tmp ルールで発生)。
// vitest からは codex の Rust loader を起動できないため、同じプレフィックス照合の
// semantics を JS で再現してメタテストとして CI で守る。
// プレフィックス照合の fidelity リスクについては helpers/codexRules.ts の冒頭コメントを参照。

import {
  commandMatchesPrefix,
  matchViolations,
  notMatchViolations,
  prefixRuleBlocks,
} from './helpers/codexRules.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const codexRules = resolve(repoRoot, '.codex/rules/default.rules');

describe('Codex rules not_match prefix validation', () => {
  it('陰性対照: 実ファイルの not_match 例は自身の pattern に一致しない', () => {
    const rules = readFileSync(codexRules, 'utf8');
    expect(notMatchViolations(rules)).toEqual([]);
  });

  it('陽性対照: pattern プレフィックスに一致する not_match を検知する', () => {
    // 旧 rm-tmp ルールと同形の不正例。helper への不正パス引数は prefix では
    // 表現できず、loader はこの not_match を「一致してしまう」として拒否していた。
    const broken = [
      'prefix_rule(',
      '    pattern = ["bash", ".codex/scripts/rm-tmp.sh"],',
      '    decision = "allow",',
      '    justification = "helper validates path at runtime.",',
      '    match = ["bash .codex/scripts/rm-tmp.sh /tmp/codex/pr_body.md"],',
      '    not_match = ["rm /tmp/codex/pr_body.md", "bash .codex/scripts/rm-tmp.sh /tmp/claude/comment.md"],',
      ')',
    ].join('\n');

    const violations = notMatchViolations(broken);

    expect(violations).toHaveLength(1);
    expect(violations[0].command).toBe('bash .codex/scripts/rm-tmp.sh /tmp/claude/comment.md');
  });

  it('陽性対照: alternation pattern に一致する not_match も検知する', () => {
    // pattern[i] が選択肢配列のケースでも、その選択肢に当たる not_match を捕捉する。
    const broken = [
      'prefix_rule(',
      '    pattern = ["gh", "pr", ["list", "view"]],',
      '    decision = "allow",',
      '    justification = "read-only.",',
      '    not_match = ["gh pr view <pr-number>"],',
      ')',
    ].join('\n');

    const violations = notMatchViolations(broken);

    expect(violations).toHaveLength(1);
    expect(violations[0].command).toBe('gh pr view <pr-number>');
  });
});

describe('Codex rules match prefix validation', () => {
  it('陰性対照: 実ファイルの match 例は自身の pattern に一致する', () => {
    const rules = readFileSync(codexRules, 'utf8');
    expect(matchViolations(rules)).toEqual([]);
  });

  it('陽性対照: pattern に一致しない match 例を含む fixture を渡すと違反を 1 件検知する', () => {
    // `match` 例が自身の pattern とは異なるプレフィックスを持つ不正例。
    // matchViolations が常に [] を返す実装（空回り）だとこの it は必ず fail する。
    const broken = [
      'prefix_rule(',
      '    pattern = ["npm", "run"],',
      '    decision = "allow",',
      '    justification = "example.",',
      '    match = ["npx vitest run"],',
      ')',
    ].join('\n');

    const violations = matchViolations(broken);

    expect(violations).toHaveLength(1);
    expect(violations[0].command).toBe('npx vitest run');
  });
});

describe('Codex gh pr merge policy', () => {
  function mergePolicyViolations(source: string): string[] {
    const blocks = prefixRuleBlocks(source);
    const mergeIndex = blocks.findIndex((block) =>
      block.includes('pattern = ["gh", "pr", "merge"],')
    );
    const violations: string[] = [];

    if (mergeIndex === -1) {
      violations.push('missing release-merge allow/prompt rule');
    } else if (!blocks[mergeIndex].includes('decision = "prompt"')) {
      violations.push('release-merge rule must prompt');
    }

    if (!blocks[mergeIndex]?.includes('--squash') || !blocks[mergeIndex]?.includes('--merge')) {
      violations.push('merge guidance must mention both --squash and --merge');
    }

    if (
      mergeIndex === -1 ||
      !blocks[mergeIndex].includes('develop-bound PRs') ||
      !blocks[mergeIndex].includes('release PRs to main')
    ) {
      violations.push('merge guidance must mention develop and main targets');
    }

    if (mergeIndex !== -1 && !blocks[mergeIndex].includes('decision = "prompt"')) {
      violations.push('generic merge guidance rule must prompt');
    }

    return violations;
  }

  it('陰性対照: 実ファイルは explicit merge-method guidance を満たす', () => {
    const rules = readFileSync(codexRules, 'utf8');
    expect(mergePolicyViolations(rules)).toEqual([]);
  });

  it('陽性対照: explicit method を欠く旧ポリシーを検知する', () => {
    const broken = [
      'prefix_rule(',
      '    pattern = ["gh", "pr", "merge"],',
      '    decision = "prompt",',
      '    justification = "Do not rely on the default merge method.",',
      '    match = ["gh pr merge <pr-number>"],',
      ')',
    ].join('\n');

    expect(mergePolicyViolations(broken)).toContain(
      'merge guidance must mention both --squash and --merge'
    );
    expect(mergePolicyViolations(broken)).toContain(
      'merge guidance must mention develop and main targets'
    );
  });
});

describe('commandMatchesPrefix unit tests', () => {
  it('完全一致プレフィックスを検知する', () => {
    expect(commandMatchesPrefix('git status', ['git', 'status'])).toBe(true);
  });

  it('プレフィックスより短いコマンドは不一致', () => {
    expect(commandMatchesPrefix('git', ['git', 'status'])).toBe(false);
  });

  it('alternation pattern のいずれかに一致する', () => {
    expect(commandMatchesPrefix('gh pr view', ['gh', 'pr', ['list', 'view']])).toBe(true);
  });

  it('alternation pattern のいずれにも一致しない場合は false', () => {
    expect(commandMatchesPrefix('gh pr merge', ['gh', 'pr', ['list', 'view']])).toBe(false);
  });
});
