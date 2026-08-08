import { describe, expect, test } from 'vitest'
import type { CertificateView, PublicationView, RouteView } from '../../api/queries'
import { domainPollRate, foldDomainStatus } from './domain-status'

const route = (status: RouteView['status']): RouteView => ({
  targetPort: 80,
  protocol: 'HTTP',
  status,
  appliedAt: null,
  lastError: null,
})

const cert = (status: CertificateView['status']): CertificateView => ({
  kind: 'LETS_ENCRYPT',
  status,
  notAfter: null,
  lastError: null,
})

describe('foldDomainStatus — 접힌 상태 파생 우선순위', () => {
  test('releasedAt이 찍히면 다른 축과 무관하게 예약 중이다', () => {
    const fold = foldDomainStatus({
      kind: 'PLATFORM',
      // 서버는 예약용 상태값을 두지 않는다 — status는 ACTIVE로 남는다.
      status: 'ACTIVE',
      releasedAt: '2026-08-06T09:00:00+09:00',
      reservedUntil: '2026-08-13T09:00:00+09:00',
      // 해제 전 남은 실패 축이 있어도 예약 중이 이긴다.
      route: route('FAILED'),
    })
    expect(fold.key).toBe('reserved')
    expect(fold.label).toBe('예약 중')
    expect(fold.tone).toBe('neutral')
    expect(fold.hint).toBe(
      '8월 13일에 이름이 풀립니다. 그 전에는 다시 연결할 수 있습니다.',
    )
  })

  test('releasedAt 없이 status만으로는 예약 중으로 접히지 않는다', () => {
    // 판별 기준은 releasedAt 하나다 — REMOVED 값 자체는 예약을 뜻하지 않는다.
    const fold = foldDomainStatus({ kind: 'PLATFORM', status: 'REMOVED' })
    expect(fold.key).not.toBe('reserved')
  })

  test('해제됐지만 예약 만료를 모르면 날짜 없는 안내로 접힌다', () => {
    const fold = foldDomainStatus({
      kind: 'PLATFORM',
      status: 'ACTIVE',
      releasedAt: '2026-08-06T09:00:00+09:00',
    })
    expect(fold.key).toBe('reserved')
    expect(fold.hint).toContain('이름이 풀립니다')
  })

  test('도메인 검증 실패는 소유 확인 축을 지목한다', () => {
    const fold = foldDomainStatus({
      kind: 'CUSTOM',
      status: 'FAILED',
      // 다른 축이 실패해도 여정 순서상 소유 확인이 먼저다.
      certificate: cert('FAILED'),
      route: route('FAILED'),
    })
    expect(fold.key).toBe('failed')
    expect(fold.tone).toBe('danger')
    expect(fold.hint).toBe('소유 확인에 실패했습니다 — DNS 레코드를 확인해 주세요.')
  })

  test('인증서 실패는 도메인이 정상일 때 인증서 축을 지목한다', () => {
    const fold = foldDomainStatus({
      kind: 'CUSTOM',
      status: 'ACTIVE',
      certificate: cert('FAILED'),
      route: route('FAILED'),
    })
    expect(fold.key).toBe('failed')
    expect(fold.hint).toBe('인증서 발급에 실패했습니다.')
  })

  test('라우트 실패는 앞 축이 모두 정상일 때 라우트 축을 지목한다', () => {
    const fold = foldDomainStatus({
      kind: 'CUSTOM',
      status: 'ACTIVE',
      certificate: cert('ACTIVE'),
      route: route('FAILED'),
    })
    expect(fold.key).toBe('failed')
    expect(fold.hint).toBe('라우트 적용에 실패했습니다.')
  })

  test('커스텀 + 소유 확인 전(PENDING)은 레코드 대기다', () => {
    const fold = foldDomainStatus({ kind: 'CUSTOM', status: 'PENDING', route: route('PENDING') })
    expect(fold.key).toBe('awaiting-records')
    expect(fold.label).toBe('레코드 대기')
    expect(fold.tone).toBe('warning')
    expect(fold.hint).toBe('안내된 DNS 레코드 2개를 추가하면 자동으로 확인됩니다.')
  })

  test('검증 중(VERIFYING)은 연결 중 — 소유 확인 진행 안내', () => {
    const fold = foldDomainStatus({ kind: 'CUSTOM', status: 'VERIFYING', route: route('PENDING') })
    expect(fold.key).toBe('connecting')
    expect(fold.label).toBe('연결 중')
    expect(fold.hint).toContain('소유 확인을 진행하고 있습니다')
  })

  test('검증 완료 후 인증서가 아직 없는 커스텀은 발급 중 안내다', () => {
    const fold = foldDomainStatus({
      kind: 'CUSTOM',
      status: 'ACTIVE',
      certificate: null,
      route: route('PENDING'),
    })
    expect(fold.key).toBe('connecting')
    expect(fold.hint).toBe('인증서를 발급하고 있습니다. 보통 몇 분 안에 끝납니다.')
  })

  test('인증서 갱신 중(RENEWING)도 발급 안내로 접힌다', () => {
    const fold = foldDomainStatus({
      kind: 'CUSTOM',
      status: 'ACTIVE',
      certificate: cert('RENEWING'),
      route: route('APPLIED'),
    })
    expect(fold.key).toBe('connecting')
    expect(fold.hint).toBe('인증서를 발급하고 있습니다. 보통 몇 분 안에 끝납니다.')
  })

  test('라우트 적용 대기(PENDING 또는 미생성)는 적용 안내로 접힌다', () => {
    const pending = foldDomainStatus({
      kind: 'PLATFORM',
      status: 'ACTIVE',
      certificate: { ...cert('ACTIVE'), kind: 'ORIGIN_CA_WILDCARD' },
      route: route('PENDING'),
    })
    expect(pending.key).toBe('connecting')
    expect(pending.hint).toContain('공개 설정을 적용하고 있습니다')

    // 접수 직후 과도기 — 라우트 블록이 아직 없어도 크래시 없이 연결 중이다.
    const missing = foldDomainStatus({
      kind: 'PLATFORM',
      status: 'ACTIVE',
      certificate: { ...cert('ACTIVE'), kind: 'ORIGIN_CA_WILDCARD' },
      route: null,
    })
    expect(missing.key).toBe('connecting')
  })

  test('전 축 정상이면 연결됨 — 안내 줄이 없다', () => {
    const fold = foldDomainStatus({
      kind: 'CUSTOM',
      status: 'ACTIVE',
      certificate: cert('ACTIVE'),
      route: route('APPLIED'),
    })
    expect(fold.key).toBe('connected')
    expect(fold.label).toBe('연결됨')
    expect(fold.tone).toBe('success')
    expect(fold.hint).toBeNull()
  })

  test('플랫폼 서브도메인은 인증서 블록이 없어도 라우트만 적용되면 연결됨이다', () => {
    const fold = foldDomainStatus({
      kind: 'PLATFORM',
      status: 'ACTIVE',
      certificate: { ...cert('ACTIVE'), kind: 'ORIGIN_CA_WILDCARD' },
      route: route('APPLIED'),
    })
    expect(fold.key).toBe('connected')
  })
})

