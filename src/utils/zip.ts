/**
 * ZIP 生成・ダウンロード共通ユーティリティ
 *
 * - JSZip は dynamic import で遅延ロード（初期バンドル軽量化）
 * - エントリ名・zipName は `sanitizeFilename` で必ずサニタイズし、
 *   Zip Slip 類似攻撃や予期しない拡張子付与を防ぐ
 */

import { downloadBlob } from '@/utils/download';
import { sanitizeFilename } from '@/utils/filename';

export interface ZipFileEntry {
  /** エントリのファイル名（呼び出し側でサニタイズ済みを渡すか、ここでサニタイズされる） */
  name: string;
  /** 文字列 or Blob（バイナリ）どちらでも可 */
  content: Blob | string;
}

/**
 * 渡されたファイル群を ZIP にまとめてダウンロードする。
 *
 * @param files ZIP に含めるファイル一覧（name は必ずサニタイズして格納される）
 * @param zipName ダウンロード時のファイル名（必ず `.zip` 拡張子に正規化される）
 */
export async function downloadZip(files: ZipFileEntry[], zipName: string): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const { name, content } of files) {
    // ZIP エントリ名は Zip Slip 類似の攻撃媒体になり得るため必ずサニタイズする。
    // 拡張子のホワイトリストは呼び出し側の意図を尊重するため、ここでは強制せず
    // 危険文字のみを除去する（拡張子の付け替えは行わない）。
    const safeEntryName = sanitizeFilename(name);
    zip.file(safeEntryName, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  // zipName 自体もユーザー入力起源になり得るのでサニタイズし、`.zip` を強制する
  const safeZipName = sanitizeFilename(zipName, ['zip']);
  downloadBlob(blob, safeZipName);
}
