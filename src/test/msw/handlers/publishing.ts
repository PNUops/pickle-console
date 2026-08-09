import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { orgs, requestOptions } from './reference'
import { problemResponse } from './auth'
import { recordVmEvent, vmStore } from './vms'

type Schemas = components['schemas']
type VmDetail = Schemas['VmDetailResponse']
type PublicationView = Schemas['PublicationView']
type DomainDetail = Schemas['DomainDetailView']
type DomainSummary = Schemas['DomainSummaryView']

/** 커스텀 도메인 검증에서 A 레코드로 안내하는 리버스 프록시 IP. */
const PROXY_IP = '164.125.249.87'
/** 인증서 만료일 계산에 쓰는 고정 기준 시각 (프로젝트 기준일 2026-07-12). */
const REFERENCE_NOW = new Date('2026-07-12T00:00:00+09:00').getTime()

/** 플랫폼 서브도메인 상한 (실서버는 관리자 설정값 — mock 고정). */
export const PLATFORM_DOMAIN_LIMIT = 3
/** 플랫폼 서브도메인 해제 후 이름 예약 일수 (실서버는 관리자 설정값 — mock 고정). */
export const NAME_RESERVATION_DAYS = 7

let nextDomainId = 900

/**
 * 해제됐지만 이름 예약이 남은 플랫폼 서브도메인 행. 서버는 예약용 상태값을
 * 두지 않는다 — status는 그대로 두고 releasedAt이 채워지는 것으로 예약을
 * 표현하며, 언제 풀리는지는 reservedUntil이 알려 준다. 예약 중에는 같은 VM이
 * 같은 이름으로 다시 연결할 수 있고, DELETE(즉시 반납)나 예약 만료로 이름이
 * 풀린다. 커스텀 도메인은 해제 즉시 이름이 풀리므로 여기 남지 않는다.
 */
let reservedDomains: DomainDetail[] = initialReservedDomains()

/**
 * REMOVED 행. 실서버는 반납·회수·강제 해제 때 행을 지우지 않고 REMOVED로
 * 바꾸며(releasedAt은 함께 지운다 — REMOVED 행은 아무것도 예약하지 않는다),
 * 목록에서는 기본적으로 숨기고 status=REMOVED 명시 요청에만 노출한다.
 * mock이 행을 배열에서 빼 버리면 이 목록 규칙이 가려진다.
 */
let removedDomains: DomainDetail[] = []

/** 행을 REMOVED 묘비로 바꿔 보관한다 (실서버의 retire와 같은 모양). */
function retireDomain(d: DomainDetail) {
  removedDomains.push({
    ...d,
    status: 'REMOVED',
    releasedAt: null,
    reservedUntil: null,
    verification: null,
  })
}

/** 예약 중 픽스처 — D-day 표시는 실행 시점 기준이라 만료를 동적으로 만든다. */
function initialReservedDomains(): DomainDetail[] {
  const releasedAt = new Date(Date.now() - 86_400_000).toISOString()
  const reservedUntil = new Date(Date.now() + 6 * 86_400_000).toISOString()
  return [
    {
      id: 22,
      vmId: 63,
      kind: 'PLATFORM',
      fqdn: 'shop-old.pusan.dev',
      rootDomain: 'pusan.dev',
      // 예약 중이어도 status는 예약 전 값 그대로다 (판별은 releasedAt).
      status: 'ACTIVE',
      verifiedAt: null,
      createdAt: '2026-06-20T09:00:00+09:00',
      releasedAt,
      reservedUntil,
      verification: null,
    },
  ]
}

export function resetPublishingFixtures() {
  nextDomainId = 900
  reservedDomains = initialReservedDomains()
  removedDomains = []
}

/* ─── org 이름 조회 (관리자 목록의 기관 맥락) ─── */
function orgName(orgId: number): string {
  return orgs.find((o) => o.id === orgId)?.name ?? `기관 #${orgId}`
}

/* ─── 서빙 중 공개 순회 ─── */
function livePublications(): { vm: VmDetail; pub: PublicationView }[] {
  return vmStore.flatMap((vm) => vm.publications.map((pub) => ({ vm, pub })))
}

