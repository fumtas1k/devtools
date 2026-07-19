import { useMemo, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ResultTable, type TableColumn } from '@/components/ui/ResultTable';
import {
  decodeSamlInput,
  parseSamlXml,
  runResponseChecks,
  runLogoutRequestChecks,
  runLogoutResponseChecks,
  formatXml,
  type CheckItem,
  type DecodedInput,
  type SamlAssertion,
  type SamlAttribute,
  type SamlBinding,
  type SamlMessage,
} from '@/utils/saml';

const BINDING_LABEL: Record<SamlBinding, string> = {
  redirect: 'HTTP-Redirect binding（base64 + deflate）',
  post: 'HTTP-POST binding（base64）',
  xml: '生 XML',
};

/** サンプル: 現在時刻を挟む有効期間の Response を POST binding（base64）で生成 */
function buildSampleInput(): string {
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const now = Date.now();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_sample-resp" Version="2.0" IssueInstant="${iso(now)}" Destination="https://sp.example.com/acs" InResponseTo="_sample-req">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_sample-a1" Version="2.0" IssueInstant="${iso(now)}">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">taro.yamada@example.com</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData Recipient="https://sp.example.com/acs" NotOnOrAfter="${iso(now + 5 * 60_000)}" InResponseTo="_sample-req"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${iso(now - 5 * 60_000)}" NotOnOrAfter="${iso(now + 5 * 60_000)}">
      <saml:AudienceRestriction><saml:Audience>https://sp.example.com/metadata</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="_sample-s1">
      <saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="mail"><saml:AttributeValue>taro.yamada@example.com</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="displayName" FriendlyName="表示名"><saml:AttributeValue>山田 太郎</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="groups"><saml:AttributeValue>dev</saml:AttributeValue><saml:AttributeValue>admin</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
  const bytes = new TextEncoder().encode(xml);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 複数 AudienceRestriction は AND 判定のため、2 件以上ならグループが分かる表記にする */
function formatAudienceRestrictions(restrictions: string[][] | undefined): string | undefined {
  if (!restrictions) return undefined;
  const nonEmpty = restrictions.filter((g) => g.length > 0);
  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0].join(', ');
  return nonEmpty.map((g) => `[${g.join(', ')}]`).join(' AND ');
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col md:flex-row md:gap-2">
      <dt className="caption text-muted md:w-56 shrink-0">{label}</dt>
      <dd className="caption font-mono break-all text-default">{value}</dd>
    </div>
  );
}

const CHECK_TONE: Record<CheckItem['status'], 'success' | 'warning' | 'error' | 'info'> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
};

const CHECK_TONE_LABEL: Record<CheckItem['status'], string> = {
  success: 'OK',
  warning: '注意',
  error: 'エラー',
  info: '情報',
};

function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <section className="rounded-lg p-4 bg-subtle">
      <h3 className="body-emphasis text-default mb-3">チェックリスト</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2">
            <span className="flex items-center gap-2 md:w-56 shrink-0">
              <StatusBadge tone={CHECK_TONE[item.status]}>
                {CHECK_TONE_LABEL[item.status]}
              </StatusBadge>
              <span className="caption text-default">{item.label}</span>
            </span>
            <span className="caption break-all whitespace-pre-line text-default">
              {item.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint-xs text-muted mt-3">
        有効期間はこの端末の現在時刻で判定しています。IdP / SP
        間の時刻ずれ（クロックスキュー）により実環境の判定と異なる場合があります。
      </p>
    </section>
  );
}

type KeyedSamlAttribute = SamlAttribute & { key: string };

const ATTR_COLUMNS: TableColumn<KeyedSamlAttribute>[] = [
  {
    key: 'name',
    header: '属性名',
    className: 'font-mono break-all',
    render: (a) => (
      <>
        {a.name}
        {a.friendlyName && <span className="text-muted ml-2">({a.friendlyName})</span>}
      </>
    ),
  },
  {
    key: 'values',
    header: '値',
    className: 'font-mono break-all',
    render: (a) => a.values.join(', '),
  },
];

