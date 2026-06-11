/**
 * Worker オフロード判断のための計測ベンチ
 * vitest の include glob (*.test.{ts,tsx}) に含まれないため npm run test には乗らない。
 * 実行: npx vitest bench src/utils/json-formatter/__tests__/offload.bench.ts
 *
 * 計測項目:
 *   - CPU 時間: 各処理の実行時間（ウォームアップ後 10 回の中央値・p90）
 *   - serialize_in: Worker へ渡す入力の structuredClone 時間
 *   - serialize_out: Worker から返る出力の structuredClone 時間
 *   - 正味便益: CPU - (serialize_in + serialize_out)
 */

import { bench, describe } from 'vitest';
import { parseJson } from '../parse';
import { formatJson, minifyJson } from '../format';
import { buildTree } from '../tree';
import { maskValue, type MaskOptions } from '../mask';
import { runQuery } from '../query';
import { generateTypeScript } from '../type-gen';
import { getNodeValue } from 'jsonc-parser';
import { makeWideArray, makeDeepNest, makeMaskHeavy, makeQueryTarget } from './fixtures';

// ──────────────────────────────────────────────
// フィクスチャ構築
// ──────────────────────────────────────────────

// 幅広配列（≈500KB / ≈1MB / ≈5MB）
// N=5000 → 整形済み約 560KB 程度
const WIDE_5000 = JSON.stringify(makeWideArray(5000), null, 2);
const WIDE_10000 = JSON.stringify(makeWideArray(10000), null, 2);
const WIDE_50000 = JSON.stringify(makeWideArray(50000), null, 2);

// マスク重い（≈500KB / ≈1MB）
const MASK_3000 = JSON.stringify(makeMaskHeavy(3000), null, 2);
const MASK_6000 = JSON.stringify(makeMaskHeavy(6000), null, 2);

// 深いネスト（buildTree / type-gen 圧迫用）
const DEEP_200 = JSON.stringify(makeDeepNest(200), null, 2);

// クエリ対象
const QUERY_2000 = JSON.stringify(makeQueryTarget(2000), null, 2);
const QUERY_5000 = JSON.stringify(makeQueryTarget(5000), null, 2);

// ──────────────────────────────────────────────
// 計測ユーティリティ
// ──────────────────────────────────────────────

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function p90(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.9)];
}

/**
 * 関数を K 回計測し { med, p90 } を返す（ウォームアップ 3 回付き）
 */
