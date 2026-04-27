import {
  generateKeyPair,
  signTicket,
  ticketToQrString,
  generateQrSvg,
} from './src/utils/qr-ticket';
import jsQR from 'jsqr';
import { window } from 'happy-dom'; // もし環境にあれば。なければ playwright の browser_evaluate を使う

// 調査用パラメータ
const EVENT_ID = 'EVENT-2026-04-27';
const TICKET_ID = 'T-00001';
const TIMESTAMP = '2099-12-31T23:59:59Z';
const SIGNATURE_DUMMY = 'MEQCIH6_xH_...long_signature_base64url...'; // 約86文字

async function investigate() {
  console.log('--- QRチケット文字数限界調査 (160px) ---');

  // 署名が必要なため、一度実際に署名付きQRを生成してベースの長さを測る
  const keyPair = await generateKeyPair();

  for (let len = 0; len <= 200; len += 10) {
    const name = 'あ'.repeat(len); // 日本語（3バイト/文字相当）でテスト
    const payload = { e: EVENT_ID, t: TICKET_ID, x: TIMESTAMP, n: name, p: '一般' };
    const signed = await signTicket(payload, keyPair.privateKey);
    const qrString = ticketToQrString(signed);

    // ここで QRコードの「密度」と「読み取り成功率」を計測したい
    // 文字数、バイト数、QRバージョンを記録
    console.log(
      `Length: ${len}, Total Bytes: ${new TextEncoder().encode(qrString).length}, String: ${qrString.substring(0, 30)}...`
    );
  }
}
