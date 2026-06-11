/**
 * getNodeValue 遅延評価判断のための計測ベンチ（issue #512 残スコープ③・measure-first）
 * vitest の include glob (*.test.{ts,tsx}) に含まれないため npm run test には乗らない。
 * 実行: npx vitest bench src/utils/json-formatter/__tests__/getnodevalue.bench.ts
 *
 * 背景:
 *   processJson は入力が変わるたび `value: getNodeValue(root)` を eager 評価して meta.value に格納するが、
 *   meta.value を読むのは query 入力時 / mask ビュー / type ビューのみ。
 *   デフォルトの text ビューと tree ビューでは meta.value は一切使われない
 *   （text は整形文字列、tree は buildTree を使う）。
 *   → text/tree ビューでは getNodeValue の CPU は「毎キーストローク捨てている無駄仕事」。
 *
 * 遅延化（消費する view のときだけ評価）の便益 = この getNodeValue CPU 時間。
 *   Worker オフロードと違い clone 往復コストはゼロ。実装コストも thunk / memo 化のみ。
 *
 * 計測:
 *   - getNodeValue 単独 CPU（ホットパスで回避可能な無駄）
 *   - 必須仕事（parse + format）の CPU
 *   - 無駄率 = getNodeValue / (parse + format)
 *   各処理を前処理を除いた当該処理のみで計測する（root は事前計算）。
 */

import { bench, describe } from 'vitest';
import { getNodeValue } from 'jsonc-parser';
import { parseJson } from '../parse';
import { formatJson } from '../format';
import { makeWideArray } from './fixtures';

// 幅広配列（整形済み実測: n=5,000→1,462KB / n=10,000→2,936KB / n=50,000→14,880KB）
const WIDE_5000 = JSON.stringify(makeWideArray(5000), null, 2);
const WIDE_10000 = JSON.stringify(makeWideArray(10000), null, 2);
const WIDE_50000 = JSON.stringify(makeWideArray(50000), null, 2);

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function p90(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.9)];
}

/** 関数を K 回計測し { med, p90 } を返す（ウォームアップ 3 回付き）。 */
function measure(fn: () => void, k = 10): { med: number; p90: number } {
  for (let i = 0; i < 3; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < k; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return { med: median(times), p90: p90(times) };
}

/** parse 済み root を取り出す（失敗時は例外でベンチを止める）。 */
function rootOf(text: string) {
  const r = parseJson(text);
  if (!r.ok) throw new Error('fixture parse failed');
  return r.root;
}

interface Row {
  サイズ: string;
  parse_ms: number;
  format_ms: number;
  getNodeValue_ms: number;
  getNodeValue_p90_ms: number;
  必須計_ms: number;
  無駄率: string;
  long_task: string;
}

const rows: Row[] = [];

describe('json-formatter getNodeValue 遅延評価判断ベンチ', () => {
  // vitest bench は iterations 指定に関わらずコールバックを複数回呼ぶため、
  // 重い計測は最初の 1 回だけ実行する（rows の重複蓄積と多重実行を防ぐ）。
  let measured = false;
  bench(
    'getNodeValue CPU vs 必須仕事（parse+format）',
    () => {
      if (measured) return;
      measured = true;

      const cases: [string, string][] = [
        ['~1.4MB (n=5,000)', WIDE_5000],
        ['~2.9MB (n=10,000)', WIDE_10000],
        ['~14.5MB (n=50,000)', WIDE_50000],
      ];

      for (const [サイズ, text] of cases) {
        const kb = (new TextEncoder().encode(text).length / 1024).toFixed(0);
        console.log(`  fixture ${サイズ}: ${kb} KB`);

        const root = rootOf(text);
        const parse = measure(() => parseJson(text));
        const format = measure(() => formatJson(text, root, '2'));
        const gnv = measure(() => getNodeValue(root));

        const 必須計 = parse.med + format.med;
        rows.push({
          サイズ,
          parse_ms: Math.round(parse.med * 10) / 10,
          format_ms: Math.round(format.med * 10) / 10,
          getNodeValue_ms: Math.round(gnv.med * 10) / 10,
          getNodeValue_p90_ms: Math.round(gnv.p90 * 10) / 10,
          必須計_ms: Math.round(必須計 * 10) / 10,
          無駄率: `${Math.round((gnv.med / 必須計) * 1000) / 10}%`,
          long_task:
            gnv.med > 50
              ? `yes（${gnv.med.toFixed(1)}ms > 50ms）`
              : `no（${gnv.med.toFixed(1)}ms）`,
        });
      }
      console.table(rows);
    },
    { iterations: 1, warmupIterations: 0, warmupTime: 0, time: 0 }
  );
});
