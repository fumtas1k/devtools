# SAMLデコーダ（saml-decoder）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **実装サブエージェントは `model: sonnet` で dispatch すること（ユーザー指示）。**

**Goal:** SAMLResponse / AuthnRequest を貼り付けると入力形式（URL / URLエンコード / base64 / base64+deflate / 生XML）を自動判定してデコードし、Assertion の構造表示と定番チェック（Status / 有効期間 / Audience / NameID）を行うブラウザ完結ツールを追加する。

**Architecture:** ロジックは `src/utils/saml/`（cert / har と同じディレクトリ分割: types / decode / parse / checks / format / index）に置き、UI は `src/components/tools/SamlDecoder.tsx` から利用する。XML は `DOMParser` で名前空間 URI ベースにパースし prefix 非依存。deflate 展開のみ新規依存 `fflate` を使う。

**Tech Stack:** React + TypeScript, DOMParser, fflate（新規・唯一の追加依存）, Vitest（`@vitest-environment jsdom`）, Playwright。

**Spec:** `docs/superpowers/specs/2026-07-17-saml-decoder-design.md`

---

## ファイル構成

| 種別   | パス                                                            | 責務                                                     |
| :----- | :-------------------------------------------------------------- | :------------------------------------------------------- |
| Create | `src/utils/saml/types.ts`                                       | 型定義のみ                                               |
| Create | `src/utils/saml/decode.ts`                                      | 入力形式の自動判定とデコードチェーン                     |
| Create | `src/utils/saml/parse.ts`                                       | XML → 構造化モデル（Response / AuthnRequest）            |
| Create | `src/utils/saml/checks.ts`                                      | Response の定番チェックリスト（検知機構 → 陽性対照必須） |
| Create | `src/utils/saml/format.ts`                                      | XML 整形（表示用）                                       |
| Create | `src/utils/saml/index.ts`                                       | re-export                                                |
| Create | `src/utils/__tests__/saml-fixtures.ts`                          | テスト用 XML フィクスチャ                                |
| Create | `src/utils/__tests__/saml-decode.test.ts`                       | decode のユニットテスト                                  |
| Create | `src/utils/__tests__/saml-parse.test.ts`                        | parse のユニットテスト                                   |
| Create | `src/utils/__tests__/saml-checks.test.ts`                       | checks のユニットテスト（陽性対照含む）                  |
| Create | `src/utils/__tests__/saml-format.test.ts`                       | format のユニットテスト                                  |
| Create | `src/components/tools/SamlDecoder.tsx`                          | ツール UI                                                |
| Create | `src/pages/tools/saml-decoder.astro`                            | ページ                                                   |
| Create | `tests/e2e/saml-decoder.spec.ts`                                | E2E（陽性対照含む）                                      |
| Modify | `src/data/tools.ts`                                             | ツールエントリ追加                                       |
| Modify | `tests/e2e/visual-regression-pages.ts`                          | `PAGES` に追加                                           |
| Modify | `package.json` / `package-lock.json`                            | fflate 追加                                              |
| Modify | `README.md` / `SPEC.md` / `docs/tools.md` / `docs/decisions.md` | ドキュメント更新                                         |

前提: ブランチ `feat/saml-decoder` 上で作業（作成済み）。コミットメッセージは Conventional Commits + 日本語。`git add` は明示 pathspec のみ（`-A` 禁止）。

---

### Task 1: fflate 依存追加

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: インストール**

```bash
npm install fflate --no-audit --no-fund --cache "$TMPDIR/npm-cache"
```

- [ ] **Step 2: 確認**

```bash
grep '"fflate"' package.json && node -e "const {deflateSync,decompressSync}=require('fflate');const d=deflateSync(new TextEncoder().encode('<x/>'));console.log(new TextDecoder().decode(decompressSync(d)))"
```

Expected: `"fflate": "^0.8.x"` の行と `<x/>` が出力される。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: SAMLデコーダ用に fflate を追加"
```

---

### Task 2: 型定義とデコードチェーン（`decode.ts`）

**Files:**

- Create: `src/utils/saml/types.ts`
- Create: `src/utils/saml/decode.ts`
- Create: `src/utils/__tests__/saml-decode.test.ts`

- [ ] **Step 1: 型定義を作成**（テスト不要、次ステップの前提）

`src/utils/saml/types.ts`:

```ts
/** 入力の由来バインディング */
export type SamlBinding = 'redirect' | 'post' | 'xml';

export interface DecodedInput {
  xml: string;
  /** 適用した変換ステップ（UI 表示用、適用順） */
  steps: string[];
  binding: SamlBinding;
}

export interface SamlAttribute {
  name: string;
  friendlyName?: string;
  values: string[];
}

export interface SamlConditions {
  notBefore?: string;
  notOnOrAfter?: string;
  audiences: string[];
}

export interface SamlSubjectConfirmation {
  method?: string;
  recipient?: string;
  notOnOrAfter?: string;
  inResponseTo?: string;
}

export interface SamlAuthnStatement {
  authnInstant?: string;
  sessionIndex?: string;
  authnContextClassRef?: string;
}

export interface SamlAssertion {
  id?: string;
  issuer?: string;
  nameId?: string;
  nameIdFormat?: string;
  attributes: SamlAttribute[];
  conditions?: SamlConditions;
  authnStatements: SamlAuthnStatement[];
  subjectConfirmations: SamlSubjectConfirmation[];
  /** Assertion 直下に ds:Signature を持つか（存在表示のみ、検証はしない） */
  signed: boolean;
}

export interface SamlResponseData {
  type: 'response';
  issuer?: string;
  statusCode?: string;
  statusMessage?: string;
  destination?: string;
  inResponseTo?: string;
  issueInstant?: string;
  /** Response 直下に ds:Signature を持つか */
  signed: boolean;
  assertions: SamlAssertion[];
  encryptedAssertionCount: number;
}

export interface SamlAuthnRequestData {
  type: 'authnRequest';
  issuer?: string;
  destination?: string;
  acsUrl?: string;
  protocolBinding?: string;
  issueInstant?: string;
  nameIdPolicyFormat?: string;
  allowCreate?: string;
  authnContextClassRefs: string[];
  signed: boolean;
}

export type SamlMessage = SamlResponseData | SamlAuthnRequestData;

export type CheckStatus = 'success' | 'warning' | 'error' | 'info';

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
```

- [ ] **Step 2: フィクスチャを作成**

`src/utils/__tests__/saml-fixtures.ts`:

```ts
/**
 * SAML テスト用フィクスチャ。
 * 日時は固定（2026-07-17 00:00Z 周辺）。checks のテストは now を注入して有効/期限切れを切り替える。
 */
export const SAMPLE_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/acs" InResponseTo="_req1">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_a1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData Recipient="https://sp.example.com/acs" NotOnOrAfter="2026-07-17T00:05:00Z" InResponseTo="_req1"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-07-16T23:55:00Z" NotOnOrAfter="2026-07-17T00:05:00Z">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="2026-07-17T00:00:00Z" SessionIndex="_s1">
      <saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="mail"><saml:AttributeValue>taro.yamada@example.com</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="displayName" FriendlyName="表示名"><saml:AttributeValue>山田 太郎</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="groups"><saml:AttributeValue>dev</saml:AttributeValue><saml:AttributeValue>admin</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

