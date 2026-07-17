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