function AssertionSection({
  assertion,
  index,
  total,
}: {
  assertion: SamlAssertion;
  index: number;
  total: number;
}) {
  return (
    <section className="rounded-lg p-4 bg-subtle space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="body-emphasis text-default">Assertion{total > 1 ? ` ${index + 1}` : ''}</h3>
        <StatusBadge tone="info">
          {assertion.signed ? '署名あり（未検証）' : '署名なし'}
        </StatusBadge>
      </div>
      <dl className="space-y-1">
        <SummaryRow label="NameID" value={assertion.nameId} />
        <SummaryRow label="NameID Format" value={assertion.nameIdFormat} />
        <SummaryRow label="NotBefore" value={assertion.conditions?.notBefore} />
        <SummaryRow label="NotOnOrAfter" value={assertion.conditions?.notOnOrAfter} />
        <SummaryRow
          label="Audience"
          value={formatAudienceRestrictions(assertion.conditions?.audienceRestrictions)}
        />
        {assertion.subjectConfirmations.map((sc, i) => (
          <SummaryRow
            key={i}
            label={`SubjectConfirmation${assertion.subjectConfirmations.length > 1 ? ` ${i + 1}` : ''}`}
            value={[
              sc.recipient && `Recipient: ${sc.recipient}`,
              sc.notOnOrAfter && `NotOnOrAfter: ${sc.notOnOrAfter}`,
              sc.inResponseTo && `InResponseTo: ${sc.inResponseTo}`,
            ]
              .filter(Boolean)
              .join(' / ')}
          />
        ))}
        {assertion.authnStatements.map((st, i) => (
          <SummaryRow
            key={i}
            label={`AuthnStatement${assertion.authnStatements.length > 1 ? ` ${i + 1}` : ''}`}
            value={[
              st.authnInstant && `AuthnInstant: ${st.authnInstant}`,
              st.sessionIndex && `SessionIndex: ${st.sessionIndex}`,
              st.authnContextClassRef && `AuthnContext: ${st.authnContextClassRef}`,
            ]
              .filter(Boolean)
              .join(' / ')}
          />
        ))}
      </dl>
      {assertion.attributes.length > 0 && (
        <div>
          <h4 className="caption text-muted mb-2">属性（{assertion.attributes.length} 件）</h4>
          <ResultTable
            rows={assertion.attributes.map((a, i) => ({ ...a, key: `${i}-${a.name}` }))}
            columns={ATTR_COLUMNS}
            getKey={(a) => a.key}
          />
        </div>
      )}
    </section>
  );
}

interface ParsedOk {
  decoded: DecodedInput;
  message: SamlMessage;
  error?: undefined;
}
interface ParsedNg {
  error: string;
}

