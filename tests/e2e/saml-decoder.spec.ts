import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/** 有効期間を現在時刻基準で生成する Response XML（E2E は実時刻でチェックが走るため動的に組む） */
function responseXml(opts: { notOnOrAfterOffsetMs: number; statusCode?: string }): string {
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const now = Date.now();
  const status = opts.statusCode ?? 'urn:oasis:names:tc:SAML:2.0:status:Success';
  return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r" Version="2.0" IssueInstant="${iso(now)}" Destination="https://sp.example.com/acs">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="${status}"/></samlp:Status>
  <saml:Assertion ID="_a" Version="2.0" IssueInstant="${iso(now)}">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro@example.com</saml:NameID></saml:Subject>
    <saml:Conditions NotBefore="${iso(now - 300_000)}" NotOnOrAfter="${iso(now + opts.notOnOrAfterOffsetMs)}">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="mail"><saml:AttributeValue>taro@example.com</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
}

const AUTHN_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_q" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://idp.example.com/sso" AssertionConsumerServiceURL="https://sp.example.com/acs">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
</samlp:AuthnRequest>`;

test.describe('SAMLデコーダ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/saml-decoder');
    // client:load の Astro island hydration 完了前に fill() すると入力イベントが
    // React にバインドされておらず state 更新が発生しない（サンドボックス環境で
    // 特に顕在化する race）。hydration 完了を正典 helper で待ってから操作する。
    await waitForReactHydration(page);
  });

  test('有効な Response を貼ると内容とチェックリストが表示される', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(responseXml({ notOnOrAfterOffsetMs: 300_000 }));
    await expect(page.getByText('Response サマリ')).toBeVisible();
    await expect(page.getByText('https://idp.example.com/metadata').first()).toBeVisible();
    await expect(page.getByText('taro@example.com').first()).toBeVisible();
    await expect(page.getByText('有効期間内です', { exact: false })).toBeVisible();
    await expect(page.getByText('チェックリスト')).toBeVisible();
  });

  test('サンプルボタンでデコード結果が表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプル' }).click();
    await expect(page.getByText('Response サマリ')).toBeVisible();
    await expect(page.getByText('HTTP-POST binding', { exact: false }).first()).toBeVisible();
  });

  test('陽性対照: 期限切れ Response はエラー表示になる', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(responseXml({ notOnOrAfterOffsetMs: -300_000 }));
    await expect(page.getByText('期限切れです', { exact: false })).toBeVisible();
  });

  test('陽性対照: Status Responder はエラー表示になる', async ({ page }) => {
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(
      responseXml({
        notOnOrAfterOffsetMs: 300_000,
        statusCode: 'urn:oasis:names:tc:SAML:2.0:status:Responder',
      })
    );
    await expect(page.getByText('Success ではありません', { exact: false })).toBeVisible();
  });

  test('陽性対照: SP entityID 不一致はエラー表示になる', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(responseXml({ notOnOrAfterOffsetMs: 300_000 }));
    await page.getByLabel(/SP entityID/).fill('https://other.example.com/metadata');
    await expect(page.getByText('SP entityID と不一致です', { exact: false })).toBeVisible();
  });

  test('AuthnRequest はサマリのみ表示されチェックリストは出ない', async ({ page }) => {
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(AUTHN_REQUEST_XML);
    await expect(page.getByText('AuthnRequest サマリ')).toBeVisible();
    await expect(page.getByText('https://sp.example.com/acs').first()).toBeVisible();
    await expect(page.getByText('チェックリスト')).toBeHidden();
  });

  test('不正な入力はエラーメッセージが表示される', async ({ page }) => {
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill('これはSAMLではない');
    await expect(page.getByText('base64 として解釈できません', { exact: false })).toBeVisible();
  });
});
