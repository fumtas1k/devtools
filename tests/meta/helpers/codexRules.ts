/**
 * Codex rules パーサ / プレフィックス照合ユーティリティ
 *
 * このヘルパは `.codex/rules/default.rules` の構造を JavaScript で解析し、
 * prefix_rule の `pattern` / `not_match` / `match` 整合性をメタテストで検証するために使用する。
 *
 * ⚠️  **Fidelity リスク（必読）**
 * `commandMatchesPrefix` によるプレフィックス照合は、codex の Rust loader の semantics を
 * JS で再現した「想定ミラー」であり正本ではない。
 * codex 側の照合仕様（quote 処理 / `--` の扱い / alternation の深さ等）が変わると、
 * このテストが green のまま実 loader が rules 読み込みに失敗する乖離が起こり得る。
 * 実 loader の起動確認は別途必要（追跡 issue: #548）。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** pattern の各トークン位置。文字列は exact match、配列は alternation（どれかに一致）。 */
export type PatternToken = string | string[];

/** `not_match` または `match` 整合性違反の報告単位。 */
export interface Violation {
  pattern: PatternToken[];
  command: string;
}

// ---------------------------------------------------------------------------
// パーサ
// ---------------------------------------------------------------------------

/**
 * rules ソース文字列から `prefix_rule(...)` ブロックをすべて抽出して返す。
 */
export function prefixRuleBlocks(source: string): string[] {
  return source.match(/prefix_rule\(\n[\s\S]*?\n\)/g) ?? [];
}

/**
 * ブロック内の `key = [ ... ]` 配列リテラルを抽出して返す。
 * 返り値は trailing comma を除去済みの JSON 互換文字列。
 *
 * 非貪欲 regex ではネスト配列の中間 `]` で切れるため、
 * 括弧の深さをカウントして正確に取り出す。
 * `.rules` ファイルは複数行配列の末尾要素に trailing comma を許容しているが
 * JSON.parse は許容しないため、`,` の後に空白 / 改行 / `]` が続くケースを除去する。
 */
export function extractBracket(block: string, key: string): string | null {
  const keyIdx = block.indexOf(`${key} = [`);
  if (keyIdx === -1) return null;
  const start = block.indexOf('[', keyIdx);
  let depth = 0;
  for (let i = start; i < block.length; i++) {
    const char = block[i];
    if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth === 0) {
        const raw = block.slice(start, i + 1);
        // trailing comma 除去: `,` の直後が空白・改行・`]` のパターンを削除
        return raw.replace(/,(\s*[\]])/g, '$1');
      }
    }
  }
  return null;
}

/**
 * ブロックから `pattern` を JSON パースして返す。存在しない場合は `null`。
 */
export function parsePattern(block: string): PatternToken[] | null {
  const raw = extractBracket(block, 'pattern');
  return raw ? (JSON.parse(raw) as PatternToken[]) : null;
}

/**
 * ブロックから `not_match` を JSON パースして返す。存在しない場合は `null`。
 */
export function parseNotMatch(block: string): string[] | null {
  const raw = extractBracket(block, 'not_match');
  return raw ? (JSON.parse(raw) as string[]) : null;
}

/**
 * ブロックから `match` を JSON パースして返す。存在しない場合は `null`。
 */
export function parseMatch(block: string): string[] | null {
  const raw = extractBracket(block, 'match');
  return raw ? (JSON.parse(raw) as string[]) : null;
}

// ---------------------------------------------------------------------------
// プレフィックス照合
// ---------------------------------------------------------------------------

/**
 * command を argv に分割し、pattern の各位置を先頭から順に検証する。
 * pattern[i] が配列（alternation）なら、トークンがそのいずれかに一致すれば可。
 *
 * @see Fidelity リスクについてはファイル冒頭のコメントを参照。
 */
export function commandMatchesPrefix(command: string, pattern: PatternToken[]): boolean {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens.length < pattern.length) return false;
  return pattern.every((token, index) =>
    Array.isArray(token) ? token.includes(tokens[index]) : tokens[index] === token
  );
}

// ---------------------------------------------------------------------------
// 違反検出
// ---------------------------------------------------------------------------

/**
 * `not_match` 例が自身の `pattern` プレフィックスに一致してしまう違反を返す。
 *
 * 違反が存在する場合、codex loader は rules ファイルの読み込みに失敗する。
 */
export function notMatchViolations(source: string): Violation[] {
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

/**
 * `match` 例が自身の `pattern` プレフィックスに一致しない違反を返す。
 *
 * `match` 例は rules ファイルの動作例として「一致すべき」コマンドのはず。
 * 一致しない例が存在する場合、ドキュメント的な不整合を示す。
 *
 * `match` フィールドを持たない block はスキップする。
 */
export function matchViolations(source: string): Violation[] {
  const violations: Violation[] = [];
  for (const block of prefixRuleBlocks(source)) {
    const pattern = parsePattern(block);
    const match = parseMatch(block);
    if (!pattern || !match) continue;
    for (const command of match) {
      if (!commandMatchesPrefix(command, pattern)) {
        violations.push({ pattern, command });
      }
    }
  }
  return violations;
}
