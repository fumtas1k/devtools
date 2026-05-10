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
 * 実装方針: lazy create + in-place 更新。
 *   - [rules] effect: 初回 non-empty で sheet を生成・attach (lazy create)。
 *     以降は同一 sheet を replaceSync で in-place 更新するため
 *     adoptedStyleSheets への add / filter を繰り返さない。
 *     rules が空文字列に変化した場合は sheet を attach したまま replaceSync('')
 *     で cssRules を空にする (再度 non-empty に戻った時の add コストを避ける)。
 *   - [] cleanup effect: unmount 時に sheet を detach し ref を null に戻す。
 *
 * @param buildRules - hook が確定した className を受け取り CSS rules 文字列を
 *   組み立てて返す callback。初回 mount で空文字列を返すと sheet 生成・attach を
 *   スキップする (後続の rerender で non-empty になれば lazy create する)。
 *   non-empty で attach 済みの状態から空文字列に切り替わった場合は sheet 自体は
 *   attach されたまま、cssRules のみ空になる。
 * @returns root element に付与する unique class 名
 */
export function useDynamicStyleSheet(buildRules: (className: string) => string): string {
  const rawId = useId();
  const className = `dyn-${rawId.replaceAll(':', '_')}`;
  const rules = buildRules(className);

  // sheet インスタンスを useRef で保持して同一インスタンスを再利用する
  const sheetRef = useRef<CSSStyleSheet | null>(null);

  // rules 変化時: 初回 non-empty で lazy create、以降は in-place 更新
  useEffect(() => {
    if (!rules) {
      // empty に変化した場合は cssRules を空にする (sheet は attach 維持)
      if (sheetRef.current) sheetRef.current.replaceSync('');
      return;
    }
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet();
      sheetRef.current = sheet;
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    sheetRef.current.replaceSync(rules);
  }, [rules]);

  // unmount 時に sheet を detach
  useEffect(() => {
    return () => {
      const sheet = sheetRef.current;
      if (sheet) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
        sheetRef.current = null;
      }
    };
  }, []);

  return className;
}
