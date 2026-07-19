import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * meta test: E2E spec の hydration 待ち漏れ検出 (issue #750 再発防止策)
 *
 * Playwright の fill / click / setInputFiles が React island の hydration
 * 完了前に実行されると、DOM だけ書き換わり React の onChange が発火しない
 * hydration race で flaky になる（CI は workers:1 で顕在化せずローカル並列
 * 実行でのみ落ちるため発見が遅れる）。
 *
 * 検知ルール: `tests/e2e/*.spec.ts` のうちソースに `goto('/tools/...')` を
 * 含むファイルは `waitForReactHydration` または `withProductionCsp`（内部で
 * hydration 待ちを実施）への参照を必須とする。
 *
 * 除外基準: React のイベントハンドラ発火に依存しない spec（computed style
 * 読取のみ等）は ALLOWLIST に理由付きで登録する。`/test-fixtures/*` や
 * 静的ページのみへ goto する spec は検知対象外（gate spec 等は自然に除外）。
 *
 * 注意: 参照検出はソース文字列ベースの heuristic（コメント内の言及でも
 * 通過しうる）。厳密性より「新規 spec 作成時の完全な失念」の検知を目的とする。
 * 既知の限界（false negative）:
 * - 変数経由の goto（`const P = '/tools/x'; goto(P)`）は検知できない
 * - `withProductionCsp` に `{ skipHydration: true }` を渡す spec は参照ありと
 *   みなされるが、ラッパ内部の hydration 待ちは skip される（static page 用
 *   オプションのため `/tools/` ページでの使用時は spec 側で待機を担保すること）
 */

const E2E_DIR = join(__dirname, '../e2e');

/** hydration 待ち不要と判断した spec の allowlist（除外理由を必ず併記） */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  [
    'prefers-reduced-motion.spec.ts',
    'computed style の読取のみで React イベントハンドラの発火に依存しない',
  ],
]);

const TOOLS_GOTO_RE = /goto\(\s*['"`]\/tools\//;
const HYDRATION_HELPER_RE = /waitForReactHydration|withProductionCsp/;

interface SpecSource {
  name: string;
  content: string;
}

/** hydration 待ちが漏れている spec 名を返す純粋関数（陰性/陽性両対照で共有） */
function findSpecsMissingHydrationWait(
  specs: readonly SpecSource[],
  allowlist: ReadonlyMap<string, string>
): string[] {
  return specs
    .filter((s) => !allowlist.has(s.name))
    .filter((s) => TOOLS_GOTO_RE.test(s.content))
    .filter((s) => !HYDRATION_HELPER_RE.test(s.content))
    .map((s) => s.name)
    .sort();
}

/**
 * allowlist の腐敗（orphan）を返す純粋関数。
 * 実在しない・既にヘルパー使用済み・/tools/ へ goto しない spec が
 * allowlist に残っている場合に検出する（vrt-pages-coverage の orphan 検出踏襲）。
 */
function findOrphanAllowlistEntries(
  specs: readonly SpecSource[],
  allowlist: ReadonlyMap<string, string>
): string[] {
  const byName = new Map(specs.map((s) => [s.name, s]));
  return [...allowlist.keys()]
    .filter((name) => {
      const spec = byName.get(name);
      if (!spec) return true;
      return HYDRATION_HELPER_RE.test(spec.content) || !TOOLS_GOTO_RE.test(spec.content);
    })
    .sort();
}

function loadSpecs(): SpecSource[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((name) => ({ name, content: readFileSync(join(E2E_DIR, name), 'utf8') }));
}

describe('E2E hydration 待ちカバレッジ', () => {
  it('goto(/tools/*) する全 spec が waitForReactHydration か withProductionCsp を使用している', () => {
    const missing = findSpecsMissingHydrationWait(loadSpecs(), ALLOWLIST);
    expect(missing).toEqual([]);
  });

  it('ALLOWLIST に orphan エントリがない', () => {
    const orphans = findOrphanAllowlistEntries(loadSpecs(), ALLOWLIST);
    expect(orphans).toEqual([]);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
// fixture を注入し、検知ロジックが実際に違反を列挙することを確認する。
describe('[陽性対照] E2E hydration 待ちカバレッジ検知機構', () => {
  const emptyAllowlist: ReadonlyMap<string, string> = new Map();

  it('hydration 待ちなしで /tools/ へ goto する fixture を検出する', () => {
    const fixture: SpecSource = {
      name: 'fake-missing.spec.ts',
      content: `await page.goto('/tools/fake-tool');\nawait page.fill('#x', 'y');`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([
      'fake-missing.spec.ts',
    ]);
  });

  it('waitForReactHydration 使用済み fixture は検出しない（過検知なし）', () => {
    const fixture: SpecSource = {
      name: 'fake-ok.spec.ts',
      content: `await page.goto('/tools/fake-tool');\nawait waitForReactHydration(page);`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([]);
  });

  it('withProductionCsp 使用済み fixture は検出しない（過検知なし）', () => {
    const fixture: SpecSource = {
      name: 'fake-csp.spec.ts',
      content: `await withProductionCsp(browser, '/tools/fake-tool', async (page) => {});`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([]);
  });

  it('/tools/ 以外へ goto する fixture は検出しない（gate spec 等の除外）', () => {
    const fixture: SpecSource = {
      name: 'fake-fixture-page.spec.ts',
      content: `await page.goto('/test-fixtures/hydration-broken');`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([]);
  });

  it('allowlist 登録済み fixture は検出しない', () => {
    const fixture: SpecSource = {
      name: 'fake-allowed.spec.ts',
      content: `await page.goto('/tools/fake-tool');`,
    };
    const allowlist = new Map([['fake-allowed.spec.ts', 'テスト用の除外理由']]);
    expect(findSpecsMissingHydrationWait([fixture], allowlist)).toEqual([]);
  });

  it('orphan 検出: 実在しない allowlist エントリを検出する', () => {
    const allowlist = new Map([['no-such-file.spec.ts', '理由']]);
    expect(findOrphanAllowlistEntries([], allowlist)).toEqual(['no-such-file.spec.ts']);
  });

  it('orphan 検出: ヘルパー使用済みなのに allowlist に残るエントリを検出する', () => {
    const fixture: SpecSource = {
      name: 'fake-migrated.spec.ts',
      content: `await page.goto('/tools/x');\nawait waitForReactHydration(page);`,
    };
    const allowlist = new Map([['fake-migrated.spec.ts', '理由']]);
    expect(findOrphanAllowlistEntries([fixture], allowlist)).toEqual(['fake-migrated.spec.ts']);
  });
});
