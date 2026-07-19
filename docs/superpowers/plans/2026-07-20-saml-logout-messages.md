# SAML デコーダ LogoutRequest / LogoutResponse 対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SAML デコーダを LogoutRequest / LogoutResponse（シングルログアウト）に対応させ、期限切れリクエスト・Status 失敗レスポンスのトラブルシュートを可能にする。

**Architecture:** 既存の「`parse.ts` ルート要素分岐 → 判別可能 union `SamlMessage` → 型別サマリ UI → 型別チェックリスト」パターンの最小拡張。Status 抽出とタイムゾーン注記は既存 Response ロジックから関数抽出して共有する。

**Tech Stack:** React + TypeScript (Astro island) / Vitest (jsdom) / Playwright。外部ライブラリ追加なし。

**Spec:** `docs/superpowers/specs/2026-07-20-saml-logout-messages-design.md`

**前提:** ブランチ `feat/issue-745-saml-logout-messages`（origin/develop 起点、作成済み）で作業する。

---

### Task 1: パーサ拡張（types + parse + フィクスチャ）

**Files:**
- Modify: `src/utils/saml/types.ts`（union に 2 型追加）
- Modify: `src/utils/saml/parse.ts`（ルート分岐 + `parseStatus` 抽出 + 2 パーサ追加）
- Modify: `src/utils/__tests__/saml-fixtures.ts`（フィクスチャ追加）
- Test: `src/utils/__tests__/saml-parse.test.ts`

- [ ] **Step 1: フィクスチャを追加する**

`src/utils/__tests__/saml-fixtures.ts` の `AUTHN_REQUEST_XML` 定義の直後（`toBase64` 関数の前）に以下を追加:

```ts
export const LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lreq1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://idp.example.com/slo" NotOnOrAfter="2026-07-17T00:05:00Z" Reason="urn:oasis:names:tc:SAML:2.0:logout:user">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</saml:NameID>
  <samlp:SessionIndex>_s1</samlp:SessionIndex>
  <samlp:SessionIndex>_s2</samlp:SessionIndex>
</samlp:LogoutRequest>`;

/** EncryptedID を含む LogoutRequest（NameID なし・復号非対応の注記確認用） */
export const ENCRYPTED_ID_LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lreq2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
  <saml:EncryptedID><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#"/></saml:EncryptedID>
</samlp:LogoutRequest>`;

/** NameID / EncryptedID / NotOnOrAfter がいずれもない LogoutRequest（チェックの error / info 分岐用） */
export const NO_NAMEID_LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lreq3" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://sp.example.com/metadata</saml:Issuer>
</samlp:LogoutRequest>`;

export const LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lres1" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" Destination="https://sp.example.com/slo" InResponseTo="_lreq1">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
</samlp:LogoutResponse>`;

/** 二段階ステータスで失敗する LogoutResponse（Status チェックの陽性対照用） */
export const FAILED_LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_lres2" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder">
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:RequestDenied"/>
    </samlp:StatusCode>
    <samlp:StatusMessage>Session not found</samlp:StatusMessage>
  </samlp:Status>
</samlp:LogoutResponse>`;

/** prefix なし（default xmlns）の LogoutRequest。prefix 非依存パースの回帰確認用 */
export const DEFAULT_NS_LOGOUT_REQUEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LogoutRequest xmlns="urn:oasis:names:tc:SAML:2.0:protocol" ID="_lreq4" Version="2.0" IssueInstant="2026-07-17T00:00:00Z">
  <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">https://sp.example.com/metadata</Issuer>
  <NameID xmlns="urn:oasis:names:tc:SAML:2.0:assertion">taro.yamada@example.com</NameID>
  <SessionIndex>_s1</SessionIndex>
