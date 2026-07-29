import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'

type Schemas = components['schemas']

/* ─── fixtures ─── */

function initialOrgs(): Schemas['OrgSummaryResponse'][] {
  return [
    {
      id: 1,
      name: '정보컴퓨터공학부 실습지원센터',
      slug: 'cse-lab',
      description: '학부 수업·캡스톤용 서버 자원 제공',
      status: 'ACTIVE',
      hidden: false,
    },
    // the seed org is hidden in real data; msw serves it regardless of role
    { id: 2, name: '테스트 기관', slug: 'test-org', description: null, status: 'ACTIVE', hidden: true },
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

/** OS 카탈로그 — 공개 /templates는 ACTIVE 리비전만 노출한다. */
export const ubuntuTemplate: Schemas['VmTemplateResponse'] = {
  id: 1,
  name: 'ubuntu-24.04',
  displayName: 'Ubuntu 24.04 LTS',
  version: 2,
  minDiskGb: 10,
  status: 'ACTIVE',
  notes: '대부분의 수업·동아리 프로젝트에 적합합니다.',
}

export const templates: Schemas['VmTemplateResponse'][] = [ubuntuTemplate]

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
      id: 1,
      name: 'small',
      displayName: '소형',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      status: 'ACTIVE',
      notes: '간단한 실습·정적 웹 서버에 적합합니다.',
    },
    {
      id: 2,
      name: 'basic',
      displayName: '기본형',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      status: 'ACTIVE',
      notes: '대부분의 수업·캡스톤 프로젝트에 적합합니다.',
    },
    {
      id: 3,
      name: 'large',
      displayName: '대형',
      vcpu: 4,
      memoryMb: 8192,
      diskGb: 40,
      status: 'ACTIVE',
      notes: 'DB·데이터 처리 실습용입니다.',
    },
    {
      id: 9,
      name: 'legacy',
      displayName: '구형 프리셋',
      vcpu: 1,
      memoryMb: 512,
      diskGb: 10,
      status: 'DISABLED',
      notes: '메모리가 부족해 은퇴시킨 프리셋',
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

/* ─── handlers ─── */

export const referenceHandlers: RequestHandler[] = [
  http.get('*/api/v1/orgs', () => HttpResponse.json(orgs, { status: 200 })),
  http.get('*/api/v1/templates', () => HttpResponse.json(templates, { status: 200 })),
  // 공개 목록은 ACTIVE 프리셋만 노출한다 (은퇴 프리셋은 관리자 목록에만 남는다).
  http.get('*/api/v1/vm-flavors', () =>
    HttpResponse.json(
      flavorStore.filter((flavor) => flavor.status === 'ACTIVE'),
      { status: 200 },
    ),
  ),
  http.get('*/api/v1/meta/request-options', () =>
    HttpResponse.json(requestOptions, { status: 200 }),
  ),
  http.get('*/api/v1/meta/status', () => HttpResponse.json(systemStatus, { status: 200 })),
]