export const FAILED_STATUS_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder"/>
    <samlp:StatusMessage>Authentication failed</samlp:StatusMessage>
  </samlp:Status>
</samlp:Response>`;

export const ENCRYPTED_ASSERTION_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp3" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:EncryptedAssertion><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#"/></saml:EncryptedAssertion>
</samlp:Response>`;

export const AUTHN_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_req1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://idp.example.com/sso" AssertionConsumerServiceURL="https://sp.example.com/acs" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
  <samlp:RequestedAuthnContext Comparison="exact">
    <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
  </samlp:RequestedAuthnContext>
</samlp:AuthnRequest>`;

/** UTF-8 → base64（マルチバイト対応。btoa 直呼びは日本語で例外になるため必須） */
export function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
```

- [ ] **Step 3: decode の失敗するテストを書く**

`src/utils/__tests__/saml-decode.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'fflate';
import { decodeSamlInput } from '@/utils/saml';
import { SAMPLE_RESPONSE_XML, AUTHN_REQUEST_XML, toBase64 } from './saml-fixtures';

function deflateBase64(xml: string): string {
  const compressed = deflateSync(new TextEncoder().encode(xml));
  let bin = '';
  for (const b of compressed) bin += String.fromCharCode(b);
  return btoa(bin);
}

describe('decodeSamlInput', () => {
  it('生 XML をそのまま返す', () => {
    const r = decodeSamlInput(SAMPLE_RESPONSE_XML);
    expect(r.binding).toBe('xml');
    expect(r.xml).toBe(SAMPLE_RESPONSE_XML);
  });

  it('base64（HTTP-POST binding）をデコードする', () => {
    const r = decodeSamlInput(toBase64(SAMPLE_RESPONSE_XML));
    expect(r.binding).toBe('post');
    expect(r.xml).toContain('<samlp:Response');
    expect(r.steps).toContain('base64 デコード');
  });

  it('改行・空白入り base64 も受け付ける', () => {
    const b64 = toBase64(SAMPLE_RESPONSE_XML).replace(/(.{60})/g, '$1\n');
    expect(decodeSamlInput(b64).binding).toBe('post');
  });

  it('base64 + deflate（HTTP-Redirect binding）を展開する', () => {
    const r = decodeSamlInput(deflateBase64(AUTHN_REQUEST_XML));
    expect(r.binding).toBe('redirect');
    expect(r.xml).toContain('<samlp:AuthnRequest');
    expect(r.steps).toContain('deflate 展開');
  });

  it('URL エンコードされた base64+deflate を展開する', () => {
    const r = decodeSamlInput(encodeURIComponent(deflateBase64(AUTHN_REQUEST_XML)));
    expect(r.binding).toBe('redirect');
  });

  it('URL 全体から SAMLRequest パラメータを抽出する', () => {
    const url = `https://idp.example.com/sso?SAMLRequest=${encodeURIComponent(deflateBase64(AUTHN_REQUEST_XML))}&RelayState=abc`;
    const r = decodeSamlInput(url);
    expect(r.binding).toBe('redirect');
    expect(r.steps[0]).toBe('URL からパラメータ抽出');
    expect(r.xml).toContain('<samlp:AuthnRequest');
  });

  it('URL 全体から SAMLResponse パラメータを抽出する', () => {
    const url = `https://sp.example.com/acs?SAMLResponse=${encodeURIComponent(toBase64(SAMPLE_RESPONSE_XML))}`;
    expect(decodeSamlInput(url).xml).toContain('<samlp:Response');
  });

  it('SAML パラメータの無い URL はエラー', () => {
    expect(() => decodeSamlInput('https://example.com/?foo=bar')).toThrow(
      /SAMLResponse \/ SAMLRequest/
    );
  });

  it('base64 でない文字列はエラー', () => {
    expect(() => decodeSamlInput('これはSAMLではない')).toThrow();
  });

  it('base64 だが中身が XML でない場合はエラー', () => {
    expect(() => decodeSamlInput(toBase64('hello world'))).toThrow(/XML ではありません/);
  });

  it('空入力はエラー', () => {
    expect(() => decodeSamlInput('   ')).toThrow(/入力が空/);
  });
});
```

- [ ] **Step 4: 失敗を確認**

Run: `npm run test -- src/utils/__tests__/saml-decode.test.ts`
Expected: FAIL（`@/utils/saml` が存在しない）

- [ ] **Step 5: decode を実装**

`src/utils/saml/decode.ts`:

```ts
import { decompressSync } from 'fflate';
import type { DecodedInput } from './types';

const utf8 = new TextDecoder('utf-8', { fatal: true });

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * SAML メッセージ入力の自動判定デコード。
 * URL 全体 / URL エンコード base64 / base64（POST）/ base64+deflate（Redirect）/ 生 XML に対応。
 */
export function decodeSamlInput(raw: string): DecodedInput {
  const steps: string[] = [];
  let text = raw.trim();
  if (!text) throw new Error('入力が空です');

  // 1. URL 全体 → SAMLResponse / SAMLRequest パラメータ抽出（searchParams.get は URL デコード済みを返す）
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new Error('URL として解釈できません');
    }
    const param = url.searchParams.get('SAMLResponse') ?? url.searchParams.get('SAMLRequest');
    if (!param) throw new Error('URL に SAMLResponse / SAMLRequest パラメータが見つかりません');
    steps.push('URL からパラメータ抽出');
    text = param;
  }

  // 2. 生 XML
  if (text.startsWith('<')) {
    return { xml: text, steps: [...steps, '生 XML と判定'], binding: 'xml' };
  }

  // 3. URL エンコード解除（%xx を含む場合のみ。復号失敗はそのまま続行）
  if (/%[0-9a-fA-F]{2}/.test(text)) {
    try {
      text = decodeURIComponent(text);
      steps.push('URL デコード');
    } catch {
      /* %xx が偶然含まれる base64 の可能性があるため無視 */
    }
  }

  // 4. base64
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(text.replace(/\s+/g, ''));
  } catch {
    throw new Error(
      'base64 として解釈できません（SAMLResponse / SAMLRequest の値か確認してください）'
    );
  }
  steps.push('base64 デコード');

  // 5. そのまま XML → HTTP-POST binding
  try {
    const asText = utf8.decode(bytes);
    if (asText.trimStart().startsWith('<')) {
      return { xml: asText, steps, binding: 'post' };
    }
  } catch {
    /* UTF-8 でない → deflate 圧縮の可能性 */
  }

  // 6. deflate 展開 → HTTP-Redirect binding（decompressSync は raw deflate / zlib / gzip を自動判定）
  let inflated: string;
  try {
    inflated = utf8.decode(decompressSync(bytes));
  } catch {
    throw new Error('デコード結果が XML ではありません（deflate 展開にも失敗しました）');
  }
  if (!inflated.trimStart().startsWith('<')) {
    throw new Error('デコード結果が XML ではありません（SAML メッセージか確認してください）');
  }
  return { xml: inflated, steps: [...steps, 'deflate 展開'], binding: 'redirect' };
}
```

`src/utils/saml/index.ts`（この時点では decode と types のみ。Task 3〜4 で追記）:

```ts
export * from './types';
export { decodeSamlInput } from './decode';
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npm run test -- src/utils/__tests__/saml-decode.test.ts`
Expected: PASS（全ケース）

- [ ] **Step 7: Commit**

```bash
git add src/utils/saml/types.ts src/utils/saml/decode.ts src/utils/saml/index.ts src/utils/__tests__/saml-fixtures.ts src/utils/__tests__/saml-decode.test.ts
git commit -m "feat: SAML 入力の自動判定デコードチェーンを追加"
```

---

### Task 3: XML パーサ（`parse.ts`）

**Files:**

- Create: `src/utils/saml/parse.ts`
- Modify: `src/utils/saml/index.ts`
- Create: `src/utils/__tests__/saml-parse.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/saml-parse.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSamlXml } from '@/utils/saml';
import {
  SAMPLE_RESPONSE_XML,
  FAILED_STATUS_RESPONSE_XML,
  ENCRYPTED_ASSERTION_RESPONSE_XML,
  AUTHN_REQUEST_XML,
} from './saml-fixtures';

