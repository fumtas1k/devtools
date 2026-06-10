// src/components/tools/JsonTreeViewVirtual.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { KeyPart, RowActions, VALUE_CLASS } from '@/components/tools/JsonTreeRowParts';
import { flattenTree, computeWindow } from '@/utils/json-formatter';
import type { FlatRow, TreeNode } from '@/utils/json-formatter';

/** 実測前に使う行高の推定値（caption 0.875rem × line-height 1.6 + padding ≒ 24px）。 */
const ESTIMATED_ROW_H = 24;
/** 可視範囲の上下に余分に描画する行数（スクロール時の白抜け防止）。 */
const OVERSCAN = 20;

interface Props {
  node: TreeNode;
  /** 各コンテナの初期開閉状態（全展開 / 全折りたたみは親が key 再マウントで反映）。 */
  defaultOpen: boolean;
  /** スクロールコンテナ（.json-tree-box）への ref。親（JsonTreeResult）が所有する。 */
  scrollRef: RefObject<HTMLDivElement | null>;
}

interface RowProps {
  row: FlatRow;
  /** open 行のトグル。識別子は path ではなく行キー（重複キー JSON でも一意）。 */
  onToggle: (key: string) => void;
  /** 行高実測用 callback ref（可視 slice の先頭行のみに付与）。 */
  measureRef?: (el: HTMLLIElement | null) => void;
}

function VirtualRow({ row, onToggle, measureRef }: RowProps) {
  const { node, depth, kind } = row;
  // 現行ツリーの入れ子 ul（padding-left: 1.1rem）と同じ幅のインデントを
  // depth 個のスペーサで表現する（フラット構造のため。罫線は仮想パスでは省略）。
  const indent = Array.from({ length: depth }, (_, i) => (
    <span key={i} className="json-toggle-spacer" aria-hidden="true" />
  ));

  if (kind === 'close') {
    return (
      <li className="json-row" ref={measureRef}>
        <span className="json-line">
          {indent}
          <span className="json-toggle-spacer" aria-hidden="true" />
          <span className="json-punct">{node.type === 'array' ? ']' : '}'}</span>
        </span>
      </li>
    );
  }

  if (kind === 'value') {
    return (
      <li className="json-row" ref={measureRef}>
        <span className="json-line">
          {indent}
          <span className="json-toggle-spacer" aria-hidden="true" />
          <KeyPart node={node} />
          <span className={VALUE_CLASS[node.type] ?? ''}>{node.raw}</span>
          <RowActions node={node} />
        </span>
      </li>
    );
  }

  // kind === 'open'
  const openBracket = node.type === 'array' ? '[' : '{';
  const closeBracket = node.type === 'array' ? ']' : '}';
  const count = node.children?.length ?? 0;
  const open = !row.collapsed;
  return (
    <li className="json-row" ref={measureRef}>
      <span className="json-line">
        {indent}
        <button
          type="button"
          className="json-toggle"
          aria-expanded={open}
          aria-label={open ? '折りたたむ' : '展開する'}
          onClick={() => onToggle(row.key)}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <KeyPart node={node} />
        <span className="json-punct">{openBracket}</span>
        {!open && (
          <>
            <span className="json-collapsed">…</span>
            <span className="json-punct">{closeBracket}</span>
            <span className="json-count">{count} 項目</span>
          </>
        )}
        <RowActions node={node} />
      </span>
    </li>
  );
}

/**
 * 大規模 JSON 用の仮想化ツリービュー（issue #512）。
 * 可視範囲の行だけを DOM 化し、範囲外の高さは上下の spacer で保つ。
 *
 * - 開閉状態は「デフォルトからの反転 行キー集合」で集中管理（flattenTree の XOR 設計。
 *   行キーは基本 path、重複キー JSON では `#n` 付きで一意）。
 *   全展開 / 全折りたたみは親の key 再マウント + defaultOpen で state ごとリセットされる
 *   （JsonTreeView と同じ流儀）。
 * - spacer の高さは SVG の height 属性（presentation attribute）で表現する。
 *   CSS inline style ではないため CSP style-src の対象外（decisions [098] と同方式）。
 *   inline style / el.style mutation は一切使わない（issue #176 B 案準拠）。
 * - 行高は等高前提（1 行固定・nowrap）。可視 slice の先頭行を描画のたびに実測し、
 *   ズーム / フォント変化に追従する。
 */
export function JsonTreeViewVirtual({ node, defaultOpen, scrollRef }: Props) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [rowH, setRowH] = useState(0); // 0 = 未実測（推定値で描画）

  const rows = useMemo(() => flattenTree(node, toggled, defaultOpen), [node, toggled, defaultOpen]);

  // スクロール位置（rAF throttle）とビューポート高（ResizeObserver）を追跡する。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    setScrollTop(el.scrollTop);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTop(el.scrollTop));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [scrollRef]);

  // 行高の実測（callback ref）。0.5px 未満の揺らぎでは更新せず実測→再描画のループを防ぐ。
  const measureRef = useCallback((el: HTMLLIElement | null) => {
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0) setRowH((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
  }, []);

  const onToggle = useCallback((key: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const effectiveRowH = rowH > 0 ? rowH : ESTIMATED_ROW_H;
  const { start, end } = computeWindow(scrollTop, viewportH, effectiveRowH, rows.length, OVERSCAN);
  const topH = Math.round(start * effectiveRowH);
  const bottomH = Math.round((rows.length - end) * effectiveRowH);

  return (
    <div className="json-tree-root caption font-mono" role="group" aria-label="JSON ツリー">
      <ul className="json-tree json-tree--root">
        {topH > 0 && (
          <li aria-hidden="true">
            <svg className="block" width="1" height={topH} />
          </li>
        )}
        {rows.slice(start, end).map((row, i) => (
          <VirtualRow
            key={row.key}
            row={row}
            onToggle={onToggle}
            measureRef={i === 0 ? measureRef : undefined}
          />
        ))}
        {bottomH > 0 && (
          <li aria-hidden="true">
            <svg className="block" width="1" height={bottomH} />
          </li>
        )}
      </ul>
    </div>
  );
}
