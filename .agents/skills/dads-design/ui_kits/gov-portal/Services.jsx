// Procedures list + FAQ screen for the gov-portal UI kit.
function Services({ onNav, mode }) {
  const { Table, Accordion, Breadcrumbs, ChipLabel, Button } = window.DADS_952a55;
  return (
    <main className="kit-container" style={{ padding: '24px 0 0' }}>
      <Breadcrumbs items={[{ label: 'ホーム', href: '#' }, { label: mode === 'help' ? 'よくある質問' : '手続き一覧' }]} />
      <h1 className="text-std-32B-150" style={{ color: 'var(--text-heading)', margin: '20px 0 28px' }}>
        {mode === 'help' ? 'よくある質問' : '手続き一覧'}
      </h1>

      {mode !== 'help' && (
        <section style={{ marginBottom: '48px' }}>
          <Table
            caption="オンラインで申請できる主な手続き"
            columns={['手続き名', 'カテゴリー', '所要時間', '状態']}
            rows={[
              [<a href="#" className="dads-link" onClick={(e) => { e.preventDefault(); onNav('apply'); }}>転入届</a>, '引越し・住まい', '約10分', <ChipLabel variant="filled-outline" color="green">受付中</ChipLabel>],
              [<a href="#" className="dads-link" onClick={(e) => { e.preventDefault(); onNav('apply'); }}>児童手当の認定請求</a>, '子育て・教育', '約15分', <ChipLabel variant="filled-outline" color="green">受付中</ChipLabel>],
              ['印鑑登録', '証明・登録', '約8分', <ChipLabel variant="filled-outline" color="orange">準備中</ChipLabel>],
              ['住民票の写しの請求', '証明・登録', '約5分', <ChipLabel variant="filled-outline" color="green">受付中</ChipLabel>],
              ['国民健康保険の加入', '保険・年金', '約12分', <ChipLabel variant="filled-outline" color="green">受付中</ChipLabel>],
            ]}
          />
        </section>
      )}

      <section style={{ maxWidth: '820px' }}>
        <h2 className="text-std-24B-150" style={{ color: 'var(--text-heading)', marginBottom: '16px' }}>よくあるご質問</h2>
        <div style={{ borderTop: '1px solid var(--border-divider)' }}>
          <Accordion title="オンライン申請に必要なものは何ですか？" defaultOpen>
            マイナンバーカードと、カードの読み取りに対応したスマートフォン、または ICカードリーダーが必要です。一部の手続きは本人確認なしでも申請できます。
          </Accordion>
          <Accordion title="手数料の支払い方法を教えてください">
            クレジットカード、電子マネー、ペイジーに対応しています。手数料が無料の手続きもあります。
          </Accordion>
          <Accordion title="申請後、結果はどこで確認できますか？">
            マイページの「申請状況」から、審査の進捗と結果をいつでも確認できます。更新時にはメールでもお知らせします。
          </Accordion>
          <Accordion title="入力を途中で保存できますか？">
            ログインしている場合、入力内容は自動的に下書き保存されます。後日、続きから再開できます。
          </Accordion>
        </div>
        <div style={{ marginTop: '32px', padding: '28px', background: 'var(--color-blue-50)', borderRadius: 'var(--radius-12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <div>
            <div className="text-std-20B-160" style={{ color: 'var(--text-heading)', marginBottom: '6px' }}>解決しませんでしたか？</div>
            <div className="text-std-16N-170" style={{ color: 'var(--text-subtle)' }}>サポート窓口がメール・チャットでお答えします。</div>
          </div>
          <Button variant="solid-fill" size="lg" onClick={() => onNav('apply')}>お問い合わせ</Button>
        </div>
      </section>
    </main>
  );
}

Object.assign(window, { Services });
