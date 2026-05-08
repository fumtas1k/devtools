import { useEffect, useId } from 'react';

/**
 * Constructable Stylesheets で per-instance scoped CSS を注入。
 *
 * CSP3 strict 化対応: `setProperty` / `style` 属性経由は `style-src` の対象だが、
 * `new CSSStyleSheet()` + `replaceSync()` は programmatic stylesheet として
 * `style-src` 対象外 (`docs/decisions.md [067]` 参照)。
 *
 * SSR-safe: `useId()` ベースで stable な class 名を返すため SSR / CSR で
 * markup mismatch しない。`adoptedStyleSheets` への attach は `useEffect`
 * 内で行うため client-side のみ実行される。
 *
 * @param buildRules - hook が確定した className を受け取り CSS rules 文字列を
 *   組み立てて返す callback。空文字列を返すと sheet 生成・attach をスキップする。
 * @returns root element に付与する unique class 名
 */
export function useDynamicStyleSheet(buildRules: (className: string) => string): string {
  const rawId = useId();
  const className = `dyn-${rawId.replaceAll(':', '_')}`;
  const rules = buildRules(className);

  useEffect(() => {
    if (!rules) return;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(rules);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
    };
  }, [rules]);

  return className;
}
