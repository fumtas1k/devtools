/** GTIN-14の制約 */
export const GTIN14_LENGTH = 14;

/** GS1 DataBar Limited が受け付ける先頭桁 */
export const DATABAR_LIMITED_FIRST_DIGITS = [0, 1] as const;

/** GTIN-14 チェックディジット計算結果の型 */
export interface Gs1CalcResult {
  /** チェックディジット（1桁の数字） */
  checkDigit: number;
  /** チェックディジットを含む14桁の完全なGTIN */
  fullGtin: string;
}

/**
 * GTIN-14 チェックディジットを計算する（モジュラス10 ウェイト3-1）
 * 左から奇数位(1,3,5…13)×3、偶数位(2,4,6…12)×1
 * check = (10 - sum%10) % 10
 *
 * @param digits13 - チェックディジットを除いた13桁の数字文字列
 * @returns 計算結果（チェックディジットと完全なGTIN）
 */
export function calcGtin14CheckDigit(digits13: string): Gs1CalcResult {
  const digits = digits13.split('').map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    // 左から1番目（i=0）は奇数位→×3
    sum += i % 2 === 0 ? d * 3 : d * 1;
  });
  const checkDigit = (10 - (sum % 10)) % 10;
  return {
    checkDigit,
    fullGtin: digits13 + checkDigit,
  };
}

/**
 * GS1 DataBar Limited の入力バリデーション
 * @param input - 13桁の数字文字列
 * @returns エラーメッセージ（正常時は空文字）
 */
export function validateGtin14Input(input: string): string {
  if (!input) return '';
  if (!/^\d+$/.test(input)) return '数字のみ入力してください';
  if (input.length > 13) return `13桁を入力してください（現在${input.length}桁）`;
  if (input.length < 13) return `13桁を入力してください（現在${input.length}桁）`;
  const first = Number(input[0]);
  if (first !== 0 && first !== 1) {
    return 'GS1 DataBar Limitedの先頭桁は 0 または 1 のみ使用できます';
  }
  return '';
}

/** サポートするアプリケーション識別子 (AI) のコード定義 */
export type AiCode = '17' | '10' | '11' | '15' | '21';

/** アプリケーション識別子 (AI) の詳細定義インターフェース */
export interface AiEntry {
  /** AIコード（'17', '10' など） */
  ai: AiCode;
  /** UI表示用のラベル */
  label: string;
  /** 入力フィールドのプレースホルダー */
  placeholder: string;
  /**
   * 可変長AIかどうか。
   * true の場合、後続AIが存在するときバーコード内でFNC1区切りが必要。
   * FNC1の挿入は bwip-js の gs1process() が自動で処理するため、
   * buildBwipText() での明示的な挿入は不要。
   */
  isVariableLength: boolean;
  /** 入力値のバリデーション。エラーメッセージを返す（正常時は空文字） */
  validate: (value: string) => string;
}

export const AI_DEFS: AiEntry[] = [
  {
    ai: '17',
    label: '賞味/消費期限 (17)',
    placeholder: 'YYMMDD (例: 231231)',
    isVariableLength: false,
    validate: (v) => {
      if (!v) return '';
      if (!/^\d{6}$/.test(v)) return 'YYMMDD形式の6桁を入力してください';
      const mm = Number(v.slice(2, 4));
      const dd = Number(v.slice(4, 6));
      if (mm < 1 || mm > 12) return '月は01〜12で入力してください';
      if (dd < 0 || dd > 31) return '日は00〜31で入力してください';
      return '';
    },
  },
  {
    ai: '10',
    label: 'ロット番号 (10)',
    placeholder: '英数字 (例: ABC123)',
    isVariableLength: true,
    validate: (v) => {
      if (!v) return '';
      if (!/^[\x20-\x7E]{1,20}$/.test(v))
        return '最大20文字の印刷可能なASCII文字を入力してください';
      return '';
    },
  },
  {
    ai: '11',
    label: '製造日 (11)',
    placeholder: 'YYMMDD (例: 230101)',
    isVariableLength: false,
    validate: (v) => {
      if (!v) return '';
      if (!/^\d{6}$/.test(v)) return 'YYMMDD形式の6桁を入力してください';
      const mm = Number(v.slice(2, 4));
      const dd = Number(v.slice(4, 6));
      if (mm < 1 || mm > 12) return '月は01〜12で入力してください';
      if (dd < 0 || dd > 31) return '日は00〜31で入力してください';
      return '';
    },
  },
  {
    ai: '15',
    label: '最良品質保持期限 (15)',
    placeholder: 'YYMMDD (例: 231231)',
    isVariableLength: false,
    validate: (v) => {
      if (!v) return '';
      if (!/^\d{6}$/.test(v)) return 'YYMMDD形式の6桁を入力してください';
      const mm = Number(v.slice(2, 4));
      const dd = Number(v.slice(4, 6));
      if (mm < 1 || mm > 12) return '月は01〜12で入力してください';
      if (dd < 0 || dd > 31) return '日は00〜31で入力してください';
      return '';
    },
  },
  {
    ai: '21',
    label: 'シリアル番号 (21)',
    placeholder: '英数字 (例: SN001)',
    isVariableLength: true,
    validate: (v) => {
      if (!v) return '';
      if (!/^[\x20-\x7E]{1,20}$/.test(v))
        return '最大20文字の印刷可能なASCII文字を入力してください';
      return '';
    },
  },
];

