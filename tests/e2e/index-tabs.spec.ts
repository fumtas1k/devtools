import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe('トップページ カテゴリタブ（production CSP 適用）', () => {
  // PR #469 レビュー指摘2: タブが 5 つに増えスマホ幅で溢れるようになったため、
  // パネルをスワイプして active タブがタブバー外へ隠れた際にタブバーを追従スクロールさせる。
  test('スマホでパネルを末尾までスワイプすると active タブがタブバー内へ追従スクロールする（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(
      browser,
      '/',
      async (page) => {
        await page.setViewportSize(MOBILE_VIEWPORT);

        const tabBarScrollLeft = () =>
          page.evaluate(() => document.getElementById('tab-bar')!.scrollLeft);

        // 初期状態: タブバーは左端（横スクロールしていない）
        expect(await tabBarScrollLeft()).toBe(0);

        // 末尾パネル（変換・解析 = index 4）までスワイプして scrollend を発火。
        // panels は scroll-behavior:smooth のため scrollTo() は非同期アニメーションになり
        // 直後の scrollLeft が確定しない。scrollLeft 直接代入は同期的に確定するため使用する。
        await page.evaluate(() => {
          const panels = document.getElementById('panels')!;
          panels.scrollLeft = panels.clientWidth * 4;
          panels.dispatchEvent(new Event('scrollend'));
        });

        // active タブが同期され、タブバーが追従して横スクロールする
        await expect(page.getByRole('tab', { name: '変換・解析' })).toHaveAttribute(
          'aria-selected',
          'true'
        );
        await expect.poll(tabBarScrollLeft).toBeGreaterThan(0);
      },
      { skipHydration: true }
    );
  });
});
