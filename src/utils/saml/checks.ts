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
    items.push({
      id: 'status',
      label: 'Status',
      status: 'error',
      detail: res.statusMessage
        ? `${code}（StatusMessage: ${res.statusMessage}）`
        : `${code}（Success ではありません）`,
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

    // timezone designator（Z または ±hh:mm / ±hhmm）が無い場合、端末のローカル時刻として
    // 解釈されるため判定が実行環境依存になる。判定自体は続行しつつ注記を付ける
    const hasTimezone = (s: string) => /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
    const missingTimezone =
      (!!c.notBefore && !hasTimezone(c.notBefore)) ||
      (!!c.notOnOrAfter && !hasTimezone(c.notOnOrAfter));
    const tzNote = missingTimezone
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
  const audiences = [...new Set(res.assertions.flatMap((a) => a.conditions?.audiences ?? []))];
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
  } else if (audiences.includes(sp)) {
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
