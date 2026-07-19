// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSamlXml, runResponseChecks } from '@/utils/saml';
import type { SamlResponseData } from '@/utils/saml';
import {
  SAMPLE_RESPONSE_XML,
  FAILED_STATUS_RESPONSE_XML,
  ENCRYPTED_ASSERTION_RESPONSE_XML,
  NESTED_STATUS_RESPONSE_XML,
} from './saml-fixtures';

function parseResponse(xml: string): SamlResponseData {
  const m = parseSamlXml(xml);
  if (m.type !== 'response') throw new Error('response expected');
  return m;
}

// フィクスチャの有効期間: 2026-07-16T23:55:00Z 〜 2026-07-17T00:05:00Z
const IN_WINDOW = new Date('2026-07-17T00:02:00Z');
const AFTER_WINDOW = new Date('2026-07-17T01:00:00Z');
const BEFORE_WINDOW = new Date('2026-07-16T23:00:00Z');

function byId(items: ReturnType<typeof runResponseChecks>, id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`check item not found: ${id}`);
  return item;
}

describe('runResponseChecks: 正常系', () => {
  const res = parseResponse(SAMPLE_RESPONSE_XML);

  it('Status Success は success', () => {
    expect(byId(runResponseChecks(res, { now: IN_WINDOW }), 'status').status).toBe('success');
  });

  it('有効期間内は success', () => {
    expect(byId(runResponseChecks(res, { now: IN_WINDOW }), 'validity-0').status).toBe('success');
  });

  it('SP entityID 未入力の Audience は info（表示のみ）', () => {
    const item = byId(runResponseChecks(res, { now: IN_WINDOW }), 'audience');
    expect(item.status).toBe('info');
    expect(item.detail).toContain('https://sp.example.com/metadata');
  });

  it('SP entityID 一致は success', () => {
    const item = byId(
      runResponseChecks(res, { now: IN_WINDOW, spEntityId: 'https://sp.example.com/metadata' }),
      'audience'
    );
    expect(item.status).toBe('success');
  });

  it('NameID ありは success', () => {
    expect(byId(runResponseChecks(res, { now: IN_WINDOW }), 'nameid').status).toBe('success');
  });
});

describe('runResponseChecks: 陽性対照（fail 側の検知能力を実証）', () => {
  it('Status Responder は error になり StatusMessage を含む', () => {
    const item = byId(runResponseChecks(parseResponse(FAILED_STATUS_RESPONSE_XML)), 'status');
    expect(item.status).toBe('error');
    expect(item.detail).toContain('Responder');
    expect(item.detail).toContain('Authentication failed');
  });

  it('期限切れ（NotOnOrAfter 経過）は error になる', () => {
    const item = byId(
      runResponseChecks(parseResponse(SAMPLE_RESPONSE_XML), { now: AFTER_WINDOW }),
      'validity-0'
    );
    expect(item.status).toBe('error');
    expect(item.detail).toContain('期限切れ');
  });

  it('NotOnOrAfter ちょうどは仕様通り期限切れ（境界値: NotOnOrAfter は排他）', () => {
    const item = byId(
      runResponseChecks(parseResponse(SAMPLE_RESPONSE_XML), {
        now: new Date('2026-07-17T00:05:00Z'),
      }),
      'validity-0'
    );
    expect(item.status).toBe('error');
  });

  it('有効期間前（NotBefore 未到達）は error になる', () => {
    const item = byId(
      runResponseChecks(parseResponse(SAMPLE_RESPONSE_XML), { now: BEFORE_WINDOW }),
      'validity-0'
    );
    expect(item.status).toBe('error');
    expect(item.detail).toContain('有効期間前');
  });

  it('SP entityID 不一致は error になる', () => {
    const item = byId(
      runResponseChecks(parseResponse(SAMPLE_RESPONSE_XML), {
        now: IN_WINDOW,
        spEntityId: 'https://other.example.com',
      }),
      'audience'
    );
    expect(item.status).toBe('error');
    expect(item.detail).toContain('不一致');
  });

  it('ネストした StatusCode は外側/内側コードを併記する', () => {
    const item = byId(runResponseChecks(parseResponse(NESTED_STATUS_RESPONSE_XML)), 'status');
    expect(item.status).toBe('error');
    expect(item.detail).toContain('Responder / RequestDenied');
    expect(item.detail).toContain('Authentication failed');
  });

  it('EncryptedAssertion のみの Response は warning になる', () => {
    const item = byId(
      runResponseChecks(parseResponse(ENCRYPTED_ASSERTION_RESPONSE_XML)),
      'assertion'
    );
    expect(item.status).toBe('warning');
    expect(item.detail).toContain('暗号化');
  });

  it('Assertion なし（失敗レスポンス）は error になる', () => {
    const item = byId(runResponseChecks(parseResponse(FAILED_STATUS_RESPONSE_XML)), 'assertion');
    expect(item.status).toBe('error');
  });
});

