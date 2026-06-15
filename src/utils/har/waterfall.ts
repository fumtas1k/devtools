import type { HarEntry, HarTimings } from './types';

/** ウォーターフォールで描画する HAR タイミングフェーズ（描画順）。 */
export type HarPhase = 'blocked' | 'dns' | 'connect' | 'ssl' | 'send' | 'wait' | 'receive';

/** フェーズ描画順。ssl は connect の末尾区間として connect の直後に置く。 */
export const PHASE_ORDER: HarPhase[] = [
  'blocked',
  'dns',
  'connect',
  'ssl',
  'send',
  'wait',
  'receive',
];

export interface WaterfallSegment {
  phase: HarPhase;
  /** フェーズ所要時間（ms, > 0）。 */
  ms: number;
  /** バー内相対幅（ms / totalMs, 0..1）。flex セグメント幅に使う。 */
  widthRatio: number;
}

export interface WaterfallRow {
  /** 起点・timings から横棒を描画できるか。false なら "—" を表示。 */
  hasTimeline: boolean;
  /** 全体起点からの相対開始位置（(start - t0) / globalTotal, 0..1）。 */
  offsetRatio: number;
  /** バー全体幅（durationMs / globalTotal, 0..1）。 */
  widthRatio: number;
  /** このエントリのフェーズ合計 ms。 */
  totalMs: number;
  segments: WaterfallSegment[];
}

export interface WaterfallModel {
  /** 全体タイムラインの総時間（ms, >= 1）。 */
  totalMs: number;
  /** entries と同じ長さ・同じ順序。 */
  rows: WaterfallRow[];
}

/** startedDateTime（ISO 文字列）を epoch ms に変換。解析不能・非文字列は null。 */
function parseStart(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** timings の 1 フィールドを正の ms として読む（-1 / 未定義 / 非数 / 0 以下は 0）。 */
function phaseMs(timings: HarTimings, key: string): number {
  const v = timings[key];
  return typeof v === 'number' && v > 0 ? v : 0;
}

/** timings をフェーズ別 ms 列に分解する（ssl は connect から控除）。 */
function buildPhaseMs(timings: HarTimings | undefined): { phase: HarPhase; ms: number }[] {
  if (!timings || typeof timings !== 'object') return [];
  const sslMs = phaseMs(timings, 'ssl');
  // HAR 1.2: ssl は connect の部分時間。二重計上を避けるため connect から控除する。
  const connectMs = Math.max(phaseMs(timings, 'connect') - sslMs, 0);
  const byPhase: Record<HarPhase, number> = {
    blocked: phaseMs(timings, 'blocked'),
    dns: phaseMs(timings, 'dns'),
    connect: connectMs,
    ssl: sslMs,
    send: phaseMs(timings, 'send'),
    wait: phaseMs(timings, 'wait'),
    receive: phaseMs(timings, 'receive'),
  };
  const out: { phase: HarPhase; ms: number }[] = [];
  for (const phase of PHASE_ORDER) {
    if (byPhase[phase] > 0) out.push({ phase, ms: byPhase[phase] });
  }
  return out;
}

/**
 * HAR エントリ列から全体タイムライン基準のウォーターフォール配置モデルを計算する。
 * 純関数・入力非破壊（entries を読むのみ）。
 */
export function computeWaterfall(entries: (HarEntry | null)[]): WaterfallModel {
  // 1st pass: 各エントリの起点とフェーズ列・所要時間を求める。
  const pre = entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return {
        start: null as number | null,
        phases: [] as { phase: HarPhase; ms: number }[],
        durationMs: 0,
      };
    }
    const start = parseStart(entry.startedDateTime);
    const phases = buildPhaseMs(entry.timings);
    const durationMs = phases.reduce((a, p) => a + p.ms, 0);
    return { start, phases, durationMs };
  });

  // 全体タイムライン（描画可能なエントリのみで起点・終点を決める）。
  let t0 = Infinity;
  let tEnd = -Infinity;
  for (const p of pre) {
    if (p.start == null || p.phases.length === 0) continue;
    if (p.start < t0) t0 = p.start;
    const end = p.start + p.durationMs;
    if (end > tEnd) tEnd = end;
  }
  const hasGlobal = Number.isFinite(t0) && Number.isFinite(tEnd);
  const totalMs = hasGlobal ? Math.max(tEnd - t0, 1) : 1;

  const rows: WaterfallRow[] = pre.map((p) => {
    const hasTimeline = hasGlobal && p.start != null && p.phases.length > 0;
    if (!hasTimeline) {
      return {
        hasTimeline: false,
        offsetRatio: 0,
        widthRatio: 0,
        totalMs: p.durationMs,
        segments: [],
      };
    }
    const offsetRatio = (p.start! - t0) / totalMs;
    const widthRatio = p.durationMs / totalMs;
    const segments: WaterfallSegment[] = p.phases.map((ph) => ({
      phase: ph.phase,
      ms: ph.ms,
      widthRatio: ph.ms / p.durationMs,
    }));
    return { hasTimeline: true, offsetRatio, widthRatio, totalMs: p.durationMs, segments };
  });

  return { totalMs, rows };
}
