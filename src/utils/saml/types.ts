/** 入力の由来バインディング */
export type SamlBinding = 'redirect' | 'post' | 'xml';

export interface DecodedInput {
  xml: string;
  /** 適用した変換ステップ（UI 表示用、適用順） */
  steps: string[];
  binding: SamlBinding;
}

export interface SamlAttribute {
  name: string;
  friendlyName?: string;
  values: string[];
}

export interface SamlConditions {
  notBefore?: string;
  notOnOrAfter?: string;
  /** AudienceRestriction ごとの Audience 列挙（外側 = AND、内側 = restriction 内の OR） */
  audienceRestrictions: string[][];
}

export interface SamlSubjectConfirmation {
  method?: string;
  recipient?: string;
  notOnOrAfter?: string;
  inResponseTo?: string;
}

export interface SamlAuthnStatement {
  authnInstant?: string;
  sessionIndex?: string;
  authnContextClassRef?: string;
}

export interface SamlAssertion {
  id?: string;
  issuer?: string;
  nameId?: string;
  nameIdFormat?: string;
  attributes: SamlAttribute[];
  conditions?: SamlConditions;
  authnStatements: SamlAuthnStatement[];
  subjectConfirmations: SamlSubjectConfirmation[];
  /** Assertion 直下に ds:Signature を持つか（存在表示のみ、検証はしない） */
  signed: boolean;
}

export interface SamlResponseData {
  type: 'response';
  issuer?: string;
  statusCode?: string;
  /** 外側 StatusCode の直下にネストした内側 StatusCode の Value */
  statusSubCode?: string;
  statusMessage?: string;
  destination?: string;
  inResponseTo?: string;
  issueInstant?: string;
  /** Response 直下に ds:Signature を持つか */
  signed: boolean;
  assertions: SamlAssertion[];
  encryptedAssertionCount: number;
}

export interface SamlAuthnRequestData {
  type: 'authnRequest';
  issuer?: string;
  destination?: string;
  acsUrl?: string;
  protocolBinding?: string;
  issueInstant?: string;
  nameIdPolicyFormat?: string;
  allowCreate?: string;
  authnContextClassRefs: string[];
  signed: boolean;
}

export interface SamlLogoutRequestData {
  type: 'logoutRequest';
  issuer?: string;
  destination?: string;
  issueInstant?: string;
  /** ルート属性。リクエスト自体の有効期限（SAML 仕様上は任意） */
  notOnOrAfter?: string;
  /** Reason 属性（URI） */
  reason?: string;
  nameId?: string;
  nameIdFormat?: string;
  /** NameID が EncryptedID で暗号化されている場合 true（内容は表示不可・復号は非対応） */
  encryptedNameId: boolean;
  /** samlp:SessionIndex（複数可） */
  sessionIndexes: string[];
  signed: boolean;
}

export interface SamlLogoutResponseData {
  type: 'logoutResponse';
  issuer?: string;
  statusCode?: string;
  /** 外側 StatusCode の直下にネストした内側 StatusCode の Value */
  statusSubCode?: string;
  statusMessage?: string;
  destination?: string;
  inResponseTo?: string;
  issueInstant?: string;
  signed: boolean;
}

export type SamlMessage =
  | SamlResponseData
  | SamlAuthnRequestData
  | SamlLogoutRequestData
  | SamlLogoutResponseData;

export type CheckStatus = 'success' | 'warning' | 'error' | 'info';

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
