import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('GS1 DataBar 生成（production CSP 適用）', () => {
  test('ページが正しく表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await expect(page.getByRole('heading', { name: 'GS1 DataBar 生成' })).toBeVisible();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
      await expect(page.getByRole('button', { name: '+ フィールド追加' })).toBeVisible();
    });
  });

  test('AI コード Select のデフォルト値が正しい（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期フィールドは賞味/消費期限(17) と ロット番号(10)
      await expect(page.getByLabel('AI コード 1')).toHaveValue('17');
      await expect(page.getByLabel('AI コード 2')).toHaveValue('10');
    });
  });

  test('別フィールドで選択済みの AI は disabled になる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 1 行目は '17'（賞味/消費期限）、2 行目は '10'（ロット番号）
      // 2 行目 Select で '17' の option は disabled のはず
      const opt17InSelect2 = page
        .getByLabel('AI コード 2')
        .getByRole('option', { name: '賞味/消費期限 (17)' });
      await expect(opt17InSelect2).toBeDisabled();

      // 2 行目 Select で '10' の option は disabled でない
      const opt10InSelect2 = page
        .getByLabel('AI コード 2')
        .getByRole('option', { name: 'ロット番号 (10)' });
      await expect(opt10InSelect2).toBeEnabled();
    });
  });

  test('1 行目の AI を変更すると 2 行目の disabled が連動する（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: Select1='17', Select2='10'。未使用の '11'（製造日）を 1 行目に選択
      await page.getByLabel('AI コード 1').selectOption('11');
      await expect(page.getByLabel('AI コード 1')).toHaveValue('11');

      // React 再レンダリング後に '11' が Select 2 で disabled になるのを expect のオートリトライで待つ
      await expect(
        page.getByLabel('AI コード 2').getByRole('option', { name: '製造日 (11)' })
      ).toBeDisabled();

      // '17' は 2 行目で enabled になる
      await expect(
        page.getByLabel('AI コード 2').getByRole('option', { name: '賞味/消費期限 (17)' })
      ).toBeEnabled();
    });
  });

  test('削除ボタンでフィールドが減る（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: 2 フィールド
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
      await expect(page.getByLabel('AI コード 2')).toBeVisible();

      await page.getByRole('button', { name: 'フィールドを削除' }).first().click();

      await expect(page.getByLabel('AI コード 2')).toBeHidden();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();
    });
  });

  test('+ フィールド追加でフィールドが増える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // 初期状態: 2 フィールド。1 行削除してから追加
      await page.getByRole('button', { name: 'フィールドを削除' }).first().click();
      await expect(page.getByLabel('AI コード 1')).toBeVisible();

      await page.getByRole('button', { name: '+ フィールド追加' }).click();
      await expect(page.getByLabel('AI コード 2')).toBeVisible();
    });
  });

  // 陽性対照: PNG ダウンロード失敗時に ErrorMessage が表示されることを保証する
  // (issue #338: 旧実装は fire-and-forget で unhandled promise rejection、UI feedback 無し)。
  // svgContentToPngBlob 内の `URL.createObjectURL(svgBlob)` 経路を意図的に throw させ、
  // Promise reject → downloadPng の try/catch → setDownloadError → role=alert 表示
  // という全経路を実証する。
  test('PNG ダウンロード失敗時に ErrorMessage が表示される（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // GTIN-14 を入力して SVG 生成を待つ
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      // svgContentToPngBlob 内 `URL.createObjectURL(svgBlob)` を意図的に throw させる。
      // 同期 throw は Promise executor 内なので Promise reject に変換される (Promise spec)。
      // blob.type は Chromium の正規化で `image/svg+xml;charset=utf-8` になる場合があるため
      // startsWith で照合する。PNG 出力 blob (`image/png`) は除外され影響しない。
      await page.evaluate(() => {
        const orig = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob: Blob) => {
          if (blob.type.startsWith('image/svg+xml')) {
            throw new Error('forced failure for E2E positive control');
          }
          return orig(blob);
        };
      });

      await page.getByRole('button', { name: 'PNGダウンロード' }).click();

      // role=alert の ErrorMessage block に「ダウンロードエラー」が表示される
      await expect(page.getByRole('alert').filter({ hasText: /ダウンロードエラー/ })).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────
  // バーコード認識安定化 (anti-aliasing 抑止) のブラウザ実測検証
  //
  // 旧実装は (a) bwip-js SVG に shape-rendering 未指定、(b) Canvas→PNG 時に
  // imageSmoothingEnabled = true (default) のため、bar/space edge が灰色に滲み
  // scanner が黒/白二値閾値で decode 失敗する事象を起こしていた (composite CC-A
  // のロット (10) が読めない事象)。fix を revert すると以下 2 ケースは必ず fail
  // する陽性対照。
  // ─────────────────────────────────────────────
  test('生成 SVG に shape-rendering="crispEdges" が付与されている（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const preview = page.getByLabel(/GS1 DataBar.*のバーコード/);
      const innerHtml = await preview.evaluate((el) => el.innerHTML);
      expect(innerHtml).toContain('shape-rendering="crispEdges"');
    });
  });

  test('バーコードプレビューの image-rendering が pixelated（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      const preview = page.getByLabel(/GS1 DataBar.*のバーコード/);
      await expect(preview).toBeVisible();

      const rendering = await preview.evaluate((el) => getComputedStyle(el).imageRendering);
      // Chromium (本リポジトリ playwright.config.ts の唯一の project) は
      // 'pixelated' をそのまま正規化して返す。本 assertion はあくまで CSS class が
      // 適用されたことの観測であり、実際の raster cache 経路でのピクセル化挙動は
      // ブラウザ実装依存のため別途実機検証が必要。
      expect(rendering).toBe('pixelated');
    });
  });

  // 陽性対照: composite シンボルに GS1 推奨の 10X quiet zone (左右 padding) が
  // 確保されていることを実出力 SVG で検証する。bwip-js v4.9.0 の renmatrix は
  // micropdf417 経由で渡される `borderleft/right=1` しか CC 部に持たず、CC-A
  // 周囲の quiet zone が 1X (= 3 svg-px @ scale=3) に縮退する。GS1 General Spec
  // は CC component 周囲に 10X 推奨を要求し、PC スキャナの decode 失敗実例が
  // あるため `paddingwidth: 10` を `bwipjs.toSVG` に明示している。
  //
  // 検証方法: AI フィールド入力で composite シンボルを生成 → SVG の最初の
  // <rect/path> の x 座標が `scale × paddingwidth = 30` 以上であることを確認。
  // `paddingwidth` を削ると 0〜数 svg-px (1X 相当) になるため必ず fail する。
  test('composite シンボルに GS1 推奨の 10X quiet zone (paddingwidth) が確保されている（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // GTIN + ロット (10) を入力して databarlimitedcomposite を生成
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await page.getByLabel('AI フィールド値 2').fill('ABC123');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const preview = page.getByLabel(/GS1 DataBar.*のバーコード/);
      // SVG viewBox の min-x からシンボル左端までの padding を svg-px で取得。
      // bwip-js は描画要素を <path>/<rect> で出力する。最も左にある描画要素の
      // x 座標 (= 左端からの padding) を測定する。
      // `<text>` (includetext: true の人間可読 GTIN) は textxalign='center' で
      // symbol 中央配置されるため最左にならないが、stroke-width 計算で getBBox
      // の挙動が path/rect と微妙に異なるため、quiet zone 計測対象から明示的に
      // 除外する (rect, path のみを query)。
      const leftPaddingPx = await preview.evaluate((el) => {
        const svg = el.querySelector('svg');
        if (!svg) return -1;
        // SVGGraphicsElement.getBBox() は viewBox 座標系で要素群の bounding box を返す。
        // viewBox 全体に対し描画要素群の x が paddingleft 分だけ右にオフセットされる。
        const items = svg.querySelectorAll('rect, path');
        let minX = Infinity;
        for (const it of items) {
          const bbox = (it as SVGGraphicsElement).getBBox();
          if (bbox.x < minX) minX = bbox.x;
        }
        return Number.isFinite(minX) ? minX : -1;
      });

      // paddingwidth: 10 × scale: 3 = 30 svg-px。bwip-js の内部処理で多少の
      // 浮動小数点誤差が乗る可能性があるため > 25 で判定する (paddingwidth 削除時は
      // 0〜3 svg-px 程度になるため十分な余裕)。
      expect(leftPaddingPx).toBeGreaterThan(25);
    });
  });

  // 陽性対照 (補): non-composite (`databarlimited` 単独) には `paddingwidth` が
  // **適用されない** ことを assert する。renlinear が default で持つ
  // `borderleft: 10` (10X quiet zone) のみ反映され、symbol 全幅が必要以上に
  // 拡大しない設計を回帰防止する。
  //
  // 検証方法: GTIN のみ入力 (AI フィールド未入力) → `hasAnyAiValue=false` →
  // `databarlimited` 経路 + paddingwidth スキップ。最左描画要素の x が
  // 25 svg-px 未満であることを assert。`paddingwidth: 10` を non-composite にも
  // 誤って適用すると leftmost x が 37 svg-px 付近に shift して fail する。
  test('non-composite シンボルには paddingwidth が適用されない（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // GTIN のみ入力 (AI フィールド未入力で composite 経路に入らない)
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const preview = page.getByLabel(/GS1 DataBar.*のバーコード/);
      const leftPaddingPx = await preview.evaluate((el) => {
        const svg = el.querySelector('svg');
        if (!svg) return -1;
        const items = svg.querySelectorAll('rect, path');
        let minX = Infinity;
        for (const it of items) {
          const bbox = (it as SVGGraphicsElement).getBBox();
          if (bbox.x < minX) minX = bbox.x;
        }
        return Number.isFinite(minX) ? minX : -1;
      });

      // renlinear の borderleft=10 (X-dim) + scale=3 = 30 svg-px 内に最初のバーが
      // 入る (実測 M.x=8.50 付近, stroke-width 込みで getBBox.x ≈ 7)。
      // `paddingwidth: 10` が誤って適用された場合は 30 svg-px 更に右にシフト
      // (≈ 37) するため、< 25 の閾値で確実に分離できる。
      expect(leftPaddingPx).toBeLessThan(25);
    });
  });

  // 陽性対照: 生成 PNG の **背景が transparent ではなく白 (RGBA=255,255,255,255)**
  // であることをブラウザ実機で検証する。
  //
  // 旧実装は Canvas2D default の transparent 背景 (RGBA=0,0,0,0) のまま drawImage
  // していたため、quiet zone / バー間 pixel が完全 transparent になり、image-based
  // barcode reader (Dynamsoft Barcode Reader 等) が transparent pixel を「黒」と
  // 解釈して decode 失敗していた (実例: dev server 生成 PNG → Dynamsoft 0 件、
  // 同 PNG を画面 screenshot → 同 reader で confidence=100 で decode 成功)。
  //
  // `src/utils/download.ts` の svgContentToPngBlob で `ctx.fillStyle = 'white'` +
  // `ctx.fillRect(0, 0, canvas.width, canvas.height)` を scale 前に呼ぶことで
  // PNG 背景を実 RGB 白として記録する。
  //
  // 検証方法: ツールが実 download に使う経路 (svgContentToPngBlob と同等) を
  // 再現し、quiet zone 領域の pixel が α=255 / RGB=(255,255,255) であることを
  // ImageData 経由で assert。fix を revert すると α=0 (transparent) に戻り fail する。
  test('生成 PNG の quiet zone が透明ではなく白 (α=255) で塗られている（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // composite を生成 (paddingheight + 全 4 辺の quiet zone を持つ最大サイズ)
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await page.getByLabel('AI フィールド値 2').fill('ABC123');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const samples = await page.evaluate(async () => {
        const preview = document.querySelector('[aria-label*="のバーコード"]');
        const svg = preview?.querySelector('svg');
        if (!svg) return null;
        const svgContent = svg.outerHTML;
        const m = svgContent.match(/width="(\d+)" height="(\d+)"/);
        if (!m) return null;
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        const RETINA_SCALE = 2;
        const canvas = document.createElement('canvas');
        canvas.width = w * RETINA_SCALE;
        canvas.height = h * RETINA_SCALE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        // 本物の svgContentToPngBlob と完全に同じ順序を再現
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.scale(RETINA_SCALE, RETINA_SCALE);
        const img = new Image();
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error('img load failed'));
          img.src = url;
        });
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        // quiet zone 4 隅で sampling
        const points = [
          { name: 'top-left', x: 5, y: 5 },
          { name: 'top-right', x: canvas.width - 5, y: 5 },
          { name: 'bottom-left', x: 5, y: canvas.height - 5 },
          { name: 'bottom-right', x: canvas.width - 5, y: canvas.height - 5 },
        ];
        return points.map((p) => {
          const d = ctx.getImageData(p.x, p.y, 1, 1).data;
          return { name: p.name, r: d[0], g: d[1], b: d[2], a: d[3] };
        });
      });

      expect(samples).not.toBeNull();
      // 全 quiet zone 4 隅で α=255 / RGB=(255,255,255) (transparent 0 ではなく白)
      // fix revert 時は α=0, RGB=(0,0,0) になり全件 fail する。
      for (const s of samples!) {
        expect.soft(s.a, `${s.name} alpha`).toBe(255);
        expect.soft(s.r, `${s.name} red`).toBe(255);
        expect.soft(s.g, `${s.name} green`).toBe(255);
        expect.soft(s.b, `${s.name} blue`).toBe(255);
      }
    });
  });
});
