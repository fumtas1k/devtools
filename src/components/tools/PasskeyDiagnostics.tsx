import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { diagnosePasskeyEnvironment } from '@/utils/passkeyDiagnostics';
import type { DiagnosticResult, PasskeyReport } from '@/utils/passkeyDiagnostics';

const ITEMS: { key: keyof PasskeyReport; title: string; description: string }[] = [
  {
    key: 'secure',
    title: 'セキュアコンテキスト',
    description: 'このページが HTTPS や localhost などの安全な環境で開かれているかを確認します。',
  },
  {
    key: 'webauthn',
    title: 'WebAuthn API',
    description:
      'このブラウザに公開鍵認証の API が公開されているかを確認します。認証の成功を保証するものではありません。',
  },
  {
    key: 'platform',
    title: '端末内の認証器',
    description:
      '生体認証や PIN で本人確認できる端末内認証器の可用性を問い合わせます。利用不可でも、外付けキーや別の端末を使える場合があります。',
  },
  {
    key: 'autofill',
    title: 'パスキーの自動入力',
    description:
      'ログインフォームで候補を提示する conditional mediation の可用性を問い合わせます。保存済みパスキーの有無は確認しません。',
  },
];
const LABELS = { supported: '対応', unsupported: '非対応', unknown: '判定不可' } as const;
const TONES = { supported: 'success', unsupported: 'warning', unknown: 'info' } as const;
const REASONS = {
  result: '現在の環境から取得した結果です。',
  'missing-api': '問い合わせ API がありません。端末自体の非対応とは限りません。',
  insecure: 'セキュアコンテキストではないため判定できません。HTTPS で開き直してください。',
  error: '問い合わせに失敗しました。再確認するか、別のブラウザで比較してください。',
  timeout: '3 秒以内に応答がありませんでした。非対応とは断定できません。再確認してください。',
} as const;

function Result({ result }: { result?: DiagnosticResult }) {
  return result ? (
    <StatusBadge tone={TONES[result.state]}>{LABELS[result.state]}</StatusBadge>
  ) : (
    <StatusBadge tone="info">確認中</StatusBadge>
  );
}

export function PasskeyDiagnosticsTool() {
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<PasskeyReport | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    void diagnosePasskeyEnvironment(
      {
        secure: window.isSecureContext,
        credential:
          typeof window.PublicKeyCredential === 'undefined'
            ? undefined
            : window.PublicKeyCredential,
      },
      controller.signal
    ).then((result) => {
      if (!controller.signal.aborted) setReport(result);
    });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="space-y-6">
      <NotificationBanner variant="info" title="登録・ログインせずに確認します">
        <p>
          診断結果はこの画面内だけで扱い、保存・外部送信しません。他サイトのパスキー登録状況や、Touch
          ID が表示されない原因は判定できません。
        </p>
      </NotificationBanner>
      <div className="flex flex-wrap items-center gap-4">
        <ActionButton onClick={() => setAttempt((value) => value + 1)} loading={!report}>
          再確認する
        </ActionButton>
        <p role="status" className="text-muted">
          {report
            ? '診断が完了しました。各項目の説明も確認してください。'
            : 'この環境の対応状況を確認しています。'}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {ITEMS.map(({ key, title, description }) => (
          <section
            key={key}
            aria-label={title}
            className="rounded-lg border border-default p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-heading">{title}</h2>
              <Result result={report?.[key]} />
            </div>
            <p className="text-body">{description}</p>
            {report && <p className="text-muted">{REASONS[report[key].reason]}</p>}
          </section>
        ))}
      </div>
      <p className="text-muted">
        結果はこのページ・ブラウザ・端末の現在の状態に限られます。「対応」でも特定サイトでのログイン成功や、パスキーの同期状態は保証しません。
      </p>
    </div>
  );
}