</LogoutRequest>`;

/** prefix なし（default xmlns）の LogoutResponse。prefix 非依存パースの回帰確認用 */
export const DEFAULT_NS_LOGOUT_RESPONSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LogoutResponse xmlns="urn:oasis:names:tc:SAML:2.0:protocol" ID="_lres3" Version="2.0" IssueInstant="2026-07-17T00:00:00Z" InResponseTo="_lreq4">
  <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">https://idp.example.com/metadata</Issuer>
  <Status><StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></Status>
</LogoutResponse>`;
```

- [ ] **Step 2: 失敗するパーステストを書く**

`src/utils/__tests__/saml-parse.test.ts` の import に追加:

```ts
import {
  // ...既存 import はそのまま...
  LOGOUT_REQUEST_XML,
  ENCRYPTED_ID_LOGOUT_REQUEST_XML,
  NO_NAMEID_LOGOUT_REQUEST_XML,
  LOGOUT_RESPONSE_XML,
  FAILED_LOGOUT_RESPONSE_XML,
  DEFAULT_NS_LOGOUT_REQUEST_XML,
  DEFAULT_NS_LOGOUT_RESPONSE_XML,
} from './saml-fixtures';
```

ファイル末尾に追加:

```ts
describe('parseSamlXml: LogoutRequest', () => {
  it('サマリ情報と複数 SessionIndex を抽出する', () => {
    const m = parseSamlXml(LOGOUT_REQUEST_XML);
    if (m.type !== 'logoutRequest') throw new Error('logoutRequest expected');
    expect(m.issuer).toBe('https://sp.example.com/metadata');
    expect(m.destination).toBe('https://idp.example.com/slo');
    expect(m.issueInstant).toBe('2026-07-17T00:00:00Z');
    expect(m.notOnOrAfter).toBe('2026-07-17T00:05:00Z');
    expect(m.reason).toBe('urn:oasis:names:tc:SAML:2.0:logout:user');
    expect(m.nameId).toBe('taro.yamada@example.com');
    expect(m.nameIdFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    expect(m.encryptedNameId).toBe(false);
    expect(m.sessionIndexes).toEqual(['_s1', '_s2']);
    expect(m.signed).toBe(false);
  });

  it('EncryptedID を検出する', () => {
    const m = parseSamlXml(ENCRYPTED_ID_LOGOUT_REQUEST_XML);
    if (m.type !== 'logoutRequest') throw new Error('logoutRequest expected');
    expect(m.nameId).toBeUndefined();
    expect(m.encryptedNameId).toBe(true);
  });

  it('prefix なし（default xmlns）の LogoutRequest も正常にパースする（回帰）', () => {
    const m = parseSamlXml(DEFAULT_NS_LOGOUT_REQUEST_XML);
    if (m.type !== 'logoutRequest') throw new Error('logoutRequest expected');
    expect(m.issuer).toBe('https://sp.example.com/metadata');
    expect(m.nameId).toBe('taro.yamada@example.com');
    expect(m.sessionIndexes).toEqual(['_s1']);
  });

  it('NameID / EncryptedID / NotOnOrAfter なしはいずれも undefined / false / 空になる', () => {
    const m = parseSamlXml(NO_NAMEID_LOGOUT_REQUEST_XML);
    if (m.type !== 'logoutRequest') throw new Error('logoutRequest expected');
    expect(m.nameId).toBeUndefined();
    expect(m.encryptedNameId).toBe(false);
    expect(m.notOnOrAfter).toBeUndefined();
    expect(m.sessionIndexes).toEqual([]);
  });
});

describe('parseSamlXml: LogoutResponse', () => {
  it('サマリ情報を抽出する', () => {
    const m = parseSamlXml(LOGOUT_RESPONSE_XML);
    if (m.type !== 'logoutResponse') throw new Error('logoutResponse expected');
    expect(m.issuer).toBe('https://idp.example.com/metadata');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Success');
    expect(m.destination).toBe('https://sp.example.com/slo');
    expect(m.inResponseTo).toBe('_lreq1');
    expect(m.signed).toBe(false);
  });

  it('二段階ステータスの内側コードと StatusMessage を抽出する', () => {
    const m = parseSamlXml(FAILED_LOGOUT_RESPONSE_XML);
    if (m.type !== 'logoutResponse') throw new Error('logoutResponse expected');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Responder');
    expect(m.statusSubCode).toBe('urn:oasis:names:tc:SAML:2.0:status:RequestDenied');
    expect(m.statusMessage).toBe('Session not found');
  });

  it('prefix なし（default xmlns）の LogoutResponse も正常にパースする（回帰）', () => {
    const m = parseSamlXml(DEFAULT_NS_LOGOUT_RESPONSE_XML);
    if (m.type !== 'logoutResponse') throw new Error('logoutResponse expected');
    expect(m.issuer).toBe('https://idp.example.com/metadata');
    expect(m.statusCode).toBe('urn:oasis:names:tc:SAML:2.0:status:Success');
    expect(m.inResponseTo).toBe('_lreq4');
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm run test -- src/utils/__tests__/saml-parse.test.ts`
Expected: FAIL（`対応していない SAML メッセージです` エラーで新規 describe 2 つが落ちる。既存テストは PASS のまま）

- [ ] **Step 4: types.ts に 2 型を追加する**

`src/utils/saml/types.ts` の `SamlAuthnRequestData` 定義の直後に追加し、`SamlMessage` を差し替える:

```ts
export interface SamlLogoutRequestData {
  type: 'logoutRequest';
  issuer?: string;
  destination?: string;
  issueInstant?: string;
  /** ルート属性。リクエスト自体の有効期限（SAML 仕様上は任意） */
  notOnOrAfter?: string;
  /** Reason 属性（URI） */
  reason?: string;
  nameId?: string;
  nameIdFormat?: string;
  /** NameID が EncryptedID で暗号化されている場合 true（内容は表示不可・復号は非対応） */
  encryptedNameId: boolean;
  /** samlp:SessionIndex（複数可） */
  sessionIndexes: string[];
  signed: boolean;
}

export interface SamlLogoutResponseData {
  type: 'logoutResponse';
  issuer?: string;
  statusCode?: string;
  /** 外側 StatusCode の直下にネストした内側 StatusCode の Value */
  statusSubCode?: string;
  statusMessage?: string;
  destination?: string;
  inResponseTo?: string;
  issueInstant?: string;
  signed: boolean;
}
```

```ts
export type SamlMessage =
  | SamlResponseData
  | SamlAuthnRequestData
  | SamlLogoutRequestData
  | SamlLogoutResponseData;
```

- [ ] **Step 5: parse.ts を拡張する**

`src/utils/saml/parse.ts` を以下のとおり変更する。

import に 2 型を追加:

```ts
import type {
  SamlAssertion,
  SamlAttribute,
  SamlAuthnRequestData,
  SamlLogoutRequestData,
  SamlLogoutResponseData,
  SamlMessage,
  SamlResponseData,
} from './types';
```

`parseSamlXml` のルート分岐と doc コメント・エラーメッセージを更新:

```ts
/**
 * SAML XML を構造化モデルへパースする。
 * 対応: Response / AuthnRequest / LogoutRequest / LogoutResponse。それ以外の SAML メッセージ型はエラー。
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
  if (root.namespaceURI === NS_P && root.localName === 'LogoutRequest')
    return parseLogoutRequest(root);
  if (root.namespaceURI === NS_P && root.localName === 'LogoutResponse')
    return parseLogoutResponse(root);
  throw new Error(
    `対応していない SAML メッセージです（${root.namespaceURI ?? '名前空間なし'} の ${root.localName}）。SAML 2.0 の Response / AuthnRequest / LogoutRequest / LogoutResponse のみ対応しています`
  );
}
```

Status 抽出を `parseStatus` ヘルパーに抽出し、`parseResponse` を差し替える:

```ts
interface ParsedStatus {
  statusCode?: string;
  statusSubCode?: string;
  statusMessage?: string;
}

/** samlp:Status から外側/内側 StatusCode と StatusMessage を抽出する（Response / LogoutResponse 共通） */
function parseStatus(root: Element): ParsedStatus {
  const status = childNS(root, NS_P, 'Status');
  const outerStatusCode = status ? childNS(status, NS_P, 'StatusCode') : undefined;
  // 二段階ステータス（外側 StatusCode の子にもう1つ StatusCode）の内側コード
  const innerStatusCode = outerStatusCode
    ? childNS(outerStatusCode, NS_P, 'StatusCode')
    : undefined;
  return {
    statusCode: attrOf(outerStatusCode, 'Value'),
    statusSubCode: attrOf(innerStatusCode, 'Value'),
    statusMessage: status ? textOf(childNS(status, NS_P, 'StatusMessage')) : undefined,
  };
}

function parseResponse(root: Element): SamlResponseData {
  return {
    type: 'response',
    issuer: textOf(childNS(root, NS_A, 'Issuer')),
    ...parseStatus(root),
    destination: attrOf(root, 'Destination'),
    inResponseTo: attrOf(root, 'InResponseTo'),
    issueInstant: attrOf(root, 'IssueInstant'),
    signed: hasDirectSignature(root),
    assertions: childrenNS(root, NS_A, 'Assertion').map(parseAssertion),
    encryptedAssertionCount: childrenNS(root, NS_A, 'EncryptedAssertion').length,
  };
}
```

ファイル末尾に 2 パーサを追加:

```ts
function parseLogoutRequest(root: Element): SamlLogoutRequestData {
  const nameId = childNS(root, NS_A, 'NameID');
  return {
    type: 'logoutRequest',
    issuer: textOf(childNS(root, NS_A, 'Issuer')),
    destination: attrOf(root, 'Destination'),
    issueInstant: attrOf(root, 'IssueInstant'),
    notOnOrAfter: attrOf(root, 'NotOnOrAfter'),
    reason: attrOf(root, 'Reason'),
    nameId: textOf(nameId),
    nameIdFormat: attrOf(nameId, 'Format'),
    encryptedNameId: childNS(root, NS_A, 'EncryptedID') !== undefined,
    // SessionIndex は assertion 側ではなく protocol 名前空間の要素
    sessionIndexes: childrenNS(root, NS_P, 'SessionIndex').flatMap((e) => textOf(e) ?? []),
    signed: hasDirectSignature(root),
  };
}

function parseLogoutResponse(root: Element): SamlLogoutResponseData {
  return {
    type: 'logoutResponse',
    issuer: textOf(childNS(root, NS_A, 'Issuer')),
    ...parseStatus(root),
    destination: attrOf(root, 'Destination'),
    inResponseTo: attrOf(root, 'InResponseTo'),
    issueInstant: attrOf(root, 'IssueInstant'),
    signed: hasDirectSignature(root),
  };
}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm run test -- src/utils/__tests__/saml-parse.test.ts`
Expected: PASS（既存 Response / AuthnRequest テスト含め全件）

- [ ] **Step 7: 型チェックとコミット**

```bash
node_modules/.bin/astro check
git add src/utils/saml/types.ts src/utils/saml/parse.ts src/utils/__tests__/saml-fixtures.ts src/utils/__tests__/saml-parse.test.ts
git commit -m "feat: SAMLデコーダのパーサを LogoutRequest/LogoutResponse に対応"
```

Expected: astro check エラー 0 件（`SamlDecoder.tsx` は `SamlMessage` の union 拡張に対して網羅 switch を持たないため型エラーは出ない）

---

### Task 2: チェックリスト拡張（checks + index 公開）

**Files:**
- Modify: `src/utils/saml/checks.ts`（`statusCheckItem` / `timezoneNote` 抽出 + 2 関数追加）
- Modify: `src/utils/saml/index.ts`（export 追加）
- Test: `src/utils/__tests__/saml-checks.test.ts`

- [ ] **Step 1: 失敗するチェックテストを書く**

`src/utils/__tests__/saml-checks.test.ts` の import を更新:

```ts
import {
  parseSamlXml,
  runResponseChecks,
  runLogoutRequestChecks,
  runLogoutResponseChecks,
} from '@/utils/saml';
import type { SamlLogoutRequestData, SamlLogoutResponseData, SamlResponseData } from '@/utils/saml';
import {
  SAMPLE_RESPONSE_XML,
  FAILED_STATUS_RESPONSE_XML,
  ENCRYPTED_ASSERTION_RESPONSE_XML,
  NESTED_STATUS_RESPONSE_XML,
  LOGOUT_REQUEST_XML,
  ENCRYPTED_ID_LOGOUT_REQUEST_XML,
  NO_NAMEID_LOGOUT_REQUEST_XML,
  LOGOUT_RESPONSE_XML,
  FAILED_LOGOUT_RESPONSE_XML,
} from './saml-fixtures';
```

ファイル末尾に追加（`byId` は既存ヘルパーをそのまま利用。引数型が `runResponseChecks` の戻り値型なので `CheckItem[]` 互換でそのまま渡せる）:

```ts
function parseLogoutRequest(xml: string): SamlLogoutRequestData {
  const m = parseSamlXml(xml);
  if (m.type !== 'logoutRequest') throw new Error('logoutRequest expected');
  return m;
}

function parseLogoutResponse(xml: string): SamlLogoutResponseData {
  const m = parseSamlXml(xml);
  if (m.type !== 'logoutResponse') throw new Error('logoutResponse expected');
  return m;
}

// LOGOUT_REQUEST_XML の NotOnOrAfter: 2026-07-17T00:05:00Z
describe('runLogoutRequestChecks', () => {
  const req = parseLogoutRequest(LOGOUT_REQUEST_XML);

  it('期限内は success', () => {
    const item = byId(runLogoutRequestChecks(req, { now: IN_WINDOW }), 'notOnOrAfter');
    expect(item.status).toBe('success');
  });

  it('陽性対照: 期限切れは error', () => {
    const item = byId(runLogoutRequestChecks(req, { now: AFTER_WINDOW }), 'notOnOrAfter');
    expect(item.status).toBe('error');
    expect(item.detail).toContain('期限切れ');
  });

  it('NotOnOrAfter なしは info（SAML 仕様上は任意属性）', () => {
    const noLimit = parseLogoutRequest(NO_NAMEID_LOGOUT_REQUEST_XML);
    expect(byId(runLogoutRequestChecks(noLimit, { now: IN_WINDOW }), 'notOnOrAfter').status).toBe(
      'info'
    );
  });

  it('パース不能な NotOnOrAfter は warning', () => {
    const broken = { ...req, notOnOrAfter: 'not-a-date' };
    expect(byId(runLogoutRequestChecks(broken, { now: IN_WINDOW }), 'notOnOrAfter').status).toBe(
      'warning'
    );
  });

  it('タイムゾーンなし日時は判定続行しつつ warning + 注記', () => {
    const noTz = { ...req, notOnOrAfter: '2026-07-17T00:05:00' };
    const item = byId(runLogoutRequestChecks(noTz, { now: BEFORE_WINDOW }), 'notOnOrAfter');
    expect(item.status).toBe('warning');
    expect(item.detail).toContain('ローカル時刻');
  });

  it('NameID ありは success', () => {
    expect(byId(runLogoutRequestChecks(req, { now: IN_WINDOW }), 'nameid').status).toBe('success');
  });

  it('EncryptedID は warning（復号非対応）', () => {
    const enc = parseLogoutRequest(ENCRYPTED_ID_LOGOUT_REQUEST_XML);
    const item = byId(runLogoutRequestChecks(enc, { now: IN_WINDOW }), 'nameid');
    expect(item.status).toBe('warning');
    expect(item.detail).toContain('暗号化');
  });

  it('陽性対照: NameID / EncryptedID なしは error', () => {
    const none = parseLogoutRequest(NO_NAMEID_LOGOUT_REQUEST_XML);
    expect(byId(runLogoutRequestChecks(none, { now: IN_WINDOW }), 'nameid').status).toBe('error');
  });
});

describe('runLogoutResponseChecks', () => {
  it('Status Success は success', () => {
    const res = parseLogoutResponse(LOGOUT_RESPONSE_XML);
    expect(byId(runLogoutResponseChecks(res), 'status').status).toBe('success');
  });

  it('陽性対照: Status 失敗は error になり内側コードを併記する', () => {
    const res = parseLogoutResponse(FAILED_LOGOUT_RESPONSE_XML);
    const item = byId(runLogoutResponseChecks(res), 'status');
    expect(item.status).toBe('error');
    expect(item.detail).toContain('Responder / RequestDenied');
    expect(item.detail).toContain('Session not found');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test -- src/utils/__tests__/saml-checks.test.ts`
Expected: FAIL（`runLogoutRequestChecks` / `runLogoutResponseChecks` が未定義）

- [ ] **Step 3: checks.ts を実装する**

`src/utils/saml/checks.ts` に以下の変更を加える。

import を更新:

```ts
import type {
  CheckItem,
  SamlLogoutRequestData,
  SamlLogoutResponseData,
  SamlResponseData,
} from './types';
```

`STATUS_SUCCESS` 定数の直後に共有ヘルパー 2 つを追加:

```ts
interface StatusFields {
  statusCode?: string;
  statusSubCode?: string;
  statusMessage?: string;
}

/** Status チェック項目を組み立てる（Response / LogoutResponse 共通） */
function statusCheckItem(res: StatusFields): CheckItem {
  if (res.statusCode === STATUS_SUCCESS) {
    return { id: 'status', label: 'Status', status: 'success', detail: 'Success' };
  }
  const code = res.statusCode?.split(':').pop() ?? '不明';
  const subCode = res.statusSubCode?.split(':').pop();
  const codeLabel = subCode ? `${code} / ${subCode}` : code;
  return {
    id: 'status',
    label: 'Status',
    status: 'error',
    detail: res.statusMessage
      ? `${codeLabel}（StatusMessage: ${res.statusMessage}）`
      : `${codeLabel}（Success ではありません）`,
  };
}

/**
 * xs:dateTime 文字列の解釈注記を組み立てる。
 * - 日付のみ形式（YYYY / YYYY-MM / YYYY-MM-DD）は ES 仕様上 UTC (00:00Z) 解釈が確定 → 専用注記
 * - timezone designator（Z / ±hh / ±hh:mm / ±hhmm）なしはローカル時刻解釈で環境依存 → 警告注記
 * 両形式が混在する場合は注記を連結する
 */
function timezoneNote(...values: (string | undefined)[]): {
  note: string;
  missingTimezone: boolean;
} {
  // 時刻部（T または スペース区切りの hh:mm）の存在を前提とすることで、年月のみ形式
  // （例: "2026-07"）の末尾ハイフンをタイムゾーンオフセットと誤認しないようにする
  const hasTimezone = (s: string) =>
    /[T ]\d{2}:\d{2}/.test(s) && /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(s);
  const isDateOnly = (s: string) => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(s);
  const present = values.filter((v): v is string => !!v);
  const dateOnly = present.some(isDateOnly);
  const missingTimezone = present.some((v) => !isDateOnly(v) && !hasTimezone(v));
  let note = '';
  if (dateOnly) note += '\n※ 日付のみのため、UTC (00:00Z) として解釈しています';
  if (missingTimezone)
    note += '\n※ タイムゾーン指定がないため、この端末のローカル時刻として解釈しています';
  return { note, missingTimezone };
}
```

`runResponseChecks` の Status ブロック（`// 1. Status` から最初の `}` まで）を差し替え:

```ts
  // 1. Status
  items.push(statusCheckItem(res));
```

`runResponseChecks` の有効期間ループ内の `hasTimezone` / `isDateOnly` / `dateOnly` / `missingTimezone` / `tzNote` の組み立て（`const hasTimezone = ...` から `if (missingTimezone) ...` の行まで）を差し替え:

```ts
    const { note: tzNote, missingTimezone } = timezoneNote(c.notBefore, c.notOnOrAfter);
```

（以降の `${tzNote}` 参照と `missingTimezone ? 'warning' : 'success'` はそのまま）

ファイル末尾に 2 関数を追加:

```ts
/** LogoutRequest の定番チェックリストを実行する */
export function runLogoutRequestChecks(
  req: SamlLogoutRequestData,
  opts: CheckOptions = {}
): CheckItem[] {
  const now = opts.now ?? new Date();
  const items: CheckItem[] = [];

  // 1. NotOnOrAfter（LogoutRequest では任意属性のため、なしは info）
  if (!req.notOnOrAfter) {
    items.push({
      id: 'notOnOrAfter',
      label: 'NotOnOrAfter',
      status: 'info',
      detail: '期限指定はありません（SAML 仕様上は任意）',
    });
  } else {
    const limit = new Date(req.notOnOrAfter);
    if (isNaN(limit.getTime())) {
      items.push({
        id: 'notOnOrAfter',
        label: 'NotOnOrAfter',
        status: 'warning',
        detail: `日時を解釈できません（NotOnOrAfter: ${req.notOnOrAfter}）`,
      });
    } else {
      const { note, missingTimezone } = timezoneNote(req.notOnOrAfter);
      if (now >= limit) {
        items.push({
          id: 'notOnOrAfter',
          label: 'NotOnOrAfter',
          status: 'error',
          detail: `期限切れです（NotOnOrAfter: ${req.notOnOrAfter}）${note}`,
        });
      } else {
        items.push({
          id: 'notOnOrAfter',
          label: 'NotOnOrAfter',
          status: missingTimezone ? 'warning' : 'success',
          detail: `期限内です（NotOnOrAfter: ${req.notOnOrAfter}）${note}`,
        });
      }
    }
  }

  // 2. NameID（SAML 2.0 Core 仕様上 BaseID / NameID / EncryptedID のいずれかが必須）
  if (req.nameId) {
    items.push({
      id: 'nameid',
      label: 'NameID',
      status: 'success',
      detail: 'NameID が含まれています',
    });
  } else if (req.encryptedNameId) {
    items.push({
      id: 'nameid',
      label: 'NameID',
      status: 'warning',
      detail: '暗号化されており内容を確認できません（復号は非対応）',
    });
  } else {
    items.push({
      id: 'nameid',
      label: 'NameID',
      status: 'error',
      detail: 'NameID が含まれていません（LogoutRequest には NameID / EncryptedID のいずれかが必要です）',
    });
  }

  return items;
}

/** LogoutResponse の定番チェックリストを実行する（Status のみ） */
export function runLogoutResponseChecks(res: SamlLogoutResponseData): CheckItem[] {
  return [statusCheckItem(res)];
}
```

`src/utils/saml/index.ts` の checks export を差し替え:

```ts
export {
  runResponseChecks,
  runLogoutRequestChecks,
  runLogoutResponseChecks,
  type CheckOptions,
} from './checks';
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm run test -- src/utils/__tests__/saml-checks.test.ts`
Expected: PASS（既存 `runResponseChecks` テスト含め全件。リファクタで挙動が変わっていないことの回帰確認を兼ねる）

- [ ] **Step 5: 全ユニットテスト・型チェック・コミット**

```bash
npm run test
node_modules/.bin/astro check
git add src/utils/saml/checks.ts src/utils/saml/index.ts src/utils/__tests__/saml-checks.test.ts
git commit -m "feat: LogoutRequest/LogoutResponse のチェックリストを追加"
```

Expected: 全テスト PASS / astro check エラー 0 件

---

### Task 3: UI 拡張（SamlDecoder.tsx）

**Files:**
- Modify: `src/components/tools/SamlDecoder.tsx`

- [ ] **Step 1: import と型別分岐を追加する**

`@/utils/saml` の import に `runLogoutRequestChecks, runLogoutResponseChecks` を追加:

```ts
import {
  decodeSamlInput,
  parseSamlXml,
  runResponseChecks,
  runLogoutRequestChecks,
  runLogoutResponseChecks,
  formatXml,
  type CheckItem,
  type DecodedInput,
  type SamlAssertion,
  type SamlAttribute,
  type SamlBinding,
  type SamlMessage,
} from '@/utils/saml';
```

`SamlDecoderTool` 内の型別変数と checks useMemo を差し替え（`const authnRequest = ...` の行の直後に 2 行追加し、`const checks = ...` を差し替え）:

```ts
  const logoutRequest = ok && ok.message.type === 'logoutRequest' ? ok.message : null;
  const logoutResponse = ok && ok.message.type === 'logoutResponse' ? ok.message : null;

  const checks = useMemo(() => {
    if (response) return runResponseChecks(response, { spEntityId });
    if (logoutRequest) return runLogoutRequestChecks(logoutRequest);
    if (logoutResponse) return runLogoutResponseChecks(logoutResponse);
    return null;
  }, [response, logoutRequest, logoutResponse, spEntityId]);
```

- [ ] **Step 2: サマリ見出しと型別 dl を追加する**

サマリセクションの見出しを差し替え:

```tsx
            <h3 className="body-emphasis text-default mb-3">
              {response && 'Response サマリ'}
              {authnRequest && 'AuthnRequest サマリ'}
              {logoutRequest && 'LogoutRequest サマリ'}
              {logoutResponse && 'LogoutResponse サマリ'}
            </h3>
```

`{authnRequest && (...)}` ブロックの直後（サマリ `</section>` の直前）に追加:

```tsx
            {logoutRequest && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer" value={logoutRequest.issuer} />
                <SummaryRow label="Destination" value={logoutRequest.destination} />
                <SummaryRow label="IssueInstant" value={logoutRequest.issueInstant} />
                <SummaryRow label="NotOnOrAfter" value={logoutRequest.notOnOrAfter} />
                <SummaryRow label="Reason" value={logoutRequest.reason} />
                <SummaryRow
                  label="NameID"
                  value={
                    logoutRequest.encryptedNameId ? '（暗号化・表示不可）' : logoutRequest.nameId
                  }
                />
                <SummaryRow label="NameID Format" value={logoutRequest.nameIdFormat} />
                <SummaryRow
                  label="SessionIndex"
                  value={logoutRequest.sessionIndexes.join(', ') || undefined}
                />
                <SummaryRow
                  label="署名"
                  value={logoutRequest.signed ? 'あり（このツールでは検証しません）' : 'なし'}
                />
              </dl>
            )}
            {logoutResponse && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer" value={logoutResponse.issuer} />
                <SummaryRow label="Status" value={logoutResponse.statusCode} />
                <SummaryRow label="Status (内側)" value={logoutResponse.statusSubCode} />
                <SummaryRow label="StatusMessage" value={logoutResponse.statusMessage} />
                <SummaryRow label="Destination" value={logoutResponse.destination} />
                <SummaryRow label="InResponseTo" value={logoutResponse.inResponseTo} />
                <SummaryRow label="IssueInstant" value={logoutResponse.issueInstant} />
                <SummaryRow
                  label="署名"
                  value={logoutResponse.signed ? 'あり（このツールでは検証しません）' : 'なし'}
                />
              </dl>
            )}
```

注: チェックリストの `{checks && <CheckList items={checks} />}` は既存のまま変更不要（checks の useMemo 差し替えで Logout 2 型にも表示される）。コメント `{/* チェックリスト（Response のみ） */}` は `{/* チェックリスト（Response / Logout 2 型） */}` に更新する。

- [ ] **Step 3: 型チェック・ユニットテスト・コミット**

```bash
node_modules/.bin/astro check
npm run test
git add src/components/tools/SamlDecoder.tsx
git commit -m "feat: SAMLデコーダ UI に LogoutRequest/LogoutResponse サマリとチェックリストを追加"
```

Expected: astro check エラー 0 件 / 全テスト PASS

---

### Task 4: E2E テスト追加

**Files:**
- Modify: `tests/e2e/saml-decoder.spec.ts`

- [ ] **Step 1: E2E spec を追加する**

`tests/e2e/saml-decoder.spec.ts` の `AUTHN_REQUEST_XML` 定義の直後に追加:

```ts
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
```

`test.describe('SAMLデコーダ', ...)` ブロック内の末尾に追加:

```ts
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
    await expect(page.getByText('Session not found', { exact: false })).toBeVisible();
  });
```

注: `beforeEach` の `waitForReactHydration(page)` は既存 spec で対応済みのため追加不要。

- [ ] **Step 2: E2E を実行する**

Run: `npm run test:e2e -- saml-decoder`
Expected: PASS（既存 + 新規 3 件）

※ sandbox の loopback connect 全面 deny 環境では実行不能。接続 probe が 2〜3 回失敗したら `.claude/rules/git-and-fs.md` に従い workaround 探索を打ち切り、「CI を最終ゲートにする」判断へ切り替えて完了報告に明記する。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/saml-decoder.spec.ts
git commit -m "test(e2e): LogoutRequest/LogoutResponse の表示と陽性対照を追加"
```

---

### Task 5: ドキュメント更新

**Files:**
- Modify: `docs/tools.md`（SAMLデコーダ節）

- [ ] **Step 1: docs/tools.md を更新する**

`docs/tools.md` の SAMLデコーダ節（366 行目付近）で以下 3 箇所を変更する。

(1) 「仕組み・アルゴリズム」の `parse.ts` の段落（`- \`parse.ts\` が ...` の行）の「Response は Issuer/Status/...」の文に LogoutRequest / LogoutResponse を追記し、次のとおり差し替える:

```markdown
- `parse.ts` が `DOMParser` で XML をパースし、`getElementsByTagNameNS` 等の名前空間 URI ベースの解決で prefix（`saml:` / `samlp:` 等）非依存に構造化する。Response は Issuer/Status/Destination と Assertion ごとの NameID・属性・Conditions・AuthnStatement・SubjectConfirmationData、AuthnRequest は Issuer/Destination/AssertionConsumerServiceURL/ProtocolBinding/NameIDPolicy/RequestedAuthnContext、LogoutRequest は Issuer/Destination/NotOnOrAfter/Reason/NameID（EncryptedID は存在検出のみ）/SessionIndex（複数可）、LogoutResponse は Issuer/Status/Destination/InResponseTo を抽出する。`ds:Signature` の有無・`EncryptedAssertion` の件数も検出する（存在表示のみ、検証・復号はしない）
```

(2) `checks.ts` の段落の箇条書き（`- \`checks.ts\` の \`runResponseChecks\` が ...` のサブ項目群）の末尾に追加:

```markdown
  - `runLogoutRequestChecks` は LogoutRequest の NotOnOrAfter（任意属性のため未指定は info、期限切れは error）と NameID の存在（EncryptedID は復号非対応のため warning、いずれもなしは仕様違反として error）を、`runLogoutResponseChecks` は Status を同じ規則で判定する
```

(3) 「制限・エッジケース」の 1 つ目の箇条書きを差し替え:

```markdown
- XMLDSig 署名検証・EncryptedAssertion / EncryptedID の復号・ArtifactResolve 等のその他メッセージ型は非対応（署名・暗号化は存在の有無のみ表示。第2版候補）
```

- [ ] **Step 2: 整形チェックとコミット**

```bash
npm run format:check
git add docs/tools.md
git commit -m "docs: SAMLデコーダの LogoutRequest/LogoutResponse 対応を技術解説に反映"
```

Expected: format:check PASS（fail した場合は `npm run format` で整形してから commit）

---

## 完了後（親セッションが実施）

1. push 前必須チェック: `npm run test` / `node_modules/.bin/astro check` / `npm run test:e2e`（sandbox 不能なら CI ゲート判断を PR 本文に明記）
2. `git push -u origin feat/issue-745-saml-logout-messages`
3. PR 作成: `gh pr create --base develop --body-file /tmp/claude/pr_body.md`（`docs/playbooks/pr-creation.md` 3〜5 章に従う）
4. マージ後: issue #745 のチェックボックス「LogoutRequest / LogoutResponse 等の他メッセージ型」を更新

## スコープ外

- 署名検証 / EncryptedAssertion・EncryptedID の復号 / マスク出力 / その他メッセージ型（issue #745 に残置）
- サンプルボタンの Logout 対応・VRT ページ追加・README / SPEC.md 更新（ツール追加ではないため不要）
