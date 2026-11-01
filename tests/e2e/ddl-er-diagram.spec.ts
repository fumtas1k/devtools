import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('DDL→ER図ジェネレータ（production CSP 適用）', () => {
  test('サンプル入力でER図・Mermaidコード・ダウンロードボタンが表示される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/ddl-er-diagram', async (page) => {
      // サンプルを入力
      await page.getByRole('button', { name: 'サンプルを入力' }).click();

      // ER図 img が visible になるのを待つ
      await expect(page.getByTestId('er-diagram').locator('img')).toBeVisible();

      // Mermaid コードが erDiagram を含む
      await expect(page.getByTestId('mermaid-code')).toContainText('erDiagram');

      // ダウンロードボタンが visible
      await expect(page.getByRole('button', { name: 'SVGダウンロード' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'PNGダウンロード' })).toBeVisible();
    });
  });

  test('構文エラー入力でエラーメッセージを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ddl-er-diagram', async (page) => {
      // 不完全な CREATE TABLE 文を入力してエラーを発生させる
      await page.getByLabel('CREATE TABLE 文').fill('CREATE TABLE');

      // エラーメッセージが表示される
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });
});

test('全角と非隣接テーブルの SVG は実描画でも重ならず各出力で一致する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/ddl-er-diagram', async (page) => {
    await page.evaluate(() => {
      const create = URL.createObjectURL.bind(URL);
      const blobs = new Map<string, Blob>();
      Object.assign(window, { testSvgBlobs: blobs });
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
      };
    });
    const ddl = `CREATE TABLE \`顧客管理テーブル\` (\`識別番号\` INT PRIMARY KEY);
CREATE TABLE middle_table (id INT PRIMARY KEY);
CREATE TABLE orders (\`顧客参照番号がとても長い列名\` INT PRIMARY KEY,
  FOREIGN KEY (\`顧客参照番号がとても長い列名\`) REFERENCES \`顧客管理テーブル\`(\`識別番号\`));`;
    await page.getByLabel('CREATE TABLE 文').fill(ddl);
    const img = page.getByTestId('er-diagram-img');
    await expect(img).toBeVisible();
    const svg = await img.evaluate(async (el) => {
      const blobs = (window as unknown as { testSvgBlobs: Map<string, Blob> }).testSvgBlobs;
      return (await blobs.get((el as HTMLImageElement).src)?.text()) ?? '';
    });
    expect(svg).toContain('顧客参照番号');

    // 実際の blob SVG を DOM に一時的に配置し、ブラウザの文字の描画範囲を調べる。
    const result = await page.evaluate((source) => {
      const node = document.importNode(
        new DOMParser().parseFromString(source, 'image/svg+xml').documentElement,
        true
      ) as unknown as SVGSVGElement;
      document.body.appendChild(node);
      const rects = [...node.querySelectorAll('rect')];
      const cards = rects.filter(
        (r) => r.getAttribute('stroke') === '#334155' && r.getAttribute('fill') === '#ffffff'
      );
      const badges = rects.filter((r) =>
        ['#1e40af', '#065f46'].includes(r.getAttribute('fill') ?? '')
      );
      const labels = rects.filter(
        (r) => r.getAttribute('fill') === '#ffffff' && r.getAttribute('rx') === '2'
      );
      const box = (el: SVGGraphicsElement) => {
        const b = el.getBBox();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      const inside = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
        a.x >= b.x - 0.1 &&
        a.y >= b.y - 0.1 &&
        a.x + a.w <= b.x + b.w + 0.1 &&
        a.y + a.h <= b.y + b.h + 0.1;
      const texts = [...node.querySelectorAll('text')];
      const cardTexts = texts.filter((t) => !labels.some((r) => r.nextElementSibling === t));
      const result = {
        cards: cards.length,
        labels: labels.length,
        badges: badges.length,
        positiveControl: overlap(box(cards[0]), box(cards[0])),
        cardTextFits: cardTexts.every((t) => cards.some((c) => inside(box(t), box(c)))),
        bodyAvoidsBadges: cardTexts
          .filter((t) => t.textContent?.includes(' : '))
          .every((t) => badges.every((b) => !overlap(box(t), box(b)))),
        badgeTextFits: badges.every(
          (b) =>
            b.nextElementSibling instanceof SVGGraphicsElement &&
            inside(box(b.nextElementSibling), box(b))
        ),
        labelsFit: labels.every(
          (r) =>
            r.nextElementSibling instanceof SVGGraphicsElement &&
            inside(box(r.nextElementSibling), box(r))
        ),
        labelsAvoidCards: labels.every((r) => cards.every((c) => !overlap(box(r), box(c)))),
        labelsAvoidEachOther: labels.every((r, i) =>
          labels.slice(0, i).every((other) => !overlap(box(r), box(other)))
        ),
      };
      node.remove();
      return result;
    }, svg);
    expect(result).toEqual({
      cards: 3,
      labels: 1,
      badges: 4,
      positiveControl: true,
      cardTextFits: true,
      bodyAvoidsBadges: true,
      badgeTextFits: true,
      labelsFit: true,
      labelsAvoidCards: true,
      labelsAvoidEachOther: true,
    });
    const svgDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'SVGダウンロード' }).click();
    const downloadedSvg = await svgDownload;
    const stream = await downloadedSvg.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe(svg);
    const pngDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNGダウンロード' }).click();
    const png = await pngDownload;
    const pngStream = await png.createReadStream();
    const pngChunks: Buffer[] = [];
    for await (const chunk of pngStream) pngChunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(pngChunks);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
  });
});
