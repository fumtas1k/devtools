import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

  // 陽性対照: composite シンボル上部に `injectCompositeText` で AI テキストが注入
  // されることを実 preview SVG で検証する。
  //
  // PR #450 で撤去された関数を PR #458 (透明背景真因判明) を受けて復活させた経緯
  // (decisions [083])。`src/utils/gs1-databar.ts` の `injectCompositeText` を削除
  // または `Gs1Databar.tsx` の wiring (`compositeText ? injectCompositeText(...) : sizedSvg`)
  // を削ると本 test の text 要素 / 文字列 / y=21 配置 assert が全て fail する。
  //
  // non-composite (AI フィールド未入力) では injection されない (`compositeText` が
  // 空文字で early return) ことも別 case で確認し、誤って常時注入する regression
  // を捕捉する。
  test('composite シンボルに AI テキスト ((17)... (10)...) が SVG 上部に注入される（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await page.getByLabel('AI フィールド値 1').fill('231231');
      await page.getByLabel('AI フィールド値 2').fill('ABC123');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const inspection = await page.getByLabel(/GS1 DataBar.*のバーコード/).evaluate((el) => {
        const svg = el.querySelector('svg');
        if (!svg) return null;
        const textEls = Array.from(svg.querySelectorAll('text'));
        const compositeText = textEls.find((t) => /\(17\).*\(10\)/.test(t.textContent ?? ''));
        if (!compositeText) {
          return { found: false, textContents: textEls.map((t) => t.textContent) };
        }
        return {
          found: true,
          content: compositeText.textContent,
          y: compositeText.getAttribute('y'),
          textAnchor: compositeText.getAttribute('text-anchor'),
          fontSize: compositeText.getAttribute('font-size'),
          fill: compositeText.getAttribute('fill'),
        };
      });

      expect(inspection?.found, '<text> 要素が AI テキストを含んで存在する').toBe(true);
      // バー code text 表示 = "(17)YYMMDD(10)LOT" の compact 形式 (decisions [083] user 決定)
      expect(inspection?.content).toBe('(17)231231(10)ABC123');
      // geometry: textRowH - 3 = 24 - 3 = 21 (Courier New baseline)
      expect(inspection?.y).toBe('21');
      expect(inspection?.textAnchor).toBe('middle');
      expect(inspection?.fontSize).toBe('18');
      // <text> の塗り色は `.gs1-svg-container` の color から継承 (global.css)
      expect(inspection?.fill).toBe('currentColor');
    });
  });

  test('non-composite (AI フィールド未入力) シンボルには AI テキスト注入されない（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // GTIN のみ入力 (`compositeText` が空文字 → injectCompositeText は early return)
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      const aiTextPresent = await page.getByLabel(/GS1 DataBar.*のバーコード/).evaluate((el) => {
        const svg = el.querySelector('svg');
        if (!svg) return false;
        // bwip-js の `includetext: true` で linear 部 "(01)GTIN" は出るが
        // それは <text> ではなく <path> として描画される。AI テキスト形式
        // `(17)` / `(10)` の <text> 要素は injection されないはず。
        const textEls = Array.from(svg.querySelectorAll('text'));
        return textEls.some((t) => /\(17\)|\(10\)|\(11\)|\(15\)|\(21\)/.test(t.textContent ?? ''));
      });
      expect(aiTextPresent).toBe(false);
    });
  });

  // 陽性対照: 生成 PNG の **背景が transparent ではなく白 (RGBA=255,255,255,255)**
  // であることを **実 download click 経路** で検証する。
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
  // 検証方法 (#458 review C 対応):
  //  - PNG ダウンロードボタン click → page.waitForEvent('download') で実 blob を受け取る
  //  - download.path() で OS 一時 file に書き出された実 PNG を Node fs で読み込む
  //  - その PNG を base64 化して page.evaluate 内に渡し、<img> → canvas drawImage 経由で
  //    pixel を decode → 4 隅 quiet zone の RGBA を sampling
  //  - 本物の svgContentToPngBlob (download.ts) の出力 PNG を assert する経路なので、
  //    fix を revert すると α=0 (transparent) に戻り全件 fail する設計を維持
  //  - 旧版 (test 内で svgContentToPngBlob を再実装) は本実装を bypass する false
  //    negative リスクがあったため、実 production code 経由に置換
  test('生成 PNG の quiet zone が透明ではなく白 (α=255) で塗られている（陽性対照 / CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
      // composite を生成 (PNG dimensions: 293 × 75 @ scale=3, paddingwidth=10)
      await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
      await page.getByLabel('AI フィールド値 2').fill('ABC123');
      await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

      // 実 download click → OS 一時 file 取得
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'PNGダウンロード' }).click();
      const download = await downloadPromise;
      const path = await download.path();
      expect(path, 'download path should be defined').toBeTruthy();

      // 実 PNG を読み込み base64 化して browser に転送 → <img> 経由で pixel decode
      const pngBase64 = (await readFile(path!)).toString('base64');
      const samples = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        // quiet zone 4 隅で sampling (image-based reader が境界検出に使う領域)
        const points = [
          { name: 'top-left', x: 5, y: 5 },
          { name: 'top-right', x: canvas.width - 5, y: 5 },
          { name: 'bottom-left', x: 5, y: canvas.height - 5 },
          { name: 'bottom-right', x: canvas.width - 5, y: canvas.height - 5 },
        ];
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: points.map((p) => {
            const d = ctx.getImageData(p.x, p.y, 1, 1).data;
            return { name: p.name, r: d[0], g: d[1], b: d[2], a: d[3] };
          }),
        };
      }, pngBase64);

      expect(samples).not.toBeNull();
      // 全 quiet zone 4 隅で α=255 / RGB=(255,255,255) (transparent 0 ではなく白)
      // fix revert 時は α=0, RGB=(0,0,0) になり全件 fail する。
      for (const s of samples!.pixels) {
        expect.soft(s.a, `${s.name} alpha`).toBe(255);
        expect.soft(s.r, `${s.name} red`).toBe(255);
        expect.soft(s.g, `${s.name} green`).toBe(255);
        expect.soft(s.b, `${s.name} blue`).toBe(255);
      }
    });
  });

  // ─────────────────────────────────────────────
  // A4 印刷機能
  // ─────────────────────────────────────────────
  test.describe('A4 印刷機能', () => {
    test('有効バーコード 0 件では印刷コントロールが非表示', async ({ browser }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        // 初期状態: バーコード未生成。印刷ボタンは表示されない。
        await expect(page.getByRole('button', { name: '印刷' })).toBeHidden();
        // 列数・サイズ ToggleGroup も非表示
        await expect(page.getByRole('group', { name: '列数' })).toBeHidden();
        await expect(page.getByRole('group', { name: 'サイズ 小/中/大' })).toBeHidden();
      });
    });

    test('有効バーコード 1 件以上で印刷コントロールが表示される', async ({ browser }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        // GTIN を入力してバーコード生成
        await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
        await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

        // 印刷コントロールが表示される
        await expect(page.getByRole('button', { name: '印刷' })).toBeVisible();
        await expect(page.getByRole('group', { name: '列数' })).toBeVisible();
        await expect(page.getByRole('group', { name: 'サイズ 小/中/大' })).toBeVisible();
      });
    });

    test('列数 ToggleGroup 切替で印刷コンテナの grid クラスが更新される', async ({ browser }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
        await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

        // デフォルト 2列
        const printGrid = page.locator('.print-grid');
        await expect(printGrid).toHaveClass(/print-grid--cols-2/);

        // 3列に切替
        await page.getByRole('group', { name: '列数' }).getByText('3列').click();
        await expect(printGrid).toHaveClass(/print-grid--cols-3/);

        // 1列に切替
        await page.getByRole('group', { name: '列数' }).getByText('1列').click();
        await expect(printGrid).toHaveClass(/print-grid--cols-1/);
      });
    });

    test('サイズ ToggleGroup 切替で .print-area 内 SVG の width 属性が mm 値で更新される', async ({
      browser,
    }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
        await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

        // デフォルト「中」: print-area 内 SVG の width が mm 値を持つ
        const getPrintSvgWidth = () =>
          page.evaluate(() => {
            const svg = document.querySelector('.print-area svg');
            return svg?.getAttribute('width') ?? '';
          });

        const widthMedium = await getPrintSvgWidth();
        expect(widthMedium).toMatch(/mm$/);

        // 「大」に切替
        await page.getByRole('group', { name: 'サイズ 小/中/大' }).getByText('大').click();
        const widthLarge = await getPrintSvgWidth();
        expect(widthLarge).toMatch(/mm$/);
        // 大は中より数値が大きい
        expect(parseFloat(widthLarge)).toBeGreaterThan(parseFloat(widthMedium));

        // 「小」に切替
        await page.getByRole('group', { name: 'サイズ 小/中/大' }).getByText('小').click();
        const widthSmall = await getPrintSvgWidth();
        expect(widthSmall).toMatch(/mm$/);
        // 小は中より数値が小さい
        expect(parseFloat(widthSmall)).toBeLessThan(parseFloat(widthMedium));
      });
    });

    test('「印刷」ボタン click で例外が出ない（window.print をスタブ化）', async ({ browser }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
        await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

        // window.print をスタブ化してダイアログが開かないようにする
        await page.evaluate(() => {
          window.print = () => {};
        });

        // クリックして例外が出ないことを確認
        await expect(page.getByRole('button', { name: '印刷' })).toBeVisible();
        await page.getByRole('button', { name: '印刷' }).click();
        // エラーメッセージが表示されないことを確認
        await expect(page.getByRole('alert')).toBeHidden();
      });
    });

    test('大サイズ選択時に推奨ヒントが表示される', async ({ browser }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
        await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

        // デフォルト「中」ではヒント非表示
        await expect(page.getByText('大サイズは 1〜2 列を推奨')).toBeHidden();

        // 「大」に切替するとヒント表示
        await page.getByRole('group', { name: 'サイズ 小/中/大' }).getByText('大').click();
        await expect(page.getByText('大サイズは 1〜2 列を推奨')).toBeVisible();

        // 「中」に戻すとヒント非表示
        await page.getByRole('group', { name: 'サイズ 小/中/大' }).getByText('中').click();
        await expect(page.getByText('大サイズは 1〜2 列を推奨')).toBeHidden();
      });
    });

    test('印刷コンテナは createPortal で document.body 直下に配置される', async ({ browser }) => {
      await withProductionCsp(browser, '/tools/gs1-databar', async (page) => {
        await page.getByLabel('GTIN-14（先頭13桁）').fill('0498700000001');
        await expect(page.getByLabel(/GS1 DataBar.*のバーコード/)).toBeVisible();

        // .print-area が document.body の直接の子要素として存在することを検証。
        // createPortal が body 直下へ出すことで @media print の通常フロー配置
        // （複数ページ印刷でクリップしない）が成立する。
        // aria-hidden な印刷専用要素のため role/text を持たず、構造検証は evaluate で行う。
        const isDirectBodyChild = await page.evaluate(() => {
          const printAreas = Array.from(document.body.children).filter((el) =>
            el.classList.contains('print-area')
          );
          return printAreas.length === 1;
        });
        expect(isDirectBodyChild).toBe(true);
      });
    });
  });
});