describe('parseSamlXml: Response', () => {
  it('サマリ情報を抽出する', () => {
    const m = parseSamlXml(SAMPLE_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.issuer).toBe('https://idp.example.com/metadata');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Success');
    expect(m.destination).toBe('https://sp.example.com/acs');
    expect(m.inResponseTo).toBe('_req1');
    expect(m.issueInstant).toBe('2026-07-17T00:00:00Z');
    expect(m.signed).toBe(false);
    expect(m.encryptedAssertionCount).toBe(0);
  });

  it('Assertion の Subject / Conditions / AuthnStatement を抽出する', () => {
    const m = parseSamlXml(SAMPLE_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.assertions).toHaveLength(1);
    const a = m.assertions[0];
    expect(a.nameId).toBe('taro.yamada@example.com');
    expect(a.nameIdFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    expect(a.conditions?.notBefore).toBe('2026-07-16T23:55:00Z');
    expect(a.conditions?.notOnOrAfter).toBe('2026-07-17T00:05:00Z');
    expect(a.conditions?.audiences).toEqual(['https://sp.example.com/metadata']);
    expect(a.authnStatements[0].sessionIndex).toBe('_s1');
    expect(a.authnStatements[0].authnContextClassRef).toContain('PasswordProtectedTransport');
    expect(a.subjectConfirmations[0].recipient).toBe('https://sp.example.com/acs');
    expect(a.subjectConfirmations[0].method).toBe('urn:oasis:names:tc:SAML:2.0:cm:bearer');
  });

  it('属性（複数値・FriendlyName 含む）を抽出する', () => {
    const m = parseSamlXml(SAMPLE_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    const attrs = m.assertions[0].attributes;
    expect(attrs).toHaveLength(3);
    expect(attrs[1]).toEqual({
      name: 'displayName',
      friendlyName: '表示名',
      values: ['山田 太郎'],
    });
    expect(attrs[2].values).toEqual(['dev', 'admin']);
  });

  it('Status 失敗レスポンスの StatusMessage を抽出する', () => {
    const m = parseSamlXml(FAILED_STATUS_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Responder');
    expect(m.statusMessage).toBe('Authentication failed');
    expect(m.assertions).toHaveLength(0);
  });

  it('EncryptedAssertion を数える', () => {
    const m = parseSamlXml(ENCRYPTED_ASSERTION_RESPONSE_XML);
    if (m.type !== 'response') throw new Error('response expected');
    expect(m.encryptedAssertionCount).toBe(1);
    expect(m.assertions).toHaveLength(0);
  });
});

describe('parseSamlXml: AuthnRequest', () => {
  it('サマリ情報を抽出する', () => {
    const m = parseSamlXml(AUTHN_REQUEST_XML);
    if (m.type !== 'authnRequest') throw new Error('authnRequest expected');
    expect(m.issuer).toBe('https://sp.example.com/metadata');
    expect(m.destination).toBe('https://idp.example.com/sso');
    expect(m.acsUrl).toBe('https://sp.example.com/acs');
    expect(m.protocolBinding).toBe('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST');
    expect(m.nameIdPolicyFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    expect(m.allowCreate).toBe('true');
    expect(m.authnContextClassRefs).toEqual([
      'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
    ]);
  });
});

describe('parseSamlXml: 異常系', () => {
  it('壊れた XML はエラー', () => {
    expect(() => parseSamlXml('<samlp:Response>')).toThrow(/XML/);
  });

  it('SAML 以外の XML はエラー', () => {
    expect(() => parseSamlXml('<root><child/></root>')).toThrow(/対応していない/);
  });

  it('LogoutRequest は未対応としてエラー', () => {
    const xml =
      '<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_l1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z"/>';
    expect(() => parseSamlXml(xml)).toThrow(/LogoutRequest/);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- src/utils/__tests__/saml-parse.test.ts`
Expected: FAIL（`parseSamlXml` 未定義）

- [ ] **Step 3: parse を実装**

`src/utils/saml/parse.ts`:

```ts
import type {
  SamlAssertion,
  SamlAttribute,
  SamlAuthnRequestData,
  SamlMessage,
  SamlResponseData,
} from './types';

const NS_P = 'urn:oasis:names:tc:SAML:2.0:protocol';
const NS_A = 'urn:oasis:names:tc:SAML:2.0:assertion';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';

/** 直下の子要素のみを名前空間 URI + localName で探す（prefix 非依存・ネスト混入防止） */
function childNS(el: Element, ns: string, local: string): Element | undefined {
  return Array.from(el.children).find((c) => c.namespaceURI === ns && c.localName === local);
}

function childrenNS(el: Element, ns: string, local: string): Element[] {
  return Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === local);
}

function textOf(el: Element | undefined): string | undefined {
  const t = el?.textContent?.trim();
  return t || undefined;
}

function attrOf(el: Element | undefined, name: string): string | undefined {
  return el?.getAttribute(name) ?? undefined;
}

function hasDirectSignature(el: Element): boolean {
  return childNS(el, NS_DS, 'Signature') !== undefined;
}

/**
 * SAML XML を構造化モデルへパースする。
 * 対応: Response / AuthnRequest。それ以外の SAML メッセージ型はエラー。
 */
export function parseSamlXml(xml: string): SamlMessage {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML の構文エラーがあります');
  }
  const root = doc.documentElement;
  if (root.namespaceURI === NS_P && root.localName === 'Response') return parseResponse(root);
  if (root.namespaceURI === NS_P && root.localName === 'AuthnRequest')
    return parseAuthnRequest(root);
  throw new Error(
    `対応していない SAML メッセージです（${root.localName}）。対応形式: Response / AuthnRequest`
  );
}

function parseResponse(root: Element): SamlResponseData {
  const status = childNS(root, NS_P, 'Status');
  return {
    type: 'response',
    issuer: textOf(childNS(root, NS_A, 'Issuer')),
    statusCode: status ? attrOf(childNS(status, NS_P, 'StatusCode'), 'Value') : undefined,
    statusMessage: status ? textOf(childNS(status, NS_P, 'StatusMessage')) : undefined,
    destination: attrOf(root, 'Destination'),
    inResponseTo: attrOf(root, 'InResponseTo'),
    issueInstant: attrOf(root, 'IssueInstant'),
    signed: hasDirectSignature(root),
    assertions: childrenNS(root, NS_A, 'Assertion').map(parseAssertion),
    encryptedAssertionCount: childrenNS(root, NS_A, 'EncryptedAssertion').length,
  };
}

function parseAssertion(el: Element): SamlAssertion {
  const subject = childNS(el, NS_A, 'Subject');
  const nameId = subject && childNS(subject, NS_A, 'NameID');
  const conditions = childNS(el, NS_A, 'Conditions');
  const attrStatement = childNS(el, NS_A, 'AttributeStatement');
  return {
    id: attrOf(el, 'ID'),
    issuer: textOf(childNS(el, NS_A, 'Issuer')),
    nameId: textOf(nameId),
    nameIdFormat: attrOf(nameId, 'Format'),
    attributes: attrStatement
      ? childrenNS(attrStatement, NS_A, 'Attribute').map(parseAttribute)
      : [],
    conditions: conditions
      ? {
          notBefore: attrOf(conditions, 'NotBefore'),
          notOnOrAfter: attrOf(conditions, 'NotOnOrAfter'),
          audiences: childrenNS(conditions, NS_A, 'AudienceRestriction').flatMap((ar) =>
            childrenNS(ar, NS_A, 'Audience').flatMap((a) => textOf(a) ?? [])
          ),
        }
      : undefined,
    authnStatements: childrenNS(el, NS_A, 'AuthnStatement').map((s) => {
      const ctx = childNS(s, NS_A, 'AuthnContext');
      return {
        authnInstant: attrOf(s, 'AuthnInstant'),
        sessionIndex: attrOf(s, 'SessionIndex'),
        authnContextClassRef: ctx ? textOf(childNS(ctx, NS_A, 'AuthnContextClassRef')) : undefined,
      };
    }),
    subjectConfirmations: subject
      ? childrenNS(subject, NS_A, 'SubjectConfirmation').map((sc) => {
          const data = childNS(sc, NS_A, 'SubjectConfirmationData');
          return {
            method: attrOf(sc, 'Method'),
            recipient: attrOf(data, 'Recipient'),
            notOnOrAfter: attrOf(data, 'NotOnOrAfter'),
            inResponseTo: attrOf(data, 'InResponseTo'),
          };
        })
      : [],
    signed: hasDirectSignature(el),
  };
}

function parseAttribute(el: Element): SamlAttribute {
  return {
    name: attrOf(el, 'Name') ?? '(名前なし)',
    friendlyName: attrOf(el, 'FriendlyName'),
    values: childrenNS(el, NS_A, 'AttributeValue').map((v) => v.textContent?.trim() ?? ''),
  };
}

function parseAuthnRequest(root: Element): SamlAuthnRequestData {
  const nameIdPolicy = childNS(root, NS_P, 'NameIDPolicy');
  const requestedCtx = childNS(root, NS_P, 'RequestedAuthnContext');
  return {
    type: 'authnRequest',
    issuer: textOf(childNS(root, NS_A, 'Issuer')),
    destination: attrOf(root, 'Destination'),
    acsUrl: attrOf(root, 'AssertionConsumerServiceURL'),
    protocolBinding: attrOf(root, 'ProtocolBinding'),
    issueInstant: attrOf(root, 'IssueInstant'),
    nameIdPolicyFormat: attrOf(nameIdPolicy, 'Format'),
    allowCreate: attrOf(nameIdPolicy, 'AllowCreate'),
    authnContextClassRefs: requestedCtx
      ? childrenNS(requestedCtx, NS_A, 'AuthnContextClassRef').flatMap((e) => textOf(e) ?? [])
      : [],
    signed: hasDirectSignature(root),
  };
}
```

`src/utils/saml/index.ts` に追記:

```ts
export { parseSamlXml } from './parse';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/utils/__tests__/saml-parse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/saml/parse.ts src/utils/saml/index.ts src/utils/__tests__/saml-parse.test.ts
git commit -m "feat: SAML Response / AuthnRequest の構造化パーサを追加"
```

---

### Task 4: 定番チェックリスト（`checks.ts`）— 検知機構・陽性対照必須

> ⚠️ このタスクは検知機構の実装。**`.agents/rules/common.md` 3 章に従い test-gates skill の陽性対照ルールを適用**する。「fail するべき入力で実際に error になる」テストを必ず含める（下記テストの `陽性対照` describe）。

**Files:**

- Create: `src/utils/saml/checks.ts`
- Modify: `src/utils/saml/index.ts`
- Create: `src/utils/__tests__/saml-checks.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/saml-checks.test.ts`:

```ts
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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- src/utils/__tests__/saml-checks.test.ts`
Expected: FAIL（`runResponseChecks` 未定義）

- [ ] **Step 3: checks を実装**

`src/utils/saml/checks.ts`:

```ts
import type { CheckItem, SamlResponseData } from './types';

const STATUS_SUCCESS = 'urn:oasis:names:tc:SAML:2.0:status:Success';

export interface CheckOptions {
  /** テスト用に注入可能な現在時刻（省略時は実時刻） */
  now?: Date;
  /** SP entityID。入力時のみ Audience と厳密一致で照合する */
  spEntityId?: string;
}

/** Response の定番チェックリストを実行する（AuthnRequest には適用しない） */
export function runResponseChecks(res: SamlResponseData, opts: CheckOptions = {}): CheckItem[] {
  const now = opts.now ?? new Date();
  const items: CheckItem[] = [];

  // 1. Status
  if (res.statusCode === STATUS_SUCCESS) {
    items.push({ id: 'status', label: 'Status', status: 'success', detail: 'Success' });
  } else {
    const code = res.statusCode?.split(':').pop() ?? '不明';
    items.push({
      id: 'status',
      label: 'Status',
      status: 'error',
      detail: res.statusMessage
        ? `${code}（StatusMessage: ${res.statusMessage}）`
        : `${code}（Success ではありません）`,
    });
  }

  // 2. Assertion 有無（無ければ以降のチェックは打ち切り）
  if (res.assertions.length === 0) {
    items.push({
      id: 'assertion',
      label: 'Assertion',
      status: res.encryptedAssertionCount > 0 ? 'warning' : 'error',
      detail:
        res.encryptedAssertionCount > 0
          ? '暗号化されており内容を確認できません（復号は非対応）'
          : 'Assertion が含まれていません',
    });
    return items;
  }

  // 3. 有効期間（NotOnOrAfter は SAML 仕様上その時刻自体を含まない排他境界）
  res.assertions.forEach((a, i) => {
    const label = res.assertions.length > 1 ? `有効期間 (Assertion ${i + 1})` : '有効期間';
    const c = a.conditions;
    if (!c || (!c.notBefore && !c.notOnOrAfter)) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'warning',
        detail: 'Conditions に有効期間の指定がありません',
      });
      return;
    }
    const notBefore = c.notBefore ? new Date(c.notBefore) : undefined;
    const notOnOrAfter = c.notOnOrAfter ? new Date(c.notOnOrAfter) : undefined;
    if (notBefore && now < notBefore) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'error',
        detail: `有効期間前です（NotBefore: ${c.notBefore}）。IdP / SP の時刻ずれ（クロックスキュー）の可能性があります`,
      });
    } else if (notOnOrAfter && now >= notOnOrAfter) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'error',
        detail: `期限切れです（NotOnOrAfter: ${c.notOnOrAfter}）`,
      });
    } else {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'success',
        detail: `有効期間内です（${c.notBefore ?? '-'} 〜 ${c.notOnOrAfter ?? '-'}）`,
      });
    }
  });

  // 4. Audience（SP entityID 入力時のみ照合、未入力は表示のみ）
  const audiences = [...new Set(res.assertions.flatMap((a) => a.conditions?.audiences ?? []))];
  const sp = opts.spEntityId?.trim();
  if (audiences.length === 0) {
    items.push({
      id: 'audience',
      label: 'Audience',
      status: 'warning',
      detail: 'AudienceRestriction がありません',
    });
  } else if (!sp) {
    items.push({ id: 'audience', label: 'Audience', status: 'info', detail: audiences.join(', ') });
  } else if (audiences.includes(sp)) {
    items.push({
      id: 'audience',
      label: 'Audience',
      status: 'success',
      detail: `SP entityID と一致します（${sp}）`,
    });
  } else {
    items.push({
      id: 'audience',
      label: 'Audience',
      status: 'error',
      detail: `SP entityID と不一致です（Audience: ${audiences.join(', ')}）`,
    });
  }

  // 5. Recipient（表示のみ）
  const recipients = [
    ...new Set(
      res.assertions.flatMap((a) =>
        a.subjectConfirmations.flatMap((s) => (s.recipient ? [s.recipient] : []))
      )
    ),
  ];
  items.push({
    id: 'recipient',
    label: 'Recipient',
    status: recipients.length > 0 ? 'info' : 'warning',
    detail:
      recipients.length > 0
        ? recipients.join(', ')
        : 'SubjectConfirmationData に Recipient がありません',
  });

  // 6. NameID
  const hasNameId = res.assertions.some((a) => a.nameId);
  items.push({
    id: 'nameid',
    label: 'NameID',
    status: hasNameId ? 'success' : 'warning',
    detail: hasNameId
      ? 'NameID が含まれています'
      : 'NameID が含まれていません（SP 側でユーザを特定できない可能性があります）',
  });

  return items;
}
```

`src/utils/saml/index.ts` に追記:

```ts
export { runResponseChecks, type CheckOptions } from './checks';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/utils/__tests__/saml-checks.test.ts`
Expected: PASS（陽性対照 7 ケース含む全ケース）

- [ ] **Step 5: Commit**

```bash
git add src/utils/saml/checks.ts src/utils/saml/index.ts src/utils/__tests__/saml-checks.test.ts
git commit -m "feat: SAML Response の定番チェックリストを追加（陽性対照テスト付き）"
```

---

### Task 5: XML 整形（`format.ts`）

**Files:**

- Create: `src/utils/saml/format.ts`
- Modify: `src/utils/saml/index.ts`
- Create: `src/utils/__tests__/saml-format.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/saml-format.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { formatXml } from '@/utils/saml';

