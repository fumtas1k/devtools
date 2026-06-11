// Multi-step online application flow for the gov-portal UI kit.
const { useState } = React;

function Stepper({ step }) {
  const steps = ['入力', '確認', '完了'];
  return (
    <ol style={{ listStyle: 'none', display: 'flex', gap: '0', margin: '0 0 32px', padding: 0 }}>
      {steps.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo';
        return (
          <li key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : '0 0 auto' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '32px', height: '32px', borderRadius: 'var(--radius-full)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                font: '700 16px/1 var(--font-sans)',
                background: state === 'todo' ? 'var(--color-solid-gray-100)' : 'var(--color-blue-900)',
                color: state === 'todo' ? 'var(--text-subtle)' : '#fff',
              }}>{state === 'done' ? '✓' : i + 1}</span>
              <span className="text-std-16B-170" style={{ color: state === 'current' ? 'var(--color-blue-900)' : 'var(--text-subtle)' }}>{s}</span>
            </span>
            {i < steps.length - 1 && <span style={{ flex: 1, height: '2px', margin: '0 16px', background: i < step ? 'var(--color-blue-900)' : 'var(--border-divider)' }} />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, requirement, children }) {
  const { Label } = window.DADS_952a55;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Label requirement={requirement}>{label}</Label>
      {children}
    </div>
  );
}

function Apply({ onNav }) {
  const { Input, Select, Radio, Checkbox, Textarea, NotificationBanner, Button } = window.DADS_952a55;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '山田 太郎', kana: 'ヤマダ タロウ', email: 'taro@example.jp', pref: '東京都', type: '本人', reason: '', agree: false });
  const [showError, setShowError] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="kit-container" style={{ padding: '40px 0 0', maxWidth: '760px' }}>
      <div style={{ marginBottom: '8px' }}>
        <span className="text-dns-14N-130" style={{ color: 'var(--text-subtle)' }}>オンライン申請 / 転入届</span>
      </div>
      <h1 className="text-std-32B-150" style={{ color: 'var(--text-heading)', margin: '0 0 28px' }}>転入届の申請</h1>
      <Stepper step={step} />

      {step === 0 && (
        <form onSubmit={(e) => { e.preventDefault(); if (!form.agree) { setShowError(true); return; } setShowError(false); setStep(1); }}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {showError && (
            <NotificationBanner type="error" title="入力内容をご確認ください">
              「利用規約に同意する」にチェックを入れてください。
            </NotificationBanner>
          )}
          <Field label="氏名" requirement="required"><Input blockSize="lg" value={form.name} onChange={set('name')} /></Field>
          <Field label="フリガナ" requirement="required"><Input blockSize="lg" value={form.kana} onChange={set('kana')} /></Field>
          <Field label="メールアドレス" requirement="required"><Input blockSize="lg" type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="転入先の都道府県" requirement="required">
            <Select blockSize="lg" value={form.pref} onChange={set('pref')}>
              <option>東京都</option><option>大阪府</option><option>愛知県</option><option>福岡県</option>
            </Select>
          </Field>
          <Field label="申請者の区分" requirement="required">
            <div style={{ display: 'flex', gap: '24px' }}>
              <Radio name="type" checked={form.type === '本人'} onChange={() => setForm({ ...form, type: '本人' })}>本人</Radio>
              <Radio name="type" checked={form.type === '代理人'} onChange={() => setForm({ ...form, type: '代理人' })}>代理人</Radio>
            </div>
          </Field>
          <Field label="備考（任意）" requirement="optional"><Textarea rows={3} value={form.reason} onChange={set('reason')} placeholder="ご要望があればご記入ください" /></Field>
          <div style={{ padding: '16px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius-8)' }}>
            <Checkbox checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })}>利用規約およびプライバシーポリシーに同意する</Checkbox>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <Button variant="outline" size="lg" onClick={() => onNav('home')}>中断する</Button>
            <Button variant="solid-fill" size="lg" type="submit">確認画面へ進む</Button>
          </div>
        </form>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <NotificationBanner type="info1" bannerStyle="color-chip" title="入力内容をご確認ください">
            内容に誤りがなければ「この内容で申請する」を押してください。
          </NotificationBanner>
          <dl style={{ margin: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-12)', overflow: 'hidden' }}>
            {[['氏名', form.name], ['フリガナ', form.kana], ['メールアドレス', form.email], ['転入先', form.pref], ['区分', form.type], ['備考', form.reason || '—']].map(([k, v], i) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <dt style={{ padding: '16px', background: 'var(--surface-subtle)', font: '700 16px/1.5 var(--font-sans)', color: 'var(--text-heading)' }}>{k}</dt>
                <dd style={{ margin: 0, padding: '16px', font: '400 16px/1.5 var(--font-sans)', color: 'var(--text-body)' }}>{v}</dd>
              </div>
            ))}
          </dl>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button variant="outline" size="lg" onClick={() => setStep(0)}>入力に戻る</Button>
            <Button variant="solid-fill" size="lg" onClick={() => setStep(2)}>この内容で申請する</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <span style={{ width: '72px', height: '72px', borderRadius: 'var(--radius-full)', background: 'var(--color-green-50)', color: 'var(--color-success-1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z" /></svg>
          </span>
          <h2 className="text-std-28B-150" style={{ color: 'var(--text-heading)', margin: '0 0 12px' }}>申請が完了しました</h2>
          <p className="text-std-16N-170" style={{ color: 'var(--text-subtle)', margin: '0 0 8px' }}>受付番号: <strong className="text-mono-16B-150" style={{ color: 'var(--text-heading)' }}>2024-0091</strong></p>
          <p className="text-std-16N-170" style={{ color: 'var(--text-subtle)', maxWidth: '520px', margin: '0 auto 28px' }}>受付完了のメールをお送りしました。審査の状況はマイページからご確認いただけます。</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Button variant="outline" size="lg" onClick={() => { setStep(0); onNav('home'); }}>ホームへ戻る</Button>
            <Button variant="solid-fill" size="lg" onClick={() => setStep(0)}>申請状況を確認する</Button>
          </div>
        </div>
      )}
    </main>
  );
}

Object.assign(window, { Apply });
