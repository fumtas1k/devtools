/**
 * Vitest global setup — jsdom polyfill for Constructable Stylesheets API.
 *
 * jsdom 26 は CSSStyleSheet.replaceSync / document.adoptedStyleSheets 未実装のため polyfill する。
 * useDynamicStyleSheet を使うコンポーネント（ToggleGroup, ResultTable 等）を jsdom 環境で
 * render する全テストに適用される。
 */
if (typeof CSSStyleSheet !== 'undefined' && !CSSStyleSheet.prototype.replaceSync) {
  CSSStyleSheet.prototype.replaceSync = function (cssText: string) {
    while (this.cssRules.length > 0) {
      this.deleteRule(0);
    }
    const rules = cssText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    rules.forEach((rule, i) => {
      try {
        this.insertRule(rule, i);
      } catch {
        // jsdom の insertRule が拒否する正規 CSS rule もあるため polyfill では握りつぶす。
      }
    });
  };
}

if (typeof document !== 'undefined' && !('adoptedStyleSheets' in document)) {
  const sheets: CSSStyleSheet[] = [];
  Object.defineProperty(document, 'adoptedStyleSheets', {
    get() {
      return sheets;
    },
    set(v: CSSStyleSheet[]) {
      sheets.length = 0;
      sheets.push(...v);
    },
  });
}
