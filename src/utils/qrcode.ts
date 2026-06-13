import qrcode from 'qrcode-generator';

/**
 * qrcode-generatorのデフォルトの文字コード扱いはISO-8859-1相当であり、
 * 日本語（マルチバイト文字）を正しく扱えません。
 * ここでTextEncoderを用いてUTF-8エンコードを行うようにグローバルに上書きします。
 *
 * 重要: 他のファイルからは 'qrcode-generator' を直接インポートせず、
 * 必ず createQrSvg (@/utils/qrcode) を使用してください。
 */
qrcode.stringToBytes = (s: string) => {
  return [...new TextEncoder().encode(s)];
};

/** QRコードのエラー訂正レベル（L: 7% 〜 H: 30% の冗長度）。 */
export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * テキストとエラー訂正レベルを受け取り、QRコードのSVG文字列を返す。
 * 'qrcode-generator' の直接 import を他ファイルに持ち込まないための窓口関数。
 */
export function createQrSvg(text: string, level: QrErrorLevel): string {
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ scalable: true });
}