describe('formatXml', () => {
  it('1 行 XML をインデント付きに整形する', () => {
    const out = formatXml('<a xmlns="urn:x"><b attr="1">v</b><c/></a>');
    expect(out).toBe(['<a xmlns="urn:x">', '  <b attr="1">v</b>', '  <c/>', '</a>'].join('\n'));
  });

  it('XML 宣言を保持する', () => {
    const out = formatXml('<?xml version="1.0" encoding="UTF-8"?><a><b/></a>');
    expect(out.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('テキストと属性をエスケープする', () => {
    const out = formatXml('<a attr="&quot;x&quot;">&lt;tag&gt; &amp; more</a>');
    expect(out).toBe('<a attr="&quot;x&quot;">&lt;tag&gt; &amp; more</a>');
  });

  it('parse 不能な入力はそのまま返す', () => {
    expect(formatXml('<broken')).toBe('<broken');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- src/utils/__tests__/saml-format.test.ts`
Expected: FAIL（`formatXml` 未定義）

- [ ] **Step 3: format を実装**

`src/utils/saml/format.ts`:

```ts
/**
 * 表示用の簡易 XML 整形。
 * 要素・属性・テキストのみを再構成する（コメント・mixed content は SAML メッセージでは
 * 実質使われないため対象外）。parse 不能な入力はそのまま返す。
 */
export function formatXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return xml;
  const lines: string[] = [];
  const decl = xml.match(/^\s*<\?xml[^?]*\?>/);
  if (decl) lines.push(decl[0].trim());
  serializeEl(doc.documentElement, 0, lines);
  return lines.join('\n');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

function openTag(el: Element): string {
  const attrs = Array.from(el.attributes)
    .map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
    .join('');
  return `<${el.tagName}${attrs}`;
}

function serializeEl(el: Element, depth: number, lines: string[]): void {
  const indent = '  '.repeat(depth);
  const children = Array.from(el.children);
  if (children.length === 0) {
    const text = (el.textContent ?? '').trim();
    lines.push(
      text
        ? `${indent}${openTag(el)}>${escapeText(text)}</${el.tagName}>`
        : `${indent}${openTag(el)}/>`
    );
    return;
  }
  lines.push(`${indent}${openTag(el)}>`);
  for (const c of children) serializeEl(c, depth + 1, lines);
  lines.push(`${indent}</${el.tagName}>`);
}
```

`src/utils/saml/index.ts` に追記（最終形）:

```ts
export * from './types';
export { decodeSamlInput } from './decode';
export { parseSamlXml } from './parse';
export { runResponseChecks, type CheckOptions } from './checks';
export { formatXml } from './format';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- src/utils/__tests__/saml-format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/saml/format.ts src/utils/saml/index.ts src/utils/__tests__/saml-format.test.ts
git commit -m "feat: SAML 生 XML の表示用整形を追加"
```

---

### Task 6: UI コンポーネント（`SamlDecoder.tsx`）

**Files:**

- Create: `src/components/tools/SamlDecoder.tsx`

規約リマインド:

- 色は semantic class / `@theme` auto-utility のみ（primitive scale 禁止）
- `dangerouslySetInnerHTML` 禁止（全て React 要素として組み立て済みの設計）
- `aria-live` / `role` は既存パターン（JwtDecoder の `role="status" aria-live="polite"`）を踏襲

- [ ] **Step 1: コンポーネントを実装**

`src/components/tools/SamlDecoder.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ResultTable, type TableColumn } from '@/components/ui/ResultTable';
import {
  decodeSamlInput,
  parseSamlXml,
  runResponseChecks,
  formatXml,
  type CheckItem,
  type DecodedInput,
  type SamlAssertion,
  type SamlAttribute,
  type SamlBinding,
  type SamlMessage,
} from '@/utils/saml';

const BINDING_LABEL: Record<SamlBinding, string> = {
  redirect: 'HTTP-Redirect binding（base64 + deflate）',
  post: 'HTTP-POST binding（base64）',
  xml: '生 XML',
};

/** サンプル: 現在時刻を挟む有効期間の Response を POST binding（base64）で生成 */
function buildSampleInput(): string {
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const now = Date.now();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_sample-resp" Version="2.0" IssueInstant="${iso(now)}" Destination="https://sp.example.com/acs" InResponseTo="_sample-req">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_sample-a1" Version="2.0" IssueInstant="${iso(now)}">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData Recipient="https://sp.example.com/acs" NotOnOrAfter="${iso(now + 5 * 60_000)}" InResponseTo="_sample-req"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${iso(now - 5 * 60_000)}" NotOnOrAfter="${iso(now + 5 * 60_000)}">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="_sample-s1">
      <saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="mail"><saml:AttributeValue>taro.yamada@example.com</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="displayName" FriendlyName="表示名"><saml:AttributeValue>山田 太郎</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="groups"><saml:AttributeValue>dev</saml:AttributeValue><saml:AttributeValue>admin</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
  const bytes = new TextEncoder().encode(xml);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col md:flex-row md:gap-2">
      <dt className="caption text-muted md:w-56 shrink-0">{label}</dt>
      <dd className="caption font-mono break-all text-default">{value}</dd>
    </div>
  );
}

const CHECK_TONE: Record<CheckItem['status'], 'success' | 'warning' | 'error' | 'info'> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
};

const CHECK_TONE_LABEL: Record<CheckItem['status'], string> = {
  success: 'OK',
  warning: '注意',
  error: 'エラー',
  info: '情報',
};

function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <section className="rounded-lg p-4 bg-subtle">
      <h3 className="body-emphasis text-default mb-3">チェックリスト</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2">
            <span className="flex items-center gap-2 md:w-56 shrink-0">
              <StatusBadge tone={CHECK_TONE[item.status]}>
                {CHECK_TONE_LABEL[item.status]}
              </StatusBadge>
              <span className="caption text-default">{item.label}</span>
            </span>
            <span className="caption break-all text-default">{item.detail}</span>
          </li>
        ))}
      </ul>
      <p className="hint-xs text-muted mt-3">
        有効期間はこの端末の現在時刻で判定しています。IdP / SP
        間の時刻ずれ（クロックスキュー）により実環境の判定と異なる場合があります。
      </p>
    </section>
  );
}

