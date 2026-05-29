import { parseTree, type Node, type ParseError, type ParseOptions } from 'jsonc-parser';
import { offsetToLineColumn, parseErrorMessage, type JsonSyntaxError } from './errors';

export type ParseResult = { ok: true; root: Node } | { ok: false; error: JsonSyntaxError };

// strict JSON: コメント・末尾カンマ・空入力をすべてエラーにする。
// JSON5 / コメント許容は将来のモードで別途対応する。
const STRICT_OPTIONS: ParseOptions = {
  disallowComments: true,
  allowTrailingComma: false,
  allowEmptyContent: false,
};

function toSyntaxError(text: string, parseError: ParseError): JsonSyntaxError {
  const { line, column } = offsetToLineColumn(text, parseError.offset);
  return {
    message: parseErrorMessage(parseError.error),
    line,
    column,
    offset: parseError.offset,
  };
}

/**
 * strict JSON としてパースし、AST ルートノードまたは構文エラーを返す。
 * 寛容パーサ（jsonc-parser）でツリーは得つつ、errors 配列で不正を検知する。
 */
export function parseJson(text: string): ParseResult {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, STRICT_OPTIONS);

  if (errors.length > 0) {
    return { ok: false, error: toSyntaxError(text, errors[0]) };
  }
  if (!root) {
    // 空入力など、ルートが得られないケース。
    return {
      ok: false,
      error: { message: parseErrorMessage(4 /* ValueExpected */), line: 1, column: 1, offset: 0 },
    };
  }
  return { ok: true, root };
}