function findLive(domainId: number): { vm: VmDetail; pub: PublicationView } | null {
  return livePublications().find(({ pub }) => pub.domain.id === domainId) ?? null
}

function toDomainSummary(d: DomainDetail): DomainSummary {
  return {
    id: d.id,
    vmId: d.vmId,
    kind: d.kind,
    fqdn: d.fqdn,
    rootDomain: d.rootDomain,
    status: d.status,
    verifiedAt: d.verifiedAt,
    createdAt: d.createdAt,
    releasedAt: d.releasedAt ?? null,
    reservedUntil: d.reservedUntil ?? null,
  }
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

/**
 * 서버 GlobalExceptionHandler와 같은 모양의 422 — detail은 항상 일반 문구이고,
 * 구체적인 사유는 errors[]에만 담긴다 (필드 메시지를 detail로 복제하지 않는다).
 */
const validationFailed = (instance: string, field: string, message: string) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: '요청 값을 확인해 주세요.',
    instance,
    code: 'VALIDATION_FAILED',
    errors: [{ field, message }],
  })

const fqdnTaken = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '이미 사용 중인 도메인입니다',
    status: 409,
    detail: '요청한 도메인이 이미 다른 곳에 연결되어 있습니다. 다른 이름을 사용해 주세요.',
    instance,
    code: 'DOMAIN_FQDN_TAKEN',
  })

const limitReached = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '플랫폼 서브도메인 개수 제한에 도달했습니다',
    status: 409,
    detail: `이 VM에는 플랫폼 서브도메인을 최대 ${PLATFORM_DOMAIN_LIMIT}개까지 연결할 수 있습니다. 기존 서브도메인을 해제하거나 커스텀 도메인을 사용해 주세요.`,
    instance,
    code: 'DOMAIN_LIMIT_REACHED',
  })

/** 연결 접수 가능한 VM 상태 (계약: RUNNING/STOPPED 외에는 409 VM_INVALID_STATE). */
const CONNECTABLE_STATUSES = ['RUNNING', 'STOPPED']

/** 플랫폼 서브도메인 형식 (소문자·숫자·하이픈 3~40자, 하이픈 시작·끝 불가). */
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/

/** 연결 시점 서브도메인 검증 (형식·예약어 — 서버 422와 같은 규칙). */
function subdomainError(subdomain: string): string | null {
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    return '서브도메인은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요.'
  }
  if (requestOptions.reservedSubdomains.includes(subdomain)) {
    return `'${subdomain}'은(는) 예약된 서브도메인이라 사용할 수 없습니다.`
  }
  return null
}

/** 커스텀 도메인 형식 검증 (다중 라벨 + 플랫폼 관리 존 하위 금지). */
function customDomainError(customDomain: string): string | null {
  const labels = customDomain.split('.')
  if (labels.length < 2 || labels.some((l) => l.length === 0)) {
    return '커스텀 도메인은 완전한 외부 FQDN(예: app.example.com)이어야 합니다.'
  }
  if (customDomain.endsWith('.pusan.dev') || customDomain === 'pusan.dev') {
    return '플랫폼이 관리하는 도메인 하위 이름은 커스텀 도메인으로 사용할 수 없습니다.'
  }
  return null
}

/**
 * FQDN 점유 검사 — 서빙 중인 모든 도메인과, 다른 VM 몫으로 예약된 이름이
 * 점유다. 같은 VM의 예약 이름은 점유가 아니다 (다시 연결 대상).
 */
function isFqdnTaken(fqdn: string, exceptVmId: number): boolean {
  return (
    livePublications().some(({ pub }) => pub.fqdn === fqdn) ||
    reservedDomains.some((d) => d.vmId !== exceptVmId && d.fqdn === fqdn)
  )
}

/** 같은 VM·같은 FQDN의 예약 행을 꺼낸다 (다시 연결이면 예약 목록에서 제거). */
function takeReserved(vmId: number, fqdn: string): DomainDetail | null {
  const idx = reservedDomains.findIndex((d) => d.vmId === vmId && d.fqdn === fqdn)
  return idx >= 0 ? reservedDomains.splice(idx, 1)[0] : null
}

