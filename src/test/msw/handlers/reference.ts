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

export const smallFlavor: Schemas['VmFlavorResponse'] = {
  id: 1,
  name: 'small',
  displayName: '소형',
  vcpu: 1,
  memoryMb: 1024,
  diskGb: 10,
  status: 'ACTIVE',
  notes: '간단한 실습·정적 웹 서버에 적합합니다.',
}

export const basicFlavor: Schemas['VmFlavorResponse'] = {
  id: 2,
  name: 'basic',
  displayName: '기본형',
  vcpu: 2,
  memoryMb: 2048,
  diskGb: 20,
  status: 'ACTIVE',
  notes: '대부분의 수업·캡스톤 프로젝트에 적합합니다.',
}

export const largeFlavor: Schemas['VmFlavorResponse'] = {
  id: 3,
  name: 'large',
  displayName: '대형',
  vcpu: 4,
  memoryMb: 8192,
  diskGb: 40,
  status: 'ACTIVE',
  notes: 'DB·데이터 처리 실습용입니다.',
}

export const vmFlavors: Schemas['VmFlavorResponse'][] = [
  smallFlavor,
  basicFlavor,
  largeFlavor,
]

export const requestOptions = {
  allowedRootDomains: ['pickle.pnuops.com', 'lab.pnuops.com'],
  reservedSubdomains: ['www', 'api', 'admin', 'ssh', 'mail'],
  sshHost: 'ssh.pickle.pnuops.com',
}

/* ─── handlers ─── */

export const referenceHandlers: RequestHandler[] = [
  http.get('*/api/v1/orgs', () => HttpResponse.json(orgs, { status: 200 })),
  http.get('*/api/v1/templates', () => HttpResponse.json(templates, { status: 200 })),
  http.get('*/api/v1/vm-flavors', () => HttpResponse.json(vmFlavors, { status: 200 })),
  http.get('*/api/v1/meta/request-options', () =>
    HttpResponse.json(requestOptions, { status: 200 }),
  ),
  http.get('*/api/v1/meta/status', () => HttpResponse.json(systemStatus, { status: 200 })),
]
