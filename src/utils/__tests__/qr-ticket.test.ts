import { describe, it, expect } from 'vitest';
import {
  buildPayload,
  generateKeyPair,
  exportKeyPair,
  importPrivateKey,
  importPublicKey,
  signTicket,
  verifyTicket,
  ticketToQrString,
  generateQrSvg,
  generateTicketId,
  type TicketPayload,
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
// buildPayload
// ────────────────────────────────────────────
describe('buildPayload', () => {
  const base: TicketPayload = { e: 'event-01', t: 'T-00001', x: '2026-12-31T23:59' };

  it('必須フィールドのみでキー昇順ソートされたJSONを返す', () => {
    const result = buildPayload(base);
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(['e', 't', 'x']);
    expect(parsed.e).toBe('event-01');
    expect(parsed.t).toBe('T-00001');
    expect(parsed.x).toBe('2026-12-31T23:59');
  });

  it('任意フィールド n, p を含む場合もキー昇順に並ぶ', () => {
    const payload: TicketPayload = { ...base, n: '山田 太郎', p: 'VIP' };
    const result = buildPayload(payload);
    const keys = Object.keys(JSON.parse(result));
    expect(keys).toEqual([...keys].sort());
  });

  it('同一入力で常に同一の出力を返す（決定論性）', () => {
    expect(buildPayload(base)).toBe(buildPayload(base));
  });

  it('任意フィールドが空文字の場合はペイロードに含まれない', () => {
    const payload: TicketPayload = { ...base, n: '', p: '' };
    const parsed = JSON.parse(buildPayload(payload));
    expect('n' in parsed).toBe(false);
    expect('p' in parsed).toBe(false);
  });
});

// ────────────────────────────────────────────
// ticketToQrString
// ────────────────────────────────────────────
describe('ticketToQrString', () => {
  it('全フィールドをキー昇順ソートしたJSONを返す', () => {
    const ticket = {
      e: 'event-01',
      t: 'T-00001',
      x: '2026-12-31T23:59',
      s: 'dummysig',
      n: '山田 太郎',
      p: 'VIP',
    };
    const result = ticketToQrString(ticket);
    const keys = Object.keys(JSON.parse(result));
    expect(keys).toEqual([...keys].sort());
  });

  it('任意フィールドなしで正しいJSONを返す', () => {
    const ticket = { e: 'ev', t: 'T-00001', x: '2026-01-01T00:00', s: 'sig' };
    const parsed = JSON.parse(ticketToQrString(ticket));
    expect(parsed.e).toBe('ev');
    expect(parsed.t).toBe('T-00001');
    expect(parsed.s).toBe('sig');
    expect('n' in parsed).toBe(false);
    expect('p' in parsed).toBe(false);
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
    expect(exported.privateKey.d).toBeTruthy();   // 秘密鍵成分

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
  const payload: TicketPayload = {
    e: 'event-2026',
    t: 'T-00001',
    x: '2099-12-31T23:59',  // 十分先の日時
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
  });

  it('改竄検知: イベントIDを書き換えると署名が無効になる', async () => {
    const pair = await generateKeyPair();
    const signed = await signTicket(payload, pair.privateKey);
    const tampered = { ...signed, e: 'evil-event' };
    const result = await verifyTicket(JSON.stringify(tampered), pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('署名が無効');
  });

  it('改竄検知: チケットIDを書き換えると署名が無効になる', async () => {
    const pair = await generateKeyPair();
    const signed = await signTicket(payload, pair.privateKey);
    const tampered = { ...signed, t: 'T-99999' };
    const result = await verifyTicket(JSON.stringify(tampered), pair.publicKey);

    expect(result.valid).toBe(false);
  });

  it('期限切れ検知: 過去の有効期限は expired: true を返す', async () => {
    const pair = await generateKeyPair();
    const expired: TicketPayload = { ...payload, x: '2000-01-01T00:00' };
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

  it('不正JSON: パース失敗でエラーメッセージを返す', async () => {
    const pair = await generateKeyPair();
    const result = await verifyTicket('not-json', pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('形式が不正');
  });

  it('必須フィールド欠落: e がないとエラーメッセージを返す', async () => {
    const pair = await generateKeyPair();
    const incomplete = JSON.stringify({ t: 'T-00001', x: '2099-01-01T00:00', s: 'sig' });
    const result = await verifyTicket(incomplete, pair.publicKey);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('必須フィールド');
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
});