/** 커스텀 도메인 공개를 구성한다 (검증 대기 PENDING). */
function buildCustomPublication(vm: VmDetail, fqdn: string, port: number): PublicationView {
  const token = `pv-${Math.random().toString(16).slice(2, 14)}`
  return {
    fqdn,
    domain: {
      id: nextDomainId++,
      vmId: vm.id,
      kind: 'CUSTOM',
      fqdn,
      rootDomain: null,
      status: 'PENDING',
      verifiedAt: null,
      createdAt: '2026-07-12T09:00:00+09:00',
      releasedAt: null,
      reservedUntil: null,
      verification: {
        token,
        requiredRecords: [
          { type: 'A', name: fqdn, value: PROXY_IP },
          { type: 'TXT', name: `_pickle-verify.${fqdn}`, value: token },
        ],
        aVerified: false,
        txtVerified: false,
        lastCheckedAt: null,
        lastError: null,
      },
    },
    route: { targetPort: port, protocol: 'HTTP', status: 'PENDING', appliedAt: null, lastError: null },
    certificate: null,
  }
}

/**
 * 플랫폼 서브도메인 공개를 구성한다 — 공용 와일드카드 인증서라 소유 확인 없이
 * 즉시 라우트 적용 대기.
 */
function buildPlatformPublication(
  vm: VmDetail,
  port: number,
  subdomain: string,
  rootDomain: string,
): PublicationView {
  const fqdn = `${subdomain}.${rootDomain}`
  return {
    fqdn,
    domain: {
      id: nextDomainId++,
      vmId: vm.id,
      kind: 'PLATFORM',
      fqdn,
      rootDomain,
      status: 'ACTIVE',
      verifiedAt: null,
      createdAt: '2026-07-12T09:00:00+09:00',
      releasedAt: null,
      reservedUntil: null,
      verification: null,
    },
    route: { targetPort: port, protocol: 'HTTP', status: 'PENDING', appliedAt: null, lastError: null },
    certificate: {
      kind: 'ORIGIN_CA_WILDCARD',
      status: 'ACTIVE',
      notAfter: '2040-01-01T00:00:00+09:00',
      lastError: null,
    },
  }
}

function toAdminRoute(vm: VmDetail, pub: PublicationView): Schemas['AdminRouteView'] {
  const route = pub.route!
  return {
    id: pub.domain.id,
    domainId: pub.domain.id,
    fqdn: pub.fqdn,
    domainKind: pub.domain.kind,
    vmId: vm.id,
    vmName: vm.name,
    workspaceId: vm.workspaceId,
    workspaceName: vm.workspaceName,
    orgId: vm.orgId,
    orgName: orgName(vm.orgId),
    targetPort: route.targetPort,
    protocol: 'HTTP',
    status: route.status,
    appliedGeneration: route.status === 'APPLIED' ? 7 : null,
    appliedAt: route.appliedAt,
    lastError: route.lastError,
    updatedAt: vm.updatedAt,
  }
}

function toAdminDomain(vm: VmDetail, pub: PublicationView): Schemas['AdminDomainView'] {
  return {
    id: pub.domain.id,
    vmId: vm.id,
    kind: pub.domain.kind,
    fqdn: pub.fqdn,
    rootDomain: pub.domain.rootDomain,
    status: pub.domain.status,
    verifiedAt: pub.domain.verifiedAt,
    releasedAt: null,
    reservedUntil: null,
    createdAt: pub.domain.createdAt,
    vmName: vm.name,
    workspaceId: vm.workspaceId,
    workspaceName: vm.workspaceName,
    orgId: vm.orgId,
    orgName: orgName(vm.orgId),
    routeStatus: pub.route?.status ?? null,
    certificateStatus: pub.certificate?.status ?? null,
    updatedAt: vm.updatedAt,
  }
}

/**
 * 예약 중(또는 REMOVED) 행의 관리자 목록 표현 — 라우트·인증서 축이 없다.
 * 예약 축은 사용자 목록과 같은 값이 그대로 실린다.
 */
