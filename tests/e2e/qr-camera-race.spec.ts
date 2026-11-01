import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test('カメラ起動待ちに画像アップロードへ切り替えると遅れて取得したカメラを停止する', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      resolveCamera: () => void;
      cameraStops: number;
    };
    state.cameraStops = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            state.resolveCamera = () =>
              resolve({
                getTracks: () => [
                  {
                    stop: () => {
                      state.cameraStops += 1;
                    },
                  },
                ],
              } as unknown as MediaStream);
          }),
      },
    });
  });
  await page.goto('/tools/qr-reader');
  await waitForReactHydration(page);
  await page.getByRole('button', { name: 'カメラを起動' }).click();
  await page.getByRole('button', { name: '画像アップロード' }).click();
  await page.evaluate(() =>
    (window as typeof window & { resolveCamera: () => void }).resolveCamera()
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { cameraStops: number }).cameraStops)
    )
    .toBe(1);
  await page.getByRole('button', { name: 'カメラ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'カメラを起動' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'カメラを停止' })).toHaveCount(0);
});
