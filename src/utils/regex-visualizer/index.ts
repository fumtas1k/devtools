export { parseRegex, type RegexAstNode } from './parse';
export { analyzeRedos, type RedosResult, type RedosStatus } from './redos';
export { buildRailroad } from './railroad';
export type { RailNode } from './railroad-layout';
// 注意: この barrel は parse.ts / redos.ts（CJS の regexp-tree / recheck 依存）も re-export する。
// この barrel から runMatch を【値】import すると兄弟モジュールの CJS が SSR グラフに巻き込まれ、
// dev SSR が `module is not defined` で落ちうる。client component からは match.ts を直接 import すること
// （RegexMatchTester.tsx 参照）。型のみの import は実行時消去されるため barrel 経由でも安全。
export { runMatch, type MatchResult, type RegexMatch, type CaptureGroup } from './match';
