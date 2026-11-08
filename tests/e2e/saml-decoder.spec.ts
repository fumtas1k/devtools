import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { waitForReactHydration, withProductionCsp } from './helpers';

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

  test('陽性対照: XML サイズ超過を表示し、通常の入力で復帰する', async ({ page }) => {
    test.setTimeout(90_000);
    const input = page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/);
    // ブラウザ内で生成し、巨大な文字列を Playwright の転送経路に載せない。
    await input.evaluate((element) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(element, `<a>${'x'.repeat(32 * 1024 * 1024 - 6)}</a>`);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.getByText('XML のサイズが上限（UTF-8 で 32 MiB）を超えました')).toBeVisible();
    await input.fill(AUTHN_REQUEST_XML);
    await expect(page.getByText('AuthnRequest サマリ')).toBeVisible();
    await expect(page.getByText('XML のサイズが上限（UTF-8 で 32 MiB）を超えました')).toBeHidden();
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

test.describe('暗号化 Assertion の方式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/saml-decoder');
    await waitForReactHydration(page);
  });

  test('宣言された方式をデータと鍵ごとに安全に表示し、既存の案内も維持する', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    const longUri = `https://example.invalid/${'long'.repeat(40)}`;
    const malicious = 'urn:example:<img src=x onerror=alert(1)>';
    const xml = `<p:Response xmlns:p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:a="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:x="http://www.w3.org/2001/04/xmlenc#" xmlns:d="http://www.w3.org/2000/09/xmldsig#" xmlns:f="urn:fake">
      <d:Signature/><a:Assertion><a:Subject><a:NameID>plain-user</a:NameID></a:Subject></a:Assertion>
      <a:EncryptedAssertion><x:EncryptedData><x:EncryptionMethod Algorithm="${longUri}"/><d:KeyInfo>
        <x:EncryptedKey><x:EncryptionMethod Algorithm="urn:key:one"/></x:EncryptedKey>
        <x:EncryptedKey><x:EncryptionMethod Algorithm="urn:example:&lt;img src=x onerror=alert(1)&gt;"/></x:EncryptedKey>
      </d:KeyInfo><x:CipherData><x:EncryptionMethod Algorithm="urn:decoy"/></x:CipherData></x:EncryptedData>
      <x:EncryptedData><x:EncryptionMethod Algorithm=""/></x:EncryptedData>
      <x:EncryptedKey><x:EncryptionMethod Algorithm="urn:sibling"/></x:EncryptedKey></a:EncryptedAssertion>
      <a:EncryptedAssertion><x:EncryptedData><x:EncryptionMethod f:Algorithm="urn:fake"/></x:EncryptedData></a:EncryptedAssertion>
    </p:Response>`;
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(xml);
    const first = page
      .getByRole('heading', { name: '暗号化された Assertion 1 の方式' })
      .locator('..');
    const second = page
      .getByRole('heading', { name: '暗号化された Assertion 2 の方式' })
      .locator('..');
    await expect(first).toContainText(longUri);
    await expect(first).toContainText('urn:key:one');
    await expect(first).toContainText(malicious);
    await expect(first).toContainText('EncryptedData 2');
    await expect(first).toContainText('Assertion 直下の鍵');
    await expect(first).toContainText('urn:sibling');
    await expect(first).toContainText('未指定');
    await expect(first).not.toContainText('urn:decoy');
    await expect(second).toContainText('未指定');
    await expect(second).not.toContainText('urn:fake');
    await expect(first.locator('img, a')).toHaveCount(0);
    await expect(page.getByText('plain-user', { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        'EncryptedAssertion が 2 件含まれています。復号（秘密鍵の入力）には対応していません。'
      )
    ).toBeVisible();
    await expect(page.getByText('あり（個別に検証できます）')).toBeVisible();
    await expect(page.getByText(/署名検証は Response と直下 Assertion/)).toBeVisible();
    expect(await first.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(requested.some((url) => url.startsWith('https://example.invalid/'))).toBe(false);
  });

  test('平文のみでは暗号化方式カードを表示しない', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(responseXml({ notOnOrAfterOffsetMs: 300_000 }));
    await expect(
      page.getByRole('heading', { name: /暗号化された Assertion .* の方式/ })
    ).toHaveCount(0);
    await expect(page.getByText('taro@example.com').first()).toBeVisible();
  });

  test('明示した証明書で各対象を検証し、入力変更で結果を破棄する', async ({ page }) => {
    const fixture = (name: string) => readFileSync(`tests/fixtures/saml-signature/${name}`, 'utf8');
    const input = page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/);
    const certificate = page.getByLabel('公開証明書（PEM）');
    const results = page.getByRole('list', { name: '署名検証の結果' });
    await input.fill(fixture('multiple.xml'));
    await certificate.fill(fixture('certificate.pem'));
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await expect(results).toContainText('Assertion 1［_unsigned］：未署名');
    await expect(results).toContainText('指定証明書の公開鍵で Assertion 2［_second］の署名が一致');
    await expect(results).toContainText('指定証明書の公開鍵で Assertion 3［_third］の署名が一致');
    await certificate.fill(fixture('other-certificate.pem'));
    await expect(results).toContainText('Assertion 2［_second］：未検証');
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await expect(results).toContainText('Assertion 2［_second］：不一致');
    await input.fill(fixture('tampered-content.xml'));
    await expect(results).not.toContainText('：一致');
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByLabel('公開証明書（PEM）')).toHaveCount(0);
  });
});

