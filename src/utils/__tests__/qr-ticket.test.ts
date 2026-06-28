import { describe, it, expect } from 'vitest';
import {
  serializeTicket,
  parseQrString,
  generateKeyPair,
  exportKeyPair,
  importPrivateKey,
  importPublicKey,
  signTicket,
  verifyTicket,
  ticketToQrString,
  generateQrSvg,
  generateTicketId,
  estimateTicketByteSize,
  type TicketPayload,
  type SignedTicket,
} from '@/utils/qr-ticket';

// ────────────────────────────────────────────
// generateTicketId
// ────────────────────────────────────────────
describe('generateTicketId', () => {
  it('1桁の連番を5桁ゼロ埋めでフォーマットする', () => {
    expect(generateTicketId(1)).toBe('T-00001');
  });

  it('2桁の連番を正しくフォーマットする', () => {
    expect(generateTicketId(10)).toBe('T-00010');
  });

  it('5桁の連番をそのままフォーマットする', () => {
    expect(generateTicketId(99999)).toBe('T-99999');
  });
});

// ────────────────────────────────────────────
// estimateTicketByteSize
// ────────────────────────────────────────────
describe('estimateTicketByteSize', () => {
  it('署名込みのバイト数を正しく見積もる（日本語なし）', () => {
    const payload: TicketPayload = { e: 'ev', t: 'T-1', timestamp: 1704067200 };
    // ev|T-1|1704067200|| (19 bytes) + | (1 byte) + signature (86 bytes) = 106 bytes
    expect(estimateTicketByteSize(payload)).toBe(106);
  });

  it('日本語を含む場合も正確なバイト数を計算する', () => {
    const payload: TicketPayload = { e: 'ev', t: 'T-1', timestamp: 1704067200, n: 'あ' };
    // ev|T-1|1704067200|あ| (22 bytes) + | + signature = 109 bytes
    expect(estimateTicketByteSize(payload)).toBe(109);
  });
});

// ────────────────────────────────────────────
// serializeTicket
// ────────────────────────────────────────────
describe('serializeTicket', () => {
  const base: TicketPayload = { e: 'event-01', t: 'T-00001', timestamp: 1735689540 }; // 2024-12-31T23:59:00Z

  it('必須フィールドのみでパイプ区切りの文字列を返す', () => {
    expect(serializeTicket(base)).toBe('event-01|T-00001|1735689540||');
  });

  it('任意フィールド n, p を含む場合も正しくパイプで連結される', () => {
    const payload: TicketPayload = { ...base, n: '山田 太郎', p: 'VIP' };
    expect(serializeTicket(payload)).toBe('event-01|T-00001|1735689540|山田 太郎|VIP');
  });

  it('フィールド内に | が含まれる場合は throw する', () => {
    const payload: TicketPayload = { ...base, n: '山田|太郎', p: 'VIP|A' };
    expect(() => serializeTicket(payload)).toThrow('|');
  });

  it('同一入力で常に同一の出力を返す（決定論性）', () => {
    expect(serializeTicket(base)).toBe(serializeTicket(base));
  });

  it('任意フィールドが空文字の場合は空として連結される', () => {
    const payload: TicketPayload = { ...base, n: '', p: '' };
    expect(serializeTicket(payload)).toBe('event-01|T-00001|1735689540||');
  });

  it('timestamp が 0 の場合は "0" として連結される（serializeTicket 自体は検証しない）', () => {
    const payload: TicketPayload = { ...base, timestamp: 0 };
    expect(serializeTicket(payload)).toBe('event-01|T-00001|0||');
  });

  it('timestamp が負値の場合も文字列として連結される（検証は verifyTicket に委譲）', () => {
    const payload: TicketPayload = { ...base, timestamp: -3600 };
    expect(serializeTicket(payload)).toBe('event-01|T-00001|-3600||');
  });
});

