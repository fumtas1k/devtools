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
  // template の中身は childNodes ではなく .content（別 fragment）に入るため、
  // リストから外すと走査に映らないまま innerHTML 再シリアライズで復活する。drop 必須
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

function parseUrl(value: string): URL | null {
  try {
    // 相対 URL はダミー base で解決される（srcdoc 内では親 origin 基準になり無害）
    return new URL(value.trim(), 'https://sandbox.invalid/');
  } catch {
    return null;
  }
}

/** a の href 用: http / https / mailto のみ許可 */
function isSafeLinkUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  // mailto: は連絡先リンクとして表示価値があり、sandbox iframe 内では navigation も遮断されるため許可
  return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
}

/** img src で許可する data: URL の MIME（raster 画像形式のみ。svg+xml は script を内包し得るため除外） */
const RASTER_IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

/**
 * img の src 用: data:image の raster 形式のみ許可。
 *
 * remote 画像（http / https）は本番 CSP（img-src 'self' data: blob:）で
 * srcdoc iframe 内でも描画されず img-src 違反ノイズになるだけで、
 * CSP のない dev では逆に外部フェッチ（tracking pixel）が発生してしまう
 * （「外部に送信されません」の建付けと齟齬）ため許可しない。
 */
function isSafeImageSrc(value: string): boolean {
  const url = parseUrl(value);
  if (!url || url.protocol !== 'data:') return false;
  // data: URL の pathname は "image/png;base64,..." 形式。MIME 部分のみ取り出して判定
  const mime = url.pathname.split(/[;,]/, 1)[0];
  return RASTER_IMAGE_MIME.test(mime);
}

function sanitizeAttributes(el: Element, tag: string): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' && (tag !== 'a' || !isSafeLinkUrl(attr.value))) {
      el.removeAttribute(attr.name);
    } else if (name === 'src' && (tag !== 'img' || !isSafeImageSrc(attr.value))) {
      el.removeAttribute(attr.name);
    }
  }
}

/**
 * 明示スタックによる反復走査でツリー全体をサニタイズする。
 *
 * クリップボード由来 HTML は攻撃者制御入力であり、関数再帰だと深いネスト
 * （約 2000 段）で RangeError が throw されレンダー中のコンポーネントごと
 * クラッシュするため、任意深度で throw しない反復実装とする。
 *
 * unwrap（許可リスト外の無害タグの展開）は、子をスタックへ積んでから
 * replaceWith で親へ移すことで、移動後の子も漏れなく処理される
 * （再帰版の「子を先に処理してから展開」と同じ結果になる）。
 *
 * root 自身は対象外で、root の子孫のみをサニタイズする（doc.body と同じ扱い）。
 * 既に DOM ツリーを持つ呼び出し元・深いネストのテスト用に export している。
 */
export function sanitizeTree(root: Element): void {
  // 走査中に付け替え・削除を行うため childNodes はスタックへ積んでから処理する
  const stack: Node[] = [];
  for (const node of root.childNodes) stack.push(node);

  while (stack.length > 0) {
    const node = stack.pop()!;
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
      // 許可リスト外の無害タグは unwrap（子要素のみ残す）。
      // 子は先にスタックへ積み、親へ移した後に必ず処理される
      const children = [...el.childNodes];
      for (const child of children) stack.push(child);
      el.replaceWith(...children);
      continue;
    }
    sanitizeAttributes(el, tag);
    for (const child of el.childNodes) stack.push(child);
  }
}

/** HTML 文字列をサニタイズして安全な HTML 文字列を返す */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeTree(doc.body);
  return doc.body.innerHTML;
}
