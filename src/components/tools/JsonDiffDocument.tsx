import { useRef, useState, type ReactNode } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import type { JsonDiffRange } from '@/utils/json-diff';

// 大きなファイルでも一度に大量の mark 要素を作らず、原文は省略しない。
const RANGES_PER_PAGE = 512;

type Props = {
  id: string;
  side: 'before' | 'after';
  text: string;
  ranges: JsonDiffRange[];
};

export function JsonDiffDocument({ id, side, text, ranges }: Props) {
  const [page, setPage] = useState(0);
  const viewer = useRef<HTMLPreElement>(null);
  function showPage(nextPage: number) {
    setPage(nextPage);
    viewer.current?.scrollTo({ top: 0, left: 0 });
    viewer.current?.focus();
  }
  const before = side === 'before';
  const label = before ? '変更前の全文' : '変更後の全文';
  const pages = Math.max(1, Math.ceil(ranges.length / RANGES_PER_PAGE));
  const first = page * RANGES_PER_PAGE;
  const next = first + RANGES_PER_PAGE;
  let offset = first === 0 ? 0 : ranges[first].start;
  const content: ReactNode[] = [];
  for (const { start, end } of ranges.slice(first, next)) {
    if (start > offset) content.push(text.slice(offset, start));
    content.push(
      <span key={start} role="group" aria-label={before ? '変更前の差分' : '変更後の差分'}>
        <mark
          className={`underline decoration-2 underline-offset-2 ${
            before ? 'bg-error-tint text-error-text' : 'bg-success-tint text-success'
          }`}
        >
          {text.slice(start, end)}
        </mark>
      </span>
    );
    offset = end;
  }
  content.push(text.slice(offset, ranges[next]?.start ?? text.length));

  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2">
      <h4 id={id} className="body-emphasis">
        {label}
      </h4>
      <pre
        ref={viewer}
        aria-describedby={id}
        tabIndex={0}
        className="max-h-96 overflow-auto rounded-md border border-default bg-subtle p-3 font-mono whitespace-pre-wrap wrap-anywhere"
      >
        <code>{content}</code>
      </pre>
      {pages > 1 && (
        <div
          role="group"
          aria-label={`${label}のページ`}
          className="flex flex-wrap items-center gap-2"
        >
          <ActionButton disabled={page === 0} onClick={() => showPage(page - 1)}>
            前へ
          </ActionButton>
          <span aria-live="polite">
            {page + 1} / {pages}
          </span>
          <ActionButton disabled={page + 1 >= pages} onClick={() => showPage(page + 1)}>
            次へ
          </ActionButton>
        </div>
      )}
    </section>
  );
}
