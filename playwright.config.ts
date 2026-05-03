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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
    const isCI = !!process.env.CI;
    return {
      command: isCI
        ? 'npm run preview -- --port 4321'
        : 'npm run build && npm run preview -- --port 4321',
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
      timeout: isCI ? 30_000 : 120_000,
      reuseExistingServer: !isCI,
    };
  })(),
});
