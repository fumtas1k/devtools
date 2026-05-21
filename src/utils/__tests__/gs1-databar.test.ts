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
// fix revert (関数削除 / dimension 拡張ロジック削除 / escape 削除 / quiet zone 撤去 /
// 白背景 rect 撤去) で必ず fail する設計。具体的には:
//   - 関数削除: import error → test ファイル全体 fail
//   - dimension 拡張削除: newH = h + barcodeOffsetY(33) を確認する assert が fail
//   - text 配置 y 削除: `<text ... y="21" ...>` 文字列が存在しない fail
//   - XSS escape 削除: raw `<script>` が SVG 文字列に残って escape 検証 fail
//   - quiet zone 撤去 (barcodeOffsetY を textRegionH と同値に戻す): translate y=33 検証 fail
//   - 白背景 rect 撤去: `<rect ... fill="white"/>` 検証 fail
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

  it('text が injection され y=21 (textRegionH - 3) に配置される', () => {
    const out = injectCompositeText(baseSvg, '(17)231231(10)ABC123');
    // text element の baseline 位置 (textRegionH=24 - 3 = 21)
    expect(out).toMatch(/<text [^>]*y="21" /);
    // 中身は escape された AI 値
    expect(out).toContain('>(17)231231(10)ABC123</text>');
    expect(out).toContain('font-size="18"');
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain('fill="currentColor"');
    expect(out).toContain('font-family="\'Courier New\',Courier,monospace"');
  });

  it('viewBox 高さは元の barcode 高さ + barcodeOffsetY(33) に拡張される', () => {
    const out = injectCompositeText(baseSvg, '(17)231231');
    // baseSvg height=75 + barcodeOffsetY=33 = 108
    expect(out).toMatch(/viewBox="0 0 \S+ 108\.0"/);
    expect(out).toContain('height="108"');
  });

  it('barcode が text より広いときは barcode 幅を維持し translate は y=33 のみ (横 shift 0)', () => {
    // baseSvg width=293、text 長 10 文字 + padding 16 → 推定幅 ~76px < 293
    const out = injectCompositeText(baseSvg, '(17)231231');
    expect(out).toContain('width="293"');
    expect(out).toMatch(/viewBox="0 0 293\.0 108\.0"/);
    // translate(0, 33) で barcode は下方向のみ shift (textRegionH 24 + quietZone 9)
    expect(out).toContain('transform="translate(0.0,33)"');
  });

  it('text が barcode より広いときは SVG 幅を拡張し barcode を中央寄せする', () => {
    // 54 文字 ((17) + '1'×50) × charW=10.8 + padding=16 = 599.2 > 293
    const longText = '(17)' + '1'.repeat(50);
    const out = injectCompositeText(baseSvg, longText);
    expect(out).toMatch(/viewBox="0 0 599\.2 108\.0"/);
    expect(out).toContain('width="599"'); // Math.round(599.2)
    // (newW - barcodeW) / 2 = (599.2 - 293) / 2 = 153.1
    expect(out).toContain('transform="translate(153.1,33)"');
  });

  it('XSS escape: <script> tag を含む text は &lt;script&gt; に escape される', () => {
    const out = injectCompositeText(baseSvg, '<script>alert(1)</script>');
    // raw `<script>` は SVG に出ない
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('</script>');
    // escape 後の文字列が text element 内に含まれる
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('barcode 部は <g transform="translate(_, 33)"> でラップされる (元 inner を保持)', () => {
    const out = injectCompositeText(baseSvg, '(17)231231');
    // 元 SVG の <path .../> が <g transform="..."> 内に残る
    expect(out).toMatch(/<g transform="translate\([\d.]+,33\)">.*<path[^>]*\/>.*<\/g>/s);
  });

  // 陽性対照 (本修正で導入): text descender 終端と barcode 上端の間に GS1 General Spec
  // 5.9.2.6 が要求する ≥1X (= 3px @ scale=3) の quiet zone を確保していることを実観測する。
  //
  // 旧実装 (barcode translate y = textRegionH = 24) では:
  //   - text baseline y=21 + Courier New descender ~4px → descender 終端 ~y=25
  //   - barcode 上端 = y=24 → 実際は descender が CC-A 上端を **1px 侵食**
  // → composite reader (Dynamsoft / 医薬品 reader) が CC-A の row indicator pattern を
  //   誤検出して AI 10/17 が decode 不能になる回帰。PR #450 で同問題が「ディセンダー
  //   侵入」として認知され撤去されたが、PR #458 で transparent 背景という独立要因が
  //   見つかり PR #462 で AI text 復活時に descender 仮説が red herring 扱いされた。
  //   実際は両方とも独立した decode 阻害要因で、印刷物 + 業務 reader 経路では
  //   descender 侵入が再浮上していた。
  //
  // 本 assert が fail する revert pattern:
  //   - `barcodeOffsetY = textRegionH + quietZone` を `= textRegionH` に戻す
  //   - `quietZone = 9` を `= 0` にする
  // → translate y が 24 に戻り `translate(0.0,33)` assert が fail。
  it('陽性対照: text descender 終端と barcode 上端の gap が GS1 spec ≥1X (3px @ scale=3) を満たす', () => {
    const out = injectCompositeText(baseSvg, '(17)231231');
    // baseline y=21 + Courier New descender ~4-5px → 描画 bottom y ≈ 25-26
    // barcode top y = 33 (translate y)
    // → gap = 33 - 26 = 7px = ~2.3X @ scale=3 ≥ 1X spec要求 ✓
    const translateMatch = out.match(/<g transform="translate\([\d.]+,(\d+)\)">/);
    expect(translateMatch, 'barcode translate y を抽出できない').not.toBeNull();
    const barcodeTopY = Number(translateMatch![1]);
    const baselineY = 21;
    const descenderApprox = 5; // Courier New @ fontSize=18 の安全側見積もり
    const gap = barcodeTopY - (baselineY + descenderApprox);
    const oneXAtScale3 = 3;
    expect(
      gap,
      `quiet zone gap (${gap}px) must be ≥ 1X (${oneXAtScale3}px)`
    ).toBeGreaterThanOrEqual(oneXAtScale3);
  });

  // 陽性対照 (本修正で導入): SVG 全域に白背景 rect が **text / barcode より背面** に
  // 挿入されていることを確認。SVG transparent な状態で dark UI に embed されたり
  // reader が aggressive binarization する場合に CC-A 透明 pixel が黒判定されて decode
  // 失敗する事象 (PR #458 が canvas2D 経由でのみ対処していた領域) を SVG 単体でも
  // 防ぐ defense in depth。
  //
  // fail する revert pattern: `<rect ... fill="white"/>` の挿入を撤去 → 本 assert が fail。
  it('陽性対照: 白背景 rect が <svg> 開始タグ直後 (text / barcode より背面) に挿入される', () => {
    const out = injectCompositeText(baseSvg, '(17)231231');
    // <svg ...><rect width="293.0" height="108.0" fill="white"/> の順
    expect(out).toMatch(
      /<svg[^>]*>\s*<rect width="293\.0" height="108\.0" fill="white"\/>\s*<text /
    );
  });

  // 陽性対照 (#462 review A 対応): width / height 置換 regex は **<svg> 開始タグ内に
  // anchor** されており、`<svg>` に width/height 属性が無く子要素にだけ `width="N"`
  // がある場合に **子要素を wrong match して破壊しない** ことを実観測する。
  //
  // anchor を外して旧形 (`/width="\d+"/`) に戻すと、最初の match が子要素
  // `<rect width="10">` になり `<rect width="76">` (newW=76) に誤置換されて
  // 子要素 width assertion が必ず fail する設計 (test-gates 鉄則 1)。
  //
  // 実運用では `addSvgDimensions` が `<svg>` に width/height を必ず注入するため
  // anchor の差は顕在化しないが、bwip-js / addSvgDimensions の将来変更で svg root
  // から width/height が外れた場合の silent regression を防ぐ防御ガード。
  it('<svg> ルートに width 属性無し + 子要素 <rect width="N"> ありの場合に子要素を破壊しない (anchor 検証)', () => {
    // svg root に width/height 属性なし、viewBox のみ。子要素 <rect width="10">。
    // injectCompositeText は viewBox から barcodeW=100 / h=50 を取得して動作する。
    const svgNoRootWidth =
      '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="10" height="20" fill="#000"/></svg>';
    // text 長さ 10 文字 → estimatedTextW = 10 * 10.8 + 16 = 124 → newW = max(100, 124) = 124
    // newH = 50 + barcodeOffsetY(33) = 83
    const out = injectCompositeText(svgNoRootWidth, '(17)231231');
    // 子要素 <rect width="10" height="20" fill="#000"> は元のまま。
    // 旧 regex (anchor 無し) なら最初の `width="10"` が `width="124"` に誤置換されて
    // `<rect width="124" height="83" fill="#000">` になり、本 assert が fail する。
    // (注: SVG 全域に追加挿入される白背景 rect (`width="124.0" height="83.0" fill="white"`)
    //  とは別物。子要素 rect のみを照合するため `fill="#000"` も含めて anchor する。)
    expect(out).toMatch(/<rect width="10" height="20" fill="#000"/);
    // svg root には元々 width 属性が無いため anchor 付き regex は no-op (注入もしない)。
    // viewBox は別 regex で更新される (anchor 無関係)。
    expect(out).toMatch(/viewBox="0 0 124\.0 83\.0"/);
  });
});