/**
 * bwip-js の databarlimitedcomposite 用テキスト文字列を組み立てる
 * フォーマット: (01)GTIN14|(AI1)value1(AI2)value2...
 *
 * FNC1（可変長AIの終端区切り文字）の挿入は bwip-js の gs1process() が
 * 自動で処理する。isVariableLength=true のAIが後続AIを持つ場合、
 * ライブラリ内部でFNC1が自動挿入されるため、この関数での明示的な挿入は不要。
 *
 * @param fullGtin - 14桁のGTIN
 * @param compositeFields - AI→値のペア配列（値が空のものは除外）
 */
export function buildBwipText(
  fullGtin: string,
  compositeFields: { ai: AiCode; value: string }[]
): string {
  const linear = `(01)${fullGtin}`;
  const filledFields = compositeFields.filter((f) => f.value.trim() !== '');
  if (filledFields.length === 0) return linear;
  const composite = filledFields.map((f) => `(${f.ai})${f.value.trim()}`).join('');
  return `${linear}|${composite}`;
}

/**
 * HTML/XML 特殊文字をエスケープする
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 合成シンボルの上に AI テキストを挿入する。
 * bwip-js の includetext は composite 部上のテキストを出力しないため、
 * SVG 文字列を直接操作してテキスト要素を追加する。
 *
 * @param svg - bwip-js が生成した SVG 文字列
 * @param text - 挿入するテキスト
 * @returns テキストを挿入した SVG 文字列
 */
export function injectCompositeText(svg: string, text: string): string {
  if (!text) return svg;

  const escapedText = escapeHtml(text);
  const vbMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!vbMatch) return svg;
  const barcodeW = parseFloat(vbMatch[1]);
  const h = parseFloat(vbMatch[2]);

  const fontSize = 18;
  const textRowH = fontSize + 6;

  // Courier New monospace: 1文字あたり約 0.6em
  // 見積もりはエスケープ前の文字数で行う（ブラウザは実体参照を1文字分で描画するため）
  const charW = fontSize * 0.6;
  const padding = 16;
  const estimatedTextW = text.length * charW + padding;

  // テキストがバーコードより広い場合は幅を広げる
  const newW = Math.max(barcodeW, estimatedTextW);
  const newH = h + textRowH;

  // 幅が広がった場合、バーコードを水平方向の中央に配置する
  const barcodeOffsetX = (newW - barcodeW) / 2;

  let result = svg
    .replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="0 0 ${newW.toFixed(1)} ${newH.toFixed(1)}"`)
    .replace(/width="\d+"/, `width="${Math.round(newW)}"`)
    .replace(/height="\d+"/, `height="${Math.round(newH)}"`);

  const openEnd = result.indexOf('>') + 1;
  const closeStart = result.lastIndexOf('</svg>');
  const openTag = result.slice(0, openEnd);
  const inner = result.slice(openEnd, closeStart);

  // SVG `<text>` の塗り色は `fill="currentColor"` で親要素の `color` から継承する。
  // 親要素 (Gs1Databar.tsx の `dangerouslySetInnerHTML` ラッパ `<div>`) は
  // `.gs1-svg-container` クラス経由で `color: var(--color-text)` を設定する前提。
  // 親 className を変更する際は `global.css` の `.gs1-svg-container` ルールを
  // 維持するか同等の color 設定を用意しないと SVG text のデフォルト色 (UA 依存、
  // 通常 black) にフォールバックする。CSP `style-src` strict 化を見据えた
  // inline style 撲滅 (#176 B 案 / [067]) の一環で採用。
  const textEl =
    `<text x="${(newW / 2).toFixed(1)}" y="${textRowH - 3}" ` +
    `text-anchor="middle" font-family="'Courier New',Courier,monospace" ` +
    `font-size="${fontSize}" fill="currentColor">${escapedText}</text>`;

  const barcodeTranslate = `translate(${barcodeOffsetX.toFixed(1)},${textRowH})`;

  return `${openTag}${textEl}<g transform="${barcodeTranslate}">${inner}</g></svg>`;
}
