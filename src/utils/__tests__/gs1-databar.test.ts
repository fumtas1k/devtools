import { describe, it, expect } from 'vitest';
import {
  calcGtin14CheckDigit,
  validateGtin14Input,
  buildBwipText,
  addSvgDimensions,
  escapeHtml,
  injectCompositeText,
  AI_DEFS,
  type AiCode,
} from '@/utils/gs1-databar';

// ────────────────────────────────────────────
// AI_DEFS: isVariableLength
// ────────────────────────────────────────────
// ... (omitted existing tests for brevity in reasoning, will include all in actual tool call)
describe('AI_DEFS isVariableLength', () => {
  it('固定長AI (17, 11, 15) は isVariableLength=false', () => {
    const fixedAis = ['17', '11', '15'];
    for (const ai of fixedAis) {
      const def = AI_DEFS.find((d) => d.ai === ai);
      expect(def?.isVariableLength, `AI ${ai} should be fixed-length`).toBe(false);
    }
  });

  it('可変長AI (10, 21) は isVariableLength=true', () => {
    const variableAis = ['10', '21'];
    for (const ai of variableAis) {
      const def = AI_DEFS.find((d) => d.ai === ai);
      expect(def?.isVariableLength, `AI ${ai} should be variable-length`).toBe(true);
    }
  });
});

// ────────────────────────────────────────────
// calcGtin14CheckDigit
// ────────────────────────────────────────────
describe('calcGtin14CheckDigit', () => {
  it('0498700000001 → チェックディジット 7', () => {
    // 左から: 0×3 4×1 9×3 8×1 7×3 0×1 0×3 0×1 0×3 0×1 0×3 0×1 1×3
    // = 0+4+27+8+21+0+0+0+0+0+0+0+3 = 63; check=(10-3)%10=7
    const r = calcGtin14CheckDigit('0498700000001');
    expect(r.checkDigit).toBe(7);
    expect(r.fullGtin).toBe('04987000000017');
  });

  it('0000000000000 → チェックディジット 0', () => {
    const r = calcGtin14CheckDigit('0000000000000');
    expect(r.checkDigit).toBe(0);
    expect(r.fullGtin).toBe('00000000000000');
  });

  it('0100000000001 → チェックディジット 5', () => {
    // 0×3+1×1+0×3+0×1+0×3+0×1+0×3+0×1+0×3+0×1+0×3+0×1+1×3
    // = 0+1+0+0+0+0+0+0+0+0+0+0+3 = 4; check=(10-4)=6... let's recalc
    // positions: i=0(0×3=0) i=1(1×1=1) i=2(0×3=0) i=3(0×1=0) i=4(0×3=0)
    //            i=5(0×1=0) i=6(0×3=0) i=7(0×1=0) i=8(0×3=0) i=9(0×1=0)
    //            i=10(0×3=0) i=11(0×1=0) i=12(1×3=3) sum=4
    // check=(10-4)%10=6
    const r = calcGtin14CheckDigit('0100000000001');
    expect(r.checkDigit).toBe(6);
    expect(r.fullGtin).toBe('01000000000016');
  });

  it('先頭0のGTIN-14: 0012345678901 → 正しいチェックディジット', () => {
    // 0×3+0×1+1×3+2×1+3×3+4×1+5×3+6×1+7×3+8×1+9×3+0×1+1×3
    // = 0+0+3+2+9+4+15+6+21+8+27+0+3 = 98; check=(10-8)%10=2
    const r = calcGtin14CheckDigit('0012345678901');
    expect(r.checkDigit).toBe(2);
    expect(r.fullGtin).toBe('00123456789012');
  });
});

// ────────────────────────────────────────────
// validateGtin14Input
// ────────────────────────────────────────────
describe('validateGtin14Input', () => {
  it('空文字はエラーなし', () => {
    expect(validateGtin14Input('')).toBe('');
  });

  it('正しい13桁の先頭0はエラーなし', () => {
    expect(validateGtin14Input('0498700000001')).toBe('');
  });

  it('正しい13桁の先頭1はエラーなし', () => {
    expect(validateGtin14Input('1234567890123')).toBe('');
  });

  it('数字以外はエラー', () => {
    expect(validateGtin14Input('049870000000a')).toBe('数字のみ入力してください');
  });

  it('桁数不足はエラー', () => {
    expect(validateGtin14Input('0498700')).toContain('13桁');
  });

  it('桁数超過はエラー', () => {
    expect(validateGtin14Input('04987000000011')).toContain('13桁');
  });

  it('先頭桁が2以上はエラー', () => {
    expect(validateGtin14Input('2498700000001')).toContain('0 または 1');
    expect(validateGtin14Input('9498700000001')).toContain('0 または 1');
  });
});

