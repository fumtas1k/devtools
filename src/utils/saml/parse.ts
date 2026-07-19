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
    `対応していない SAML メッセージです（${root.namespaceURI ?? '名前空間なし'} の ${root.localName}）。SAML 2.0 の Response / AuthnRequest のみ対応しています`
  );
}

function parseResponse(root: Element): SamlResponseData {
  const status = childNS(root, NS_P, 'Status');
  const outerStatusCode = status ? childNS(status, NS_P, 'StatusCode') : undefined;
  // 二段階ステータス（外側 StatusCode の子にもう1つ StatusCode）の内側コード
  const innerStatusCode = outerStatusCode
    ? childNS(outerStatusCode, NS_P, 'StatusCode')
    : undefined;
  return {
    type: 'response',
    issuer: textOf(childNS(root, NS_A, 'Issuer')),
    statusCode: attrOf(outerStatusCode, 'Value'),
    statusSubCode: attrOf(innerStatusCode, 'Value'),
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
          audienceRestrictions: childrenNS(conditions, NS_A, 'AudienceRestriction').map((ar) =>
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
