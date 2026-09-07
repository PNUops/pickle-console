import type { LlmKeyDetail } from '../../api/queries'
import { Card, CardContent, CardHeader, CardTitle, DescriptionField } from '../ui'
import { formatDateTime } from '../../lib/format'
import { passthroughText } from '../../lib/passthrough-endpoints'

/** 키 정보 카드 — 값과 한도를 한 자리에서 읽는 dl. */
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
            {llmKey.lastUsedAt ? formatDateTime(llmKey.lastUsedAt) : '사용 기록 없음'}
          </DescriptionField>
          <DescriptionField label="만료">
            {llmKey.expiresAt ? formatDateTime(llmKey.expiresAt) : '만료 없음'}
          </DescriptionField>
          <DescriptionField label="본문 기록">
            {llmKey.recordBodies ? (
              // 열람 범위와 보관 기간은 같은 화면의 설정 문구가 말한다. 여기서
              // 되풀이하면 한 화면이 같은 사실을 두 번 말한다. 꺼짐 쪽은
              // 되풀이가 아니라서 남는다 - 이미 기록된 것이 어떻게 되는지는
              // 설정 문구가 답하지 않는다.
              <>켜짐. 새 요청이 기록됩니다.</>
            ) : (
              <>
                꺼짐. 새 요청은 기록되지 않습니다.
                <span className="mt-0.5 block text-xs text-neutral-500">
                  이미 기록된 본문이 있으면 「기록된 본문」 탭에 남아 있고, 기록된 지 30일이
                  지나면 삭제됩니다.
                </span>
              </>
            )}
          </DescriptionField>
          <DescriptionField label="분당 요청 한도 (자체 서빙)">
            {limitLabel(llmKey.rpm, '회')}
          </DescriptionField>
          <DescriptionField label="분당 토큰 한도 (자체 서빙)">
            {limitLabel(llmKey.tpm, '토큰')}
          </DescriptionField>
          <DescriptionField label="동시 요청 한도 (자체 서빙)">
            {limitLabel(llmKey.concurrency, '건')}
          </DescriptionField>
          <DescriptionField label="유료 모델">{creditAxisLabel(llmKey)}</DescriptionField>
          {llmKey.creditLimit ? (
            <DescriptionField label="쓸 수 있는 유료 모델">
              {llmKey.creditAllowedModels.length === 0
                ? '제한 없음. 금액 한도 안에서 모든 유료 모델'
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
          <DescriptionField label="생성일">{formatDateTime(llmKey.createdAt)}</DescriptionField>
          {llmKey.revokedAt && (
            <DescriptionField label="폐기 시각">{formatDateTime(llmKey.revokedAt)}</DescriptionField>
          )}
        </dl>
        <p className="mt-4 text-xs text-neutral-500">
          마지막 사용 시각에는 최근 호출이 늦게 반영될 수 있습니다.
        </p>
      </CardContent>
    </Card>
  )
}

/** null 한도는 "무제한"이 아니라 "게이트웨이 기본값"이다 — 계약이 그렇게 말한다. */
function limitLabel(value: number | null | undefined, unit: string): string {
  return value == null ? '게이트웨이 기본값' : `${value}${unit}`
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
  if (!llmKey.creditLimit) return '금액 한도가 없어 유료 모델을 쓸 수 없습니다'
  const window =
    llmKey.creditLimitReset == null
      ? '총액'
      : { DAILY: '일일', WEEKLY: '주간', MONTHLY: '월간' }[llmKey.creditLimitReset]
  const amount = `$${llmKey.creditLimit.toLocaleString('ko-KR')} (${window})`
  return llmKey.creditAxisConnected
    ? amount
    : `${amount}, 승인된 한도를 적용하는 중입니다`
}