export function SamlDecoderTool() {
  const [input, setInput] = useState('');
  const [spEntityId, setSpEntityId] = useState('');

  const result: ParsedOk | ParsedNg | null = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const decoded = decodeSamlInput(input);
      return { decoded, message: parseSamlXml(decoded.xml) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : '解析に失敗しました' };
    }
  }, [input]);

  const ok = result && !result.error ? (result as ParsedOk) : null;
  const response = ok && ok.message.type === 'response' ? ok.message : null;
  const authnRequest = ok && ok.message.type === 'authnRequest' ? ok.message : null;
  const logoutRequest = ok && ok.message.type === 'logoutRequest' ? ok.message : null;
  const logoutResponse = ok && ok.message.type === 'logoutResponse' ? ok.message : null;

  const checks = useMemo(() => {
    if (response) return runResponseChecks(response, { spEntityId });
    if (logoutRequest) return runLogoutRequestChecks(logoutRequest);
    if (logoutResponse) return runLogoutResponseChecks(logoutResponse);
    return null;
  }, [response, logoutRequest, logoutResponse, spEntityId]);

  const prettyXml = useMemo(() => (ok ? formatXml(ok.decoded.xml) : ''), [ok]);

  return (
    <div className="space-y-6">
      <InputField
        id="saml-input"
        label="SAMLResponse / SAMLRequest を貼り付け（URL・base64・生 XML を自動判定）"
        value={input}
        onChange={setInput}
        placeholder="PHNhbWxwOlJlc3BvbnNlIC4uLg== / https://sp.example.com/acs?SAMLResponse=... / <samlp:Response ...>"
        multiline
        rows={6}
        error={result?.error}
        onSampleClick={() => setInput(buildSampleInput())}
        mono
      />

      {response && (
        <InputField
          id="saml-sp-entity-id"
          label={
            <>
              SP entityID
              <span className="caption text-muted ml-2">（任意・入力すると Audience と照合）</span>
            </>
          }
          value={spEntityId}
          onChange={setSpEntityId}
          placeholder="https://sp.example.com/metadata"
          mono
        />
      )}

      {ok && (
        <div className="space-y-4">
          {/* デコード過程（解析成功の簡潔なアナウンス。暗黙 polite のため aria-live は不要） */}
          <p className="caption text-muted" role="status">
            変換: {ok.decoded.steps.join(' → ')}（{BINDING_LABEL[ok.decoded.binding]}）
          </p>

          {/* サマリ */}
          <section className="rounded-lg p-4 bg-subtle">
            <h3 className="body-emphasis text-default mb-3">
              {response && 'Response サマリ'}
              {authnRequest && 'AuthnRequest サマリ'}
              {logoutRequest && 'LogoutRequest サマリ'}
              {logoutResponse && 'LogoutResponse サマリ'}
            </h3>
            {response && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer (IdP)" value={response.issuer} />
                <SummaryRow label="Status" value={response.statusCode} />
                <SummaryRow label="Status (内側)" value={response.statusSubCode} />
                <SummaryRow label="StatusMessage" value={response.statusMessage} />
                <SummaryRow label="Destination" value={response.destination} />
                <SummaryRow label="InResponseTo" value={response.inResponseTo} />
                <SummaryRow label="IssueInstant" value={response.issueInstant} />
                <SummaryRow
                  label="署名"
                  value={
                    response.signed || response.assertions.some((a) => a.signed)
                      ? 'あり（このツールでは検証しません）'
                      : 'なし'
                  }
                />
              </dl>
            )}
            {authnRequest && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer (SP)" value={authnRequest.issuer} />
                <SummaryRow label="Destination" value={authnRequest.destination} />
                <SummaryRow label="ACS URL" value={authnRequest.acsUrl} />
                <SummaryRow label="ProtocolBinding" value={authnRequest.protocolBinding} />
                <SummaryRow label="IssueInstant" value={authnRequest.issueInstant} />
                <SummaryRow label="NameIDPolicy Format" value={authnRequest.nameIdPolicyFormat} />
                <SummaryRow label="AllowCreate" value={authnRequest.allowCreate} />
                <SummaryRow
                  label="AuthnContextClassRef"
                  value={authnRequest.authnContextClassRefs.join(', ') || undefined}
                />
                <SummaryRow
                  label="署名"
                  value={authnRequest.signed ? 'あり（このツールでは検証しません）' : 'なし'}
                />
              </dl>
            )}
            {logoutRequest && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer" value={logoutRequest.issuer} />
                <SummaryRow label="Destination" value={logoutRequest.destination} />
                <SummaryRow label="IssueInstant" value={logoutRequest.issueInstant} />
                <SummaryRow label="NotOnOrAfter" value={logoutRequest.notOnOrAfter} />
                <SummaryRow label="Reason" value={logoutRequest.reason} />
                <SummaryRow
                  label="NameID"
                  value={
                    logoutRequest.encryptedNameId ? '（暗号化・表示不可）' : logoutRequest.nameId
                  }
                />
                <SummaryRow label="NameID Format" value={logoutRequest.nameIdFormat} />
                <SummaryRow
                  label="SessionIndex"
                  value={logoutRequest.sessionIndexes.join(', ') || undefined}
                />
                <SummaryRow
                  label="署名"
                  value={logoutRequest.signed ? 'あり（このツールでは検証しません）' : 'なし'}
                />
              </dl>
            )}
            {logoutResponse && (
              <dl className="space-y-1">
                <SummaryRow label="Issuer" value={logoutResponse.issuer} />
                <SummaryRow label="Status" value={logoutResponse.statusCode} />
                <SummaryRow label="Status (内側)" value={logoutResponse.statusSubCode} />
                <SummaryRow label="StatusMessage" value={logoutResponse.statusMessage} />
                <SummaryRow label="Destination" value={logoutResponse.destination} />
                <SummaryRow label="InResponseTo" value={logoutResponse.inResponseTo} />
                <SummaryRow label="IssueInstant" value={logoutResponse.issueInstant} />
                <SummaryRow
                  label="署名"
                  value={logoutResponse.signed ? 'あり（このツールでは検証しません）' : 'なし'}
                />
              </dl>
            )}
          </section>

          {/* チェックリスト（Response / Logout 2 型） */}
          {checks && <CheckList items={checks} />}

          {/* EncryptedAssertion 案内 */}
          {response && response.encryptedAssertionCount > 0 && (
            <NotificationBanner variant="warning" title="暗号化された Assertion">
              EncryptedAssertion が {response.encryptedAssertionCount}{' '}
              件含まれています。復号（秘密鍵の入力）には対応していません。
            </NotificationBanner>
          )}

          {/* Assertion 詳細 */}
          {response?.assertions.map((a, i) => (
            <AssertionSection key={i} assertion={a} index={i} total={response.assertions.length} />
          ))}

          {/* 生 XML */}
          <details className="rounded-lg bg-subtle">
            <summary className="cursor-pointer p-4 body-emphasis text-default">
              整形済み XML（簡易整形）
            </summary>
            <div className="px-4 pb-4 space-y-2">
              <div className="flex justify-end">
                <CopyButton text={prettyXml} label="コピー" />
              </div>
              <pre className="overflow-x-auto font-mono caption text-default">{prettyXml}</pre>
              <p className="hint-xs text-muted">
                簡易整形のため、タグ間に混在するテキスト（mixed
                content）は表示されない場合があります。
              </p>
            </div>
          </details>

          <NotificationBanner variant="info" title="このツールの制限">
            XMLDSig 署名の検証・EncryptedAssertion
            の復号は行いません。表示内容の改ざん有無は保証されないため、署名検証が必要な場合は IdP /
            SP 側のログと突き合わせてください。入力データはブラウザ外に送信しません。
          </NotificationBanner>
        </div>
      )}

      {input && (
        <div className="flex justify-end">
          <ClearButton
            onClick={() => {
              setInput('');
              setSpEntityId('');
            }}
          />
        </div>
      )}
    </div>
  );
}
