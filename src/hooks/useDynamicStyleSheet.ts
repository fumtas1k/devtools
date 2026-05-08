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
 * SSR HTML → hydration 1 frame は dynamic style 未適用 (FOUC)。callsite が
 * hard-coded literal (例: ResultTable の minWidth='42rem') の場合は許容方針
 * (`docs/decisions.md [067] Follow-up decisions` 参照、option A)。callsite が
 * user input 経由 / props 動的変化を持つ場合は別途検討が必要。
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
