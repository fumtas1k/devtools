import { printParseErrorCode } from 'jsonc-parser';

/** JSON 構文エラー（行・列は 1 始まり、offset は 0 始まり）。 */
export interface JsonSyntaxError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

/**
 * 0 始まりの offset を 1 始まりの行・列に変換する。
 * 列は当該行の先頭からの文字数（コードユニット単位）。
 */
export function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}

// jsonc-parser の ParseErrorCode 名 → 日本語メッセージ。
// const enum の値を直接 import すると esbuild/Vite でランタイム未定義になるため、
// printParseErrorCode（通常関数）で得た名前をキーにする。
const MESSAGE_BY_NAME: Record<string, string> = {
  InvalidSymbol: '不正な記号があります',
  InvalidNumberFormat: '数値の形式が不正です',
  PropertyNameExpected: 'プロパティ名（文字列キー）が必要です',
  ValueExpected: '値が必要です',
  ColonExpected: 'コロン ( : ) が必要です',
  CommaExpected: 'カンマ ( , ) が必要です',
  CloseBraceExpected: '閉じ波括弧 ( } ) が必要です',
  CloseBracketExpected: '閉じ角括弧 ( ] ) が必要です',
  EndOfFileExpected: '余分なデータがあります',
  InvalidCommentToken: 'コメントは使用できません',
  UnexpectedEndOfComment: 'コメントが閉じられていません',
  UnexpectedEndOfString: '文字列が閉じられていません',
  UnexpectedEndOfNumber: '数値が途中で終了しています',
  InvalidUnicode: '不正な Unicode エスケープです',
  InvalidEscapeCharacter: '不正なエスケープ文字です',
  InvalidCharacter: '不正な文字があります',
};

/** ParseErrorCode を日本語メッセージへ変換する（未知コードはフォールバック）。 */
export function parseErrorMessage(code: number): string {
  const name = printParseErrorCode(code as Parameters<typeof printParseErrorCode>[0]);
  return MESSAGE_BY_NAME[name] ?? `構文エラー (${name})`;
}

/** 「3行5列: メッセージ」形式のラベルを生成する。 */
export function formatErrorLabel(err: JsonSyntaxError): string {
  return `${err.line}行${err.column}列: ${err.message}`;
}
