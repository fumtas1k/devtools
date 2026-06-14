import type { HarEntry } from '@/utils/har';

interface Props {
  entries: HarEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

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
  return (
    <div className="overflow-x-auto rounded border border-default">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">HTTP リクエスト一覧</caption>
        <thead>
          <tr className="bg-subtle text-left">
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              メソッド
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              URL
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              ステータス
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              サイズ
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
              時間
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const request = e?.request;
            const response = e?.response;
            const url = typeof request?.url === 'string' ? request.url : null;
            return (
              <tr key={i} className={selectedIndex === i ? 'bg-active' : undefined}>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {request?.method ?? '—'}
                </td>
                <td className="px-3 py-1.5">
                  {url != null ? (
                    <button
                      type="button"
                      aria-current={selectedIndex === i ? 'true' : undefined}
                      className="text-left text-primary underline-offset-2 hover:underline"
                      onClick={() => onSelect(i)}
                    >
                      {shortUrl(url)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-current={selectedIndex === i ? 'true' : undefined}
                      className="text-left text-muted underline-offset-2 hover:underline"
                      onClick={() => onSelect(i)}
                    >
                      （壊れたエントリ）
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {response?.status ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                  {formatSize(response?.content?.size ?? response?.bodySize)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono">{formatTime(e?.time)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
