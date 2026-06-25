export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * 不透明色のみ対応（HEX `#rgb`/`#rrggbb`、`rgb(r,g,b)`）。
 * v1 はアルファ付き（`#rrggbbaa` / `rgba()`）非対応で null を返す。
 */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  const hex6 = /^#([0-9a-f]{6})$/.exec(s);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const hex3 = /^#([0-9a-f]{3})$/.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }
  return null;
}

export interface WcagLevels {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

function gammaExpand(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x の相対輝度（0–1）。 */
export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * gammaExpand(r) + 0.7152 * gammaExpand(g) + 0.0722 * gammaExpand(b);
}

/** WCAG コントラスト比（1–21、対称）。 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** コントラスト比から各レベルの合否を判定する。 */
export function wcagLevels(ratio: number): WcagLevels {
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

// --- APCA-W3 0.1.9 定数 ---
const APCA_MAIN_TRC = 2.4;
const APCA_R = 0.2126729;
const APCA_G = 0.7151522;
const APCA_B = 0.072175;
const APCA_NORM_BG = 0.56;
const APCA_NORM_TXT = 0.57;
const APCA_REV_TXT = 0.62;
const APCA_REV_BG = 0.65;
const APCA_BLK_THRS = 0.022;
const APCA_BLK_CLMP = 1.414;
const APCA_SCALE = 1.14;
const APCA_LO_CLIP = 0.1;
const APCA_LO_OFFSET = 0.027;
const APCA_DELTA_Y_MIN = 0.0005;

/** APCA 用の画面輝度 Y（単純べき 2.4。WCAG の区分線形とは異なる）。 */
function apcaScreenY({ r, g, b }: RGB): number {
  const lin = (c: number) => (c / 255) ** APCA_MAIN_TRC;
  return APCA_R * lin(r) + APCA_G * lin(g) + APCA_B * lin(b);
}

/**
 * APCA Lc 値（おおむね -108〜106）。
 * 引数は前景（テキスト）色・背景色の順。符号は極性（明背景＝正、暗背景＝負）。
 * 前景背景を入替えると非対称（符号反転）。
 */
export function apcaLc(text: RGB, bg: RGB): number {
  let txtY = apcaScreenY(text);
  let bgY = apcaScreenY(bg);

  // black soft-clamp
  txtY = txtY > APCA_BLK_THRS ? txtY : txtY + (APCA_BLK_THRS - txtY) ** APCA_BLK_CLMP;
  bgY = bgY > APCA_BLK_THRS ? bgY : bgY + (APCA_BLK_THRS - bgY) ** APCA_BLK_CLMP;

  if (Math.abs(bgY - txtY) < APCA_DELTA_Y_MIN) return 0;

  let sapc: number;
  let out: number;
  if (bgY > txtY) {
    // 明背景・暗文字（normal polarity）
    sapc = (bgY ** APCA_NORM_BG - txtY ** APCA_NORM_TXT) * APCA_SCALE;
    out = sapc < APCA_LO_CLIP ? 0 : sapc - APCA_LO_OFFSET;
  } else {
    // 暗背景・明文字（reverse polarity）
    sapc = (bgY ** APCA_REV_BG - txtY ** APCA_REV_TXT) * APCA_SCALE;
    out = sapc > -APCA_LO_CLIP ? 0 : sapc + APCA_LO_OFFSET;
  }
  return out * 100;
}

export interface ColorEntry {
  id: string;
  label: string;
  rgb: RGB;
}

export interface MatrixCell {
  ratio: number;
  levels: WcagLevels;
  apca: number;
  sameColor: boolean;
}

/** colors[row]=前景, colors[col]=背景 の N×N セルを計算する。 */
export function buildMatrix(colors: ColorEntry[]): MatrixCell[][] {
  return colors.map((fg) =>
    colors.map((bg) => {
      const ratio = contrastRatio(fg.rgb, bg.rgb);
      return {
        ratio,
        levels: wcagLevels(ratio),
        apca: apcaLc(fg.rgb, bg.rgb),
        sameColor: fg.id === bg.id,
      };
    })
  );
}

/** RGB を `rgb(r g b)` 形式の CSS 色文字列に変換する。 */
export function rgbToCss({ r, g, b }: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}
