/**
 * クリップボード由来 HTML の許可リスト方式サニタイザ。
 *
 * 防御は二重構造（本サニタイザでの除去 ＋ 表示側の sandbox iframe）であり、
 * ここでの見落としが直ちにスクリプト実行に繋がらない設計だが、
 * 拒否リストではなく許可リスト方式で堅く守る。
 *
 * style 属性 / style 要素は本番 CSP（style-src strict, unsafe-inline なし）で
 * srcdoc iframe にも違反として継承されるため許可しない。
 */

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** 子要素ごと丸ごと削除する要素（実行可能・埋め込み・メタ・フォーム系） */
const DROP_WITH_CHILDREN = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'noscript',
  'template',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'dialog',
  'slot',
]);

/** 全要素共通の属性許可リスト。href / src は別途 URL 検証を行う */
const ALLOWED_ATTRS = new Set([
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'start',
  'reversed',
  'dir',
  'lang',
]);

function isSafeUrl(value: string, opts: { allowDataImage?: boolean } = {}): boolean {
  let url: URL;
  try {
    // 相対 URL はダミー base で解決される（srcdoc 内では親 origin 基準になり無害）
    url = new URL(value.trim(), 'https://sandbox.invalid/');
  } catch {
    return false;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
    return true;
  }
  if (opts.allowDataImage && url.protocol === 'data:') {
    return /^image\//i.test(url.pathname);
  }
  return false;
}

function sanitizeAttributes(el: Element, tag: string): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' && (tag !== 'a' || !isSafeUrl(attr.value))) {
      el.removeAttribute(attr.name);
    } else if (
      name === 'src' &&
      (tag !== 'img' || !isSafeUrl(attr.value, { allowDataImage: true }))
    ) {
      el.removeAttribute(attr.name);
    }
  }
}

function sanitizeNode(root: Element): void {
  // 走査中に付け替え・削除を行うため childNodes は配列化してから処理する
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue; // テキストノードは保持
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CHILDREN.has(tag)) {
      el.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      // 許可リスト外の無害タグは unwrap（子要素のみ残す）。先に子を処理してから展開
      sanitizeNode(el);
      el.replaceWith(...el.childNodes);
      continue;
    }
    sanitizeAttributes(el, tag);
    sanitizeNode(el);
  }
}

/** HTML 文字列をサニタイズして安全な HTML 文字列を返す */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}
