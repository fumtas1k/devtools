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

/** NotOnOrAfter を現在時刻基準で生成する LogoutRequest XML（実時刻でチェックが走るため動的に組む） */
function logoutRequestXml(opts: { notOnOrAfterOffsetMs: number }): string {
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const now = Date.now();
  return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lq" Version="2.0" IssueInstant="${iso(now)}" Destination="https://idp.example.com/slo" NotOnOrAfter="${iso(now + opts.notOnOrAfterOffsetMs)}">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <saml:NameID>taro@example.com</saml:NameID>
  <samlp:SessionIndex>_s1</samlp:SessionIndex>
</samlp:LogoutRequest>`;
}

/** 二段階ステータスで失敗する LogoutResponse（時刻非依存のため静的でよい） */
const FAILED_LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lr" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder">
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:RequestDenied"/>
    </samlp:StatusCode>
    <samlp:StatusMessage>Session not found</samlp:StatusMessage>
  </samlp:Status>
</samlp:LogoutResponse>`;

/** UTF-8 → base64url（パディングなし、`-`/`_` 表記） */
function toBase64Url(xml: string): string {
  const bytes = new TextEncoder().encode(xml);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

  test('base64url（- _ を含みパディングなし）でエンコードした Response も正常にデコードされる', async ({
    page,
  }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(toBase64Url(responseXml({ notOnOrAfterOffsetMs: 300_000 })));
    await expect(page.getByText('Response サマリ')).toBeVisible();
    await expect(page.getByText('taro@example.com').first()).toBeVisible();
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

  test('LogoutRequest を貼るとサマリとチェックリストが表示される', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(logoutRequestXml({ notOnOrAfterOffsetMs: 300_000 }));
    await expect(page.getByText('LogoutRequest サマリ')).toBeVisible();
    await expect(page.getByText('https://sp.example.com/metadata').first()).toBeVisible();
    await expect(page.getByText('_s1').first()).toBeVisible();
    await expect(page.getByText('期限内です', { exact: false })).toBeVisible();
    await expect(page.getByText('チェックリスト')).toBeVisible();
  });

  test('陽性対照: 期限切れ LogoutRequest はエラー表示になる', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(logoutRequestXml({ notOnOrAfterOffsetMs: -300_000 }));
    await expect(page.getByText('期限切れです', { exact: false })).toBeVisible();
  });

  test('陽性対照: Status 失敗の LogoutResponse はエラー表示になる', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(FAILED_LOGOUT_RESPONSE_XML);
    await expect(page.getByText('LogoutResponse サマリ')).toBeVisible();
    await expect(page.getByText('Responder / RequestDenied', { exact: false })).toBeVisible();
    // 'Session not found' 単体だと raw XML 表示・整形済み XML 表示にも同一文字列が
    // 含まれ strict mode violation になるため、チェックリストが生成する文言で一意に絞り込む
    await expect(
      page.getByText('StatusMessage: Session not found', { exact: false })
    ).toBeVisible();
  });

  test('マスク XML トグルで PII がトークン化されコピー対象も切替わる', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプル' }).click();
    await expect(page.getByText('Response サマリ')).toBeVisible();

    // 整形済み XML の details を開く
    await page.getByText('整形済み XML（簡易整形）').click();

    // 生 XML モードでは NameID のメールが表示される
    const xmlBlock = page.locator('pre').last();
    await expect(xmlBlock).toContainText('taro.yamada@example.com');

    // マスク XML に切替
    await page.getByRole('button', { name: 'マスク XML（共有用）' }).click();
    await expect(xmlBlock).not.toContainText('taro.yamada@example.com');
    await expect(xmlBlock).toContainText('[REDACTED:PII_');
    await expect(xmlBlock).not.toContainText('山田 太郎');

    // 件数バッジが表示される
    await expect(page.getByText(/PII \d+ 件・機密 \d+ 件をマスク/)).toBeVisible();
  });
});
