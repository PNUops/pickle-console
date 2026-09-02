import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { uuid } from '../ids'

type Schemas = components['schemas']

/* ─── fixtures ─── */

function initialOrgs(): Schemas['OrgSummaryResponse'][] {
  return [
    {
      id: uuid(1),
      name: '정보컴퓨터공학부 실습지원센터',
      description: '학부 수업·캡스톤용 서버 리소스 제공',
      status: 'ACTIVE',
      hidden: false,
    },
    // the seed org is hidden in real data; msw serves it regardless of role
    { id: uuid(2), name: '테스트 기관', description: null, status: 'ACTIVE', hidden: true },
  ]
}

export let orgs: Schemas['OrgSummaryResponse'][] = initialOrgs()

function initialSystemStatus(): Schemas['SystemStatusResponse'] {
  return { maintenance: false, maintenanceMessage: null, bannerMessage: null, contactEmail: null }
}

export let systemStatus: Schemas['SystemStatusResponse'] = initialSystemStatus()

/** 테스트에서 점검 모드·배너·문의처를 조정할 때 사용. */
export function setSystemStatus(next: Partial<Schemas['SystemStatusResponse']>) {
  systemStatus = { ...systemStatus, ...next }
}

export function resetReferenceFixtures() {
  orgs = initialOrgs()
  systemStatus = initialSystemStatus()
  resetFlavorStore()
}

/** OS 카탈로그 — 공개 /os-images는 ACTIVE 리비전만 노출한다. */
export const ubuntuOsImage: Schemas['OsImageResponse'] = {
  id: uuid(1),
  name: 'ubuntu-24.04',
  displayName: 'Ubuntu 24.04 LTS',
  osFamily: 'ubuntu',
  osVersion: '24.04',
  sshUsername: 'ubuntu',
  version: 2,
  minDiskGb: 10,
  status: 'ACTIVE',
  notes: '대부분의 수업·동아리 프로젝트에 적합합니다.',
}

/**
 * 서버가 주는 순서 그대로다: 계열 오름차순, 계열 안에서는 **최신 버전 먼저**.
 * 신청 화면이 계열을 먼저 묻고 버전을 그다음에 물으며 그 두 번째 물음의 기본값이
 * 최신이므로, 이 순서가 곧 화면의 기본 선택을 정한다.
 */
export const debian13OsImage: Schemas['OsImageResponse'] = {
  id: uuid(3),
  name: 'debian-13',
  displayName: 'Debian 13',
  osFamily: 'debian',
  osVersion: '13',
  sshUsername: 'debian',
  version: 1,
  minDiskGb: 10,
  status: 'ACTIVE',
  notes: null,
}

export const ubuntu2204OsImage: Schemas['OsImageResponse'] = {
  id: uuid(2),
  name: 'ubuntu-22.04',
  displayName: 'Ubuntu 22.04 LTS',
  osFamily: 'ubuntu',
  osVersion: '22.04',
  sshUsername: 'ubuntu',
  version: 1,
  minDiskGb: 10,
  status: 'ACTIVE',
  notes: null,
}

export const osImages: Schemas['OsImageResponse'][] = [
  debian13OsImage,
  ubuntuOsImage,
  ubuntu2204OsImage,
]

/* ─── 사양 프리셋 (OS와 직교하는 축) ─── */

/**
 * 프리셋 인벤토리 — 공개 목록(GET /vm-flavors)과 관리자 목록
 * (GET /admin/vm-flavors)이 함께 쓰는 단일 저장소다. 공개 목록은 여기서 ACTIVE만
 * 걸러 내보내므로, 관리자 화면에서 은퇴시키거나 새로 만든 프리셋이 신청 화면에도
 * 그대로 반영된다(서버와 같은 관계).
 */
function initialFlavors(): Schemas['VmFlavorResponse'][] {
  return [
    {
      id: uuid(31),
      name: 'highcpu',
      displayName: '컴퓨팅 최적화',
      vcpu: 2,
      memoryMb: 1024,
      diskGb: 32,
      status: 'ACTIVE',
      notes: '연산을 많이 쓰는 작업에 맞습니다.',
      displayOrder: 1,
    },
    {
      id: uuid(32),
      name: 'highmem',
      displayName: '메모리 최적화',
      vcpu: 1,
      memoryMb: 2048,
      diskGb: 32,
      status: 'ACTIVE',
      notes: '메모리를 많이 쓰는 작업에 맞습니다.',
      displayOrder: 2,
    },
    {
      id: uuid(39),
      name: 'legacy',
      displayName: '구형 사양',
      vcpu: 1,
      memoryMb: 512,
      diskGb: 10,
      status: 'DISABLED',
      notes: '메모리가 부족해 은퇴시킨 사양',
      displayOrder: 9,
    },
  ]
}


/** 전 상태의 프리셋 저장소. 배열 자체는 유지하고 내용만 갈아 끼운다(참조 공유). */
export const flavorStore: Schemas['VmFlavorResponse'][] = initialFlavors()

export function resetFlavorStore() {
  flavorStore.splice(0, flavorStore.length, ...initialFlavors())
}

export const requestOptions = {
  allowedRootDomains: ['pusan.dev', 'lab.example'],
  reservedSubdomains: ['www', 'api', 'admin', 'ssh', 'mail'],
  sshHost: 'ssh.pcl.kr',
}

/* ─── 사용 기간 ─── */

/**
 * 공개 목록은 오늘 기준으로 아직 끝나지 않은 것만 담는다. 여기 상대 날짜를 쓰는 것은
 * 절대 날짜로 적어 두면 그 날이 지나는 순간 테스트가 조용히 다른 것을 시험하기
 * 때문이다. 무기한 한 줄이 섞여 있다.
 */
function daysFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export const requestPeriods: Schemas['RequestPeriodResponse'][] = [
  { id: uuid(21), displayName: '이번 학기', endDate: daysFromNow(120) },
  { id: uuid(22), displayName: '이번 방학', endDate: daysFromNow(60) },
  { id: uuid(23), displayName: '무기한 (교내 서비스)', endDate: null },
]

/* ─── handlers ─── */

export const referenceHandlers: RequestHandler[] = [
  http.get('*/api/v1/orgs', () => HttpResponse.json(orgs, { status: 200 })),
  http.get('*/api/v1/os-images', () => HttpResponse.json(osImages, { status: 200 })),
  // 공개 목록은 ACTIVE 프리셋만 노출한다 (은퇴 프리셋은 관리자 목록에만 남는다).
  http.get('*/api/v1/vm-flavors', () =>
    HttpResponse.json(
      flavorStore.filter((flavor) => flavor.status === 'ACTIVE'),
      { status: 200 },
    ),
  ),
  http.get('*/api/v1/request-periods', () =>
    HttpResponse.json(requestPeriods, { status: 200 }),
  ),
  http.get('*/api/v1/meta/request-options', () =>
    HttpResponse.json(requestOptions, { status: 200 }),
  ),
  http.get('*/api/v1/meta/status', () => HttpResponse.json(systemStatus, { status: 200 })),
]