/* ─── 폴링 단계 파생 ─── */

function pub(overrides: {
  kind?: 'PLATFORM' | 'CUSTOM'
  status?: 'PENDING' | 'VERIFYING' | 'ACTIVE' | 'FAILED'
  route?: RouteView | null
  certificate?: CertificateView | null
}): PublicationView {
  const kind = overrides.kind ?? 'PLATFORM'
  const status = overrides.status ?? 'ACTIVE'
  return {
    fqdn: 'x.pusan.dev',
    domain: {
      id: 1,
      vmId: 1,
      kind,
      fqdn: 'x.pusan.dev',
      rootDomain: kind === 'CUSTOM' ? null : 'pusan.dev',
      status,
      verifiedAt: null,
      createdAt: '2026-07-12T09:00:00+09:00',
      verification: null,
    },
    route: 'route' in overrides ? overrides.route : route('APPLIED'),
    certificate: 'certificate' in overrides ? overrides.certificate : cert('ACTIVE'),
  }
}

describe('domainPollRate — 목록 전체의 폴링 단계', () => {
  test('빈 목록·전 축 안정이면 폴링하지 않는다', () => {
    expect(domainPollRate([])).toBeNull()
    expect(domainPollRate([pub({})])).toBeNull()
  })

  test('라우트 적용 대기(플랫폼 또는 검증 완료 커스텀)는 빠른 폴링이다', () => {
    expect(domainPollRate([pub({ route: route('PENDING') })])).toBe('fast')
    expect(
      domainPollRate([pub({ kind: 'CUSTOM', status: 'ACTIVE', route: null })]),
    ).toBe('fast')
    expect(domainPollRate([pub({ certificate: cert('RENEWING') })])).toBe('fast')
  })

  test('검증 전 커스텀의 라우트 대기는 빠른 폴링 사유가 아니다 — 느린 폴링이다', () => {
    expect(
      domainPollRate([
        pub({ kind: 'CUSTOM', status: 'PENDING', route: route('PENDING'), certificate: null }),
      ]),
    ).toBe('slow')
    expect(
      domainPollRate([
        pub({ kind: 'CUSTOM', status: 'VERIFYING', route: route('PENDING'), certificate: null }),
      ]),
    ).toBe('slow')
    expect(
      domainPollRate([
        pub({ kind: 'CUSTOM', status: 'FAILED', route: route('PENDING'), certificate: null }),
      ]),
    ).toBe('slow')
  })

  test('어느 도메인 하나라도 빠른 사유가 있으면 목록 전체가 빠르게 돈다', () => {
    expect(
      domainPollRate([
        pub({ kind: 'CUSTOM', status: 'PENDING', route: route('PENDING'), certificate: null }),
        pub({ route: route('PENDING') }),
      ]),
    ).toBe('fast')
  })
})
