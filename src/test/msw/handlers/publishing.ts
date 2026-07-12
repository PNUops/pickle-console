import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { orgs } from './reference'
import { problemResponse } from './auth'
import { recordVmEvent, vmStore } from './vms'

type Schemas = components['schemas']
type VmDetail = Schemas['VmDetail']
type PublicationView = Schemas['PublicationView']
type DomainDetail = Schemas['DomainDetail']

/** 커스텀 도메인 검증에서 A 레코드로 안내하는 리버스 프록시 IP (plan/06). */
const PROXY_IP = '164.125.249.87'
/** 인증서 만료일 계산에 쓰는 고정 기준 시각 (프로젝트 기준일 2026-07-12). */
const REFERENCE_NOW = new Date('2026-07-12T00:00:00+09:00').getTime()

let nextDomainId = 900

/**
 * 공개 해제 후 남는 커스텀 도메인 행 (계약 unpublishVm: 검증 상태 보존을 위해
 * 도메인 행은 남고 라우트만 제거). DELETE /domains/{id}로만 정리된다.
 */
let standaloneDomains: DomainDetail[] = []

export function resetPublishingFixtures() {
  nextDomainId = 900
  standaloneDomains = []
}

/* ─── org 이름 조회 (관리자 목록의 기관 맥락) ─── */
function orgName(orgId: number): string {
  return orgs.find((o) => o.id === orgId)?.name ?? `기관 #${orgId}`
}

/* ─── 공개(publication)를 가진 VM만 순회 ─── */
function publishedVms(): VmDetail[] {
  return vmStore.filter((vm) => vm.publication != null)
}

function findByDomainId(domainId: number): { vm: VmDetail; pub: PublicationView } | null {
  for (const vm of publishedVms()) {
    if (vm.publication!.domain.id === domainId) {
      return { vm, pub: vm.publication! }
    }
  }
  return null
}

/** 공개 중인 도메인과 해제 후 남은 도메인(tombstone)을 모두 뒤진다. */
function findDomain(domainId: number): DomainDetail | null {
  return (
    findByDomainId(domainId)?.pub.domain ??
    standaloneDomains.find((d) => d.id === domainId) ??
    null
  )
}

function toDomainSummary(d: DomainDetail): Schemas['DomainSummary'] {
  return {
    id: d.id,
    vmId: d.vmId,
    kind: d.kind,
    fqdn: d.fqdn,
    rootDomain: d.rootDomain,
    status: d.status,
    verifiedAt: d.verifiedAt,
    createdAt: d.createdAt,
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

const validationFailed = (instance: string, field: string, message: string) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: message,
    instance,
    code: 'VALIDATION_FAILED',
    errors: [{ field, message }],
  })

const fqdnTaken = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '이미 사용 중인 도메인입니다',
    status: 409,
    detail: '요청한 커스텀 도메인이 이미 다른 곳에 연결되어 있습니다. 다른 도메인을 사용해 주세요.',
    instance,
    code: 'DOMAIN_FQDN_TAKEN',
  })

/** 공개 가능한 VM 상태 (계약: RUNNING/STOPPED 외에는 409 VM_INVALID_STATE). */
const PUBLISHABLE_STATUSES = ['RUNNING', 'STOPPED']

/** 커스텀 도메인 형식 검증 (다중 라벨 + 플랫폼 관리 존 하위 금지). */
function customDomainError(customDomain: string): string | null {
  const labels = customDomain.split('.')
  if (labels.length < 2 || labels.some((l) => l.length === 0)) {
    return '커스텀 도메인은 완전한 외부 FQDN(예: app.example.com)이어야 합니다.'
  }
  if (customDomain.endsWith('.pickle.pnuops.com') || customDomain === 'pickle.pnuops.com') {
    return '플랫폼이 관리하는 도메인 하위 이름은 커스텀 도메인으로 사용할 수 없습니다.'
  }
  return null
}

