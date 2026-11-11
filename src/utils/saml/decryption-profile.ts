import { exceedsUtf8ByteLimit } from './limits';
import { NS_A, NS_DS, NS_P, NS_XENC } from './ns';

const X11 = 'http://www.w3.org/2009/xmlenc11#';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';

export interface DecryptionPlan {
  aesBits: 128 | 256;
  oaepHash: 'SHA-1' | 'SHA-256';
  label: Uint8Array<ArrayBuffer>;
  encryptedKey: Uint8Array<ArrayBuffer>;
  payload: Uint8Array<ArrayBuffer>;
}

function reject(message: string): never {
  throw new Error(`復号に対応していません: ${message}`);
}
function children(el: Element): Element[] {
  return Array.from(el.children);
}
function named(el: Element, ns: string, local: string): boolean {
  return el.namespaceURI === ns && el.localName === local;
}
function direct(el: Element, ns: string, local: string): Element[] {
  return children(el).filter((part) => named(part, ns, local));
}
function one(el: Element, ns: string, local: string): Element {
  const parts = direct(el, ns, local);
  if (parts.length !== 1) reject(`${local} は 1 個必要です`);
  return parts[0];
}
function allowed(el: Element, names: Array<[string, string]>): void {
  if (
    Array.from(el.childNodes).some(
      (node) => (node.nodeType === 3 || node.nodeType === 4) && node.nodeValue?.trim()
    )
  )
    reject(`${el.localName} のテキスト`);
  if (children(el).some((c) => !names.some(([ns, name]) => named(c, ns, name))))
    reject(`${el.localName} の子要素`);
}
function attrs(el: Element, names: string[]): void {
  if (
    Array.from(el.attributes).some(
      (a) => a.namespaceURI !== XMLNS && (a.namespaceURI || !names.includes(a.name))
    )
  )
    reject(`${el.localName} の属性`);
}
function noContent(el: Element): void {
  if (children(el).length || el.textContent?.trim()) reject(`${el.localName} の内容`);
}
function binary(el: Element, max: number): Uint8Array<ArrayBuffer> {
  if (children(el).length) reject('base64 の子要素');
  attrs(el, []);
  const s = (el.textContent ?? '').replace(/[\t\n\r ]/g, '');
  if (
    s.length > 4 * Math.ceil(max / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)
  )
    reject('不正または大きすぎる base64');
  const decoded = atob(s);
  if (decoded.length > max || btoa(decoded) !== s) reject('不正な base64');
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
function cipher(el: Element, max: number): Uint8Array<ArrayBuffer> {
  const cd = one(el, NS_XENC, 'CipherData');
  attrs(cd, []);
  allowed(cd, [[NS_XENC, 'CipherValue']]);
  return binary(one(cd, NS_XENC, 'CipherValue'), max);
}

/** 元の Response は変更せず、限定した復号計画だけを返す。 */
export function createDecryptionPlan(xml: string, index: number): DecryptionPlan {
  if (exceedsUtf8ByteLimit(xml, 2 * 1024 * 1024)) reject('XML は 2 MiB 以下');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) reject('DTD / ENTITY');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.doctype) reject('XML 構文');
  const root = doc.documentElement;
  if (!root || !named(root, NS_P, 'Response')) reject('Response のみ');
  const ids = new Map<string, Element>();
  const stack: Array<[Element, number]> = [[root, 1]];
  let count = 0;
  let encryptedAssertions = 0;
  while (stack.length) {
    const [el, depth] = stack.pop()!;
    if (++count > 10000 || depth > 64) reject('要素数または深さの上限');
    if (named(el, NS_A, 'EncryptedAssertion') && ++encryptedAssertions > 16)
      reject('暗号化 Assertion の件数');
    let idCount = 0;
    for (const a of Array.from(el.attributes)) {
      if (/^id$/i.test(a.localName)) {
        if (
          ++idCount > 1 ||
          a.namespaceURI ||
          !['ID', 'Id'].includes(a.name) ||
          !a.value ||
          ids.has(a.value)
        )
          reject('ID の重複または別名');
        ids.set(a.value, el);
      }
    }
    stack.push(...children(el).map((child): [Element, number] => [child, depth + 1]));
  }
  const assertions = direct(root, NS_A, 'EncryptedAssertion');
  if (assertions.length > 16 || !Number.isInteger(index) || index < 0 || index >= assertions.length)
    reject('暗号化 Assertion の選択または件数');
  const assertion = assertions[index];
  allowed(assertion, [
    [NS_XENC, 'EncryptedData'],
    [NS_XENC, 'EncryptedKey'],
  ]);
  const data = one(assertion, NS_XENC, 'EncryptedData');
  attrs(data, ['Id', 'Type']);
  if (data.hasAttribute('Type') && data.getAttribute('Type') !== NS_XENC + 'Element')
    reject('EncryptedData Type');
  allowed(data, [
    [NS_XENC, 'EncryptionMethod'],
    [NS_DS, 'KeyInfo'],
    [NS_XENC, 'CipherData'],
  ]);
  const method = one(data, NS_XENC, 'EncryptionMethod');
  attrs(method, ['Algorithm']);
  allowed(method, [[NS_XENC, 'KeySize']]);
  const algorithm = method.getAttributeNS(null, 'Algorithm');
  const aesBits =
    algorithm === X11 + 'aes128-gcm'
      ? 128
      : algorithm === X11 + 'aes256-gcm'
        ? 256
        : reject('AES-GCM 方式');
  const sizes = direct(method, NS_XENC, 'KeySize');
  if (
    sizes.length > 1 ||
    (sizes.length &&
      (children(sizes[0]).length || sizes[0].textContent?.trim() !== String(aesBits)))
  )
    reject('KeySize');
  if (sizes.length) attrs(sizes[0], []);
  const payload = cipher(data, 1024 * 1024 + 28);
  if (payload.length < 28) reject('GCM 暗号文の長さ');
  const infos = direct(data, NS_DS, 'KeyInfo');
  if (infos.length > 1) reject('KeyInfo の数');
  const siblingKeys = direct(assertion, NS_XENC, 'EncryptedKey');
  let key: Element;
  if (infos.length) {
    const info = infos[0];
    attrs(info, []);
    allowed(info, [
      [NS_XENC, 'EncryptedKey'],
      [NS_DS, 'RetrievalMethod'],
    ]);
    const inline = direct(info, NS_XENC, 'EncryptedKey');
    const refs = direct(info, NS_DS, 'RetrievalMethod');
    if (inline.length === 1 && !refs.length && !siblingKeys.length) key = inline[0];
    else if (!inline.length && !refs.length && siblingKeys.length === 1) key = siblingKeys[0];
    else if (!inline.length && refs.length === 1 && siblingKeys.length === 1) {
      const ref = refs[0];
      attrs(ref, ['URI', 'Type']);
      noContent(ref);
      if (ref.hasAttribute('Type') && ref.getAttribute('Type') !== NS_XENC + 'EncryptedKey')
        reject('RetrievalMethod Type');
      const uri = ref.getAttributeNS(null, 'URI');
      if (
        !uri ||
        !/^#[A-Za-z_][A-Za-z0-9_.-]*$/.test(uri) ||
        ids.get(uri.slice(1)) !== siblingKeys[0] ||
        siblingKeys[0].getAttributeNS(null, 'Id') !== uri.slice(1)
      )
        reject('RetrievalMethod');
      key = siblingKeys[0];
    } else reject('鍵の関連付け');
  } else {
    if (siblingKeys.length !== 1) reject('鍵の関連付け');
    key = siblingKeys[0];
  }
  attrs(key, ['Id']);
  allowed(key, [
    [NS_XENC, 'EncryptionMethod'],
    [NS_DS, 'KeyInfo'],
    [NS_XENC, 'CipherData'],
    [NS_XENC, 'ReferenceList'],
  ]);
  const keyInfos = direct(key, NS_DS, 'KeyInfo');
  if (keyInfos.length > 1) reject('鍵の KeyInfo');
  if (keyInfos.length) {
    attrs(keyInfos[0], []);
    allowed(keyInfos[0], [[NS_DS, 'KeyName']]);
    const names = direct(keyInfos[0], NS_DS, 'KeyName');
    if (
      names.length > 1 ||
      names.some(
        (n) =>
          children(n).length > 0 || Array.from(n.attributes).some((a) => a.namespaceURI !== XMLNS)
      )
    )
      reject('鍵名');
  }
  const lists = direct(key, NS_XENC, 'ReferenceList');
  if (lists.length > 1) reject('ReferenceList');
  if (lists.length) {
    attrs(lists[0], []);
    allowed(lists[0], [[NS_XENC, 'DataReference']]);
    const ref = one(lists[0], NS_XENC, 'DataReference');
    attrs(ref, ['URI']);
    noContent(ref);
    const id = data.getAttributeNS(null, 'Id');
    if (!id || ref.getAttributeNS(null, 'URI') !== `#${id}` || ids.get(id) !== data)
      reject('DataReference');
  }
  const km = one(key, NS_XENC, 'EncryptionMethod');
  attrs(km, ['Algorithm']);
  allowed(km, [
    [NS_DS, 'DigestMethod'],
    [X11, 'MGF'],
    [NS_XENC, 'OAEPparams'],
  ]);
  const keyAlgorithm = km.getAttributeNS(null, 'Algorithm');
  if (keyAlgorithm !== NS_XENC + 'rsa-oaep-mgf1p' && keyAlgorithm !== X11 + 'rsa-oaep')
    reject('RSA-OAEP 方式');
  const digests = direct(km, NS_DS, 'DigestMethod');
  const mgfs = direct(km, X11, 'MGF');
  const labels = direct(km, NS_XENC, 'OAEPparams');
  if (
    digests.length > 1 ||
    mgfs.length > 1 ||
    labels.length > 1 ||
    (keyAlgorithm === NS_XENC + 'rsa-oaep-mgf1p' && mgfs.length)
  )
    reject('OAEP パラメータ');
  for (const p of [...digests, ...mgfs]) {
    attrs(p, ['Algorithm']);
    noContent(p);
    if (!p.hasAttributeNS(null, 'Algorithm')) reject('OAEP の Algorithm 属性');
  }
  const digest = digests[0]?.getAttributeNS(null, 'Algorithm') ?? SHA1;
  const mgf = mgfs[0]?.getAttributeNS(null, 'Algorithm') ?? X11 + 'mgf1sha1';
  const oaepHash =
    digest === SHA1 && mgf === X11 + 'mgf1sha1'
      ? 'SHA-1'
      : digest === SHA256 && mgf === X11 + 'mgf1sha256' && keyAlgorithm === X11 + 'rsa-oaep'
        ? 'SHA-256'
        : reject('OAEP digest / MGF');
  const encryptedKey = cipher(key, 1024);
  if (!encryptedKey.length) reject('鍵暗号文');
  return {
    aesBits,
    oaepHash,
    label: labels.length ? binary(labels[0], 1024) : new Uint8Array(),
    encryptedKey,
    payload,
  };
}
