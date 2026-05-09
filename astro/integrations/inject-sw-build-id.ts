import type { AstroIntegration } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '__BUILD_ID__';

export function resolveBuildId(): string {
  const sha =
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    execSync('git rev-parse --short HEAD').toString().trim();
  return sha.slice(0, 7);
}

export function injectSwBuildId(): AstroIntegration {
  return {
    name: 'inject-sw-build-id',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const swPath = fileURLToPath(new URL('sw.js', dir));
        const original = await readFile(swPath, 'utf8');
        if (!original.includes(PLACEHOLDER)) {
          throw new Error(`[inject-sw-build-id] placeholder ${PLACEHOLDER} not found in ${swPath}`);
        }
        const buildId = resolveBuildId();
        await writeFile(swPath, original.replaceAll(PLACEHOLDER, buildId));
        logger.info(`Injected BUILD_ID=${buildId} into sw.js`);
      },
    },
  };
}
