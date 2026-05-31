import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Codex の loader は各 prefix_rule の `not_match` 例が、その rule 自身の `pattern`
// プレフィックスに「一致しない」ことを検証する。一致する例を書くと codex が
// `.codex/rules/default.rules` の読み込みに失敗する(過去に rm-tmp ルールで発生)。
// vitest からは codex の Rust loader を起動できないため、同じプレフィックス照合の
// semantics を再現し、設定ファイルの整合性を CI(npm run test)で守る。

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const codexRules = resolve(repoRoot, '.codex/rules/default.rules');

type PatternToken = string | string[];

function prefixRuleBlocks(source: string): string[] {
  return source.match(/prefix_rule\(\n[\s\S]*?\n\)/g) ?? [];
}

// `key = [ ... ]` の配列リテラルをネストした括弧ごと取り出す(非貪欲 regex では
// ネスト配列で途中の `]` に引っかかるため、括弧の深さを数えて取り出す)。
function extractBracket(block: string, key: string): string | null {
  const keyIdx = block.indexOf(`${key} = [`);
  if (keyIdx === -1) return null;
  const start = block.indexOf('[', keyIdx);
  let depth = 0;
  for (let i = start; i < block.length; i++) {
    const char = block[i];
    if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth === 0) return block.slice(start, i + 1);
    }
  }
  return null;
}

// pattern / not_match は JSON 互換の配列リテラル(二重引用符・ネスト配列)なので
// JSON.parse で構造化できる。
function parsePattern(block: string): PatternToken[] | null {
  const raw = extractBracket(block, 'pattern');
  return raw ? (JSON.parse(raw) as PatternToken[]) : null;
}

function parseNotMatch(block: string): string[] | null {
  const raw = extractBracket(block, 'not_match');
  return raw ? (JSON.parse(raw) as string[]) : null;
}

// codex のプレフィックス照合: command を argv に分割し、pattern の各位置を
// 先頭から順に検証する。pattern[i] が配列なら token がそのいずれかに一致すれば可。
function commandMatchesPrefix(command: string, pattern: PatternToken[]): boolean {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens.length < pattern.length) return false;
  return pattern.every((token, index) =>
    Array.isArray(token) ? token.includes(tokens[index]) : tokens[index] === token
  );
}

interface Violation {
  pattern: PatternToken[];
  command: string;
}

function notMatchViolations(source: string): Violation[] {
  const violations: Violation[] = [];
  for (const block of prefixRuleBlocks(source)) {
    const pattern = parsePattern(block);
    const notMatch = parseNotMatch(block);
    if (!pattern || !notMatch) continue;
    for (const command of notMatch) {
      if (commandMatchesPrefix(command, pattern)) {
        violations.push({ pattern, command });
      }
    }
  }
  return violations;
}

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