const ATTR_COLUMNS: TableColumn<SamlAttribute>[] = [
  {
    key: 'name',
    header: '属性名',
    className: 'font-mono break-all',
    render: (a) => (
      <>
        {a.name}
        {a.friendlyName && <span className="text-muted ml-2">({a.friendlyName})</span>}
      </>
    ),
  },
  {
    key: 'values',
    header: '値',
    className: 'font-mono break-all',
    render: (a) => a.values.join(', '),
  },
];

function AssertionSection({
  assertion,
  index,
  total,
}: {
  assertion: SamlAssertion;
  index: number;
  total: number;
}) {
  return (
    <section className="rounded-lg p-4 bg-subtle space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="body-emphasis text-default">Assertion{total > 1 ? ` ${index + 1}` : ''}</h3>
        <StatusBadge tone="info">
          {assertion.signed ? '署名あり（未検証）' : '署名なし'}
        </StatusBadge>
      </div>
      <dl className="space-y-1">
        <SummaryRow label="NameID" value={assertion.nameId} />
        <SummaryRow label="NameID Format" value={assertion.nameIdFormat} />
        <SummaryRow label="NotBefore" value={assertion.conditions?.notBefore} />
        <SummaryRow label="NotOnOrAfter" value={assertion.conditions?.notOnOrAfter} />
        <SummaryRow
          label="Audience"
          value={assertion.conditions?.audiences.join(', ') || undefined}
        />
        {assertion.subjectConfirmations.map((sc, i) => (
          <SummaryRow
            key={i}
            label={`SubjectConfirmation${assertion.subjectConfirmations.length > 1 ? ` ${i + 1}` : ''}`}
            value={[
              sc.recipient && `Recipient: ${sc.recipient}`,
              sc.notOnOrAfter && `NotOnOrAfter: ${sc.notOnOrAfter}`,
              sc.inResponseTo && `InResponseTo: ${sc.inResponseTo}`,
            ]
              .filter(Boolean)
              .join(' / ')}
          />
        ))}
        {assertion.authnStatements.map((st, i) => (
          <SummaryRow
            key={i}
            label={`AuthnStatement${assertion.authnStatements.length > 1 ? ` ${i + 1}` : ''}`}
            value={[
              st.authnInstant && `AuthnInstant: ${st.authnInstant}`,
              st.sessionIndex && `SessionIndex: ${st.sessionIndex}`,
              st.authnContextClassRef && `AuthnContext: ${st.authnContextClassRef}`,
            ]
              .filter(Boolean)
              .join(' / ')}
          />
        ))}
      </dl>
      {assertion.attributes.length > 0 && (
        <div>
          <h4 className="caption text-muted mb-2">属性（{assertion.attributes.length} 件）</h4>
          <ResultTable rows={assertion.attributes} columns={ATTR_COLUMNS} getKey={(a) => a.name} />
        </div>
      )}
    </section>
  );
}

