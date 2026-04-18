import { colors, caption, micro } from '@/utils/styles';
import type { TicketPayload } from '@/utils/qr-ticket';

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function TicketDetail({ ticket }: { ticket: TicketPayload }) {
  const rows: { label: string; value: string }[] = [
    { label: 'イベントID', value: ticket.e },
    { label: 'チケットID', value: ticket.t },
    { label: '有効期限', value: formatExpiry(ticket.x) },
  ];
  if (ticket.n) rows.push({ label: '参加者名', value: ticket.n });
  if (ticket.p) rows.push({ label: '料金区分', value: ticket.p });

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td
              style={{
                ...micro,
                color: colors.muted,
                paddingRight: '1rem',
                paddingBottom: '0.25rem',
                whiteSpace: 'nowrap' as const,
              }}
            >
              {label}
            </td>
            <td
              style={{
                ...caption,
                color: colors.text,
                fontFamily: label === 'チケットID' ? 'monospace' : undefined,
              }}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
