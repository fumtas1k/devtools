import { describe, it, expect } from 'vitest';
import { detectInput } from '@/utils/cert/detect';

const PEM_CERT = `-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----`;

describe('detectInput', () => {
  it('空入力は empty を返す', () => {
    expect(detectInput('').kind).toBe('empty');
    expect(detectInput('   \n  ').kind).toBe('empty');
  });

  it('PEM の CERTIFICATE ブロックを複数抽出する', () => {
    const twoBlocks = `${PEM_CERT}\n${PEM_CERT}`;
    const r = detectInput(twoBlocks);
    expect(r.kind).toBe('pem');
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0].source).toBe('pem');
  });

  it('PKCS#12 の PEM ヘッダ（ENCRYPTED PRIVATE KEY を含む pfx 由来）ではなく、PRIVATE KEY のみは未対応扱いにしない', () => {
    // CERTIFICATE ブロックが1つも無ければ unknown
    const keyOnly = `-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----`;
    expect(detectInput(keyOnly).kind).toBe('unknown');
  });

  // discriminating power は「候補ゼロ」ではなく実行時間で担保する。
  // END マーカー無し入力は新旧どちらの regex でも論理的に 0 件になるため、
  // 候補数だけでは旧 quadratic 実装を検知できない（検知ゼロで green になりうる）。
  // 旧 `([\s\S]*?)` は ~1.4MB 入力で O(n^2)（数十秒規模）になり 1000ms timeout で FAIL、
  // 新 `[A-Za-z0-9+/=\s]*`（`-` を含まない）は線形で数 ms で完了するため、
  // 明示 timeout が線形性を正面から検証するゲートになる。
  it(
    'END マーカーの無い大量の BEGIN を線形時間で処理する（quadratic ReDoS 回帰防止）',
    { timeout: 1000 },
    () => {
      const adversarial = '-----BEGIN CERTIFICATE-----\n'.repeat(50000);
      const r = detectInput(adversarial);
      expect(r.candidates).toHaveLength(0);
    }
  );

  it('改行入りの base64 本文を持つ正常な PEM を抽出する（修正後も機能維持）', () => {
    const pem = `-----BEGIN CERTIFICATE-----\nMIIBAgMBAAE=\nAQID\n-----END CERTIFICATE-----`;
    const r = detectInput(pem);
    expect(r.kind).toBe('pem');
    expect(r.candidates).toHaveLength(1);
  });
});
