import type { CheckItem, SamlResponseData } from './types';

const STATUS_SUCCESS = 'urn:oasis:names:tc:SAML:2.0:status:Success';

export interface CheckOptions {
  /** テスト用に注入可能な現在時刻（省略時は実時刻） */
  now?: Date;
  /** SP entityID。入力時のみ Audience と厳密一致で照合する */
  spEntityId?: string;
}

/** Response の定番チェックリストを実行する（AuthnRequest には適用しない） */
export function runResponseChecks(res: SamlResponseData, opts: CheckOptions = {}): CheckItem[] {
  const now = opts.now ?? new Date();
  const items: CheckItem[] = [];

  // 1. Status
  if (res.statusCode === STATUS_SUCCESS) {
    items.push({ id: 'status', label: 'Status', status: 'success', detail: 'Success' });
  } else {
    const code = res.statusCode?.split(':').pop() ?? '不明';
    const subCode = res.statusSubCode?.split(':').pop();
    const codeLabel = subCode ? `${code} / ${subCode}` : code;
    items.push({
      id: 'status',
      label: 'Status',
      status: 'error',
      detail: res.statusMessage
        ? `${codeLabel}（StatusMessage: ${res.statusMessage}）`
        : `${codeLabel}（Success ではありません）`,
    });
  }

  // 2. Assertion 有無（無ければ以降のチェックは打ち切り）
  if (res.assertions.length === 0) {
    items.push({
      id: 'assertion',
      label: 'Assertion',
      status: res.encryptedAssertionCount > 0 ? 'warning' : 'error',
      detail:
        res.encryptedAssertionCount > 0
          ? '暗号化されており内容を確認できません（復号は非対応）'
          : 'Assertion が含まれていません',
    });
    return items;
  }

  // 3. 有効期間（NotOnOrAfter は SAML 仕様上その時刻自体を含まない排他境界）
  res.assertions.forEach((a, i) => {
    const label = res.assertions.length > 1 ? `有効期間 (Assertion ${i + 1})` : '有効期間';
    const c = a.conditions;
    if (!c || (!c.notBefore && !c.notOnOrAfter)) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'warning',
        detail: 'Conditions に有効期間の指定がありません',
      });
      return;
    }
    const notBefore = c.notBefore ? new Date(c.notBefore) : undefined;
    const notOnOrAfter = c.notOnOrAfter ? new Date(c.notOnOrAfter) : undefined;

    if (
      (notBefore && isNaN(notBefore.getTime())) ||
      (notOnOrAfter && isNaN(notOnOrAfter.getTime()))
    ) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'warning',
        detail: `日時を解釈できません（NotBefore: ${c.notBefore ?? '-'} / NotOnOrAfter: ${c.notOnOrAfter ?? '-'}）`,
      });
      return;
    }

    // timezone designator（Z または ±hh / ±hh:mm / ±hhmm）が無い場合、端末のローカル時刻として
    // 解釈されるため判定が実行環境依存になる。判定自体は続行しつつ注記を付ける
    const hasTimezone = (s: string) => /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(s);
    // 日付のみ形式（YYYY-MM-DD）は ES 仕様上 UTC (00:00Z) 解釈が確定しているため、
    // ローカル時刻注記の対象からは除外し、専用の注記を出す
    const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const dateOnly =
      (!!c.notBefore && isDateOnly(c.notBefore)) ||
      (!!c.notOnOrAfter && isDateOnly(c.notOnOrAfter));
    const missingTimezone =
      (!!c.notBefore && !isDateOnly(c.notBefore) && !hasTimezone(c.notBefore)) ||
      (!!c.notOnOrAfter && !isDateOnly(c.notOnOrAfter) && !hasTimezone(c.notOnOrAfter));
    const tzNote = dateOnly
      ? '\n※ 日付のみのため、UTC (00:00Z) として解釈しています'
      : missingTimezone
        ? '\n※ タイムゾーン指定がないため、この端末のローカル時刻として解釈しています'
        : '';

    if (notBefore && now < notBefore) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'error',
        detail: `有効期間前です（NotBefore: ${c.notBefore}）。IdP / SP の時刻ずれ（クロックスキュー）の可能性があります${tzNote}`,
      });
    } else if (notOnOrAfter && now >= notOnOrAfter) {
      items.push({
        id: `validity-${i}`,
        label,
        status: 'error',
        detail: `期限切れです（NotOnOrAfter: ${c.notOnOrAfter}）${tzNote}`,
      });
    } else {
      items.push({
        id: `validity-${i}`,
        label,
        status: missingTimezone ? 'warning' : 'success',
        detail: `有効期間内です（${c.notBefore ?? '-'} 〜 ${c.notOnOrAfter ?? '-'}）${tzNote}`,
      });
    }
  });

  // 4. Audience（SP entityID 入力時のみ照合、未入力は表示のみ）
  // restrictionGroups: AudienceRestriction ごとの Audience 列挙（外側 = AND、内側 = OR）
  const restrictionGroups = res.assertions.flatMap((a) => a.conditions?.audienceRestrictions ?? []);
  const audiences = [...new Set(restrictionGroups.flat())];
  // 空の restriction（Audience 要素なし）は AND 判定の対象外とする
  const nonEmptyRestrictions = restrictionGroups.filter((g) => g.length > 0);
  const sp = opts.spEntityId?.trim();
  if (audiences.length === 0) {
    items.push({
      id: 'audience',
      label: 'Audience',
      status: 'warning',
      detail: 'AudienceRestriction がありません',
    });
  } else if (!sp) {
    items.push({ id: 'audience', label: 'Audience', status: 'info', detail: audiences.join(', ') });
  } else if (nonEmptyRestrictions.every((g) => g.includes(sp))) {
    items.push({
      id: 'audience',
      label: 'Audience',
      status: 'success',
      detail: `SP entityID と一致します（${sp}）`,
    });
  } else {
    items.push({
      id: 'audience',
      label: 'Audience',
      status: 'error',
      detail: `SP entityID と不一致です（Audience: ${audiences.join(', ')}）`,
    });
  }

  // 5. Recipient（表示のみ）
  const recipients = [
    ...new Set(
      res.assertions.flatMap((a) =>
        a.subjectConfirmations.flatMap((s) => (s.recipient ? [s.recipient] : []))
      )
    ),
  ];
  items.push({
    id: 'recipient',
    label: 'Recipient',
    status: recipients.length > 0 ? 'info' : 'warning',
    detail:
      recipients.length > 0
        ? recipients.join(', ')
        : 'SubjectConfirmationData に Recipient がありません',
  });

  // 6. NameID
  const hasNameId = res.assertions.some((a) => a.nameId);
  items.push({
    id: 'nameid',
    label: 'NameID',
    status: hasNameId ? 'success' : 'warning',
    detail: hasNameId
      ? 'NameID が含まれています'
      : 'NameID が含まれていません（SP 側でユーザを特定できない可能性があります）',
  });

  return items;
}
