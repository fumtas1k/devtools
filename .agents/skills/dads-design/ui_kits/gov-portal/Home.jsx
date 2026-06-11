// Home / landing screen for the gov-portal UI kit.
function ServiceCard({ icon, title, desc, onNav }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onNav('apply'); }}
      style={{
        display: 'flex', flexDirection: 'column', gap: '12px', padding: '24px',
        background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-12)',
        textDecoration: 'none', boxShadow: 'var(--elevation-1)', transition: 'box-shadow .12s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--elevation-3)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--elevation-1)'; }}>
      <span style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-full)', background: 'var(--color-blue-50)', color: 'var(--color-blue-900)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={icon} /></svg>
      </span>
      <div className="text-std-18B-160" style={{ color: 'var(--text-heading)' }}>{title}</div>
      <div className="text-dns-14N-130" style={{ color: 'var(--text-subtle)' }}>{desc}</div>
      <span className="dads-link" style={{ font: '700 14px/1 var(--font-sans)', marginTop: '4px' }}>手続きへ進む →</span>
    </a>
  );
}

function Home({ onNav }) {
  const { NotificationBanner, ChipLabel } = window.DADS_952a55;
  const services = [
    { icon: 'M12 2L2 7v2h20V7L12 2zm-7 9v7H3v2h18v-2h-2v-7h-2v7h-3v-7h-2v7H9v-7H7v7H5v-7z', title: '引越し・住まい', desc: '転入・転出届、住民票の請求などの手続き' },
    { icon: 'M20 6h-4V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zM10 4h4v2h-4V4z', title: '仕事・退職', desc: '雇用保険、年金、各種給付の申請' },
    { icon: 'M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z', title: '子育て・教育', desc: '児童手当、保育所、就学に関する手続き' },
    { icon: 'M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V8h14v11z', title: '税・証明', desc: '確定申告、各種証明書の発行請求' },
  ];

  return (
    <main>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(180deg, var(--color-blue-50), #fff)' }}>
        <div className="kit-container" style={{ padding: '56px 0 48px' }}>
          <div style={{ maxWidth: '720px' }}>
            <ChipLabel variant="fill" color="blue">オンライン窓口</ChipLabel>
            <h1 className="text-dsp-48B-140" style={{ color: 'var(--text-heading)', margin: '16px 0 12px' }}>行政手続きを、<br />もっとかんたんに。</h1>
            <p className="text-std-18N-160" style={{ color: 'var(--text-subtle)', marginBottom: '28px' }}>引越し、子育て、税の手続きまで。必要な手続きをオンラインでまとめて行えます。</p>
            <div style={{ display: 'flex', gap: '8px', maxWidth: '560px', background: '#fff', padding: '8px', borderRadius: 'var(--radius-12)', boxShadow: 'var(--elevation-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: '12px', color: 'var(--text-placeholder)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 20l-5.6-5.6a7 7 0 10-1.4 1.4L20 21l1-1zM5 10a5 5 0 1110 0 5 5 0 01-10 0z" /></svg>
              </span>
              <input className="dads-field" style={{ border: 'none', flex: 1, height: '48px' }} placeholder="手続きやキーワードで検索" />
              <button className="dads-btn dads-btn--solid-fill dads-btn--md" onClick={() => onNav('services')}>検索</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="text-dns-14N-130" style={{ color: 'var(--text-subtle)' }}>よく検索される手続き：</span>
              <ChipLabel variant="outline" color="gray">転入届</ChipLabel>
              <ChipLabel variant="outline" color="gray">児童手当</ChipLabel>
              <ChipLabel variant="outline" color="gray">マイナンバー</ChipLabel>
            </div>
          </div>
        </div>
      </section>

      <div className="kit-container">
        {/* Notice */}
        <div style={{ marginTop: '32px' }}>
          <NotificationBanner type="info1" bannerStyle="color-chip" title="システムメンテナンスのお知らせ">
            6月15日（土）2:00〜5:00の間、システムメンテナンスのため一部のサービスをご利用いただけません。
          </NotificationBanner>
        </div>

        {/* Services */}
        <section style={{ marginTop: '48px' }}>
          <h2 className="text-std-28B-150" style={{ color: 'var(--text-heading)', marginBottom: '8px' }}>カテゴリーから探す</h2>
          <p className="text-std-16N-170" style={{ color: 'var(--text-subtle)', marginBottom: '24px' }}>ライフイベントに沿って、必要な手続きをまとめています。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            {services.map((s) => <ServiceCard key={s.title} {...s} onNav={onNav} />)}
          </div>
        </section>

        {/* News */}
        <section style={{ marginTop: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 className="text-std-28B-150" style={{ color: 'var(--text-heading)' }}>お知らせ</h2>
            <a href="#" className="dads-link" style={{ font: '700 15px/1 var(--font-sans)' }}>一覧を見る →</a>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[
              { d: '2024.06.01', t: 'オンライン申請の対象手続きを拡大しました', c: 'blue', tag: '更新' },
              { d: '2024.05.28', t: '本人確認方法にマイナンバーカードの読み取りを追加', c: 'green', tag: '新着' },
              { d: '2024.05.20', t: '「子育て」カテゴリーの手続きガイドを公開しました', c: 'gray', tag: 'お知らせ' },
            ].map((n, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '18px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-mono-14N-150" style={{ color: 'var(--text-subtle)', width: '92px', flexShrink: 0 }}>{n.d}</span>
                <ChipLabel variant="filled-outline" color={n.c}>{n.tag}</ChipLabel>
                <a href="#" className="dads-link" style={{ font: '400 16px/1.5 var(--font-sans)' }}>{n.t}</a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

Object.assign(window, { Home });
