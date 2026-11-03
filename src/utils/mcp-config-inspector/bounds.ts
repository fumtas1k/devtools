import { createScanner } from 'jsonc-parser';

/** jsonc-parser の SyntaxKind は ambient const enum のため値をローカル定数で扱う。 */
const TOKEN = {
  openObject: 1,
  closeObject: 2,
  openArray: 3,
  closeArray: 4,
  lineBreak: 14,
  whitespace: 15,
  eof: 17,
} as const;

/** JSON形式の判定前に、バイト数・非空白token数と括弧の深さを制限する。 */
export function checkBounds(input: string): boolean {
  if (new TextEncoder().encode(input).length > 256 * 1024) return false;
  const scanner = createScanner(input, false);
  let depth = 0;
  let count = 0;
  for (let token = scanner.scan(); token !== TOKEN.eof; token = scanner.scan()) {
    if (token !== TOKEN.lineBreak && token !== TOKEN.whitespace && ++count > 32768) return false;
    if (token === TOKEN.openObject || token === TOKEN.openArray) depth++;
    if (token === TOKEN.closeObject || token === TOKEN.closeArray) depth--;
    if (depth > 16 || depth < 0) return false;
  }
  return true;
}
