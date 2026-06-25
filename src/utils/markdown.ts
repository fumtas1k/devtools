import { marked } from 'marked';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

/**
 * markdown 文字列を GFM 準拠の HTML に変換し、sanitizeHtml でサニタイズして返す。
 *
 * - gfm: true  … GFM（表・取り消し線・コードブロック等）を有効化
 * - breaks: true … 改行を <br> に変換（一般的なエディタ体験に寄せる）
 * - async: false … 戻り値が string になることを保証（Promise<string> ではない）
 *
 * 出力は必ず sanitizeHtml に通してから返す純粋関数。
 */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { gfm: true, breaks: true, async: false }) as string;
  return sanitizeHtml(html);
}
