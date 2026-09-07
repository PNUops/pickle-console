import type { LlmKeyDetail } from '../../api/queries'
import { Card, CardContent, CardHeader, CardTitle, DescriptionField } from '../ui'
import { formatDateTime, formatRelative } from '../../lib/format'
import { passthroughText } from '../../lib/passthrough-endpoints'

/**
 * The key facts as a dl. A value cell carries the value and nothing else.
 *
 * Only the daily token limit is shown. The per-minute request, per-minute
 * token and concurrency limits are the platform's to set, so the request
 * form never asks for them and this card does not show them either.
 */
export function LlmKeyInfoCard({ llmKey }: { llmKey: LlmKeyDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>키 정보</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <DescriptionField label="키 앞부분">
            {/* 두 키를 구별하려고 두는 값이다. 아직 발급 전이면 존재하지 않는다. */}
            {llmKey.tokenPrefix ? (
              <code className="font-mono text-sm">{llmKey.tokenPrefix}…</code>
            ) : (
              '발급 전'
            )}
          </DescriptionField>
          <DescriptionField label="마지막 사용">
            {/* 「지금도 쓰이고 있나」를 묻는 값이므로 상대 시간 하나다 (Time display
                규칙). 절대 시각을 옆에 함께 두면 한 자리가 한 시각을 두 번 읽는
                것이 되고, 목록의 같은 열도 상대 시간만 쓴다. 정확한 값은
                `time` 요소가 나른다. */}
            {llmKey.lastUsedAt ? (
              <time dateTime={llmKey.lastUsedAt}>{formatRelative(llmKey.lastUsedAt)}</time>
            ) : (
              '사용 기록 없음'
            )}
          </DescriptionField>
          <DescriptionField label="만료">
            {llmKey.expiresAt ? formatDateTime(llmKey.expiresAt) : '만료 없음'}
          </DescriptionField>
          <DescriptionField label="일일 토큰 한도">
            {/* 0 is a value, not an absence: the usage gauge already says
                that a zero limit blocks the self-served models. */}
            {llmKey.dailyTokens == null
              ? '없음'
              : `${llmKey.dailyTokens.toLocaleString('ko-KR')}토큰`}
          </DescriptionField>
          <DescriptionField label="유료 모델">{creditAxisLabel(llmKey)}</DescriptionField>
          {llmKey.creditLimit ? (
            <DescriptionField label="쓸 수 있는 유료 모델">
              {llmKey.creditAllowedModels.length === 0
                ? '제한 없음'
                : llmKey.creditAllowedModels.join(', ')}
            </DescriptionField>
          ) : null}
          {/*
            차단은 허용을 이기므로, 허용 줄만 읽고 쓸 수 있다고 믿으면 안 된다.
            금액 한도로 가리지도 않는다. 지금 금액이 없어도 승인자가 막아 둔
            것은 그대로 남아 있고, 나중에 금액이 붙는 순간 그대로 적용된다.
          */}
          {llmKey.creditDeniedModels.length > 0 ? (
            <DescriptionField label="쓸 수 없는 유료 모델">
              {llmKey.creditDeniedModels.join(', ')}
            </DescriptionField>
          ) : null}
          {/*
            위 두 줄과 달리 비어 있을 때도 남는다. 두 목록은 비면 말할 것이 없지만
            이 줄은 비어 있는 것 자체가 답이고, 없으면 키 주인이 왜 404가 나는지
            알아볼 자리가 이 화면에 없다.
          */}
          <DescriptionField label="기능 권한">
            {passthroughText(llmKey.passthroughEndpoints)}
          </DescriptionField>
          <DescriptionField label="본문 기록">
            {/* Who may read the bodies and for how long is said by the
                switch on the 설정 tab and by the recorded-bodies tab. The
                one line under "off" is not a repeat: the switch says what
                turning it off does only while it is still on, so in this
                state nothing else says where the records went. */}
            {llmKey.recordBodies ? (
              '켜짐'
            ) : (
              <>
                꺼짐
                <span className="mt-0.5 block text-xs text-neutral-500">
                  이미 기록된 본문은 「기록된 본문」 탭에 남아 있습니다.
                </span>
              </>
            )}
          </DescriptionField>
          <DescriptionField label="생성일">{formatDateTime(llmKey.createdAt)}</DescriptionField>
          {llmKey.revokedAt && (
            <DescriptionField label="폐기 시각">{formatDateTime(llmKey.revokedAt)}</DescriptionField>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

/**
 * 유료 모델의 세 상태를 한 줄로 말한다. 한도는 부여됐는데 아직 적용 전인 상태가
 * 셋째이고, 이 상태를 말하지 않으면 화면은 한도를 보여주면서 호출은 거절되는
 * 모습이 되어 사용자가 플랫폼 오류로 읽는다. 게이트웨이가 같은 순간 돌려주는
 * `credit_pending` 문구와 같은 사실을 말해야 한다.
 */
function creditAxisLabel(llmKey: {
  creditLimit: number
  creditLimitReset?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null
  creditAxisConnected: boolean
}): string {
  if (!llmKey.creditLimit) return '금액 한도 없음'
  const window =
    llmKey.creditLimitReset == null
      ? '총액'
      : { DAILY: '일일', WEEKLY: '주간', MONTHLY: '월간' }[llmKey.creditLimitReset]
  const amount = `$${llmKey.creditLimit.toLocaleString('ko-KR')} (${window})`
  return llmKey.creditAxisConnected ? amount : `${amount} · 적용 중`
}
