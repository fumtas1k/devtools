import { test, expect } from 'vitest';
import qrcode from '@/utils/qrcode';

// QRコードのバージョンごとの最大データ量（誤り訂正M）
// https://www.qrcode.com/about/version.html
// バージョン13: 339バイト
// バージョン14: 385バイト
// バージョン15: 444バイト

test('QRチケットのバイト数ベース限界調査', () => {
  const DISPLAY_SIZE = 160;
  const dummySig = 'a'.repeat(86); // P-256 Base64URL

  console.log('| 日本語文字数 | 合計バイト数 | QRバージョン | セルサイズ(px) | 判定 |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');

  for (let len = 40; len <= 100; len += 5) {
    const name = 'あ'.repeat(len);
    const data = `EVENT-ID|T-00001|1777287600|${name}|一般|${dummySig}`;
    const bytes = new TextEncoder().encode(data).length;

    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const version = (moduleCount - 17) / 4;
    const cellSize = DISPLAY_SIZE / moduleCount;

    let status = 'OK';
    if (cellSize < 2.2) status = '⚠️ 不安定';
    if (cellSize < 2.0) status = '❌ 読取不可';

    console.log(`| ${len} | ${bytes} | ${version} | ${cellSize.toFixed(2)} | ${status} |`);
  }
});
