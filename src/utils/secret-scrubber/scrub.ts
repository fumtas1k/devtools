/**
 * scrubText — テキスト中の機密情報を検出して一貫トークン化置換する。
 *
 * アルゴリズム:
 * 1. 有効カテゴリの全ルールでマッチ収集
 * 2. 重複解決: start 昇順 → 重なる場合は priority 高い方、同 priority なら長い方を採用
 * 3. 一貫トークン化: カテゴリごとに初出順で連番（[REDACTED:EMAIL_1]…）。同一値は同一プレースホルダ
 * 4. 後ろから順に置換（オフセット保護）
 */

import { SCRUB_RULES, emptyCounts, type ScrubCategory } from './rules';

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
  /** マスク対象の文字列（maskGroup 指定時はそのグループの値。union マージ後に再計算される） */
  value: string;
  /** マッチ全体の開始（maskGroup 指定時、意図的に残すキー名・ホスト等を含む「考慮済み領域」） */
  fullStart: number;
  /** マッチ全体の終了 */
  fullEnd: number;
  category: ScrubCategory;
  ruleId: string;
  priority: number;
}

/**
 * maskGroup ルールのマスク範囲を解決する。
 * d フラグ（match indices）が取れない環境では、マッチ全体を over-mask する
 * fail-safe に倒す（漏えい方向のフェイルを安全方向へ反転する）。#690 M-1。
 */
export function resolveMaskRange(
  m: RegExpExecArray,
  maskGroup: number
): { value: string; start: number; end: number } {
  const groupRange = m.indices?.[maskGroup];
  if (groupRange && m[maskGroup] != null) {
    return { value: m[maskGroup], start: groupRange[0], end: groupRange[1] };
  }
  return { value: m[0], start: m.index, end: m.index + m[0].length };
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
      let maskValue: string;
      let maskStart: number;
      let maskEnd: number;

      if (rule.maskGroup != null) {
        // グループのみマスク（キー名・URLホストは残す）。位置は d フラグの indices から取る。
        // indices が取れない環境では resolveMaskRange がマッチ全体に倒す（fail-safe over-mask）。
        const range = resolveMaskRange(m, rule.maskGroup);
        maskValue = range.value;
        maskStart = range.start;
        maskEnd = range.end;
      } else {
        maskValue = m[0];
        maskStart = m.index;
        maskEnd = m.index + m[0].length;
      }

      // バリデーション（validate は元のマッチ全体に対して適用）
      if (rule.validate && !rule.validate(m[0])) continue;

      rawMatches.push({
        start: maskStart,
        end: maskEnd,
        value: maskValue,
        fullStart: m.index,
        fullEnd: m.index + m[0].length,
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

  // 重なるマッチの解決方針:
  // - 負けた側（priority 低、同 priority なら短い方）が勝者の full range
  //   （maskGroup ルールが意図的に残すキー名・URL ホスト等を含む「考慮済み領域」）に
  //   完全に含まれる場合は破棄する（例: Authorization ヘッダ内 JWT、URL 認証情報の
  //   `パスワード@ホスト` 部分がメール形式に誤マッチしたケース）。
  // - 勝者の full range からはみ出す場合は範囲を union（min〜max）にマージする。
  //   負けた側を丸ごと破棄すると、勝者に覆われていない断片（例: 高エントロピー文字列の
  //   内側だけが AWS キーにマッチしたときの前後）がマスクされず漏えいするため、
  //   安全側（over-masking）に倒す。
  const resolved: RawMatch[] = [];
  for (const m of rawMatches) {
    const last = resolved[resolved.length - 1];
    if (last && m.start < last.end) {
      const mWins =
        m.priority > last.priority ||
        (m.priority === last.priority && m.end - m.start > last.end - last.start);
      const winner = mWins ? m : last;
      const loser = mWins ? last : m;

      if (loser.start >= winner.fullStart && loser.end <= winner.fullEnd) {
        // 負けた側は勝者の考慮済み領域内 → 破棄（勝者をそのまま採用）
        if (mWins) {
          resolved[resolved.length - 1] = { ...m };
        }
      } else {
        // はみ出しあり → union マージ（メタデータは勝者を採用）
        last.category = winner.category;
        last.ruleId = winner.ruleId;
        last.priority = winner.priority;
        last.start = Math.min(last.start, m.start);
        last.end = Math.max(last.end, m.end);
        last.fullStart = Math.min(last.fullStart, m.fullStart);
        last.fullEnd = Math.max(last.fullEnd, m.fullEnd);
      }
    } else {
      // rawMatches の要素を直接 mutate しないようコピーを積む
      resolved.push({ ...m });
    }
  }

  // 一貫トークン化のキーは union マージ後の範囲で再計算する
  // （同一の見た目の文字列には同一プレースホルダを割り当てるため）
  for (const m of resolved) {
    m.value = input.slice(m.start, m.end);
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
  const counts = emptyCounts();
  for (const f of findings) {
    counts[f.category]++;
  }

  return { output, findings, counts };
}
