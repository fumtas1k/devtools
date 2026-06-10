import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// VRT PR comment build step の陽性対照スクリプトの健全性検証
// issue #324 参照: visual-regression.yml の失敗 spec 抽出 pipeline は
// VRT 失敗時のみ通る経路で CI 実証手段がないため、スクリプトで再現して検証する。

const script = 'scripts/test-vrt-comment-build.sh';

describe('scripts/test-vrt-comment-build.sh', () => {
  it('スクリプトが bash で解釈できる構文を持つ', () => {
    // bash -n で構文チェックのみ実行（副作用なし）
    expect(() => execFileSync('bash', ['-n', script], { cwd: process.cwd() })).not.toThrow();
  });

  it('3 ケース（陰性 A・陰性 B・陽性 C）が全て pass する', () => {
    // スクリプト本体実行。exit 0 = 全ケース green。
    // タイムアウトは 30 秒（bash サブプロセスが複数起動するため余裕を持たせる）。
    const result = spawnSync('bash', [script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30000,
    });

    // 失敗時に stdout/stderr を表示してデバッグしやすくする
    if (result.status !== 0) {
      console.error('stdout:', result.stdout);
      console.error('stderr:', result.stderr);
    }

    expect(result.status, 'スクリプトが非 0 で終了した').toBe(0);
  });
});