interface ParsedOk {
  decoded: DecodedInput;
  message: SamlMessage;
  error?: undefined;
}
interface ParsedNg {
  error: string;
}

export function SamlDecoderTool() {
  const [input, setInput] = useState('');
  const [spEntityId, setSpEntityId] = useState('');

  const result: ParsedOk | ParsedNg | null = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const decoded = decodeSamlInput(input);
      return { decoded, message: parseSamlXml(decoded.xml) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : '解析に失敗しました' };
    }
  }, [input]);

  const ok = result && !result.error ? (result as ParsedOk) : null;
  const response = ok && ok.message.type === 'response' ? ok.message : null;
  const authnRequest = ok && ok.message.type === 'authnRequest' ? ok.message : null;

  const checks = useMemo(
    () => (response ? runResponseChecks(response, { spEntityId }) : null),
    [response, spEntityId]
  );

  const prettyXml = useMemo(() => (ok ? formatXml(ok.decoded.xml) : ''), [ok]);

  return (
    <div className="space-y-6">
      <InputField
        id="saml-input"
        label="SAMLResponse / SAMLRequest を貼り付け（URL・base64・生 XML を自動判定）"
        value={input}
        onChange={setInput}
        placeholder="PHNhbWxwOlJlc3BvbnNlIC4uLg== / https://sp.example.com/acs?SAMLResponse=... / <samlp:Response ...>"
        multiline
        rows={6}
        error={result?.error}
        onSampleClick={() => setInput(buildSampleInput())}
        mono
      />

      {response && (
        <InputField
          id="saml-sp-entity-id"
          label={
            <>
              SP entityID
              <span className="caption text-muted ml-2">（任意・入力すると Audience と照合）</span>
            </>
          }
          value={spEntityId}
          onChange={setSpEntityId}
          placeholder="https://sp.example.com/metadata"
          mono
        />
      )}

      {ok && (
        <div className="space-y-4" role="status" aria-live="polite">
          {/* デコード過程 */}
          <p className="caption text-muted">
            変換: {ok.decoded.steps.join(' → ')}（{BINDING_LABEL[ok.decoded.binding]}）
          </p>

          {/* サマリ */}
          <section className="rounded-lg p-4 bg-subtle">
            <h3 className="body-emphasis text-default mb-3">
              {response ? 'Response サマリ' : 'AuthnRequest サマリ'}
            </h3>
            {response && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer (IdP)" value={response.issuer} />
                <SummaryRow label="Status" value={response.statusCode} />
                <SummaryRow label="StatusMessage" value={response.statusMessage} />
                <SummaryRow label="Destination" value={response.destination} />
                <SummaryRow label="InResponseTo" value={response.inResponseTo} />
                <SummaryRow label="IssueInstant" value={response.issueInstant} />
                <SummaryRow
                  label="署名"
                  value={
                    response.signed || response.assertions.some((a) => a.signed)
                      ? 'あり（このツールでは検証しません）'
                      : 'なし'
                  }
                />
              </dl>
            )}
            {authnRequest && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer (SP)" value={authnRequest.issuer} />
                <SummaryRow label="Destination" value={authnRequest.destination} />
                <SummaryRow label="ACS URL" value={authnRequest.acsUrl} />
                <SummaryRow label="ProtocolBinding" value={authnRequest.protocolBinding} />
                <SummaryRow label="IssueInstant" value={authnRequest.issueInstant} />
                <SummaryRow label="NameIDPolicy Format" value={authnRequest.nameIdPolicyFormat} />
                <SummaryRow label="AllowCreate" value={authnRequest.allowCreate} />
                <SummaryRow
                  label="AuthnContextClassRef"
                  value={authnRequest.authnContextClassRefs.join(', ') || undefined}
                />
                <SummaryRow
                  label="署名"
                  value={authnRequest.signed ? 'あり（このツールでは検証しません）' : 'なし'}
                />
              </dl>
            )}
          </section>

          {/* チェックリスト（Response のみ） */}
          {checks && <CheckList items={checks} />}

          {/* EncryptedAssertion 案内 */}
          {response && response.encryptedAssertionCount > 0 && (
            <NotificationBanner variant="warning" title="暗号化された Assertion">
              EncryptedAssertion が {response.encryptedAssertionCount}{' '}
              件含まれています。復号（秘密鍵の入力）には対応していません。
            </NotificationBanner>
          )}

          {/* Assertion 詳細 */}
          {response?.assertions.map((a, i) => (
            <AssertionSection
              key={a.id ?? i}
              assertion={a}
              index={i}
              total={response.assertions.length}
            />
          ))}

          {/* 生 XML */}
          <details className="rounded-lg bg-subtle">
            <summary className="cursor-pointer p-4 body-emphasis text-default">
              整形済み XML
            </summary>
            <div className="px-4 pb-4 space-y-2">
              <div className="flex justify-end">
                <CopyButton text={prettyXml} label="コピー" />
              </div>
              <pre className="overflow-x-auto font-mono caption text-default">{prettyXml}</pre>
            </div>
          </details>

          <NotificationBanner variant="info" title="このツールの制限">
            XMLDSig 署名の検証・EncryptedAssertion
            の復号は行いません。表示内容の改ざん有無は保証されないため、署名検証が必要な場合は IdP /
            SP 側のログと突き合わせてください。入力データはブラウザ外に送信しません。
          </NotificationBanner>
        </div>
      )}

      {input && (
        <div className="flex justify-end">
          <ClearButton
            onClick={() => {
              setInput('');
              setSpEntityId('');
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx astro check --filter SamlDecoder.tsx`
Expected: エラー 0 件。`InputField` / `ResultTable` / `StatusBadge` の props が実際の定義と食い違う場合は**コンポーネント側の定義を読み**、この計画のコードを props 定義に合わせて修正する（既存コンポーネントは変更しない）。

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/SamlDecoder.tsx
git commit -m "feat: SAMLデコーダの UI コンポーネントを追加"
```

---

### Task 7: ページ・ツール登録・VRT 登録

**Files:**

- Create: `src/pages/tools/saml-decoder.astro`
- Modify: `src/data/tools.ts`（`toolEntries` 配列の末尾に追加）
- Modify: `tests/e2e/visual-regression-pages.ts`（`PAGES` の `'/tools/ddl-er-diagram'` の後に追加）

- [ ] **Step 1: Astro ページを作成**

`src/pages/tools/saml-decoder.astro`:

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { SamlDecoderTool } from '@/components/tools/SamlDecoder';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'saml-decoder')!;
---

<ToolLayout tool={tool}>
  <SamlDecoderTool client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      SSO の SAMLResponse / SAMLRequest（AuthnRequest）をデコードして内容を表示します。 URL
      全体・URLエンコード・base64（HTTP-POST binding）・base64 + deflate（HTTP-Redirect
      binding）・生 XML を自動判定します。Assertion には氏名・メールアドレス等の個人情報が
      含まれますが、全処理はブラウザ内で完結し、データを外部へ送信しません。 XMLDSig 署名の検証と
      EncryptedAssertion の復号には対応していません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>SSO ログイン失敗時に IdP からの SAMLResponse の Status・有効期限を確認したい</li>
      <li>Assertion に含まれる NameID・属性が SP の期待と一致しているか確認したい</li>
      <li>Audience / Destination の設定ミス（entityID 不一致）を切り分けたい</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 2: `src/data/tools.ts` の `toolEntries` 末尾（`ddl-er-diagram` エントリの後）に追加**

```ts
  {
    slug: 'saml-decoder',
    name: 'SAMLデコーダ',
    description:
      'SSO の SAMLResponse / AuthnRequest を base64・deflate 自動判定でデコードし、Assertion の内容と Status・有効期限・Audience の定番チェックを表示します。データはブラウザ外に送信しません',
    category: 'encode',
    yomi: 'さむるでこーだ',
  },
```

- [ ] **Step 3: `tests/e2e/visual-regression-pages.ts` の `PAGES` 配列（`'/tools/ddl-er-diagram'` の後）に追加**

```ts
  '/tools/saml-decoder',
```

- [ ] **Step 4: 検証**

```bash
node_modules/.bin/astro check
npm run test -- tests/meta/vrt-pages-coverage.test.ts
npm run build
```

Expected: すべて成功。`npm run dev` で `http://localhost:4321/tools/saml-decoder` が表示され、サンプルボタンでデコード結果が出ることを確認。

- [ ] **Step 5: Commit**

```bash
git add src/pages/tools/saml-decoder.astro src/data/tools.ts tests/e2e/visual-regression-pages.ts
git commit -m "feat: SAMLデコーダのページ・ツール登録・VRT 対象を追加"
```

---

### Task 8: E2E テスト（陽性対照含む）

**Files:**

- Create: `tests/e2e/saml-decoder.spec.ts`

規約リマインド: ロケーターは `getByRole` / `getByText` / `getByLabel` のみ。属性セレクタ禁止。`expect` のオートリトライを優先。

- [ ] **Step 1: E2E テストを書く**

`tests/e2e/saml-decoder.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

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
    await expect(page.getByText('HTTP-POST binding', { exact: false })).toBeVisible();
  });

  test('陽性対照: 期限切れ Response はエラー表示になる', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(responseXml({ notOnOrAfterOffsetMs: -300_000 }));
    await expect(page.getByText('期限切れです', { exact: false })).toBeVisible();
  });

  test('陽性対照: Status Responder はエラー表示になる', async ({ page }) => {
    await page
      .getByLabel(/SAMLResponse \/ SAMLRequest を貼り付け/)
      .fill(
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
```

- [ ] **Step 2: 実行して確認**

Run: `npm run test:e2e -- saml-decoder.spec.ts`
Expected: 全ケース PASS。ラベル文言・ボタン名（「サンプル」）が実際の `InputField` 実装とずれて fail した場合は、実 DOM の文言に合わせて **テスト側** を修正する。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/saml-decoder.spec.ts
git commit -m "test: SAMLデコーダの E2E テストを追加（陽性対照含む）"
```

---

### Task 9: ドキュメント更新

**Files:**

- Modify: `README.md`（ツール一覧に追加。既存行の形式に合わせる）
- Modify: `SPEC.md`（2.3 章: fflate 追加 / 2.4 章: `src/utils/saml/` / 4・5 章: ツール一覧 / 9 章: チェックリスト。各章の既存記述形式に合わせる）
- Modify: `docs/tools.md`（技術解説を追加）
- Modify: `docs/decisions.md`（採用理由を追記。既存の `[NNN]` 連番形式に従い次番号を使う）

- [ ] **Step 1: README.md のツール一覧に追加**

既存エントリの形式（表 or リスト）に合わせ、以下の内容で追加:

> **SAMLデコーダ** (`/tools/saml-decoder`) — SSO の SAMLResponse / AuthnRequest を自動判定デコードし、Assertion の内容と Status・有効期限・Audience の定番チェックを表示

- [ ] **Step 2: SPEC.md を更新**

- 2.3 章（ライブラリ一覧）: `fflate` を追加（用途: SAML HTTP-Redirect binding の raw deflate 展開）
- 2.4 章（ディレクトリ構成）: `src/utils/saml/` を追加
- 4・5 章（ツール一覧）: saml-decoder を追加
- 9 章（チェックリスト）: 該当フェーズに saml-decoder 完了項目を追加

- [ ] **Step 3: docs/tools.md に技術解説を追加**

既存ツールの見出し形式に合わせ、以下の内容で追加:

> **SAMLデコーダ（saml-decoder）**
>
> - 仕組み: 入力を URL パラメータ抽出 → URL デコード → base64 → raw deflate 展開（fflate `decompressSync`）の順に自動判定し、`DOMParser` で名前空間 URI ベース（prefix 非依存）にパース。Response は Status / Conditions / Audience / NameID の定番チェックを現在時刻基準で実行
> - 準拠仕様: SAML 2.0 Core / Bindings（HTTP-POST・HTTP-Redirect）。`NotOnOrAfter` は仕様通り排他境界として判定
> - 制限: XMLDSig 署名検証・EncryptedAssertion 復号・LogoutRequest 等の他メッセージ型は非対応（第2版候補）。ブラウザの `DOMParser` は外部エンティティを解決しないため XXE は発生しない

- [ ] **Step 4: docs/decisions.md に追記**

次の連番で追加:

> **[NNN] SAMLデコーダ: deflate 展開に fflate を採用**
> pako と比較し、バンドルサイズが小さく TypeScript 型定義を同梱する fflate を採用。`decompressSync` が raw deflate / zlib / gzip を自動判定するため、仕様外の zlib ラッパー付き実装の IdP にも耐性がある。XMLDSig 署名検証は C14N（正規化）実装が重く初版スコープ外とした（`docs/superpowers/specs/2026-07-17-saml-decoder-design.md` 参照）。

- [ ] **Step 5: 整形と確認**

```bash
npm run format
git diff --stat
```

- [ ] **Step 6: Commit**

```bash
git add README.md SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: SAMLデコーダのドキュメントを更新"
```

---

### Task 10: スコープ外項目の issue 化

**Files:** なし（GitHub 操作のみ）

- [ ] **Step 1: 第2版候補の issue を作成**（本文はファイル経由必須・`--body` 直接埋め込み禁止）

`/tmp/claude/saml-v2-issue.md` を作成:

```markdown
## 概要

SAMLデコーダ（#PR番号）の初版でスコープ外とした機能の第2版候補。

## 候補

- [ ] XMLDSig 署名検証（C14N 実装が山場。`xmldsigjs` 等の導入検討）
- [ ] EncryptedAssertion の復号（秘密鍵入力）
- [ ] LogoutRequest / LogoutResponse 等の他メッセージ型
- [ ] 共有用マスク出力（secret-scrubber との連携）

## 経緯

`docs/superpowers/specs/2026-07-17-saml-decoder-design.md` のスコープ外セクション参照。
```

```bash
gh issue create --title "SAMLデコーダ第2版: 署名検証・復号・他メッセージ型対応" --body-file /tmp/claude/saml-v2-issue.md
bash scripts/rm-tmp.sh /tmp/claude/saml-v2-issue.md
```

---

### Task 11: 最終検証と PR 作成

- [ ] **Step 1: push 前必須チェック（`.agents/rules/common.md` 3 章）**

```bash
npm run format:check
npm run lint
npm run test
node_modules/.bin/astro check
npm run test:e2e
```

Expected: すべて PASS。失敗があれば修正してから進む（修正は該当タスクの流儀で TDD）。

- [ ] **Step 2: PR 作成（`docs/playbooks/pr-creation.md` 3〜5 章参照）**

`/tmp/claude/pr_body.md` に PR 本文を作成（概要 / 変更内容 / スクリーンショット欄 / テスト結果 / スコープ外 issue 番号）し:

```bash
git push -u origin feat/saml-decoder
gh pr create --base develop --title "feat: SAMLデコーダを追加" --body-file /tmp/claude/pr_body.md
bash scripts/rm-tmp.sh /tmp/claude/pr_body.md
```

- [ ] **Step 3: UI 目視確認**

PC (1280x800) / スマホ (390x844) 両方でスクリーンショットを撮影し、`.agents/rules/ui-conventions.md` 3.1 章のチェックリストで目視確認。結果を PR に添付（撮影手順は同 3.2 章）。

- [ ] **Step 4: VRT baseline 再生成の手動トリガーを依頼**

`Update Visual Regression Baseline` workflow の `workflow_dispatch` を **ユーザーに手動トリガー依頼**する（web セッションでは 403 のため自分で起動を試みない。CLI セッションでも先に可否確認せず提案から入る）。branch は `feat/saml-decoder` を指定。

- [ ] **Step 5: マージ時の後処理（マージ後に実施）**

- `docs/tool-candidates.md` S2-2 の状態列に ✅ と PR 番号を記載（別コミットまたは同 PR 内最終コミット）
- feature PR は `--squash` でマージ。**squash コミット件名が Conventional Commits 形式（`feat: SAMLデコーダを追加 (#NNN)`）になっているか確認**（`docs/playbooks/pr-creation.md` 6 章）

---

## Self-Review 済み確認事項

- spec の全要件（5 入力形式 / Response・AuthnRequest / チェックリスト 4 項目+α / 署名存在表示 / EncryptedAssertion 案内 / 整形 XML / test-gates 陽性対照 / VRT / docs 更新 / スコープ外 issue 化）に対応するタスクがあることを確認
- `NotOnOrAfter` の排他境界（`now >= notOnOrAfter` で期限切れ）は SAML Core 仕様準拠。テスト・実装・docs の記述が一致
- 型名・関数名はタスク間で一貫（`decodeSamlInput` / `parseSamlXml` / `runResponseChecks` / `formatXml`、`SamlMessage` 判別は `type: 'response' | 'authnRequest'`）
- UI コードは既存 props 定義（InputField / ResultTable / StatusBadge / NotificationBanner / ClearButton / CopyButton）を確認済みの範囲で記述。Task 6 Step 2 に食い違い時の解決手順を明記