// ────────────────────────────────────────────
// buildBwipText
// ────────────────────────────────────────────
describe('buildBwipText', () => {
  it('合成フィールドなし → linear部のみ', () => {
    const result = buildBwipText('04987000000017', []);
    expect(result).toBe('(01)04987000000017');
  });

  it('空値のフィールドは除外される', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '' },
      { ai: '10' as AiCode, value: '' },
    ]);
    expect(result).toBe('(01)04987000000017');
  });

  it('1つのAIフィールド', () => {
    const result = buildBwipText('04987000000017', [{ ai: '17' as AiCode, value: '231231' }]);
    expect(result).toBe('(01)04987000000017|(17)231231');
  });

  it('複数のAIフィールド', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '231231' },
      { ai: '10' as AiCode, value: 'ABC123' },
    ]);
    expect(result).toBe('(01)04987000000017|(17)231231(10)ABC123');
  });

  it('値の前後スペースはトリムされる', () => {
    const result = buildBwipText('04987000000017', [{ ai: '10' as AiCode, value: '  ABC  ' }]);
    expect(result).toBe('(01)04987000000017|(10)ABC');
  });
});

// ────────────────────────────────────────────
// addSvgDimensions
// ────────────────────────────────────────────
//
// 陽性対照: fix を revert (shape-rendering 注入や width/height 注入を削る) と
// 該当 it() が必ず fail する設計。bwip-js の SVG が anti-alias で滲んで scanner
// decode 失敗した事象 (composite CC-A 部のロット (10) が読めない) を再発防止する
// regression test 一式。
describe('addSvgDimensions', () => {
  it('viewBox から width / height 属性を注入する (PNG 変換時の natural size 0x0 回避)', () => {
    const input = '<svg viewBox="0 0 96 50" xmlns="http://www.w3.org/2000/svg"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('width="96"');
    expect(out).toContain('height="50"');
  });

  it('shape-rendering="crispEdges" を注入する (bar/space edge の anti-alias 抑止)', () => {
    const input = '<svg viewBox="0 0 96 50" xmlns="http://www.w3.org/2000/svg"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('shape-rendering="crispEdges"');
  });

  it('注入された属性は <svg> 開始タグ内に存在する (子要素ではなく root への適用)', () => {
    const input = '<svg viewBox="0 0 100 40"><rect width="10" height="40"/></svg>';
    const out = addSvgDimensions(input);
    const openTag = out.match(/<svg[^>]*>/);
    expect(openTag).not.toBeNull();
    expect(openTag![0]).toContain('shape-rendering="crispEdges"');
    expect(openTag![0]).toContain('width="100"');
    expect(openTag![0]).toContain('height="40"');
  });

  it('小数 viewBox は四捨五入される (整数 pixel 寸法)', () => {
    const input = '<svg viewBox="0 0 95.6 49.4"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('width="96"');
    expect(out).toContain('height="49"');
  });

  it('viewBox を持たない入力は変更せず返す (想定外フォーマットを破壊しない)', () => {
    const input = '<svg width="100" height="50"></svg>';
    expect(addSvgDimensions(input)).toBe(input);
  });

  // 陽性対照 (silent regression 防止): bwip-js が将来 `<svg xmlns="..." viewBox=...>`
  // の属性順で出力するように変わった場合でも fix が動き続けることを保証する。
  // 旧実装 (literal `<svg viewBox=` で String.prototype.replace) ではここで no-op
  // になり width/height/shape-rendering が一切注入されない silent regression を
  // 起こしていた。
  it('viewBox の前に xmlns 属性があっても寸法と crispEdges を注入する', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 50"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('width="96"');
    expect(out).toContain('height="50"');
    expect(out).toContain('shape-rendering="crispEdges"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('viewBox の後に追加属性 (xmlns, class) があっても注入する', () => {
    const input = '<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg" class="foo"></svg>';
    const out = addSvgDimensions(input);
    expect(out).toContain('width="80"');
    expect(out).toContain('height="40"');
    expect(out).toContain('shape-rendering="crispEdges"');
    expect(out).toContain('class="foo"');
  });
});

