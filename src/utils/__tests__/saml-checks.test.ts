// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSamlXml, runResponseChecks } from '@/utils/saml';
import type { SamlResponseData } from '@/utils/saml';
import {
  SAMPLE_RESPONSE_XML,
  FAILED_STATUS_RESPONSE_XML,
  ENCRYPTED_ASSERTION_RESPONSE_XML,
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
