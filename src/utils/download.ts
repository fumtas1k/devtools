/**
 * ファイルダウンロードユーティリティ
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** テキストファイルをダウンロードする */
export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  triggerDownload(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename);
}

/** SVG文字列をファイルとしてダウンロードする */
export function downloadSvg(svgContent: string, filename: string): void {
  triggerDownload(new Blob([svgContent], { type: 'image/svg+xml' }), filename);
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
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = parseInt(m[1], 10) * scale;
    canvas.height = parseInt(m[2], 10) * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
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
export function downloadPngFromSvgContent(svgContent: string, filename: string): Promise<void> {
  return svgContentToPngBlob(svgContent).then((blob) => triggerDownload(blob, filename));
}

/**
 * SVG要素からPNGをダウンロードする（getBoundingClientRectで寸法取得、Retina x2倍）
 * 要素がDOMに描画されている必要がある
 */
export function downloadPngFromSvgElement(svgEl: SVGSVGElement, filename: string): void {
  const { width, height } = svgEl.getBoundingClientRect();
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const img = new Image();
  const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.click();
  };
  img.src = url;
}
