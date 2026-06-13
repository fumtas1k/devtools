import { formatTimestamp, type TicketPayload } from '@/utils/qr-ticket';
import { cx } from '@/utils/cx';

const MONO_LABELS = ['チケットID', 'イベントID'];

export function TicketDetail({ ticket }: { ticket: TicketPayload }) {
  const rows: { label: string; value: string }[] = [
    { label: 'イベントID', value: ticket.e },
    { label: 'チケットID', value: ticket.t },
    { label: '有効期限', value: formatTimestamp(ticket.timestamp) },
  ];
  if (ticket.n) rows.push({ label: '参加者名', value: ticket.n });
  if (ticket.p) rows.push({ label: '料金区分', value: ticket.p });

  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td className="caption text-muted pr-4 pb-1 whitespace-nowrap">{label}</td>
            <td
              className={cx('caption text-default', MONO_LABELS.includes(label) && 'font-mono')}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
