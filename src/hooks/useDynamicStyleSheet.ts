import { useEffect, useId, useRef } from 'react';

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
 * 実装方針 (B 案): effect を 2 本に分割し、Constructable Stylesheets の
 * in-place 更新のメリットを活かす。
 *   - 依存配列 [] の effect: mount 時のみ sheet を生成し adoptedStyleSheets に attach、
 *     unmount 時に detach する。sheet インスタンスは useRef で保持して同一を再利用。
 *   - 依存配列 [rules] の effect: rules が変化するたびに同一 sheet を replaceSync で
 *     in-place 更新する。sheet の add / filter を繰り返さないため sheet 数は増えない。
 *
 * @param buildRules - hook が確定した className を受け取り CSS rules 文字列を
 *   組み立てて返す callback。空文字列を返すと sheet 生成・attach をスキップする。
 * @returns root element に付与する unique class 名
 */
export function useDynamicStyleSheet(buildRules: (className: string) => string): string {
  const rawId = useId();
  const className = `dyn-${rawId.replaceAll(':', '_')}`;
  const rules = buildRules(className);

  // sheet インスタンスを useRef で保持して同一インスタンスを再利用する
  const sheetRef = useRef<CSSStyleSheet | null>(null);

  // mount 時のみ sheet を生成して adoptedStyleSheets に attach、unmount 時に detach
  useEffect(() => {
    if (!rules) return;
    const sheet = new CSSStyleSheet();
    sheetRef.current = sheet;
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
      sheetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rules が変化するたびに同一 sheet を in-place 更新 (sheet 数は増えない)
  useEffect(() => {
    if (!rules || !sheetRef.current) return;
    sheetRef.current.replaceSync(rules);
  }, [rules]);

  return className;
}