// ────────────────────────────────────────────
// parseQrString
// ────────────────────────────────────────────
describe('parseQrString', () => {
  it('正常系: ペイロードと署名に分解できる', () => {
    const raw = 'event-01|T-00001|1735689540|山田 太郎|VIP|dummysig';
    const result = parseQrString(raw);
    expect(result).not.toBeNull();
    expect(result?.payload).toBe('event-01|T-00001|1735689540|山田 太郎|VIP');
    expect(result?.signature).toBe('dummysig');
  });

  it('任意フィールドなしでも分解できる', () => {
    const raw = 'ev|T-00001|1704067200|||sig';
    const result = parseQrString(raw);
    expect(result).not.toBeNull();
    expect(result?.signature).toBe('sig');
  });

  it('パイプなしの文字列は null を返す', () => {
    expect(parseQrString('nopipe')).toBeNull();
  });

  it('ペイロードフィールド数が不正な場合は null を返す', () => {
    // フィールドが少ない（4 フィールド + 署名）
    expect(parseQrString('a|b|c|sig')).toBeNull();
  });

  it('署名部が空文字列の場合は null を返す', () => {
    // 末尾が | で終わる（署名なし）
    expect(parseQrString('event-01|T-00001|1735689540|n|p|')).toBeNull();
  });
});

// ────────────────────────────────────────────
// ticketToQrString
// ────────────────────────────────────────────
describe('ticketToQrString', () => {
  it('ペイロードと署名をパイプで結合した文字列を返す', () => {
    const ticket: SignedTicket = {
      e: 'event-01',
      t: 'T-00001',
      timestamp: 1735689540,
      s: 'dummysig',
      n: '山田 太郎',
      p: 'VIP',
    };
    const result = ticketToQrString(ticket);
    expect(result).toBe('event-01|T-00001|1735689540|山田 太郎|VIP|dummysig');
  });

  it('任意フィールドなしでも正しい個数のパイプで結合される', () => {
    const ticket: SignedTicket = { e: 'ev', t: 'T-00001', timestamp: 1704067200, s: 'sig' };
    const result = ticketToQrString(ticket);
    expect(result).toBe('ev|T-00001|1704067200|||sig');
  });
});

// ────────────────────────────────────────────
// generateQrSvg
// ────────────────────────────────────────────
describe('generateQrSvg', () => {
  it('テキストからSVG文字列を返す', () => {
    const svg = generateQrSvg('hello');
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg');
  });

  it('空文字列はnullを返す', () => {
    expect(generateQrSvg('')).toBeNull();
  });
});

// ────────────────────────────────────────────
// 鍵操作: generateKeyPair / exportKeyPair / importPrivateKey / importPublicKey
// ────────────────────────────────────────────
describe('generateKeyPair / exportKeyPair', () => {
  it('ECDSA P-256 鍵ペアを生成してJWKエクスポートできる', async () => {
    const pair = await generateKeyPair();
    const exported = await exportKeyPair(pair);

    expect(exported.privateKey.kty).toBe('EC');
    expect(exported.privateKey.crv).toBe('P-256');
    expect(exported.privateKey.d).toBeTruthy(); // 秘密鍵成分

    expect(exported.publicKey.kty).toBe('EC');
    expect(exported.publicKey.crv).toBe('P-256');
    expect('d' in exported.publicKey).toBe(false); // 公開鍵には d がない
    expect(exported.publicKey.x).toBeTruthy();
    expect(exported.publicKey.y).toBeTruthy();
  });
});

describe('importPrivateKey / importPublicKey', () => {
  it('JWKからインポートした鍵でラウンドトリップできる', async () => {
    const pair = await generateKeyPair();
    const exported = await exportKeyPair(pair);

    const privKey = await importPrivateKey(exported.privateKey);
    const pubKey = await importPublicKey(exported.publicKey);

    expect(privKey.type).toBe('private');
    expect(pubKey.type).toBe('public');
  });
});

