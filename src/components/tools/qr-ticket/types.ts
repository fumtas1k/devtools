import type { SignedTicket } from '@/utils/qr-ticket';

/** React key用の安定した識別子を持つチケット行（削除・並び替え時の取り違えを防ぐ） */
export interface TicketRow {
  _key: number;
  id: string;
  name: string;
  category: string;
}

/** チケット行の安定識別子を持つQR生成結果（チケットID重複時のkey衝突を防ぐ） */
export interface GeneratedQr {
  _key: number;
  ticket: SignedTicket;
  svg: string;
  qrString: string;
}