/**
 * 커스텀 도메인 FQDN이 이미 사용 중인지 검사. 다른 VM의 공개뿐 아니라
 * 해제 후 남은 도메인 행(tombstone)도 점유로 취급한다 — 같은 도메인을 다시
 * 연결하려면 먼저 DELETE /domains/{id}로 삭제해야 한다.
 */
function isFqdnTaken(fqdn: string, exceptVmId: number): boolean {
  return (
    publishedVms().some(
      (vm) => vm.id !== exceptVmId && vm.publication!.domain.fqdn === fqdn,
    ) || standaloneDomains.some((d) => d.fqdn === fqdn)
  )
}

/** 커스텀 도메인 publication을 구성한다 (검증 대기 PENDING). */
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
 * 플랫폼 서브도메인 publication을 구성한다. 학생은 서브도메인 이름을 고르지 못하며
 * (계약·운영자 결정), mock은 승인 부여값을 추적하지 않으므로 자동(AUTO)
 * `<hostname>-a1b2.<root>`를 발급한다. 공용 와일드카드 인증서라 즉시 라우트 적용 대기.
 */
function buildPlatformPublication(vm: VmDetail, port: number): PublicationView {
  const fqdn = `${vm.hostname}-a1b2.pickle.pnuops.com`
  return {
    fqdn,
    domain: {
      id: nextDomainId++,
      vmId: vm.id,
      kind: 'AUTO',
      fqdn,
      rootDomain: 'pickle.pnuops.com',
      status: 'ACTIVE',
      verifiedAt: null,
      createdAt: '2026-07-12T09:00:00+09:00',
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

function toAdminRoute(vm: VmDetail): Schemas['AdminRouteView'] {
  const pub = vm.publication!
  return {
    id: pub.domain.id,
    fqdn: pub.fqdn,
    domainKind: pub.domain.kind,
    vmId: vm.id,
    vmName: vm.name,
    groupId: vm.groupId,
    groupName: vm.groupName,
    orgId: vm.orgId,
    orgName: orgName(vm.orgId),
    targetPort: pub.route.targetPort,
    protocol: 'HTTP',
    status: pub.route.status,
    appliedGeneration: pub.route.status === 'APPLIED' ? 7 : null,
    appliedAt: pub.route.appliedAt,
    lastError: pub.route.lastError,
    updatedAt: vm.updatedAt,
  }
}

function toAdminDomain(vm: VmDetail): Schemas['AdminDomainView'] {
  const pub = vm.publication!
  return {
    id: pub.domain.id,
    vmId: vm.id,
    kind: pub.domain.kind,
    fqdn: pub.fqdn,
    rootDomain: pub.domain.rootDomain,
    status: pub.domain.status,
    verifiedAt: pub.domain.verifiedAt,
    createdAt: pub.domain.createdAt,
    vmName: vm.name,
    groupId: vm.groupId,
    groupName: vm.groupName,
    orgId: vm.orgId,
    orgName: orgName(vm.orgId),
    routeStatus: pub.route.status,
    certificateStatus: pub.certificate?.status ?? null,
    updatedAt: vm.updatedAt,
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
    scope: '*.pickle.pnuops.com',
    domainId: null,
    notAfter: '2040-01-01T00:00:00+09:00',
    daysUntilExpiry: daysUntil('2040-01-01T00:00:00+09:00'),
    lastError: null,
  }
  const custom = publishedVms()
    .filter((vm) => !orgId || vm.orgId === orgId)
    .filter((vm) => vm.publication!.certificate?.kind === 'LETS_ENCRYPT')
    .map((vm) => {
      const pub = vm.publication!
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

function paginate<T>(items: T[], page: number, size: number): Schemas['DomainPage'] {
  return {
    content: items.slice(page * size, (page + 1) * size) as never,
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  }
}

export const publishingHandlers: RequestHandler[] = [
  /* ─── 공개 (학생) ─── */
  http.post('*/api/v1/vms/:vmId/publish', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFound()
    const instance = `/api/v1/vms/${vm.id}/publish`
    if (!vm.httpPublishGranted) {
      return problemResponse({
        type: 'about:blank',
        title: 'HTTP 공개가 허가되지 않은 VM입니다',
        status: 403,
        detail: '승인 시 HTTP 공개가 허용되지 않았습니다. 필요하면 관리자에게 문의해 주세요.',
        instance,
        code: 'VM_HTTP_NOT_GRANTED',
      })
    }
    if (vm.publication != null) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 공개된 VM입니다',
        status: 409,
        detail: '이 VM은 이미 HTTP 서비스가 공개되어 있습니다. 포트·도메인을 바꾸려면 공개 설정을 수정해 주세요.',
        instance,
        code: 'PUBLICATION_ALREADY_EXISTS',
      })
    }
    if (!PUBLISHABLE_STATUSES.includes(vm.status)) {
      return problemResponse({
        type: 'about:blank',
        title: '현재 상태에서는 공개할 수 없습니다',
        status: 409,
        detail: `실행 중 또는 중지됨 상태의 VM만 공개할 수 있습니다. (현재 상태 ${vm.status})`,
        instance,
        code: 'VM_INVALID_STATE',
      })
    }
    const body = (await request.json().catch(() => ({}))) as Schemas['PublishRequest']
    const port = body.port ?? 80
    if (port === 22) {
      return validationFailed(instance, 'port', 'VM의 SSH 포트(22)는 공개할 수 없습니다.')
    }
    if (port < 1 || port > 65535) {
      return validationFailed(instance, 'port', '포트는 1–65535 범위여야 합니다.')
    }
    if (body.customDomain != null) {
      const err = customDomainError(body.customDomain)
      if (err) return validationFailed(instance, 'customDomain', err)
      if (isFqdnTaken(body.customDomain, vm.id)) return fqdnTaken(instance)
      vm.publication = buildCustomPublication(vm, body.customDomain, port)
    } else {
      vm.publication = buildPlatformPublication(vm, port)
    }
    recordVmEvent(vm.id, {
      type: 'PUBLISH',
      actorId: 42,
      detail: vm.publication.fqdn,
      createdAt: '2026-07-12T09:00:00+09:00',
    })
    return HttpResponse.json(vm.publication, { status: 202 })
  }),

  http.patch('*/api/v1/vms/:vmId/publication', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm || vm.publication == null) return notFound()
    const instance = `/api/v1/vms/${vm.id}/publication`
    const body = (await request.json().catch(() => ({}))) as Schemas['UpdatePublicationRequest']
    const pub = vm.publication
    if (body.port !== undefined) {
      if (body.port === 22) {
        return validationFailed(instance, 'port', 'VM의 SSH 포트(22)는 공개할 수 없습니다.')
      }
      if (body.port < 1 || body.port > 65535) {
        return validationFailed(instance, 'port', '포트는 1–65535 범위여야 합니다.')
      }
      pub.route.targetPort = body.port
      pub.route.status = 'PENDING'
      pub.route.appliedAt = null
      pub.route.lastError = null
    }
    if (body.customDomain !== undefined) {
      if (body.customDomain === null) {
        // 커스텀 해제 → 플랫폼 서브도메인 공개로 복귀. 커스텀 도메인 행은
        // 검증 상태 보존을 위해 남는다 (unpublish와 동일).
        if (pub.domain.kind === 'CUSTOM') {
          standaloneDomains.push({ ...pub.domain })
        }
        vm.publication = buildPlatformPublication(vm, pub.route.targetPort)
      } else {
        const err = customDomainError(body.customDomain)
        if (err) return validationFailed(instance, 'customDomain', err)
        if (isFqdnTaken(body.customDomain, vm.id)) return fqdnTaken(instance)
        if (pub.domain.kind === 'CUSTOM' && pub.domain.fqdn !== body.customDomain) {
          standaloneDomains.push({ ...pub.domain })
        }
        vm.publication = buildCustomPublication(vm, body.customDomain, pub.route.targetPort)
      }
    }
    vm.updatedAt = '2026-07-12T09:10:00+09:00'
    return HttpResponse.json(vm.publication, { status: 202 })
  }),

  http.delete('*/api/v1/vms/:vmId/publication', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm || vm.publication == null) return notFound()
    recordVmEvent(vm.id, {
      type: 'UNPUBLISH',
      actorId: 42,
      detail: vm.publication.fqdn,
      createdAt: '2026-07-12T09:20:00+09:00',
    })
    // 계약: AUTO/REQUESTED 도메인 행은 함께 정리, 커스텀은 검증 상태 보존을 위해 남는다.
    if (vm.publication.domain.kind === 'CUSTOM') {
      standaloneDomains.push({ ...vm.publication.domain })
    }
    vm.publication = null
    vm.updatedAt = '2026-07-12T09:20:00+09:00'
    return HttpResponse.json(
      { message: 'HTTP 서비스 공개 해제를 접수했습니다. 잠시 후 외부 접근이 차단됩니다.' },
      { status: 202 },
    )
  }),

  /* ─── 도메인 (학생) ─── */
  http.get('*/api/v1/domains', ({ request }) => {
    const url = new URL(request.url)
    const vmId = url.searchParams.get('vmId')
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const published = publishedVms().map(
      (vm): Schemas['DomainSummary'] => toDomainSummary(vm.publication!.domain),
    )
    const items = [...published, ...standaloneDomains.map(toDomainSummary)]
      .filter((d) => !vmId || d.vmId === Number(vmId))
      .filter((d) => !status || d.status === status)
      .sort((a, b) => b.id - a.id)
    return HttpResponse.json(paginate(items, page, size), { status: 200 })
  }),

  http.get('*/api/v1/domains/:domainId', ({ params }) => {
    const domain = findDomain(Number(params.domainId))
    if (!domain) return notFound()
    return HttpResponse.json(domain satisfies DomainDetail, { status: 200 })
  }),

  http.delete('*/api/v1/domains/:domainId', ({ params }) => {
    const domainId = Number(params.domainId)
    // 해제 후 남은 도메인 행(tombstone) 삭제 — 행만 제거한다.
    const standaloneIdx = standaloneDomains.findIndex((d) => d.id === domainId)
    if (standaloneIdx >= 0) {
      standaloneDomains.splice(standaloneIdx, 1)
      return HttpResponse.json({ message: '도메인 삭제를 접수했습니다.' }, { status: 202 })
    }
    // 공개 중인 도메인 삭제 — 계약: 연결된 라우트도 함께 제거(공개 해제).
    const found = findByDomainId(domainId)
    if (!found) return notFound()
    found.vm.publication = null
    found.vm.updatedAt = '2026-07-12T09:30:00+09:00'
    return HttpResponse.json({ message: '도메인 삭제를 접수했습니다.' }, { status: 202 })
  }),

  http.post('*/api/v1/domains/:domainId/verify', ({ params }) => {
    const found = findByDomainId(Number(params.domainId))
    const domain = found?.pub.domain ?? standaloneDomains.find((d) => d.id === Number(params.domainId))
    if (!domain) return notFound()
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
    if (found && found.pub.certificate?.status === 'FAILED') {
      found.pub.certificate = { ...found.pub.certificate, status: 'RENEWING', lastError: null }
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
    const items = publishedVms()
      .filter((vm) => !orgId || vm.orgId === Number(orgId))
      .map(toAdminRoute)
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
    const items = publishedVms()
      .filter((vm) => !orgId || vm.orgId === Number(orgId))
      .map(toAdminDomain)
      .filter((d) => !kind || d.kind === kind)
      .filter((d) => !status || d.status === status)
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
]