// ────────────────────────────────────────────
// signTicket / verifyTicket（署名・検証 E2E）
// ────────────────────────────────────────────
describe('signTicket / verifyTicket', () => {
  const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
  const payload: TicketPayload = {
    e: 'event-2026',
    t: 'T-00001',
    timestamp: futureTimestamp,
  };

  it('正常系: 署名したチケットを公開鍵で検証できる', async () => {
    const pair = await generateKeyPair();
    const signed = await signTicket(payload, pair.privateKey);
    const qrStr = ticketToQrString(signed);
    const result = await verifyTicket(qrStr, pair.publicKey);

    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.ticket?.e).toBe('event-2026');
    expect(result.ticket?.t).toBe('T-00001');
    expect(result.ticket?.timestamp).toBe(futureTimestamp);
  });

  it('改竄検知: イベントIDを書き換えると署名が無効になる', async () => {
    const pair = await generateKeyPair();
    const signed = await signTicket(payload, pair.privateKey);
    // パイプ区切り形式を模倣して改竄
    const parts = ticketToQrString(signed).split('|');
    parts[0] = 'evil-event';
    const tampered = parts.join('|');
    const result = await verifyTicket(tampered, pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('署名が無効');
  });

  it('改竄検知: チケットIDを書き換えると署名が無効になる', async () => {
    const pair = await generateKeyPair();
    const signed = await signTicket(payload, pair.privateKey);
    const parts = ticketToQrString(signed).split('|');
    parts[1] = 'T-99999';
    const tampered = parts.join('|');
    const result = await verifyTicket(tampered, pair.publicKey);

    expect(result.valid).toBe(false);
  });

  it('期限切れ検知: 過去の有効期限は expired: true を返す', async () => {
    const pair = await generateKeyPair();
    const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const expired: TicketPayload = { ...payload, timestamp: pastTimestamp };
    const signed = await signTicket(expired, pair.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('異なる鍵ペアでの検証は失敗する', async () => {
    const pair1 = await generateKeyPair();
    const pair2 = await generateKeyPair();
    const signed = await signTicket(payload, pair1.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair2.publicKey);

    expect(result.valid).toBe(false);
  });

  it('形式不正: パイプ数が足りない場合にエラーメッセージを返す', async () => {
    const pair = await generateKeyPair();
    const result = await verifyTicket('part1|part2|part3', pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('形式が不正');
  });

  it('形式不正: timestamp が数値でない場合にエラーを返す', async () => {
    const pair = await generateKeyPair();
    const incomplete = 'ev|T-00001|not-a-number|||sig';
    const result = await verifyTicket(incomplete, pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('形式が不正');
  });

  it('任意フィールド（n, p）付きチケットの署名・検証が正しく動作する', async () => {
    const pair = await generateKeyPair();
    const withOptional: TicketPayload = {
      ...payload,
      n: '山田 太郎',
      p: 'VIP',
    };
    const signed = await signTicket(withOptional, pair.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair.publicKey);

    expect(result.valid).toBe(true);
    expect(result.ticket?.n).toBe('山田 太郎');
    expect(result.ticket?.p).toBe('VIP');
  });

  it('timestamp が 0 の署名済みチケットは verifyTicket で valid: false になる', async () => {
    const pair = await generateKeyPair();
    const zeroTs: TicketPayload = { e: 'ev', t: 'T-1', timestamp: 0 };
    const signed = await signTicket(zeroTs, pair.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair.publicKey);
    expect(result.valid).toBe(false);
    // timestamp<=0 ガード経路で弾かれたことを弁別する（expired フォールバックなら expired:true / ticket:payload になり通り道違いを検出できない）
    expect(result.expired).toBe(false);
    expect(result.ticket).toBeNull();
  });

  it('timestamp が負値の署名済みチケットは verifyTicket で valid: false になる', async () => {
    const pair = await generateKeyPair();
    const negTs: TicketPayload = { e: 'ev', t: 'T-1', timestamp: -3600 };
    const signed = await signTicket(negTs, pair.privateKey);
    const result = await verifyTicket(ticketToQrString(signed), pair.publicKey);
    expect(result.valid).toBe(false);
    // timestamp<=0 ガード経路で弾かれたことを弁別する（expired フォールバックなら expired:true / ticket:payload になり通り道違いを検出できない）
    expect(result.expired).toBe(false);
    expect(result.ticket).toBeNull();
  });
});