describe('runResponseChecks: レビュー指摘の回帰', () => {
  // Conditions の NotOnOrAfter のみをパース不能な値に差し替える
  // （SubjectConfirmationData 側の NotOnOrAfter はそのまま残す）
  const INVALID_DATE_RESPONSE_XML = SAMPLE_RESPONSE_XML.replace(
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z"',
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="not-a-date"'
  );

  it('パース不能な NotOnOrAfter は success にならず warning になる（陽性対照）', () => {
    const item = byId(
      runResponseChecks(parseResponse(INVALID_DATE_RESPONSE_XML), { now: IN_WINDOW }),
      'validity-0'
    );
    expect(item.status).toBe('warning');
    expect(item.detail).toContain('日時を解釈できません');
    expect(item.detail).toContain('not-a-date');
  });

  // NotBefore / NotOnOrAfter からタイムゾーン指定（Z）を除去
  const NO_TZ_RESPONSE_XML = SAMPLE_RESPONSE_XML.replace(
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z"',
    'NotBefore="2026-07-16T23:55:00" NotOnOrAfter="2026-07-17T00:05:00"'
  );
  // 同じ「タイムゾーン指定なし」形式で now を作ることで、実行環境の TZ に依存せず
  // 「窓内」の関係性を保つ（notBefore と notOnOrAfter は共にローカル解釈されるため）
  const NO_TZ_IN_WINDOW = new Date('2026-07-17T00:02:00');
  const NO_TZ_AFTER_WINDOW = new Date('2026-07-17T01:00:00');

  it('タイムゾーン指定なしの日時は期間内でも warning に降格し、ローカル時刻解釈の注記が付く（陽性対照）', () => {
    const item = byId(
      runResponseChecks(parseResponse(NO_TZ_RESPONSE_XML), { now: NO_TZ_IN_WINDOW }),
      'validity-0'
    );
    expect(item.status).toBe('warning');
    expect(item.detail).toContain('ローカル時刻');
  });

  it('タイムゾーン指定なしでも期限切れは error のままで、ローカル時刻解釈の注記が付く', () => {
    const item = byId(
      runResponseChecks(parseResponse(NO_TZ_RESPONSE_XML), { now: NO_TZ_AFTER_WINDOW }),
      'validity-0'
    );
    expect(item.status).toBe('error');
    expect(item.detail).toContain('ローカル時刻');
  });
});

describe('runResponseChecks: タイムゾーン判定の精度（陽性対照）', () => {
  // 時のみオフセット（±hh、分なし）に置換。ES 仕様上 TZ 指定ありと解釈される。
  // "T" 区切りだと `Date` 自体が bare hour offset を解釈できないため、Date が解釈可能な
  // スペース区切り形式で検証する（`hasTimezone` は raw 文字列末尾の正規表現マッチのみで、
  // 区切り文字には依存しないため、判定ロジックの検証としては妥当）
  const HOUR_OFFSET_TZ_RESPONSE_XML = SAMPLE_RESPONSE_XML.replace(
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z"',
    'NotBefore="2026-07-16 23:55:00+09" NotOnOrAfter="2026-07-17 00:05:00+09"'
  );
  // 上記は UTC 換算で 2026-07-16T14:55:00Z 〜 2026-07-16T15:05:00Z の窓になる
  const HOUR_OFFSET_IN_WINDOW = new Date('2026-07-16T15:00:00Z');

  it('時のみオフセット（+09）は TZ ありと判定され注記が付かない（旧実装では TZ なし扱いになり fail する）', () => {
    const item = byId(
      runResponseChecks(parseResponse(HOUR_OFFSET_TZ_RESPONSE_XML), {
        now: HOUR_OFFSET_IN_WINDOW,
      }),
      'validity-0'
    );
    expect(item.status).toBe('success');
    expect(item.detail).not.toContain('※');
  });

  // 日付のみ形式（YYYY-MM-DD）に置換。ES 仕様上 UTC (00:00Z) 解釈が確定する
  const DATE_ONLY_RESPONSE_XML = SAMPLE_RESPONSE_XML.replace(
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z"',
    'NotBefore="2026-07-16" NotOnOrAfter="2026-07-17"'
  );
  const DATE_ONLY_IN_WINDOW = new Date('2026-07-16T12:00:00Z');

  it('日付のみ形式は UTC (00:00Z) 解釈の専用注記になり、ローカル時刻注記にはならない（陽性対照）', () => {
    const item = byId(
      runResponseChecks(parseResponse(DATE_ONLY_RESPONSE_XML), { now: DATE_ONLY_IN_WINDOW }),
      'validity-0'
    );
    expect(item.detail).toContain('UTC (00:00Z)');
    expect(item.detail).not.toContain('ローカル時刻');
  });
});