// ────────────────────────────────────────────
// escapeHtml
// ────────────────────────────────────────────
//
// 陽性対照: `injectCompositeText` が AI 値を SVG <text> として埋め込む際の XSS 対策。
// fix を revert (関数削除 / `replace(/</g, ...)` 等の置換を削除) すると raw `<` `>`
// `"` が SVG に流れて XSS / SVG 破損が起き、本 describe の expected/actual 比較で
// 必ず差分が出て fail する設計。
describe('escapeHtml', () => {
  it('& は &amp; に変換される (最初に処理しないと連鎖 escape の事故になる)', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('< と > はタグ injection 防止のため変換される', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('" は属性 injection 防止のため &quot; に変換される', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it("' は属性 injection 防止のため &#039; に変換される", () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('複数文字が混在しても順序通り escape される (& 先頭で連鎖 escape を防ぐ)', () => {
    // `&` が `&amp;` に展開された後に再度 escape されると `&amp;amp;` になる事故を防ぐ。
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('escape 不要な文字 (英数記号 / 日本語) はそのまま', () => {
    expect(escapeHtml('(17)231231(10)ABC123')).toBe('(17)231231(10)ABC123');
    expect(escapeHtml('賞味期限')).toBe('賞味期限');
  });
});

// ────────────────────────────────────────────
// injectCompositeText
// ────────────────────────────────────────────
//
// 陽性対照: PR #450 (commit c563cf5) で撤去された AI テキスト SVG injection を
// PR #458 (透明背景真因判明) を受けて復活させる際の geometry / XSS 安全性 / dimension
// 拡張の回帰防止テスト一式。
//
// fix revert (関数削除 / dimension 拡張ロジック削除 / escape 削除) で必ず fail する
// 設計。具体的には:
//   - 関数削除: import error → test ファイル全体 fail
//   - dimension 拡張削除: newH = h + textRowH を確認する assert が fail
//   - text 配置 y 削除: `<text ... y="21" ...>` 文字列が存在しない fail
//   - XSS escape 削除: raw `<script>` が SVG 文字列に残って escape 検証 fail
describe('injectCompositeText', () => {
  // bwip-js + addSvgDimensions の出力に近い fixture
  const baseSvg =
    '<svg width="293" height="75" shape-rendering="crispEdges" viewBox="0 0 293 75"' +
    ' xmlns="http://www.w3.org/2000/svg">' +
    '<path stroke="#000000" stroke-width="3" d="M0 0L293 0"/></svg>';

  it('空 text は SVG をそのまま返す (early return)', () => {
    expect(injectCompositeText(baseSvg, '')).toBe(baseSvg);
  });

  it('viewBox を持たない SVG は変更せず返す (想定外 fixture 破壊防止)', () => {
    const noVb = '<svg width="100" height="50"><path/></svg>';
    expect(injectCompositeText(noVb, '(17)231231')).toBe(noVb);
  });

  it('text が injection され y=21 (textRowH - 3) に配置される', () => {
    const out = injectCompositeText(baseSvg, '(17)231231(10)ABC123');
    // text element の baseline 位置 (textRowH=24 - 3 = 21)
    expect(out).toMatch(/<text [^>]*y="21" /);
    // 中身は escape された AI 値
    expect(out).toContain('>(17)231231(10)ABC123</text>');
    expect(out).toContain('font-size="18"');
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain('fill="currentColor"');
    expect(out).toContain('font-family="\'Courier New\',Courier,monospace"');
  });

  it('viewBox 高さは元の barcode 高さ + textRowH(24) に拡張される', () => {
    const out = injectCompositeText(baseSvg, '(17)231231');
    // baseSvg height=75 + textRowH=24 = 99
    expect(out).toMatch(/viewBox="0 0 \S+ 99\.0"/);
    expect(out).toContain('height="99"');
  });

  it('barcode が text より広いときは barcode 幅を維持し translate は y=24 のみ (横 shift 0)', () => {
    // baseSvg width=293、text 長 10 文字 + padding 16 → 推定幅 ~76px < 293
    const out = injectCompositeText(baseSvg, '(17)231231');
    expect(out).toContain('width="293"');
    expect(out).toMatch(/viewBox="0 0 293\.0 99\.0"/);
    // translate(0, 24) で barcode は下方向のみ shift
    expect(out).toContain('transform="translate(0.0,24)"');
  });

  it('text が barcode より広いときは SVG 幅を拡張し barcode を中央寄せする', () => {
    // 54 文字 ((17) + '1'×50) × charW=10.8 + padding=16 = 599.2 > 293
    const longText = '(17)' + '1'.repeat(50);
    const out = injectCompositeText(baseSvg, longText);
    expect(out).toMatch(/viewBox="0 0 599\.2 99\.0"/);
    expect(out).toContain('width="599"'); // Math.round(599.2)
    // (newW - barcodeW) / 2 = (599.2 - 293) / 2 = 153.1
    expect(out).toContain('transform="translate(153.1,24)"');
  });

  it('XSS escape: <script> tag を含む text は &lt;script&gt; に escape される', () => {
    const out = injectCompositeText(baseSvg, '<script>alert(1)</script>');
    // raw `<script>` は SVG に出ない
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('</script>');
    // escape 後の文字列が text element 内に含まれる
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('barcode 部は <g transform="translate(_, 24)"> でラップされる (元 inner を保持)', () => {
    const out = injectCompositeText(baseSvg, '(17)231231');
    // 元 SVG の <path .../> が <g transform="..."> 内に残る
    expect(out).toMatch(/<g transform="translate\([\d.]+,24\)">.*<path[^>]*\/>.*<\/g>/s);
  });
});
