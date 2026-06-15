import type { HarEntry, WaterfallModel } from '@/utils/har';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { cx } from '@/utils/cx';
import { HarWaterfallBar } from './HarWaterfallBar';

interface Props {
  entries: (HarEntry | null)[];
  waterfall: WaterfallModel;
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

export function HarEntryList({ entries, waterfall, selectedIndex, onSelect }: Props) {
  // 全行・全セグメントの幅/オフセットを 1 枚の stylesheet にまとめて注入する。
  // inline style / setProperty は CSP style-src 制約により使用しない（decisions [067]）。
  // 行ごとに hook を呼ぶと sheet を量産するため、必ずここで 1 回だけ呼ぶ。
  const dynClassName = useDynamicStyleSheet((className) => {
    const rules: string[] = [];
    waterfall.rows.forEach((row, i) => {
      if (!row.hasTimeline) return;
      rules.push(
        `.${className} [data-har-bar="${i}"] { --bar-left: ${(row.offsetRatio * 100).toFixed(4)}%; --bar-width: ${(row.widthRatio * 100).toFixed(4)}%; }`
      );
      row.segments.forEach((seg, j) => {
        rules.push(
          `.${className} [data-har-seg="${i}-${j}"] { --seg-width: ${(seg.widthRatio * 100).toFixed(4)}%; }`
        );
      });
    });
    return rules.join('\n');
  });

  return (
    <div className={cx('overflow-x-auto rounded border border-default', dynClassName)}>
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
            <th scope="col" className="hidden whitespace-nowrap px-3 py-2 font-medium md:table-cell">
              タイミング
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
                <td className="hidden px-3 py-1.5 md:table-cell">
                  <HarWaterfallBar row={waterfall.rows[i]!} rowIndex={i} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
