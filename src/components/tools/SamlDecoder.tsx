import { useMemo, useState } from 'react';
import { SamlDecryption } from './SamlDecryption';
import { useSamlSignatureVerification } from './useSamlSignatureVerification';
import { ActionButton } from '@/components/ui/ActionButton';
import { targetsFor, type SignatureResult } from '@/utils/saml/signature-profile';
import { InputField } from '@/components/ui/InputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { CopyButton } from '@/components/ui/CopyButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ResultTable, type TableColumn } from '@/components/ui/ResultTable';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { assertSamlInputSize } from '@/utils/saml/limits';
import {
  decodeSamlInput,
  parseSamlDocument,
  runResponseChecks,
  runLogoutRequestChecks,
  runLogoutResponseChecks,
  formatXml,
  maskSamlXml,
  type CheckItem,
  type DecodedInput,
  type SamlAssertion,
  type SamlAttribute,
  type SamlBinding,
  type SamlEncryptedAssertion,
  type SamlEncryptedKey,
  type SamlMessage,
} from '@/utils/saml';

const BINDING_LABEL: Record<SamlBinding, string> = {
  redirect: 'HTTP-Redirect binding（base64 + deflate）',
  post: 'HTTP-POST binding（base64）',
  xml: '生 XML',
};

