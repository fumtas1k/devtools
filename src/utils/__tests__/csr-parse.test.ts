/**
 * csr-parse.test.ts
 *
 * parseCsr のユニットテスト。
 *   - 陰性対照: 正常 CSR から Subject/SAN/公開鍵/署名アルゴリズムを抽出、verify=true
 *   - 陽性対照（test-gates）: 署名を改竄した CSR は signatureValid=false を返す
 *     ※「常に true を返す空回り検証」だとこのテストが fail する設計
 */
import { describe, it, expect } from 'vitest';
import { generateCsr } from '@/utils/csr/generate';
import { parseCsr } from '@/utils/csr/parse';

async function makeValidCsrPem(): Promise<string> {
  const r = await generateCsr({
    algorithm: 'RSA',
    rsaModulusLength: 2048,
    ecCurve: 'P-256',
    subject: {
      commonName: 'parse.example.test',
      organization: 'ParseOrg',
      organizationalUnit: '',
      country: 'JP',
      state: '',
      locality: '',
      email: '',
    },
    san: [{ type: 'dns', value: 'alt.example.test' }],
  });
  return r.csrPem;
}

describe('parseCsr（陰性対照: 正常系）', () => {
  it('正常 CSR から Subject/SAN/公開鍵を抽出し署名検証が true', async () => {
    const pem = await makeValidCsrPem();
    const result = await parseCsr(pem);
    expect(result.error).toBeUndefined();
    expect(result.subjectAttributes.find((a) => a.type === 'CN')?.value).toBe(
      'parse.example.test'
    );
    expect(result.san).toContain('DNS:alt.example.test');
    expect(result.publicKey.algorithm).toBe('RSA');
    expect(result.publicKey.keySizeBits).toBe(2048);
    expect(result.signatureValid).toBe(true);
  });

  it('CSR でない入力は error を返す', async () => {
    const result = await parseCsr('not a csr');
    expect(result.error).toBeDefined();
  });
});

describe('parseCsr（陽性対照: 改竄検出 / test-gates）', () => {
  it('署名値を改竄した CSR は signatureValid=false を返す', async () => {
    const pem = await makeValidCsrPem();
    // PEM 本文の base64 を 1 文字書き換えて署名を破壊する。
    // 末尾付近（署名ビット列に当たりやすい）の英大文字を別の文字に変える。
    const lines = pem.split('\n');
    const bodyEnd = lines.length - 2; // 最終行（END 行の1つ前）
    const line = lines[bodyEnd];
    // base64 の途中文字を反転（A<->B 等）して確実に別バイトにする
    const idx = Math.floor(line.length / 2);
    const c = line[idx];
    const swapped = c === 'A' ? 'B' : 'A';
    lines[bodyEnd] = line.slice(0, idx) + swapped + line.slice(idx + 1);
    const tampered = lines.join('\n');

    const result = await parseCsr(tampered);
    // パース自体は通り得るが、署名検証は不整合になる
    expect(result.signatureValid).toBe(false);
  });
});
