import type {
  CertificateView,
  DomainKind,
  DomainStatus,
  PublicationView,
  RouteView,
} from '../../api/queries'
import type { BadgeVariant } from '../ui'

/**
 * 접힌 상태 파생의 입력 — 도메인 4축(도메인·검증·인증서·라우트) 중 화면이
 * 받는 값들. 목록 행(요약)에는 route/certificate가 없을 수 있다.
 */
export interface DomainAxes {
  kind: DomainKind
  status: DomainStatus
  releasedAt?: string | null
  reservedUntil?: string | null
  route?: RouteView | null
  certificate?: CertificateView | null
}

export type DomainConnectionKey =
  | 'reserved'
  | 'failed'
  | 'awaiting-records'
  | 'connecting'
  | 'connected'

export interface FoldedDomainStatus {
  key: DomainConnectionKey
  /** 접힌 배지 라벨 (예: '연결됨'). */
  label: string
  tone: BadgeVariant
  /** 행 아래 안내 문장 — 사용자 행동·대기가 없는 상태(연결됨)는 null. */
  hint: string | null
}

/** 예약 만료 안내용 KST 월·일 표기 (예: '8월 13일'). */
const KST_MONTH_DAY = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
})

/**
 * 4축 상태를 접힌 배지 하나로 파생한다. 분류 기준은 시스템 축이 아니라
 * 사용자 행동 축이다 — 사용자가 할 일이 있는 상태는 '레코드 대기'와 '실패'
 * 둘뿐이고, 나머지는 기다림(연결 중)이거나 완료(연결됨)다. 우선순위는
 * 위에서 첫 일치: 예약 중 → 실패 → 레코드 대기 → 연결 중 → 연결됨.
 */
export function foldDomainStatus(axes: DomainAxes): FoldedDomainStatus {
  // 해제(예약 중) 판별은 status가 아니라 releasedAt이다 — 서버는 예약을 위한
  // 상태값을 두지 않아, 예약 중인 행의 status는 ACTIVE로 남아 있을 수 있다.
  if (axes.releasedAt != null) {
    return {
      key: 'reserved',
      label: '예약 중',
      tone: 'neutral',
      hint: axes.reservedUntil
        ? `${KST_MONTH_DAY.format(new Date(axes.reservedUntil))}에 이름이 풀립니다. 그 전에는 다시 연결할 수 있습니다.`
        : '곧 이름이 풀립니다. 그 전에는 다시 연결할 수 있습니다.',
    }
  }
  // 실패 축은 여정 순서(소유 확인 → 인증서 → 라우트)로 지목한다.
  if (axes.status === 'FAILED') {
    return failed('소유 확인에 실패했습니다. DNS 레코드를 확인해 주세요.')
  }
  if (axes.certificate?.status === 'FAILED') {
    return failed('인증서 발급에 실패했습니다.')
  }
  if (axes.route?.status === 'FAILED') {
    return failed('라우트 적용에 실패했습니다.')
  }
  // 사용자 조치 대기 — 커스텀 도메인의 DNS 레코드 등록 전.
  if (axes.kind === 'CUSTOM' && axes.status === 'PENDING') {
    return {
      key: 'awaiting-records',
      label: '레코드 대기',
      tone: 'warning',
      hint: '안내된 DNS 레코드 2개를 추가하면 자동으로 확인됩니다.',
    }
  }
  if (axes.status === 'VERIFYING') {
    return connecting('소유 확인을 진행하고 있습니다. 잠시 후 자동으로 갱신됩니다.')
  }
  // 커스텀 도메인은 소유 확인 뒤 개별 인증서가 발급된다 — 아직 없으면 발급 중.
  if (
    axes.certificate?.status === 'RENEWING' ||
    (axes.kind === 'CUSTOM' && axes.certificate == null)
  ) {
    return connecting('인증서를 발급하고 있습니다. 보통 몇 분 안에 끝납니다.')
  }
  if (axes.route == null || axes.route.status !== 'APPLIED') {
    return connecting('공개 설정을 적용하고 있습니다. 잠시 후 자동으로 갱신됩니다.')
  }
  return { key: 'connected', label: '연결됨', tone: 'success', hint: null }
}

function failed(hint: string): FoldedDomainStatus {
  return { key: 'failed', label: '실패', tone: 'danger', hint }
}

function connecting(hint: string): FoldedDomainStatus {
  return { key: 'connecting', label: '연결 중', tone: 'info', hint }
}

/** 도메인 상태에 따른 폴링 단계 — fast(시스템 수렴 대기) / slow(사용자 DNS 조치 대기). */
export type DomainPollRate = 'fast' | 'slow' | null

/**
 * 공개 목록 전체의 폴링 단계를 파생한다. 시스템이 곧 수렴시키는 전이(라우트
 * 적용 대기·인증서 발급/갱신)는 빠르게, 사용자 DNS 조치를 기다리는 상태
 * (커스텀 검증 대기·실패)는 서버 재검증 주기에 맞춰 완만하게, 전부 안정이면
 * 폴링하지 않는다.
 */
export function domainPollRate(publications: PublicationView[]): DomainPollRate {
  const fast = publications.some((pub) => {
    const applying =
      (pub.route == null || pub.route.status === 'PENDING') &&
      // 검증 전 커스텀 도메인의 라우트는 소유 확인이 끝나야 적용된다 — 빠른
      // 폴링 대상이 아니다 (아래 slow 축이 담당).
      (pub.domain.kind !== 'CUSTOM' || pub.domain.status === 'ACTIVE')
    return applying || pub.certificate?.status === 'RENEWING'
  })
  if (fast) return 'fast'
  const awaitingUserDns = publications.some(
    (pub) =>
      pub.domain.kind === 'CUSTOM' &&
      (pub.domain.status === 'PENDING' ||
        pub.domain.status === 'VERIFYING' ||
        pub.domain.status === 'FAILED'),
  )
  return awaitingUserDns ? 'slow' : null
}
