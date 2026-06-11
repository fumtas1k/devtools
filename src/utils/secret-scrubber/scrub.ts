/**
 * scrubText — テキスト中の機密情報を検出して一貫トークン化置換する。
 *
 * アルゴリズム:
 * 1. 有効カテゴリの全ルールでマッチ収集
 * 2. 重複解決: start 昇順 → 重なる場合は priority 高い方、同 priority なら長い方を採用
 * 3. 一貫トークン化: カテゴリごとに初出順で連番（[REDACTED:EMAIL_1]…）。同一値は同一プレースホルダ
 * 4. 後ろから順に置換（オフセット保護）
 */

import { SCRUB_RULES, type ScrubCategory } from './rules';

export interface ScrubFinding {
  category: ScrubCategory;
  ruleId: string;
  /** 置換後のプレースホルダ（例: [REDACTED:API_KEY_1]） */
  placeholder: string;
  start: number;
  end: number;
}

export interface ScrubResult {
  output: string;
  findings: ScrubFinding[];
  /** カテゴリ別の総検出件数（チップのバッジ用） */
  counts: Record<ScrubCategory, number>;
}

/** 内部マッチ構造 */
interface RawMatch {
  start: number;
  end: number;
  /** マスク対象の文字列（maskGroup 指定時はそのグループの値） */
  value: string;
  /** maskGroup 指定時、元のマッチ全体の start */
  fullStart: number;
  /** maskGroup 指定時、元のマッチ全体の end */
  fullEnd: number;
  category: ScrubCategory;
  ruleId: string;
  priority: number;
}

/**
 * テキストを検査して機密情報を [REDACTED:<CATEGORY>_<n>] に置換する。
 * 純関数・入力非破壊。
 */
export function scrubText(input: string, enabled: Record<ScrubCategory, boolean>): ScrubResult {
  const rawMatches: RawMatch[] = [];

  // ステップ 1: 全ルールでマッチを収集
  for (const rule of SCRUB_RULES) {
    if (!enabled[rule.category]) continue;

    // RegExp の lastIndex をリセット（g フラグの再利用対策）
    rule.pattern.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(input)) !== null) {
      const fullStart = m.index;
      const fullEnd = m.index + m[0].length;

      let maskValue: string;
      let maskStart: number;
      let maskEnd: number;

      if (rule.maskGroup != null) {
        // グループのみマスク（キー名・URLホストは残す）。
        // 位置は d フラグの indices から取る（indexOf による探索は
        // キー名と値が同一文字列のとき値側を取り違えて漏えいするため不可）
        const groupRange = m.indices?.[rule.maskGroup];
        if (!groupRange) continue;
        maskValue = m[rule.maskGroup];
        [maskStart, maskEnd] = groupRange;
      } else {
        maskValue = m[0];
        maskStart = fullStart;
        maskEnd = fullEnd;
      }

      // バリデーション（validate は元のマッチ全体に対して適用）
      if (rule.validate && !rule.validate(m[0])) continue;

      rawMatches.push({
        start: maskStart,
        end: maskEnd,
        value: maskValue,
        fullStart,
        fullEnd,
        category: rule.category,
        ruleId: rule.id,
        priority: rule.priority,
      });
    }

    // lastIndex をリセット（g フラグを持つ regexp は exec 後に lastIndex が進む）
    rule.pattern.lastIndex = 0;
  }

  // ステップ 2: 重複解決
  // start 昇順にソート、同 start なら priority 降順
  rawMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.priority - a.priority;
  });

  const resolved: RawMatch[] = [];
  for (const m of rawMatches) {
    if (resolved.length === 0) {
      resolved.push(m);
      continue;
    }
    const last = resolved[resolved.length - 1];
    if (m.start < last.end) {
      // 重複: priority 高い方を採用、同 priority なら長い方
      if (
        m.priority > last.priority ||
        (m.priority === last.priority && m.end - m.start > last.end - last.start)
      ) {
        resolved[resolved.length - 1] = m;
      }
      // それ以外は既存を維持（スキップ）
    } else {
      resolved.push(m);
    }
  }

  // ステップ 3: 一貫トークン化
  // カテゴリ × 文字列 → プレースホルダ の Map
  const tokenMap = new Map<string, string>();
  // カテゴリ別のカウンタ
  const categoryCounter: Partial<Record<ScrubCategory, number>> = {};

  const findings: ScrubFinding[] = [];

  for (const m of resolved) {
    const key = `${m.category}:${m.value}`;
    let placeholder = tokenMap.get(key);
    if (!placeholder) {
      const n = (categoryCounter[m.category] ?? 0) + 1;
      categoryCounter[m.category] = n;
      placeholder = `[REDACTED:${m.category}_${n}]`;
      tokenMap.set(key, placeholder);
    }
    findings.push({
      category: m.category,
      ruleId: m.ruleId,
      placeholder,
      start: m.start,
      end: m.end,
    });
  }

  // ステップ 4: 後ろから順に置換（オフセット保護）
  let output = input;
  for (let i = findings.length - 1; i >= 0; i--) {
    const f = findings[i];
    output = output.slice(0, f.start) + f.placeholder + output.slice(f.end);
  }

  // カテゴリ別件数集計（プレースホルダの種類でなく置換された occurrence 数）
  const counts: Record<ScrubCategory, number> = {
    API_KEY: 0,
    PRIVATE_KEY: 0,
    CREDENTIAL: 0,
    JWT: 0,
    EMAIL: 0,
    IP: 0,
    PHONE_JP: 0,
    CREDIT_CARD: 0,
    HIGH_ENTROPY: 0,
  };
  for (const f of findings) {
    counts[f.category]++;
  }

  return { output, findings, counts };
}
