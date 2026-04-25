/**
 * unknown 型の例外値から表示用メッセージを取り出す。
 * Error インスタンスなら `message` を、それ以外は fallback を返す。
 */
export function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
