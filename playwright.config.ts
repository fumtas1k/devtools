import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  expect: {
    // アサーションのデフォルトタイムアウト（デフォルト 5000ms を明示）
    timeout: 5000,
  },
  projects: [
    // #VRT: 通常の E2E テスト用（visual regression / dev mode hydration spec を除外）
    {
      name: 'e2e',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/visual-regression.spec.ts', '**/hydration-check-dev*.spec.ts'],
    },
    // #VRT: visual regression test 専用（spec 限定、mock 注入は spec 内 addInitScript で実施）
    {
      name: 'visual-regression',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/visual-regression.spec.ts'],
    },
    // #414: dev mode 経路 hydration check 専用 (attribute mismatch は production silent
    // recovery で console に出ないため、astro dev server + React dev build で catch する)
    {
      name: 'hydration-dev',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4322' },
      testMatch: ['**/hydration-check-dev*.spec.ts'],
    },
  ],
  webServer: (() => {
    // #248: CI と local で webServer 設定を分ける
    // - CI: `.github/workflows/test.yml` が事前に `npm run build` を走らせるため
    //   webServer は preview だけで十分。timeout は 30s（fail-fast、env 由来失敗の早期検知）。
    // - Local: build → preview を直列起動して safety net。`reuseExistingServer: false`
    //   で毎回新規 build/preview し stale dist による silent pass を防ぐ。
    //   incremental cache が効くため 2 回目以降の build は数秒。
    // 採用根拠: docs/decisions.md [063] / [065]
    //
    // #414: dev server (port 4322) を併走させ hydration-dev project に提供する。
    // preview と dev は port を分け衝突回避。preview は React production build で
    // text/structure mismatch のみ catch、dev は React dev build で attribute mismatch も
    // catch する 2 層構成。
    const isCI = !!process.env.CI;
    return [
      {
        command: isCI
          ? 'npm run preview -- --port 4321'
          : 'npm run build && npm run preview -- --port 4321',
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
        timeout: isCI ? 30_000 : 120_000,
        reuseExistingServer: !isCI,
      },
      {
        command: 'npm run dev -- --port 4322',
        url: 'http://localhost:4322',
        timeout: isCI ? 30_000 : 60_000,
        reuseExistingServer: !isCI,
      },
    ];
  })(),
});