type XmlView = 'raw' | 'masked';

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
  signatureStatus,
}: {
  assertion: SamlAssertion;
  index: number;
  total: number;
  signatureStatus?: SignatureResult['status'];
}) {
  return (
    <section className="rounded-lg p-4 bg-subtle space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="body-emphasis text-default">Assertion{total > 1 ? ` ${index + 1}` : ''}</h3>
        <StatusBadge tone="info">
          {assertion.signed
            ? signatureStatus === 'match'
              ? '署名あり（一致）'
              : signatureStatus === 'mismatch'
                ? '署名あり（不一致）'
                : signatureStatus === 'processing'
                  ? '署名あり（検証中）'
                  : '署名あり（未検証）'
            : '署名なし'}
        </StatusBadge>
      </div>
      <dl className="space-y-1">
        <SummaryRow label="ID" value={assertion.id} />
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

function EncryptionMethods({ algorithms }: { algorithms: (string | undefined)[] }) {
  return (
    <dl className="space-y-1">
      {algorithms.map((algorithm, i) => (
        <div key={i} className="flex flex-col md:flex-row md:gap-2">
          <dt className="caption text-muted md:w-56 shrink-0">
            {`EncryptionMethod${algorithms.length > 1 ? ` ${i + 1}` : ''}`}
          </dt>
          <dd className="caption font-mono break-all text-default min-w-0">
            {algorithm ?? '未指定'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EncryptedKeys({ keys }: { keys: SamlEncryptedKey[] }) {
  return keys.map((key, i) => (
    <div key={i} className="space-y-1">
      <h5 className="caption text-default">EncryptedKey {i + 1}</h5>
      <EncryptionMethods algorithms={key.algorithms} />
    </div>
  ));
}

function EncryptedAssertionSection({
  assertion,
  index,
}: {
  assertion: SamlEncryptedAssertion;
  index: number;
}) {
  return (
    <section className="rounded-lg p-4 bg-subtle space-y-3">
      <h3 className="body-emphasis text-default">暗号化された Assertion {index + 1} の方式</h3>
      <p className="caption text-muted">XML に宣言された方式 URI です。</p>
      {assertion.encryptedData.map((data, i) => (
        <div key={i} className="space-y-2">
          <h4 className="caption text-default">EncryptedData {i + 1}</h4>
          <EncryptionMethods algorithms={data.algorithms} />
          {data.encryptedKeys.length > 0 && (
            <div className="pl-4 space-y-2">
              <EncryptedKeys keys={data.encryptedKeys} />
            </div>
          )}
        </div>
      ))}
      {assertion.encryptedKeys.length > 0 && (
        <div className="space-y-2">
          <h4 className="caption text-default">Assertion 直下の鍵</h4>
          <EncryptedKeys keys={assertion.encryptedKeys} />
        </div>
      )}
      {assertion.encryptedData.length === 0 && assertion.encryptedKeys.length === 0 && (
        <p className="caption text-muted">対象の EncryptedData / EncryptedKey はありません。</p>
      )}
    </section>
  );
}

interface ParsedOk {
  decoded: DecodedInput;
  message: SamlMessage;
  document: Document;
  error?: undefined;
}
interface ParsedNg {
  error: string;
}

export function SamlDecoderTool() {
  const [input, setInput] = useState('');
  const [spEntityId, setSpEntityId] = useState('');
  const [xmlView, setXmlView] = useState<XmlView>('raw');
  const [certificate, setCertificate] = useState('');
  const { signatureResults, signatureError, verifying, resetVerification, verifySignature } =
    useSamlSignatureVerification();
  const changeInput = (value: string) => {
    resetVerification();
    setInput(value);
  };
  const changeCertificate = (value: string) => {
    resetVerification();
    setCertificate(value);
  };

  const result: ParsedOk | ParsedNg | null = useMemo(() => {
    try {
      assertSamlInputSize(input);
      if (!input.trim()) return null;
      const decoded = decodeSamlInput(input);
      return { decoded, ...parseSamlDocument(decoded.xml) };
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
  const masked = useMemo(() => (ok ? maskSamlXml(ok.decoded.xml) : null), [ok]);
  const maskedXml = useMemo(() => (masked ? formatXml(masked.xml) : ''), [masked]);
  const displayedXml = xmlView === 'masked' ? maskedXml : prettyXml;

  const verify = () => {
    if (!ok || !response) return;
    verifySignature(ok.decoded.xml, ok.document, certificate);
  };

  return (
    <div className="space-y-6">
      <InputField
        id="saml-input"
        label="SAMLResponse / SAMLRequest を貼り付け（URL・base64・生 XML を自動判定）"
        value={input}
        onChange={changeInput}
        placeholder="PHNhbWxwOlJlc3BvbnNlIC4uLg== / https://sp.example.com/acs?SAMLResponse=... / <samlp:Response ...>"
        multiline
        rows={6}
        error={result?.error}
        onSampleClick={() => changeInput(buildSampleInput())}
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
                <SummaryRow label="ID" value={response.id} />
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
                      ? 'あり（個別に検証できます）'
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

          {response && (
            <section className="rounded-lg p-4 bg-subtle space-y-4">
              <h3 className="body-emphasis text-default">署名の検証</h3>
              <p className="caption text-muted">
                信頼する公開 X.509 証明書を指定してください。証明書の信頼連鎖・失効、IdP
                の正当性、SSO の成功は確認しません。Redirect クエリ署名には対応していません。
              </p>
              <InputField
                id="saml-certificate"
                label="公開証明書（PEM）"
                value={certificate}
                onChange={changeCertificate}
                multiline
                rows={5}
                mono
                autoComplete="off"
                error={signatureError || undefined}
              />
              <ActionButton variant="primary" onClick={verify} loading={verifying}>
                署名を検証する
              </ActionButton>
              <p role="status" className="caption text-muted">
                {verifying
                  ? '署名を検証中です'
                  : signatureResults
                    ? '署名の検証が終了しました'
                    : '署名は未検証です'}
              </p>
              <ul className="space-y-2" aria-label="署名検証の結果">
                {(
                  signatureResults ??
                  targetsFor(ok.document).map(({ target }) => ({
                    ...target,
                    status: target.signed ? ('unverified' as const) : ('unsigned' as const),
                    reason: target.signed ? '署名は未検証です' : '直下に署名がありません',
                  }))
                ).map((item, index) => (
                  <li key={index} className="caption text-default break-all">
                    <strong>
                      {item.label}［{item.id || 'ID なし'}］
                    </strong>
                    ：
                    {
                      (
                        {
                          unsigned: '未署名',
                          unverified: '未検証',
                          processing: '処理中',
                          match: '一致',
                          mismatch: '不一致',
                          unsupported: '未対応',
                          'input-error': '入力エラー',
                        } as const
                      )[item.status]
                    }{' '}
                    — {item.reason}
                    {index > 0 &&
                    item.status === 'unsigned' &&
                    signatureResults?.[0]?.status === 'match'
                      ? '（Response の署名はこの Assertion の内容を含みます）'
                      : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* チェックリスト（Response / Logout 2 型） */}
          {checks && <CheckList items={checks} />}

          {/* EncryptedAssertion 案内 */}
          {response && response.encryptedAssertionCount > 0 && (
            <NotificationBanner variant="warning" title="暗号化された Assertion">
              EncryptedAssertion が {response.encryptedAssertionCount}{' '}
              件含まれています。対応する方式は下の操作で復号できます。
            </NotificationBanner>
          )}

          {response?.encryptedAssertions.map((assertion, i) => (
            <EncryptedAssertionSection key={i} assertion={assertion} index={i} />
          ))}

          {response && ok && response.encryptedAssertionCount > 0 && (
            <SamlDecryption
              key={input}
              xml={ok.decoded.xml}
              count={response.encryptedAssertionCount}
            />
          )}

          {/* Assertion 詳細 */}
          {response?.assertions.map((a, i) => (
            <AssertionSection
              key={i}
              assertion={a}
              index={i}
              total={response.assertions.length}
              signatureStatus={
                signatureResults?.find(
                  (item) => item.label === `Assertion ${i + 1}` && item.id === (a.id ?? null)
                )?.status
              }
            />
          ))}

          {/* 生 XML / マスク XML */}
          <details className="rounded-lg bg-subtle">
            <summary className="cursor-pointer p-4 body-emphasis text-default">
              整形済み XML（簡易整形）
            </summary>
            <div className="px-4 pb-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ToggleGroup<XmlView>
                  options={[
                    { value: 'raw', label: '生 XML' },
                    { value: 'masked', label: 'マスク XML（共有用）' },
                  ]}
                  value={xmlView}
                  onChange={setXmlView}
                  ariaLabel="XML 表示モード"
                  size="sm"
                  layout="wrap"
                />
                <CopyButton text={displayedXml} label="コピー" />
              </div>
              {xmlView === 'masked' && masked && (
                <div className="space-y-1">
                  <StatusBadge tone="info">
                    {masked.piiCount + masked.secretCount > 0
                      ? `PII ${masked.piiCount} 件・機密 ${masked.secretCount} 件をマスク`
                      : 'マスク対象なし'}
                  </StatusBadge>
                  <p className="hint-xs text-muted">
                    原文の署名一致結果はマスク XML
                    には適用されません。共有前に必ず目視で確認してください。構造上の PII
                    フィールドと既知パターンの除去であり、完全な匿名化を保証するものではありません。
                  </p>
                </div>
              )}
              <pre className="overflow-x-auto font-mono caption text-default">{displayedXml}</pre>
              <p className="hint-xs text-muted">
                簡易整形のため、タグ間に混在するテキスト（mixed
                content）は表示されない場合があります。
              </p>
            </div>
          </details>

          <NotificationBanner variant="info" title="このツールの制限">
            署名検証は Response と直下 Assertion
            の限定方式に対応します。復号も限定方式に対応します。
            入力データはブラウザ外に送信しません。
          </NotificationBanner>
        </div>
      )}

      {input && (
        <div className="flex justify-end">
          <ClearButton
            onClick={() => {
              changeInput('');
              setCertificate('');
              setSpEntityId('');
              setXmlView('raw');
            }}
          />
        </div>
      )}
    </div>
  );
}
