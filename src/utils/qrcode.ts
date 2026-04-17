import qrcode from 'qrcode-generator';

/**
 * qrcode-generatorのデフォルトの文字コード扱いはISO-8859-1相当であり、
 * 日本語（マルチバイト文字）を正しく扱えません。
 * ここでTextEncoderを用いてUTF-8エンコードを行うようにグローバルに上書きします。
 */
qrcode.stringToBytes = (s: string) => {
  return Array.from(new TextEncoder().encode(s));
};

export default qrcode;
