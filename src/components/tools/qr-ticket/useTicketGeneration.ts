import { useState, useRef, useMemo, useCallback } from 'react';
import {
  signTicket,
  generateQrSvg,
  ticketToQrString,
  generateTicketId,
  estimateTicketByteSize,
  MAX_QR_BYTE_SIZE,
  type TicketPayload,
} from '@/utils/qr-ticket';
import { downloadSvg } from '@/utils/download';
import { downloadZip } from '@/utils/zip';
import { sanitizeFilename, isSafeTicketId } from '@/utils/filename';
import { MAX_TICKETS } from './constants';
import type { TicketRow, GeneratedQr } from './types';

export interface UseTicketGenerationOptions {
  cryptoKeyPair: CryptoKeyPair | null;
}

export interface UseTicketGenerationReturn {
  eventId: string;
  expiry: string;
  tickets: TicketRow[];
  generating: boolean;
  generateError: string;
  generatedQrs: GeneratedQr[];
  zipping: boolean;
  zipError: string;
  setEventId: (v: string) => void;
  setExpiry: (v: string) => void;
  addTicket: () => void;
  removeTicket: (index: number) => void;
  updateTicket: (index: number, field: keyof TicketRow, value: string) => void;
  generate: () => Promise<void>;
  downloadSvgQr: (qr: GeneratedQr) => void;
  downloadZipQrs: () => Promise<void>;
}

/**
 * QRチケット生成・チケット編集・ZIPダウンロード管理フック。
 */
export function useTicketGeneration({
  cryptoKeyPair,
}: UseTicketGenerationOptions): UseTicketGenerationReturn {
  const [eventId, setEventId] = useState('');
  const [expiry, setExpiry] = useState('');
  const ticketKeyRef = useRef(1);
  const [tickets, setTickets] = useState<TicketRow[]>([
    { _key: 1, id: generateTicketId(1), name: '', category: '' },
  ]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedQrs, setGeneratedQrs] = useState<GeneratedQr[]>([]);
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState('');

  const addTicket = useCallback(() => {
    if (tickets.length >= MAX_TICKETS) return;
    ticketKeyRef.current += 1;
    const newKey = ticketKeyRef.current;
    setTickets((prev) => [
      ...prev,
      { _key: newKey, id: generateTicketId(prev.length + 1), name: '', category: '' },
    ]);
  }, [tickets.length]);

  const removeTicket = useCallback((index: number) => {
    setTickets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTicket = useCallback((index: number, field: keyof TicketRow, value: string) => {
    setTickets((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }, []);

  const generate = useCallback(async () => {
    setGenerateError('');

    if (!cryptoKeyPair) {
      setGenerateError('先に鍵ペアを生成またはインポートしてください');
      return;
    }
    if (!eventId.trim()) {
      setGenerateError('イベントIDを入力してください');
      return;
    }
    if (!expiry) {
      setGenerateError('有効期限を設定してください');
      return;
    }
    if (tickets.length === 0) {
      setGenerateError('チケットを1件以上追加してください');
      return;
    }

    // | 含有チェック: eventId
    if (eventId.includes('|')) {
      setGenerateError(
        'イベントIDに | を含めることはできません。半角 | を別の記号に置き換えてください'
      );
      return;
    }
    // | 含有チェック: 各チケットフィールド
    for (const row of tickets) {
      if (row.id.includes('|')) {
        setGenerateError(
          'チケットIDに | を含めることはできません。半角 | を別の記号に置き換えてください'
        );
        return;
      }
      if (row.name.includes('|')) {
        setGenerateError(
          '参加者名に | を含めることはできません。半角 | を別の記号に置き換えてください'
        );
        return;
      }
      if (row.category.includes('|')) {
        setGenerateError(
          '料金区分に | を含めることはできません。半角 | を別の記号に置き換えてください'
        );
        return;
      }
    }

    const emptyId = tickets.find((t) => !t.id.trim());
    if (emptyId) {
      setGenerateError('チケットIDが空の行があります');
      return;
    }
    const unsafeIdRow = tickets.find((t) => !isSafeTicketId(t.id.trim()));
    if (unsafeIdRow) {
      setGenerateError(
        'チケットIDは英数字・ピリオド・アンダースコア・ハイフンのみ、64 文字以内で入力してください'
      );
      return;
    }

    const longTicket = tickets.find((t) => {
      const payload: TicketPayload = {
        e: eventId.trim(),
        t: t.id.trim(),
        timestamp: Math.floor(new Date(expiry).getTime() / 1000),
        n: t.name.trim() || undefined,
        p: t.category.trim() || undefined,
      };
      return estimateTicketByteSize(payload) > MAX_QR_BYTE_SIZE;
    });

    if (longTicket) {
      setGenerateError(
        `データ量が上限（${MAX_QR_BYTE_SIZE}バイト）を超えているチケットがあります。`
      );
      return;
    }

    setGenerating(true);
    try {
      const results: GeneratedQr[] = [];
      for (const row of tickets) {
        const payload: TicketPayload = {
          e: eventId.trim(),
          t: row.id.trim(),
          timestamp: Math.floor(new Date(expiry).getTime() / 1000),
          ...(row.name.trim() ? { n: row.name.trim() } : {}),
          ...(row.category.trim() ? { p: row.category.trim() } : {}),
        };
        const signed = await signTicket(payload, cryptoKeyPair.privateKey);
        const qrString = ticketToQrString(signed);
        const svg = generateQrSvg(qrString);
        if (!svg) {
          setGenerateError(`チケット ${row.id} のQRコード生成に失敗しました（データが長すぎます）`);
          setGenerating(false);
          return;
        }
        results.push({ _key: row._key, ticket: signed, svg, qrString });
      }
      setGeneratedQrs(results);
    } catch {
      setGenerateError('QRコードの生成中にエラーが発生しました');
    } finally {
      setGenerating(false);
    }
  }, [cryptoKeyPair, eventId, expiry, tickets]);

  const downloadSvgQr = useCallback((qr: GeneratedQr) => {
    const safeName = sanitizeFilename(`ticket-${qr.ticket.t}.svg`, ['svg']);
    downloadSvg(qr.svg.replace('<svg ', '<svg width="160" height="160" '), safeName);
  }, []);

  const downloadZipQrs = useCallback(async () => {
    if (generatedQrs.length === 0 || zipping) return;
    setZipping(true);
    setZipError('');
    try {
      const files = generatedQrs.map(({ ticket, svg }) => ({
        name: sanitizeFilename(`ticket-${ticket.t}.svg`, ['svg']),
        content: svg.replace('<svg ', '<svg width="160" height="160" '),
        folder: 'tickets',
      }));
      await downloadZip(files, 'tickets.zip');
    } catch {
      setZipError('ZIPの作成に失敗しました');
    } finally {
      setZipping(false);
    }
  }, [generatedQrs, zipping]);

  return useMemo(
    () => ({
      eventId,
      expiry,
      tickets,
      generating,
      generateError,
      generatedQrs,
      zipping,
      zipError,
      setEventId,
      setExpiry,
      addTicket,
      removeTicket,
      updateTicket,
      generate,
      downloadSvgQr,
      downloadZipQrs,
    }),
    [
      eventId,
      expiry,
      tickets,
      generating,
      generateError,
      generatedQrs,
      zipping,
      zipError,
      setEventId,
      setExpiry,
      addTicket,
      removeTicket,
      updateTicket,
      generate,
      downloadSvgQr,
      downloadZipQrs,
    ]
  );
}
