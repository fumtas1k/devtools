/**
 * HAR 1.2 の必要サブセット型。
 * 仕様全体ではなく本ツールが読む/書くフィールドのみを定義する。
 * 未知フィールドは保持する必要があるため、各オブジェクトに index signature を許可する。
 */

export interface HarNameValue {
  name: string;
  value: string;
  [key: string]: unknown;
}

export interface HarCookie {
  name: string;
  value: string;
  [key: string]: unknown;
}

export interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: HarNameValue[];
  [key: string]: unknown;
}

export interface HarRequest {
  method: string;
  url: string;
  httpVersion?: string;
  headers: HarNameValue[];
  queryString: HarNameValue[];
  cookies: HarCookie[];
  postData?: HarPostData;
  headersSize?: number;
  bodySize?: number;
  [key: string]: unknown;
}

export interface HarContent {
  size?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
  [key: string]: unknown;
}

export interface HarResponse {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers: HarNameValue[];
  cookies: HarCookie[];
  content: HarContent;
  redirectURL?: string;
  bodySize?: number;
  [key: string]: unknown;
}

export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  send?: number;
  wait?: number;
  receive?: number;
  ssl?: number;
  comment?: string;
  [key: string]: unknown;
}

export interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
  timings?: HarTimings;
  [key: string]: unknown;
}

export interface HarLog {
  version?: string;
  entries: (HarEntry | null)[];
  [key: string]: unknown;
}

export interface Har {
  log: HarLog;
  [key: string]: unknown;
}