test.describe('検証中の入力変更', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      class DelayedWorker {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;
        terminated = false;
        constructor() {
          (window as unknown as { delayedWorker: DelayedWorker }).delayedWorker = this;
        }
        postMessage() {}
        terminate() {
          this.terminated = true;
        }
      }
      (window as unknown as { Worker: typeof DelayedWorker }).Worker = DelayedWorker;
    });
    await page.goto('/tools/saml-decoder');
    await waitForReactHydration(page);
  });

  for (const action of ['XML', '証明書', 'クリア', 'pagehide', 'pageshow'] as const) {
    test(`${action} の変更で実行中 worker を停止し、遅延結果を破棄する`, async ({ page }) => {
      const xml = readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8');
      const pem = readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8');
      const input = page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/);
      await input.fill(xml);
      await page.getByLabel('公開証明書（PEM）').fill(pem);
      await page.getByRole('button', { name: '署名を検証する' }).click();
      await expect(page.getByText('署名を検証中です')).toBeVisible();
      if (action === 'XML') await input.fill(xml.replace('reader', 'other'));
      if (action === '証明書') await page.getByLabel('公開証明書（PEM）').fill('changed');
      if (action === 'クリア') await page.getByRole('button', { name: 'クリア' }).click();
      const terminated = await page.evaluate((type) => {
        const worker = (
          window as unknown as {
            delayedWorker: { terminated: boolean; onmessage: (event: { data: unknown }) => void };
          }
        ).delayedWorker;
        if (type === 'pagehide' || type === 'pageshow') {
          window.dispatchEvent(new PageTransitionEvent(type, { persisted: true }));
        }
        const stopped = worker.terminated;
        worker.onmessage({
          data: {
            results: [
              {
                label: 'Response',
                id: '_response',
                signed: true,
                status: 'match',
                reason: '古い一致',
              },
            ],
          },
        });
        return stopped;
      }, action);
      expect(terminated).toBe(true);
      if (action === 'pagehide' || action === 'pageshow') {
        await expect(page.getByText('署名は未検証です', { exact: true }).first()).toBeVisible();
        await expect(input).toHaveValue(xml);
        await expect(page.getByLabel('公開証明書（PEM）')).toHaveValue(pem);
      }
      if (action === 'クリア') {
        await expect(page.getByRole('list', { name: '署名検証の結果' })).toHaveCount(0);
      } else {
        await expect(page.getByRole('list', { name: '署名検証の結果' })).not.toContainText(
          '古い一致'
        );
      }
    });
  }
  test('15 秒の期限で worker を停止して未対応を表示する', async ({ page }) => {
    await page.clock.install();
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8'));
    await page
      .getByLabel('公開証明書（PEM）')
      .fill(readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8'));
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await page.clock.fastForward('00:15');
    await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText(
      '15 秒を超えたため停止'
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { delayedWorker: { terminated: boolean } }).delayedWorker.terminated
      )
    ).toBe(true);
  });
  test('worker エラーを結果として表示する', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8'));
    await page
      .getByLabel('公開証明書（PEM）')
      .fill(readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8'));
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await page.evaluate(() =>
      (
        window as unknown as { delayedWorker: { onerror: (e: Event) => void } }
      ).delayedWorker.onerror(new Event('error', { cancelable: true }))
    );
    await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText(
      '署名検証を開始できませんでした'
    );
  });
});

