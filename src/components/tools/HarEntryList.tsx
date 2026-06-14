import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import type { HarEntry } from '@/utils/har';

interface Props {
  entries: HarEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

/** 1ページあたりの表示件数 */
const PAGE_SIZE = 100;

/** URL からホスト + パスの短縮表示を作る（表示専用、redact 後の URL を受け取る） */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}

function formatSize(bytes: number | undefined): string {
  if (bytes == null || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ms: number | undefined): string {
  if (ms == null) return '-';
  return `${Math.round(ms)} ms`;
}

export function HarEntryList({ entries, selectedIndex, onSelect }: Props) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  // page が範囲外の場合はクランプ（entries 件数減少時の安全対策）
  const safePage = Math.min(page, totalPages - 1);

  const pageStart = safePage * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto rounded border border-default">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">HTTP リクエスト一覧</caption>
          <thead>
            <tr className="bg-subtle text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                メソッド
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                URL
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                ステータス
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                サイズ
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                時間
              </th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((e, localIndex) => {
              const globalIndex = pageStart + localIndex;
              return (
                <tr
                  key={globalIndex}
                  className={selectedIndex === globalIndex ? 'bg-active' : undefined}
                >
                  <td className="px-3 py-1.5 font-mono">{e.request.method}</td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      aria-current={selectedIndex === globalIndex ? 'true' : undefined}
                      className="text-left text-primary underline-offset-2 hover:underline"
                      onClick={() => onSelect(globalIndex)}
                    >
                      {shortUrl(e.request.url)}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 font-mono">{e.response.status}</td>
                  <td className="px-3 py-1.5 font-mono">
                    {formatSize(e.response.content?.size ?? e.response.bodySize)}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{formatTime(e.time)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ページャ: 複数ページのときのみ表示 */}
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <ActionButton
            variant="secondary"
            size="compact"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            前へ
          </ActionButton>
          <span className="caption text-muted">
            {safePage + 1} / {totalPages} ページ（全 {entries.length} 件）
          </span>
          <ActionButton
            variant="secondary"
            size="compact"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            次へ
          </ActionButton>
        </div>
      )}
    </div>
  );
}
