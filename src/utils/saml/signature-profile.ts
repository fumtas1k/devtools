import { NS_A, NS_DS, NS_P } from './ns';

const EXC = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const RSA = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENV = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const ASCII_PREFIX = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** 正規化ライブラリの名前空間出力における対応範囲を限定する。 */
function checkNamespace(prefix: string | null, uri: string | null): void {
  if (prefix && !ASCII_PREFIX.test(prefix))
    throw new Error('名前空間 prefix は ASCII 英字・数字・_・.・- の形式のみ対応しています');
  if (uri && /[&<>"\s]/u.test(uri))
    throw new Error('名前空間 URI にエスケープを要する文字または空白があるため対応していません');
}
export const MAX_SIGNATURE_XML_BYTES = 2 * 1024 * 1024;
export const MAX_CERT_BYTES = 64 * 1024;

export interface SignatureTarget {
  label: string;
  id: string | null;
  signed: boolean;
}
export interface SignatureResult extends SignatureTarget {
  status:
    'unsigned' | 'unverified' | 'processing' | 'match' | 'mismatch' | 'unsupported' | 'input-error';
  reason: string;
}

function children(el: Element): Element[] {
  return Array.from(el.childNodes).filter((node): node is Element => node.nodeType === 1);
}
function named(el: Element, local: string): boolean {
  return el.namespaceURI === NS_DS && el.localName === local;
}
function direct(el: Element, local: string): Element[] {
  return children(el).filter((child) => named(child, local));
}
function only(el: Element, names: string[]): boolean {
  return children(el).every(
    (child) => child.namespaceURI === NS_DS && names.includes(child.localName)
  );
}
function attributes(el: Element, allowed: string[]): boolean {
  return Array.from(el.attributes).every(
    (a) =>
      a.namespaceURI === 'http://www.w3.org/2000/xmlns/' ||
      (!a.namespaceURI && allowed.includes(a.name))
  );
}
function sequence(el: Element, names: string[]): boolean {
  const actual = children(el);
  return actual.length === names.length && actual.every((child, i) => named(child, names[i]));
}
function algorithm(el: Element, value: string): boolean {
  return (
    attributes(el, ['Algorithm']) &&
    el.getAttribute('Algorithm') === value &&
    children(el).length === 0 &&
    !el.textContent?.trim()
  );
}
function textValue(el: Element): boolean {
  return children(el).length === 0 && !!el.textContent?.trim();
}

/** ブラウザと worker の XML parser の差異を fail closed で検出する。 */
export function signatureSnapshot(doc: Document): string {
  const rows: unknown[] = [];
  const stack: { node: Node; depth: number }[] = [{ node: doc, depth: 0 }];
  let count = 0;
  let signatures = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (node.nodeType === 10) throw new Error('DTD / ENTITY は署名検証に対応していません');
    if (node.nodeType === 1) {
      if (++count > 10_000 || depth > 64)
        throw new Error('要素数 10,000 または深さ 64 を超えています');
      const el = node as Element;
      if (named(el, 'Signature') && ++signatures > 16)
        throw new Error('署名が 16 個を超えています');
      checkNamespace(el.prefix, el.namespaceURI);
      const attrs = Array.from(el.attributes).map((a) => {
        checkNamespace(a.prefix, a.namespaceURI);
        if (a.namespaceURI === XMLNS) {
          checkNamespace(a.name === 'xmlns' ? null : a.localName, a.value);
        }
        return [a.namespaceURI || '', a.name, a.value];
      });
      attrs.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      rows.push([1, depth, el.namespaceURI || '', el.nodeName, attrs]);
    } else if (
      [3, 4, 7, 8].includes(node.nodeType) &&
      !(node.nodeType === 7 && node.nodeName.toLowerCase() === 'xml') &&
      !(node.nodeType === 3 && node.parentNode?.nodeType === 9 && !node.nodeValue?.trim())
    ) {
      rows.push([node.nodeType, depth, node.nodeName, node.nodeValue]);
    }
    for (let i = node.childNodes.length - 1; i >= 0; i--)
      stack.push({
        node: node.childNodes[i],
        depth: depth + (node.nodeType === 1 || node.nodeType === 9 ? 1 : 0),
      });
  }
  return JSON.stringify(rows);
}

export function targetsFor(doc: Document): { element: Element; target: SignatureTarget }[] {
  const root = doc.documentElement;
  if (root.namespaceURI !== NS_P || root.localName !== 'Response')
    throw new Error('Response 以外の署名検証には対応していません');
  const assertions = children(root).filter(
    (e) => e.namespaceURI === NS_A && e.localName === 'Assertion'
  );
  return [root, ...assertions].map((element, i) => ({
    element,
    target: {
      label: i === 0 ? 'Response' : `Assertion ${i}`,
      id: element.getAttributeNS(null, 'ID'),
      signed: direct(element, 'Signature').length > 0,
    },
  }));
}

/** 署名解析前に参照・ID・構造の曖昧さをすべて拒否する。 */
export function checkDocument(doc: Document): void {
  const targets = targetsFor(doc);
  const allowed = new Set(targets.map(({ element }) => element));
  const seen = new Set<string>();
  const stack: Element[] = [doc.documentElement];
  while (stack.length) {
    const el = stack.pop()!;
    for (const attr of Array.from(el.attributes)) {
      if (/^id$/i.test(attr.localName)) {
        if (attr.namespaceURI || attr.name !== 'ID' || !attr.value || seen.has(attr.value))
          throw new Error('ID 属性の重複または別名があるため対象を特定できません');
        seen.add(attr.value);
      }
    }
    if (named(el, 'Signature') && (!el.parentNode || !allowed.has(el.parentNode as Element)))
      throw new Error('対象直下以外の Signature には対応していません');
    if (named(el, 'Object') || named(el, 'Manifest'))
      throw new Error('Object / Manifest には対応していません');
    stack.push(...children(el));
  }
}

export function checkTarget(element: Element): Element | null {
  const signatures = direct(element, 'Signature');
  if (signatures.length === 0) return null;
  if (signatures.length !== 1) throw new Error('直下の Signature は 1 個のみ対応しています');
  const id = element.getAttributeNS(null, 'ID');
  if (!id || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id))
    throw new Error('対象の ID がないか対応外の形式です');
  const sig = signatures[0];
  if (!only(sig, ['SignedInfo', 'SignatureValue', 'KeyInfo']) || direct(sig, 'KeyInfo').length > 1)
    throw new Error('Signature の構造に対応していません');
  const keyInfo = direct(sig, 'KeyInfo')[0];
  if (
    !sequence(
      sig,
      keyInfo ? ['SignedInfo', 'SignatureValue', 'KeyInfo'] : ['SignedInfo', 'SignatureValue']
    )
  )
    throw new Error('Signature の順序に対応していません');
  if (keyInfo) {
    // 埋め込み鍵は使用しない。既知の XMLDSig 鍵情報以外は受け入れない。
    const containers: Record<string, string[]> = {
      KeyInfo: ['X509Data', 'KeyValue', 'KeyName'],
      X509Data: ['X509Certificate', 'X509IssuerSerial', 'X509SubjectName', 'X509SKI', 'X509CRL'],
      X509IssuerSerial: ['X509IssuerName', 'X509SerialNumber'],
      KeyValue: ['RSAKeyValue'],
      RSAKeyValue: ['Modulus', 'Exponent'],
    };
    const pending = [keyInfo];
    while (pending.length) {
      const part = pending.pop()!;
      if (!attributes(part, [])) throw new Error('KeyInfo の属性に対応していません');
      const accepted = containers[part.localName];
      if (accepted) {
        if (!only(part, accepted)) throw new Error('KeyInfo の構造に対応していません');
        pending.push(...children(part));
      } else if (!textValue(part))
        throw new Error('KeyInfo のテキスト値に子要素または空値があります');
    }
  }
  const infos = direct(sig, 'SignedInfo');
  const values = direct(sig, 'SignatureValue');
  if (infos.length !== 1 || values.length !== 1 || !textValue(values[0]))
    throw new Error('SignatureValue または SignedInfo の構造に対応していません');
  const info = infos[0];
  if (!sequence(info, ['CanonicalizationMethod', 'SignatureMethod', 'Reference']))
    throw new Error('SignedInfo の構造に対応していません');
  const canon = direct(info, 'CanonicalizationMethod');
  const method = direct(info, 'SignatureMethod');
  const refs = direct(info, 'Reference');
  if (
    canon.length !== 1 ||
    !algorithm(canon[0], EXC) ||
    method.length !== 1 ||
    !algorithm(method[0], RSA)
  )
    throw new Error('署名方式または正規化方式に対応していません');
  if (refs.length !== 1 || refs[0].getAttribute('URI') !== `#${id}` || refs[0].hasAttribute('Type'))
    throw new Error('対象自身への単一 Reference のみ対応しています');
  const ref = refs[0];
  if (!sequence(ref, ['Transforms', 'DigestMethod', 'DigestValue']) || !attributes(ref, ['URI']))
    throw new Error('Reference の構造に対応していません');
  const transforms = direct(ref, 'Transforms');
  const digest = direct(ref, 'DigestMethod');
  const digestValue = direct(ref, 'DigestValue');
  if (
    transforms.length !== 1 ||
    !only(transforms[0], ['Transform']) ||
    digest.length !== 1 ||
    !algorithm(digest[0], SHA) ||
    digestValue.length !== 1 ||
    !textValue(digestValue[0])
  )
    throw new Error('Digest または Transform の構造に対応していません');
  const ts = direct(transforms[0], 'Transform');
  if (ts.length !== 2 || !algorithm(ts[0], ENV) || !algorithm(ts[1], EXC))
    throw new Error('Transform は enveloped → Exclusive C14N のみ対応しています');
  return sig;
}