test('本番 CSP 下で署名を検証し、外部 DTD は通信せず拒否する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/saml-decoder', async (page) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    const input = page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/);
    const xml = readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8');
    await input.fill(xml);
    await page
      .getByLabel('公開証明書（PEM）')
      .fill(readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8'));
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText(
      'Response［_response］の署名が一致'
    );
    await input.fill(
      xml.replace('?>', '?><!DOCTYPE samlp:Response SYSTEM "https://example.invalid/evil.dtd">')
    );
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText('DTD / ENTITY');
    await input.fill(xml.replace('URI="#_response"', 'URI="https://example.invalid/external.xml"'));
    await page.getByRole('button', { name: '署名を検証する' }).click();
    await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText(
      '単一 Reference のみ対応'
    );
    expect(requested.some((url) => url.startsWith('https://example.invalid/'))).toBe(false);
  });
});

test.describe('独立生成 fixture の実 worker 検証', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/saml-decoder');
    await waitForReactHydration(page);
  });
  for (const [name, count] of [
    ['response.xml', 1],
    ['assertion.xml', 1],
    ['both.xml', 2],
    ['multiple.xml', 2],
    ['namespaces.xml', 2],
  ] as const) {
    test(`${name} の署名を表示対象ごとに照合する`, async ({ page }) => {
      await page
        .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
        .fill(readFileSync(`tests/fixtures/saml-signature/${name}`, 'utf8'));
      await page
        .getByLabel('公開証明書（PEM）')
        .fill(readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8'));
      await page.getByRole('button', { name: '署名を検証する' }).click();
      const list = page.getByRole('list', { name: '署名検証の結果' });
      await expect(list.getByText(/指定証明書の公開鍵で .*の署名が一致/)).toHaveCount(count);
      await expect(list).not.toContainText('未対応');
      await expect(list).not.toContainText('不一致');
    });
  }
});

test.describe('名前空間プロファイル', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/saml-decoder');
    await waitForReactHydration(page);
  });

  test('名前空間の未対応文字は表示を維持し署名検証だけ拒否する', async ({ page }) => {
    const xml = readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8');
    const declarations = [
      'xmlns:extra="https://example.test/ns?a=1&amp;b=2"',
      'xmlns:extra="urn:example:one two"',
      'xmlns:extra="urn:example:&quot;value"',
      'xmlns:日本語="urn:example:namespace"',
    ];
    const input = page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/);
    for (const declaration of declarations) {
      await input.fill(xml.replace('<samlp:Response ', `<samlp:Response ${declaration} `));
      await expect(page.getByText('alice@example.test', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '署名を検証する' }).click();
      await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText('未対応');
      await expect(page.getByRole('list', { name: '署名検証の結果' })).toContainText('名前空間');
    }
  });

  test('通常の属性値とテキストの日本語と & は名前空間の制限対象にならない', async ({ page }) => {
    const xml = readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8')
      .replace('Destination="https://sp.example.test/acs"', 'Destination="日本語 &amp; value"')
      .replace('alice@example.test', '日本語 &amp; Alice');
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(xml);
    await expect(page.getByText('日本語 & Alice', { exact: true })).toBeVisible();
    await page
      .getByLabel('公開証明書（PEM）')
      .fill(readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8'));
    await page.getByRole('button', { name: '署名を検証する' }).click();
    const results = page.getByRole('list', { name: '署名検証の結果' });
    await expect(results).toContainText('Response［_response］：不一致');
    await expect(results).not.toContainText('名前空間');
  });
});
