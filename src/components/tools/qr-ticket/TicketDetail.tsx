import { colors, caption } from '@/utils/styles';
import { formatTimestamp, type TicketPayload } from '@/utils/qr-ticket';

export function TicketDetail({ ticket }: { ticket: TicketPayload }) {
  const rows: { label: string; value: string }[] = [
    { label: 'イベントID', value: ticket.e },
    { label: 'チケットID', value: ticket.t },
    { label: '有効期限', value: formatTimestamp(ticket.timestamp) },
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
                ...caption,
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
