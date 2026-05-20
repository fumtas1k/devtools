/**
 * ファイルダウンロードユーティリティ
 */

/** Retina 表示向けに canvas を 2 倍解像度で描画するためのスケール係数。 */
const RETINA_SCALE = 2;

/**
 * Blob を `<a download>` 経由でダウンロードする共通処理。
 * テキスト・バイナリ・SVG・PNG・ZIP すべての出口で利用される。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** テキストファイルをダウンロードする */
export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename);
}

/** バイナリをファイルとしてダウンロードする */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
    filename
  );
}

/** SVG文字列をファイルとしてダウンロードする */
export function downloadSvg(svgContent: string, filename: string): void {
  downloadBlob(new Blob([svgContent], { type: 'image/svg+xml' }), filename);
}

/** SVG要素をファイルとしてダウンロードする */
export function downloadSvgElement(svgEl: Element, filename: string): void {
  downloadSvg(new XMLSerializer().serializeToString(svgEl), filename);
}

/** SVG文字列からPNG Blobを生成する（Retina x2倍）。SVGにwidth/height属性が必要 */
export function svgContentToPngBlob(svgContent: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const m = svgContent.match(/width="(\d+)" height="(\d+)"/);
    if (!m) {
      reject(new Error('SVG に width/height がありません'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = parseInt(m[1], 10) * RETINA_SCALE;
    canvas.height = parseInt(m[2], 10) * RETINA_SCALE;
    const ctx = canvas.getContext('2d')!;
    // Canvas2D default は transparent。bwip-js / JsBarcode の SVG は背景 rect を持たない
    // ため、一部 reader (Dynamsoft 等) が transparent を「黒」と解釈して decode 失敗する。
    // scale 前に device px 単位で全面白塗り。詳細経緯 / 代替案: docs/decisions.md [082]。
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // バーコード/QR の bar/space edge を sharp に保つため smoothing 無効化。
    // 有効のままだと SVG → Image → Canvas 経路で edge が灰色に滲み、scanner が
    // 黒/白の二値閾値で bar 幅を取り違えて decode 失敗する（GS1 DataBar の
    // composite CC-A 1X 矩形 module が読めなくなる原因）。
    ctx.imageSmoothingEnabled = false;
    ctx.scale(RETINA_SCALE, RETINA_SCALE);
    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('PNG 変換に失敗しました'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 読み込み失敗'));
    };
    img.src = url;
  });
}

/** SVG文字列からPNGをダウンロードする（Retina x2倍）。SVGにwidth/height属性が必要 */
export async function downloadPngFromSvgContent(
  svgContent: string,
  filename: string
): Promise<void> {
  const blob = await svgContentToPngBlob(svgContent);
  downloadBlob(blob, filename);
}

/**
 * SVG要素からPNGをダウンロードする（getBoundingClientRectで寸法取得、Retina x2倍）
 * 要素がDOMに描画されている必要がある。
 * Image 読み込み失敗時は reject し、呼出側で UI 通知できるようにする
 * (svgContentToPngBlob と同じ pattern)。
 */
export function downloadPngFromSvgElement(svgEl: SVGSVGElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { width, height } = svgEl.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = width * RETINA_SCALE;
    canvas.height = height * RETINA_SCALE;
    const ctx = canvas.getContext('2d')!;
    // 背景を白で fill (svgContentToPngBlob と同じ理由: transparent 背景は reader が
    // 黒 pixel と解釈して decode 失敗するため、scale 前の device px 単位で全面塗り)。
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // bar/space の edge anti-aliasing を抑止 (svgContentToPngBlob と同じ理由)。
    ctx.imageSmoothingEnabled = false;
    ctx.scale(RETINA_SCALE, RETINA_SCALE);
    const img = new Image();
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = filename;
        a.click();
        resolve();
      } catch (e) {
        // drawImage / toDataURL は canvas tainted 等で SecurityError を throw する。
        // try/catch しないと unhandled error として外に逃げ、caller の Promise には
        // reject されず silent failure 経路が残る (PR #434 レビュー指摘)。
        reject(e instanceof Error ? e : new Error('PNG への変換に失敗しました'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('PNG への変換に失敗しました'));
    };
    img.src = url;
  });
}