function measure(fn: () => void, k = 10): { med: number; p90: number } {
  // ウォームアップ
  for (let i = 0; i < 3; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < k; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return { med: median(times), p90: p90(times) };
}

// ──────────────────────────────────────────────
// レポート出力
// ──────────────────────────────────────────────

interface Row {
  処理: string;
  サイズ: string;
  CPU_med_ms: number;
  CPU_p90_ms: number;
  clone_in_ms: number;
  clone_out_ms: number;
  正味便益_ms: number;
  go_no_go: string;
}

const rows: Row[] = [];

function addRow(
  処理: string,
  サイズ: string,
  cpu: { med: number; p90: number },
  clone_in: number,
  clone_out: number
): void {
  const 正味便益_ms = cpu.med - (clone_in + clone_out);
  const go_no_go =
    cpu.med > 50 && 正味便益_ms > 0
      ? `go（CPU ${cpu.med.toFixed(1)}ms > 50ms、便益 ${正味便益_ms.toFixed(1)}ms）`
      : `no-go（CPU ${cpu.med.toFixed(1)}ms、便益 ${正味便益_ms.toFixed(1)}ms）`;
  rows.push({
    処理,
    サイズ,
    CPU_med_ms: Math.round(cpu.med * 10) / 10,
    CPU_p90_ms: Math.round(cpu.p90 * 10) / 10,
    clone_in_ms: Math.round(clone_in * 10) / 10,
    clone_out_ms: Math.round(clone_out * 10) / 10,
    正味便益_ms: Math.round(正味便益_ms * 10) / 10,
    go_no_go,
  });
}

// ──────────────────────────────────────────────
// 計測スペック定義
// ──────────────────────────────────────────────
//
// 各処理を「parse 等の前処理を除いた単独 CPU 時間」で計測し、Worker へ渡る
// 入力（cloneIn）と返る出力（cloneOut）の structuredClone コストを別途計測する。
// root / value は事前計算し、op() には当該処理のみを含める（レポートと同条件）。

const allEnabled: MaskOptions = {
  enabled: { SECRET: true, EMAIL: true, JWT: true, IP: true, CREDIT_CARD: true, PHONE_JP: true },
};

const QUERY_EXPR = 'users[?active].profile.city';

interface Spec {
  処理: string;
  サイズ: string;
  /** CPU 計測対象（前処理を含めない当該処理のみ） */
  op: () => unknown;
  /** Worker へ渡る入力（事前計算済みオブジェクト） */
  cloneIn: unknown;
  /** Worker から返る出力（事前計算済みオブジェクト） */
  cloneOut: unknown;
}

/** parse 済み root を取り出す（失敗時は例外でベンチを止める） */
function rootOf(text: string) {
  const r = parseJson(text);
  if (!r.ok) throw new Error('fixture parse failed');
  return r.root;
}

function makeSpecs(): Spec[] {
  const specs: Spec[] = [];

  // ── parseJson: in=text(string) / out=Node AST ──
  for (const [サイズ, text] of [
    ['~1.4MB (n=5,000)', WIDE_5000],
    ['~2.9MB (n=10,000)', WIDE_10000],
    ['~14.5MB (n=50,000)', WIDE_50000],
  ] as const) {
    specs.push({
      処理: 'parseJson',
      サイズ,
      op: () => parseJson(text),
      cloneIn: text,
      cloneOut: rootOf(text),
    });
  }

  // ── formatJson: in=text / out=string（root は事前計算） ──
  for (const [サイズ, text] of [
    ['~1.4MB (n=5,000)', WIDE_5000],
    ['~14.5MB (n=50,000)', WIDE_50000],
  ] as const) {
    const root = rootOf(text);
    specs.push({
      処理: 'formatJson',
      サイズ,
      op: () => formatJson(text, root, '2'),
      cloneIn: text,
      cloneOut: formatJson(text, root, '2'),
    });
  }

  // ── minifyJson: in=text / out=string ──
  {
    const text = WIDE_50000;
    const root = rootOf(text);
    specs.push({
      処理: 'minifyJson',
      サイズ: '~14.5MB (n=50,000)',
      op: () => minifyJson(text, root),
      cloneIn: text,
      cloneOut: minifyJson(text, root),
    });
  }

  // ── buildTree: in=text / out=TreeNode ──
  for (const [サイズ, text] of [
    ['~1.4MB (n=5,000)', WIDE_5000],
    ['~14.5MB (n=50,000)', WIDE_50000],
    ['~123KB (d=200)', DEEP_200],
  ] as const) {
    const root = rootOf(text);
    specs.push({
      処理: 'buildTree',
      サイズ,
      op: () => buildTree(root, text),
      cloneIn: text,
      cloneOut: buildTree(root, text),
    });
  }

  // ── maskValue: in=JS value / out=MaskResult ──
  for (const [サイズ, text] of [
    ['~1.0MB (n=3,000)', MASK_3000],
    ['~2.0MB (n=6,000)', MASK_6000],
  ] as const) {
    const value = getNodeValue(rootOf(text));
    specs.push({
      処理: 'maskValue',
      サイズ,
      op: () => maskValue(value, allEnabled),
      cloneIn: value,
      cloneOut: maskValue(value, allEnabled),
    });
  }

  // ── runQuery: in=JS value / out=QueryResult ──
  for (const [サイズ, text] of [
    ['~1.3MB (n=2,000)', QUERY_2000],
    ['~3.2MB (n=5,000)', QUERY_5000],
  ] as const) {
    const value = getNodeValue(rootOf(text));
    specs.push({
      処理: 'runQuery',
      サイズ,
      op: () => runQuery(value, QUERY_EXPR),
      cloneIn: value,
      cloneOut: runQuery(value, QUERY_EXPR),
    });
  }

  // ── generateTypeScript: in=JS value / out=string ──
  for (const [サイズ, text] of [
    ['~1.4MB (n=5,000)', WIDE_5000],
    ['~14.5MB (n=50,000)', WIDE_50000],
  ] as const) {
    const value = getNodeValue(rootOf(text));
    specs.push({
      処理: 'generateTypeScript',
      サイズ,
      op: () => generateTypeScript(value),
      cloneIn: value,
      cloneOut: generateTypeScript(value),
    });
  }

  return specs;
}

// ──────────────────────────────────────────────
// ベンチ本体（単一 bench ブロックで全処理を計測しレポート表を再現）
// ──────────────────────────────────────────────
//
// vitest bench は反復実行を前提とするが、本計測は自前の measure() で行い結果を
// console.table へ出力する。重い計測を 1 回だけ走らせるため warmup/iterations を 1 に固定。

describe('json-formatter Worker オフロード判断ベンチ', () => {
  // vitest bench は iterations 指定に関わらずコールバックを複数回呼ぶため、
  // 重い計測は最初の 1 回だけ実行する（rows の重複蓄積と多重実行を防ぐ）。
  let measured = false;
  bench(
    'CPU + clone + 正味便益（レポート表を再現）',
    () => {
      if (measured) return;
      measured = true;

      // フィクスチャサイズ
      const fixtures: [string, string][] = [
        ['WIDE_5000', WIDE_5000],
        ['WIDE_10000', WIDE_10000],
        ['WIDE_50000', WIDE_50000],
        ['MASK_3000', MASK_3000],
        ['MASK_6000', MASK_6000],
        ['DEEP_200', DEEP_200],
        ['QUERY_2000', QUERY_2000],
        ['QUERY_5000', QUERY_5000],
      ];
      for (const [label, text] of fixtures) {
        const kb = (new TextEncoder().encode(text).length / 1024).toFixed(1);
        console.log(`  fixture ${label}: ${kb} KB`);
      }

      for (const spec of makeSpecs()) {
        const cpu = measure(spec.op);
        const cloneIn = measure(() => structuredClone(spec.cloneIn)).med;
        const cloneOut = measure(() => structuredClone(spec.cloneOut)).med;
        addRow(spec.処理, spec.サイズ, cpu, cloneIn, cloneOut);
      }
      console.table(rows);
    },
    { iterations: 1, warmupIterations: 0, warmupTime: 0, time: 0 }
  );
});