function reservedToAdminDomain(d: DomainDetail): Schemas['AdminDomainView'] {
  const vm = vmStore.find((v) => v.id === d.vmId)
  return {
    id: d.id,
    vmId: d.vmId,
    kind: d.kind,
    fqdn: d.fqdn,
    rootDomain: d.rootDomain,
    status: d.status,
    verifiedAt: d.verifiedAt,
    releasedAt: d.releasedAt ?? null,
    reservedUntil: d.reservedUntil ?? null,
    createdAt: d.createdAt,
    vmName: vm?.name ?? `vm-${d.vmId}`,
    workspaceId: vm?.workspaceId ?? 0,
    workspaceName: vm?.workspaceName ?? '—',
    orgId: vm?.orgId ?? 0,
    orgName: vm ? orgName(vm.orgId) : '—',
    routeStatus: null,
    certificateStatus: null,
    updatedAt: d.releasedAt ?? d.createdAt,
  }
}

function daysUntil(notAfter: string | null): number | null {
  if (!notAfter) return null
  return Math.ceil((new Date(notAfter).getTime() - REFERENCE_NOW) / 86_400_000)
}

/** 관리자 인증서 목록: 공용 와일드카드 1개 + 커스텀 도메인별 LE 인증서. */
function adminCertificates(orgId?: number): Schemas['AdminCertificateView'][] {
  const wildcard: Schemas['AdminCertificateView'] = {
    id: 1,
    kind: 'ORIGIN_CA_WILDCARD',
    status: 'ACTIVE',
    scope: '*.pusan.dev',
    domainId: null,
    notAfter: '2040-01-01T00:00:00+09:00',
    daysUntilExpiry: daysUntil('2040-01-01T00:00:00+09:00'),
    lastError: null,
  }
  const custom = livePublications()
    .filter(({ vm }) => !orgId || vm.orgId === orgId)
    .filter(({ pub }) => pub.certificate?.kind === 'LETS_ENCRYPT')
    .map(({ pub }) => {
      const cert = pub.certificate!
      return {
        id: 1000 + pub.domain.id,
        kind: 'LETS_ENCRYPT' as const,
        status: cert.status,
        scope: pub.fqdn,
        domainId: pub.domain.id,
        notAfter: cert.notAfter ?? null,
        daysUntilExpiry: daysUntil(cert.notAfter ?? null),
        lastError: cert.lastError ?? null,
      }
    })
  return [wildcard, ...custom]
}

function paginate<T>(items: T[], page: number, size: number): Schemas['PageResponseDomainSummaryView'] {
  return {
    content: items.slice(page * size, (page + 1) * size) as never,
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  }
}