describe('runResponseChecks: 年月のみ形式・混在注記（レビュー指摘の回帰、陽性対照）', () => {
  // 年月のみ形式（YYYY-MM）に置換。末尾の "-07" が旧実装の hasTimezone 正規表現
  // （時刻部の有無を問わず末尾 ±hh にマッチ）に誤マッチし、TZ ありと誤判定されていた
  const YEAR_MONTH_RESPONSE_XML = SAMPLE_RESPONSE_XML.replace(
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z"',
    'NotBefore="2026-07" NotOnOrAfter="2026-08"'
  );
  const YEAR_MONTH_IN_WINDOW = new Date('2026-07-16T12:00:00Z');

  it('年月のみ形式（YYYY-MM）は UTC (00:00Z) 解釈の専用注記になる（旧実装では TZ あり誤判定で注記なしになり fail する）', () => {
    const item = byId(
      runResponseChecks(parseResponse(YEAR_MONTH_RESPONSE_XML), { now: YEAR_MONTH_IN_WINDOW }),
      'validity-0'
    );
    expect(item.detail).toContain('UTC (00:00Z)');
    expect(item.detail).not.toContain('ローカル時刻');
  });

  // NotBefore は日付のみ（dateOnly）、NotOnOrAfter はタイムゾーン指定なし日時（missingTimezone）
  // という混在ケース。now は NotOnOrAfter と同じ「タイムゾーン指定なし」形式で組み立てることで、
  // 実行環境の TZ に依存せず NotOnOrAfter との窓内関係を保つ（NO_TZ 系テストと同じ手法）
  const MIXED_RESPONSE_XML = SAMPLE_RESPONSE_XML.replace(
    'NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z"',
    'NotBefore="2026-07-16" NotOnOrAfter="2026-07-17T00:05:00"'
  );
  const MIXED_IN_WINDOW = new Date('2026-07-17T00:02:00');

  it('dateOnly と missingTimezone が混在する場合、UTC 注記とローカル時刻注記が両方付く（旧実装では排他分岐で UTC 注記のみになり fail する）', () => {
    const item = byId(
      runResponseChecks(parseResponse(MIXED_RESPONSE_XML), { now: MIXED_IN_WINDOW }),
      'validity-0'
    );
    expect(item.detail).toContain('UTC (00:00Z)');
    expect(item.detail).toContain('ローカル時刻');
  });
});

describe('runResponseChecks: 複数 AudienceRestriction の AND 判定（陽性対照）', () => {
  // 2 restriction、両方に SP entityID を含む
  const TWO_RESTRICTIONS_BOTH_MATCH_XML = SAMPLE_RESPONSE_XML.replace(
    '<saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>',
    '<saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>' +
      '<saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience><saml:Audience>https://partner.example.com/metadata</saml:Audience></saml:AudienceRestriction>'
  );

  // 2 restriction、SP entityID は片方の restriction にしか含まれない
  const TWO_RESTRICTIONS_ONE_MISMATCH_XML = SAMPLE_RESPONSE_XML.replace(
    '<saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>',
    '<saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>' +
      '<saml:AudienceRestriction><saml:Audience>https://other.example.com/metadata</saml:Audience></saml:AudienceRestriction>'
  );

  it('すべての AudienceRestriction に entityID が含まれる場合は一致する', () => {
    const item = byId(
      runResponseChecks(parseResponse(TWO_RESTRICTIONS_BOTH_MATCH_XML), {
        now: IN_WINDOW,
        spEntityId: 'https://sp.example.com/metadata',
      }),
      'audience'
    );
    expect(item.status).toBe('success');
  });

  it('片方の AudienceRestriction にしか entityID が含まれない場合は不一致になる（旧 flatten 実装では誤って一致してしまい fail する）', () => {
    const item = byId(
      runResponseChecks(parseResponse(TWO_RESTRICTIONS_ONE_MISMATCH_XML), {
        now: IN_WINDOW,
        spEntityId: 'https://sp.example.com/metadata',
      }),
      'audience'
    );
    expect(item.status).toBe('error');
  });
});
