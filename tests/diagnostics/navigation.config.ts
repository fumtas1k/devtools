import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import standardConfig from '../../playwright.config';

// 通常 CI の testDir / projects には入れず、明示したときだけ実行する。
export default defineConfig({
  ...standardConfig,
  testDir: '.',
  testMatch: 'navigation.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../../test-results/navigation-diagnostics/artifacts',
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: fileURLToPath(
          new URL('../../test-results/navigation-diagnostics/results.json', import.meta.url)
        ),
      },
    ],
    [
      'html',
      {
        outputFolder: fileURLToPath(
          new URL('../../playwright-report/navigation-diagnostics', import.meta.url)
        ),
        open: 'never',
      },
    ],
  ],
  projects: [{ name: 'navigation-diagnostic', use: { ...devices['Desktop Chrome'] } }],
});
