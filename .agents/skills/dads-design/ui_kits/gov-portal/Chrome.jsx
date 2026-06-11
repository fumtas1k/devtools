// Shared chrome for the gov-portal UI kit: utility bar, header, footer.
const Logo = ({ knockout }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" fill={knockout ? '#fff' : '#fff'} rx="2" />
      <path fill="#0017C1" d="M4 6c0-1.1.9-2 2-2h20c1.1 0 2 .9 2 2v6a2 2 0 0 1-2 2H6c-1.1 0-2-.9-2-2V6Z" />
      <path fill="#8B008B" d="M4 20c0-1.1.9-2 2-2h20c1.1 0 2 .9 2 2v6a2 2 0 0 1-2 2H6c-1.1 0-2-.9-2-2v-6Z" />
    </svg>
    <div style={{ lineHeight: 1 }}>
      <div className="text-std-20B-160" style={{ color: knockout ? '#fff' : 'var(--color-blue-900)', letterSpacing: '0.03em' }}>デジタル庁</div>
      <div style={{ font: '400 10px/1 var(--font-sans)', letterSpacing: '0.16em', color: knockout ? 'var(--color-blue-200)' : 'var(--text-subtle)', marginTop: '3px' }}>DIGITAL AGENCY</div>
    </div>
  </div>
);

function Header({ onNav, current }) {
  const nav = [
    { id: 'home', label: 'ホーム' },
    { id: 'services', label: '手続き一覧' },
    { id: 'apply', label: 'オンライン申請' },
    { id: 'help', label: 'よくある質問' },
  ];
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff' }}>
      {/* utility bar */}
      <div style={{ background: 'var(--color-solid-gray-50)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="kit-container" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '20px', height: '40px' }}>
          <a href="#" className="dads-link" style={{ font: '400 14px/1 var(--font-sans)' }}>文字サイズ</a>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', font: '400 14px/1 var(--font-sans)', color: 'var(--text-subtle)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.9a15.7 15.7 0 00-1.2-3.6A8 8 0 0118.9 8zM12 4c.8 1.2 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.8 1.8-4zM4.3 14a7.8 7.8 0 010-4h3.3a16.6 16.6 0 000 4H4.3zm.8 2h2.9c.3 1.3.7 2.5 1.2 3.6A8 8 0 015.1 16zm2.9-8H5.1a8 8 0 014.1-3.6C8.7 5.5 8.3 6.7 8 8zM12 20c-.8-1.2-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.8-1.8 4zm2.2-6H9.8a14.7 14.7 0 010-4h4.4a14.7 14.7 0 010 4zm.6 5.6c.5-1.1.9-2.3 1.2-3.6h2.9a8 8 0 01-4.1 3.6zM16.4 14a16.6 16.6 0 000-4h3.3a7.8 7.8 0 010 4h-3.3z" /></svg>
            English
          </span>
        </div>
      </div>
      {/* main bar */}
      <div className="kit-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '76px' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); onNav('home'); }} style={{ textDecoration: 'none' }}><Logo /></a>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {nav.map((n) => (
            <a key={n.id} href="#" onClick={(e) => { e.preventDefault(); onNav(n.id); }}
              style={{
                font: '700 16px/1 var(--font-sans)', textDecoration: 'none', padding: '10px 14px', borderRadius: 'var(--radius-8)',
                color: current === n.id ? 'var(--color-blue-900)' : 'var(--text-body)',
                background: current === n.id ? 'var(--color-blue-50)' : 'transparent',
              }}>{n.label}</a>
          ))}
          <button className="dads-btn dads-btn--solid-fill dads-btn--md" style={{ marginLeft: '12px' }} onClick={() => onNav('apply')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" /></svg>
            ログイン
          </button>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const cols = [
    { h: 'サービス', items: ['手続き一覧', 'オンライン申請', '申請状況の確認'] },
    { h: 'サポート', items: ['よくある質問', 'お問い合わせ', '利用ガイド'] },
    { h: 'このサイトについて', items: ['プライバシーポリシー', 'ウェブアクセシビリティ', '利用規約'] },
  ];
  return (
    <footer style={{ background: 'var(--color-blue-1100)', color: '#fff', marginTop: '64px' }}>
      <div className="kit-container" style={{ padding: '48px 0 32px', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '32px' }}>
        <div><Logo knockout /></div>
        {cols.map((c) => (
          <div key={c.h}>
            <div className="text-std-16B-170" style={{ marginBottom: '12px', color: 'var(--color-blue-200)' }}>{c.h}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {c.items.map((it) => (
                <li key={it}><a href="#" style={{ color: '#fff', textDecoration: 'none', font: '400 15px/1.4 var(--font-sans)' }}>{it}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--color-blue-1000)' }}>
        <div className="kit-container" style={{ padding: '20px 0', font: '400 13px/1.6 var(--font-sans)', color: 'var(--color-blue-200)' }}>© Digital Agency, Government of Japan — このサイトはデザインシステムのデモであり、実在のサービスではありません。</div>
      </div>
    </footer>
  );
}

Object.assign(window, { Header, Footer, KitLogo: Logo });
