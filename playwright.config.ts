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
  webServer: {
    // #246: security.csp の `<meta>` を含めた本番相当 CSP を E2E で評価するため
    // dev server ではなく `astro build` 後の `dist/` を `astro preview` で配信する。
    // build はキャッシュが効くと数秒、cold でも 15〜25s 程度。preview 起動は瞬時。
    command: 'npm run build && npm run preview -- --port 4321',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
    // build 時間を含むため 30s → 120s に延長（cold start でも収まる余裕）
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
