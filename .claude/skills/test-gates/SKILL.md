---
name: test-gates
description: ガード / バリデータ / 違反検知機構 / リグレッション防止テスト実装時に必ず参照。陽性対照テスト併設の必須ルール。CSP / lint / validator / セキュリティヘッダ / E2E ガード / 検知器 / detector / 違反検知 / regex マッチ系 / 静的解析 / 入力検証 / fail させる仕組み を実装/修正する場合に発動。
---

# test-gates: ガード/検知器に必ず陽性対照を併設するルール

## ルール

「検出する / 拒否する / 違反したら fail させる」機構（ガード・バリデータ・lint・検知器・regression 防止テスト全般）を追加 / 修正したら、**意図的に違反を起こして検知できることを確認する陽性対照テスト** を **必ず同じ PR に同梱** する。

## なぜ必要か

陰性対照（正常系で green）だけでは「**検知能力ゼロで green**」と「検知能力ありで green」が区別できない。陽性対照を入れて初めて検知機構として証明される。過去に PR #233 で `applyProductionCsp` が **空回りしていた** にも関わらず陰性対照のみ green で merge 寸前まで行った事故がある。

## 実装パターン

| 対象                       | 陽性対照の作り方                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------- |
| CSP 違反検知ゲート         | 故意に違反 (外部 origin の `<script src>` 注入等) → `violations.length > 0` を assert |
| 入力 validator             | 不正入力で `valid: false` 返却とエラー詳細形式を assert                                 |
| lint ルール                | 違反パターンで warning が出ることを assert                                              |
| セキュリティヘッダ assert  | 意図的に値を変える / 別 header と入れ替えて fail することを別 spec で assert            |
| E2E ガード（検知系）       | 故意に検出対象を発生させて test failure に昇格することを別 spec で確認                  |
| Promise reject ハンドラ    | mock / override で reject を強制 → catch 経路の UI feedback / state 更新を assert       |
| 静的解析 / regex マッチ    | 違反コード片をテストフィクスチャに含めて gate fail することを assert                    |

## 設計の鉄則

1. **「旧実装にこのテストを当てると必ず fail する」設計** にする。fix 前後で diff が出ないテストは陽性対照になっていない
2. 別 spec / 別 test で書き、**陰性対照と分離**。混在させると改修時に陽性側を消しても気付きにくい
3. 内部実装ではなく **観測可能な振る舞い** (UI 表示 / 戻り値 / log / state) を assert
4. fixture / mock 経路は production code path を **確実に通る** こと (mock しすぎて gate を bypass してないか確認)

## 具体例: 陰性対照と陽性対照を別 test に分ける

CSP 違反検知ゲートを例にした最小形。**陰性対照だけでは「検知が空回りしていても green」になる** ので、故意に違反を起こす陽性対照を別 test として併設する。

```ts
// 陰性対照: 正常系では違反ゼロ。これ単体では検知能力を証明できない。
it("正規 script のみなら CSP 違反は発生しない", async () => {
  const violations = collectCspViolations();
  await renderWithProductionCsp();
  expect(violations).toHaveLength(0);
});

// 陽性対照（別 test に分離）: 故意の違反を必ず捕捉する。
// → 検知が空回りしている旧実装に当てると fail する = 検知能力そのものの証明。
it("外部 origin の script 注入を CSP 違反として検知する", async () => {
  const violations = collectCspViolations();
  injectExternalScript("https://evil.example.com/x.js"); // 意図的な違反
  await waitFor(() => expect(violations.length).toBeGreaterThan(0));
});
```

観測しているのは内部 state ではなく `violations` という **観測可能な振る舞い**（鉄則 3）であり、2 つを別 test に分けることで陽性側だけ消えても気付ける（鉄則 2）。リポジトリ内の実例は `src/utils/__tests__/headers.test.ts`（`'unsafe-inline'` 不在を陽性 assert）や `tests/e2e/csp-and-evaluation.spec.ts` を参照。

## チェックリスト (ガード追加 / 修正 PR で必ず触る)

設計の鉄則を「PR 提出前に手で確認する項目」へ落とし込んだもの。TodoWrite 化して 1 項目ずつ潰す。

- [ ] 陽性対照テストを **同じ PR に** 含めたか
- [ ] そのテストは **fix 前 (旧実装) に当てると fail** することをローカルで実機確認したか
- [ ] **観測可能な振る舞い** を assert しているか (内部 state ではなく)
- [ ] 陰性対照と **別 spec / 別 test 関数** に分離したか
- [ ] mock / override で **production code path を bypass していないか** 確認したか

## 参考

- 個人 memory: `feedback_positive_control_for_gates.md`
- 過去判断ログ: `docs/decisions.md` を「陽性対照」で検索
- 過去事故: PR #233 (`applyProductionCsp` 空回り事故)
