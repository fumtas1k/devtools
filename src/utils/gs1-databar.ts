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
 * bwip-js の toSVG 出力は viewBox のみで width/height を持たない。
 * (1) flex コンテナでの寸法不定 / Image の natural size = 0x0 → PNG 空回避のため
 *     viewBox から pixel 寸法を取り出して width/height 属性を注入する。
 * (2) shape-rendering="crispEdges" を同時に注入する。bwip-js default では未指定で、
 *     付けないとブラウザ表示・Image→Canvas 経路の両方で bar/space edge が
 *     sub-pixel anti-alias で滲み、scanner が黒/白二値閾値で bar 幅を誤判定する
 *     (特に composite CC-A の 1X 矩形 module でロット (10) が読めない事象の原因)。
 *
 * 属性順依存を避けるため <svg> 開始タグ全体を regex で捕捉し、`viewBox` の
 * 前後どちらに `xmlns` 等が来ても動くようにする (bwip-js upgrade で属性順が
 * 変わっても silent regression しないようにするため)。
 */
export function addSvgDimensions(svg: string): string {
  const openTagMatch = svg.match(/<svg(\s[^>]*?)?\s+viewBox="0 0 ([\d.]+) ([\d.]+)"([^>]*)>/);
  if (!openTagMatch) return svg;
  const [originalTag, beforeViewBox = '', wStr, hStr, afterViewBox = ''] = openTagMatch;
  const w = Math.round(parseFloat(wStr));
  const h = Math.round(parseFloat(hStr));
  const newTag =
    `<svg width="${w}" height="${h}" shape-rendering="crispEdges"` +
    `${beforeViewBox} viewBox="0 0 ${wStr} ${hStr}"${afterViewBox}>`;
  return svg.replace(originalTag, newTag);
}
