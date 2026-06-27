import { describe, it, expect } from 'vitest';
import { toCsv, toJson } from '@/utils/dummy-personal-data/serialize';
import type { PersonRecord, FieldKey } from '@/utils/dummy-personal-data/types';

const rec: PersonRecord = {
  name: '佐藤 大翔',
  kana: 'さとう はると',
  gender: '男',
  birthday: '2000年01月02日',
  age: '26',
  postalCode: '100-0001',
  address: '東京都千代田区千代田1丁目2-3',
  phone: '03-1234-5678',
  mobile: '090-0123-4567',
  email: 'sato.haruto@example.com',
};

describe('toCsv', () => {
  it('BOM 付き・選択フィールドのみをヘッダ＋行で出力', () => {
    const fields: FieldKey[] = ['name', 'age'];
    const csv = toCsv([rec], fields);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const body = csv.slice(1);
    expect(body.split(/\r?\n/)[0]).toBe('氏名,年齢');
    expect(body).toContain('佐藤 大翔');
    expect(body).not.toContain('さとう'); // kana は非選択
  });

  it('陽性対照: CSV 数式インジェクション値は toCsv 経由でエスケープされる', () => {
    // 先頭が = の値は escapeCsvFormula で ' を前置される（本シリアライズ経路での発火を担保）
    const evil: PersonRecord = { ...rec, name: '=1+1' };
    const csv = toCsv([evil], ['name']);
    expect(csv).toContain("'=1+1");
    // 通常値（先頭が記号でない）は素通し（過剰エスケープしない）
    const normal = toCsv([rec], ['name']);
    expect(normal).toContain('佐藤 大翔');
    expect(normal).not.toContain("'佐藤");
  });
});

describe('toJson', () => {
  it('選択フィールドのみのオブジェクト配列を JSON 文字列化', () => {
    const json = toJson([rec], ['name', 'email']);
    const parsed = JSON.parse(json);
    expect(parsed[0]).toEqual({ 氏名: '佐藤 大翔', メールアドレス: 'sato.haruto@example.com' });
  });
});
