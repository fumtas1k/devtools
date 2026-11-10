import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { waitForReactHydration, withProductionCsp } from './helpers';

const read = (name: string) => readFileSync(`tests/fixtures/saml-encryption/${name}`, 'utf8');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const captured: string[] = [];
    Object.defineProperty(window, '__samlClipboard', { value: captured });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          captured.push(text);
        },
      },
      configurable: true,
    });
  });
  await page.goto('/tools/saml-decoder');
  await waitForReactHydration(page);
});
for (const name of [
  'xmlsec-aes128.xml',
  'xmlsec-aes256.xml',
  'xmlsec-aes128-oaep11.xml',
  'xmlsec-aes256-oaep11.xml',
]) {
  test(`${name} を Worker で復号し結果を分離する`, async ({ page }) => {
    const transmissions: string[] = [];
    const logs: string[] = [];
    page.on('request', (req) => transmissions.push(req.url(), req.postData() ?? ''));
    page.on('console', (message) => logs.push(message.text()));
    const original = read(name);
    const key = read('trial-key.pem');
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(original);
    await page.getByLabel('復号する Assertion').selectOption('0');
    await page.getByLabel('秘密鍵（PKCS#8 PEM）').fill(key);
    await page.getByRole('button', { name: '復号する', exact: true }).click();
    await expect(page.getByLabel('秘密鍵（PKCS#8 PEM）')).toHaveValue('');
    await expect(
      page.getByRole('heading', { name: '暗号化された Assertion 1 の復号結果（署名未検証）' })
    ).toBeVisible();
    await expect(page.getByText('[REDACTED:PII_1]', { exact: false })).toBeVisible();
    await expect(page.getByText('試験太郎', { exact: false })).toHaveCount(0);
    await expect(page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)).toHaveValue(original);
    const clipboard = () =>
      page.evaluate(() => (window as unknown as { __samlClipboard: string[] }).__samlClipboard);
    expect(await clipboard()).toHaveLength(0);
    await page.getByRole('button', { name: '復号結果をコピー' }).click();
    expect((await clipboard())[0]).toContain('[REDACTED:PII_1]');
    expect((await clipboard())[0]).not.toContain('試験太郎');
    await page.getByRole('button', { name: '復号した XML', exact: true }).click();
    await expect(page.getByText('試験太郎', { exact: false })).toBeVisible();
    expect(transmissions.join('\n')).not.toContain(key);
    expect(transmissions.join('\n')).not.toContain('試験太郎');
    expect(logs.join('\n')).not.toContain(key);
    expect(logs.join('\n')).not.toContain('試験太郎');
    const stored = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })
    );
    expect(stored).not.toContain(key);
    expect(stored).not.toContain('試験太郎');
  });
}

test('本番 CSP 下で独立 fixture を復号する', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/saml-decoder', async (page) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(read('xmlsec-aes256-oaep11.xml'));
    await page.getByLabel('復号する Assertion').selectOption('0');
    await page.getByLabel('秘密鍵（PKCS#8 PEM）').fill(read('trial-key.pem'));
    await page.getByRole('button', { name: '復号する', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '暗号化された Assertion 1 の復号結果（署名未検証）' })
    ).toBeVisible();
  });
});

test('改変された GCM 暗号文を拒否し以前の結果を残さない', async ({ page }) => {
  const original = read('xmlsec-aes128.xml');
  const input = page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/);
  await input.fill(original);
  await page.getByLabel('復号する Assertion').selectOption('0');
  await page.getByLabel('秘密鍵（PKCS#8 PEM）').fill(read('trial-key.pem'));
  await page.getByRole('button', { name: '復号する', exact: true }).click();
  await expect(page.getByRole('heading', { name: /復号結果（署名未検証）/ })).toBeVisible();
  let seen = 0;
  const corrupted = original.replace(
    /(<xenc:CipherValue>)([\s\S]*?)(<\/xenc:CipherValue>)/g,
    (all, start: string, value: string, end: string) => {
      if (++seen !== 2) return all;
      return start + value.replace(/[A-Za-z0-9+/]/, (c) => (c === 'A' ? 'B' : 'A')) + end;
    }
  );
  expect(seen).toBe(2);
  await input.fill(corrupted);
  await expect(page.getByRole('heading', { name: /復号結果（署名未検証）/ })).toHaveCount(0);
  await page.getByLabel('復号する Assertion').selectOption('0');
  await page.getByLabel('秘密鍵（PKCS#8 PEM）').fill(read('trial-key.pem'));
  await page.getByRole('button', { name: '復号する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('復号に失敗しました');
  await expect(page.getByText('試験太郎', { exact: false })).toHaveCount(0);
});

test('平文と複数の暗号化 Assertion から指定した 2 件目だけを復号する', async ({ page }) => {
  const first = read('xmlsec-aes128.xml');
  const second = read('xmlsec-aes256-oaep11.xml').match(
    /<saml:EncryptedAssertion>[\s\S]*?<\/saml:EncryptedAssertion>/
  )?.[0];
  expect(second).toBeTruthy();
  const xml = first.replace(
    '</samlp:Response>',
    `<saml:Assertion ID="plain"/>${second}</samlp:Response>`
  );
  await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(xml);
  await page.getByLabel('復号する Assertion').selectOption('1');
  await page.getByLabel('秘密鍵（PKCS#8 PEM）').fill(read('trial-key.pem'));
  await page.getByRole('button', { name: '復号する', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '暗号化された Assertion 2 の復号結果（署名未検証）' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /暗号化された Assertion 1 の復号結果/ })
  ).toHaveCount(0);
  await expect(page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)).toHaveValue(xml);
});

for (const placement of ['implicit', 'retrieval', 'empty-keyinfo'] as const) {
  test(`兄弟鍵の ${placement} 関連付けで復号する`, async ({ page }) => {
    const xml = await page.evaluate(
      ({ source, placement }) => {
        const xenc = 'http://www.w3.org/2001/04/xmlenc#';
        const ds = 'http://www.w3.org/2000/09/xmldsig#';
        const doc = new DOMParser().parseFromString(source, 'application/xml');
        const data = doc.getElementsByTagNameNS(xenc, 'EncryptedData')[0];
        const key = doc.getElementsByTagNameNS(xenc, 'EncryptedKey')[0];
        const info = Array.from(data.children).find((el) => el.localName === 'KeyInfo')!;
        key.setAttribute('Id', 'key1');
        data.parentElement!.appendChild(key);
        if (placement === 'retrieval') {
          const ref = doc.createElementNS(ds, 'ds:RetrievalMethod');
          ref.setAttribute('URI', '#key1');
          info.appendChild(ref);
        } else if (placement === 'implicit') info.remove();
        return new XMLSerializer().serializeToString(doc);
      },
      { source: read('xmlsec-aes128.xml'), placement }
    );
    await page.getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/).fill(xml);
    await page.getByLabel('復号する Assertion').selectOption('0');
    await page.getByLabel('秘密鍵（PKCS#8 PEM）').fill(read('trial-key.pem'));
    await page.getByRole('button', { name: '復号する', exact: true }).click();
    await expect(page.getByRole('heading', { name: /復号結果（署名未検証）/ })).toBeVisible();
  });
}
