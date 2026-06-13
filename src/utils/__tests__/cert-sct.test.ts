import { describe, it, expect } from 'vitest';
import { decodeSct } from '@/utils/cert/sct';

describe('decodeSct', () => {
  it('1件の SCT を含む TLS リストをデコードする', () => {
    // 手組み: outer list length(2) + sct length(2) + version(1=0x00)
    //   + logId(32) + timestamp(8) + extLen(2=0x0000) + sigAlg(2) + sigLen(2)+sig
    const logId = new Uint8Array(32).fill(0xab);
    const ts = 1700000000000; // ms
    const sctBody: number[] = [0x00, ...logId];
    // timestamp 8 bytes big-endian
    for (let i = 7; i >= 0; i--) sctBody.push(Number((BigInt(ts) >> BigInt(i * 8)) & 0xffn));
    sctBody.push(0x00, 0x00); // extensions length 0
    sctBody.push(0x04, 0x03); // signature hash/alg (dummy)
    sctBody.push(0x00, 0x02, 0x30, 0x00); // sig len 2 + 2 bytes
    const sctLen = sctBody.length;
    const inner = [Math.floor(sctLen / 256), sctLen % 256, ...sctBody];
    const outer = [Math.floor(inner.length / 256), inner.length % 256, ...inner];
    const r = decodeSct(new Uint8Array(outer));
    expect(r).toHaveLength(1);
    expect(r[0].version).toBe(0);
    expect(r[0].timestamp).toBe(ts);
    expect(r[0].logId).toBe('ab'.repeat(32));
  });

  it('壊れた入力では空配列を返す（throw しない）', () => {
    expect(decodeSct(new Uint8Array([0xff]))).toEqual([]);
  });
});