export const publishingHandlers: RequestHandler[] = [
  /* ─── 도메인 연결 (사용자) ─── */
  http.post('*/api/v1/vms/:vmId/domains', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFound()
    const instance = `/api/v1/vms/${vm.id}/domains`
    if (!CONNECTABLE_STATUSES.includes(vm.status)) {
      return problemResponse({
        type: 'about:blank',
        title: '현재 상태에서는 연결할 수 없습니다',
        status: 409,
        detail: `실행 중 또는 중지됨 상태의 VM만 도메인을 연결할 수 있습니다. (현재 상태 ${vm.status})`,
        instance,
        code: 'VM_INVALID_STATE',
      })
    }
    const body = (await request.json().catch(() => ({}))) as Schemas['CreateVmDomainRequest']
    const port = body.port ?? 80
    if (port === 22) {
      return validationFailed(instance, 'port', 'VM의 SSH 포트(22)는 공개할 수 없습니다.')
    }
    if (port < 1 || port > 65535) {
      return validationFailed(instance, 'port', '포트는 1–65535 범위여야 합니다.')
    }
    if (body.customDomain != null && body.subdomain != null) {
      return validationFailed(
        instance,
        'subdomain',
        '커스텀 도메인과 서브도메인은 함께 지정할 수 없습니다.',
      )
    }

    let pub: PublicationView
    if (body.customDomain != null) {
      const err = customDomainError(body.customDomain)
      if (err) return validationFailed(instance, 'customDomain', err)
      if (isFqdnTaken(body.customDomain, vm.id)) return fqdnTaken(instance)
      pub = buildCustomPublication(vm, body.customDomain, port)
    } else {
      if (!body.subdomain) {
        return validationFailed(instance, 'subdomain', '연결할 서브도메인을 지정해 주세요.')
      }
      const err = subdomainError(body.subdomain)
      if (err) return validationFailed(instance, 'subdomain', err)
      const rootDomain = body.rootDomain ?? 'pusan.dev'
      const fqdn = `${body.subdomain}.${rootDomain}`
      // 같은 VM 몫으로 예약된 이름이면 예약을 걷어내고 다시 연결한다.
      const reserved = takeReserved(vm.id, fqdn)
      if (!reserved && isFqdnTaken(fqdn, vm.id)) return fqdnTaken(instance)
      const platformCount = vm.publications.filter(
        (p) => p.domain.kind !== 'CUSTOM',
      ).length
      if (platformCount >= PLATFORM_DOMAIN_LIMIT) {
        // 예약을 이미 걷어냈다면 되돌린다 — 상한 초과 접수는 실패다.
        if (reserved) reservedDomains.push(reserved)
        return limitReached(instance)
      }
      pub = buildPlatformPublication(vm, port, body.subdomain, rootDomain)
    }

    vm.publications = [...vm.publications, pub]
    recordVmEvent(vm.id, {
      type: 'PUBLISH',
      actorId: 42,
      detail: pub.fqdn,
      createdAt: '2026-07-12T09:00:00+09:00',
    })
    return HttpResponse.json(pub, { status: 202 })
  }),

  /* ─── 도메인 목록·상세 (사용자) ─── */
  http.get('*/api/v1/domains', ({ request }) => {
    const url = new URL(request.url)
    const vmId = url.searchParams.get('vmId')
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const items = [
      ...livePublications().map(({ pub }) => toDomainSummary(pub.domain)),
      ...reservedDomains.map(toDomainSummary),
      ...removedDomains.map(toDomainSummary),
    ]
      .filter((d) => !vmId || d.vmId === Number(vmId))
      // 실서버 규칙: REMOVED는 기본 숨김, status=REMOVED 명시 때만 노출.
      .filter((d) => (status ? d.status === status : d.status !== 'REMOVED'))
      .sort((a, b) => b.id - a.id)
    return HttpResponse.json(paginate(items, page, size), { status: 200 })
  }),

  http.get('*/api/v1/domains/:domainId', ({ params }) => {
    const domainId = Number(params.domainId)
    const domain =
      findLive(domainId)?.pub.domain ??
      reservedDomains.find((d) => d.id === domainId) ??
      removedDomains.find((d) => d.id === domainId) ??
      null
    if (!domain) return notFound()
    return HttpResponse.json(domain satisfies DomainDetail, { status: 200 })
  }),

  /* ─── 포트 변경 (도메인 단위) ─── */
  http.patch('*/api/v1/domains/:domainId', async ({ params, request }) => {
    const found = findLive(Number(params.domainId))
    if (!found || found.pub.route == null) return notFound()
    const instance = `/api/v1/domains/${params.domainId}`
    const body = (await request.json().catch(() => ({}))) as Schemas['UpdateDomainRequest']
    if (body.port == null) {
      return validationFailed(instance, 'port', '변경할 포트를 지정해 주세요.')
    }
    if (body.port === 22) {
      return validationFailed(instance, 'port', 'VM의 SSH 포트(22)는 공개할 수 없습니다.')
    }
    if (body.port < 1 || body.port > 65535) {
      return validationFailed(instance, 'port', '포트는 1–65535 범위여야 합니다.')
    }
    const route = found.pub.route
    route.targetPort = body.port
    route.status = 'PENDING'
    route.appliedAt = null
    route.lastError = null
    found.vm.updatedAt = '2026-07-12T09:10:00+09:00'
    return HttpResponse.json(found.pub, { status: 202 })
  }),

  /* ─── 해제 / 즉시 반납 ─── */
  http.delete('*/api/v1/domains/:domainId', ({ params }) => {
    const domainId = Number(params.domainId)
    // 이미 예약 중인 행이면 즉시 반납 — 행은 REMOVED로 남고 이름이 바로 풀린다.
    const reservedIdx = reservedDomains.findIndex((d) => d.id === domainId)
    if (reservedIdx >= 0) {
      const [returned] = reservedDomains.splice(reservedIdx, 1)
      retireDomain(returned!)
      return HttpResponse.json(
        { message: `${returned!.fqdn} 이름을 반납했습니다. 이름이 즉시 풀립니다.` },
        { status: 202 },
      )
    }
    // 서빙 중이면 해제 — 플랫폼 서브도메인만 이름이 예약된다.
    const found = findLive(domainId)
    if (!found) return notFound()
    const { vm, pub } = found
    vm.publications = vm.publications.filter((p) => p.domain.id !== domainId)
    vm.updatedAt = '2026-07-12T09:20:00+09:00'
    recordVmEvent(vm.id, {
      type: 'UNPUBLISH',
      actorId: 42,
      detail: pub.fqdn,
      createdAt: '2026-07-12T09:20:00+09:00',
    })
    if (pub.domain.kind === 'CUSTOM') {
      // 커스텀은 예약 없이 즉시 회수 — REMOVED 묘비만 남는다.
      retireDomain(pub.domain)
      return HttpResponse.json(
        { message: `${pub.fqdn} 연결을 해제했습니다.` },
        { status: 202 },
      )
    }
    reservedDomains.push({
      ...pub.domain,
      releasedAt: new Date(Date.now()).toISOString(),
      reservedUntil: new Date(
        Date.now() + NAME_RESERVATION_DAYS * 86_400_000,
      ).toISOString(),
      verification: null,
    })
    return HttpResponse.json(
      {
        message: `${pub.fqdn} 연결을 해제했습니다. 이름은 ${NAME_RESERVATION_DAYS}일 동안 예약됩니다.`,
      },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/domains/:domainId/verify', ({ params }) => {
    const found = findLive(Number(params.domainId))
    if (!found) return notFound()
    const { pub } = found
    const domain = pub.domain
    if (domain.kind !== 'CUSTOM') {
      return problemResponse({
        type: 'about:blank',
        title: '검증할 수 없는 도메인입니다',
        status: 409,
        detail: '플랫폼 서브도메인은 소유권 검증이 필요하지 않습니다.',
        instance: `/api/v1/domains/${domain.id}/verify`,
        code: 'DOMAIN_NOT_CUSTOM',
      })
    }
    // 재검증 성공을 시뮬레이션: 소유권·전파 확인 완료 → ACTIVE.
    if (domain.verification) {
      domain.verification = {
        ...domain.verification,
        aVerified: true,
        txtVerified: true,
        lastCheckedAt: '2026-07-12T09:40:00+09:00',
        lastError: null,
      }
    }
    domain.status = 'ACTIVE'
    domain.verifiedAt = '2026-07-12T09:40:00+09:00'
    // ACTIVE인데 인증서가 FAILED였다면 발급 재트리거 → RENEWING.
    if (pub.certificate?.status === 'FAILED') {
      pub.certificate = { ...pub.certificate, status: 'RENEWING', lastError: null }
    }
    return HttpResponse.json(domain satisfies DomainDetail, { status: 202 })
  }),

  /* ─── 관리자: 라우트·도메인·인증서 ─── */
  http.get('*/api/v1/admin/routes', ({ request }) => {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const items = livePublications()
      .filter(({ pub }) => pub.route != null)
      .filter(({ vm }) => !orgId || vm.orgId === Number(orgId))
      .map(({ vm, pub }) => toAdminRoute(vm, pub))
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.id - a.id)
    return HttpResponse.json(paginate(items, page, size), { status: 200 })
  }),

  http.get('*/api/v1/admin/domains', ({ request }) => {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const kind = url.searchParams.get('kind')
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const items = [
      ...livePublications().map(({ vm, pub }) => toAdminDomain(vm, pub)),
      ...reservedDomains.map(reservedToAdminDomain),
      ...removedDomains.map(reservedToAdminDomain),
    ]
      .filter((d) => !orgId || d.orgId === Number(orgId))
      .filter((d) => !kind || d.kind === kind)
      // 실서버 규칙: REMOVED는 기본 숨김, status=REMOVED 명시 때만 노출.
      .filter((d) => (status ? d.status === status : d.status !== 'REMOVED'))
      .sort((a, b) => b.id - a.id)
    return HttpResponse.json(paginate(items, page, size), { status: 200 })
  }),

  http.get('*/api/v1/admin/certificates', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const expiringInDays = url.searchParams.get('expiringInDays')
    const orgId = url.searchParams.get('orgId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const items = adminCertificates(orgId ? Number(orgId) : undefined)
      .filter((c) => !status || c.status === status)
      .filter(
        (c) =>
          !expiringInDays ||
          (c.daysUntilExpiry != null && c.daysUntilExpiry <= Number(expiringInDays)),
      )
    return HttpResponse.json(paginate(items, page, size), { status: 200 })
  }),

  http.post('*/api/v1/admin/routes/resync', () =>
    HttpResponse.json(
      { message: '라우트 전체 재동기화를 접수했습니다. 잠시 후 적용 상태가 갱신됩니다.' },
      { status: 202 },
    ),
  ),

  /* ─── 관리자 사후 개입 ─── */
  http.post('*/api/v1/admin/domains/:domainId/force-release', ({ params }) => {
    const domainId = Number(params.domainId)
    // 예약 중 행의 강제 해제 = 즉시 반납 (행은 REMOVED로 남는다).
    const reservedIdx = reservedDomains.findIndex((d) => d.id === domainId)
    if (reservedIdx >= 0) {
      const [reserved] = reservedDomains.splice(reservedIdx, 1)
      retireDomain(reserved!)
      return HttpResponse.json(
        { message: '예약된 이름을 즉시 회수했습니다.' },
        { status: 200 },
      )
    }
    const found = findLive(domainId)
    if (!found) {
      // 이미 REMOVED인 행도 실서버처럼 같은 404로 가린다.
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 도메인이 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    // 강제 해제는 이름을 즉시 회수한다 — 예약 없이 REMOVED 묘비만 남는다.
    found.vm.publications = found.vm.publications.filter(
      (p) => p.domain.id !== domainId,
    )
    retireDomain(found.pub.domain)
    return HttpResponse.json(
      { message: '도메인을 강제 해제했습니다. 이름이 즉시 회수되고 라우트 제거가 곧 적용됩니다.' },
      { status: 200 },
    )
  }),

  http.post('*/api/v1/admin/domains/:domainId/verify', ({ params }) => {
    const found = findLive(Number(params.domainId))
    if (!found) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 도메인이 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    if (found.pub.domain.kind !== 'CUSTOM') {
      return problemResponse({
        type: 'about:blank',
        title: '검증할 수 없는 도메인입니다',
        status: 409,
        detail: '플랫폼 서브도메인은 소유권 검증이 필요하지 않습니다.',
        code: 'DOMAIN_NOT_CUSTOM',
      })
    }
    return HttpResponse.json(
      { message: '소유권 재검증을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/admin/routes/:routeId/apply', ({ params }) => {
    // msw 라우트 id = 도메인 id (toAdminRoute 참조)
    const hit = findLive(Number(params.routeId))
    if (!hit) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 라우트가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    // 실서버 규칙: 라이브 라우트의 재적용은 검증 완료(ACTIVE) 도메인만
    const { pub } = hit
    if (pub.route?.status !== 'REMOVED' && pub.domain.status !== 'ACTIVE') {
      return problemResponse({
        type: 'about:blank',
        title: '현재 상태에서는 수행할 수 없는 작업입니다',
        status: 409,
        detail: `소유권 검증이 완료(ACTIVE)된 도메인의 라우트만 재적용할 수 있습니다. (현재 상태 ${pub.domain.status})`,
        code: 'DOMAIN_NOT_ACTIVE',
      })
    }
    return HttpResponse.json(
      { message: '라우트 재적용을 접수했습니다. 잠시 후 적용 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),
]
