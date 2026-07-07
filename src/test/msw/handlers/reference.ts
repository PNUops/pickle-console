import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'

type Schemas = components['schemas']

/* ─── fixtures ─── */

function initialOrgs(): Schemas['OrgSummary'][] {
  return [
    {
      id: 1,
      name: '정보컴퓨터공학부 실습지원센터',
      slug: 'cse-lab',
      description: '학부 수업·캡스톤용 서버 자원 제공',
    },
    { id: 2, name: 'SW교육센터', slug: 'sw-edu', description: null },
  ]
}

export let orgs: Schemas['OrgSummary'][] = initialOrgs()

export function resetReferenceFixtures() {
  orgs = initialOrgs()
}

export const basicTemplate: Schemas['VmTemplate'] = {
  id: 1,
  name: 'ubuntu-24.04',
  displayName: 'Ubuntu 24.04 LTS (기본형)',
  version: 1,
  defaultVcpu: 2,
  defaultMemoryMb: 2048,
  defaultDiskGb: 20,
  minDiskGb: 10,
  status: 'ACTIVE',
  notes: '대부분의 수업·동아리 프로젝트에 적합합니다.',
}

export const largeTemplate: Schemas['VmTemplate'] = {
  id: 2,
  name: 'ubuntu-24.04-db',
  displayName: 'Ubuntu 24.04 LTS (DB 실습형)',
  version: 1,
  defaultVcpu: 4,
  defaultMemoryMb: 4096,
  defaultDiskGb: 40,
  minDiskGb: 20,
  status: 'ACTIVE',
  notes: 'DB·데이터 처리 실습용 템플릿입니다.',
}

export const templates: Schemas['VmTemplate'][] = [basicTemplate, largeTemplate]

export const requestOptions = {
  allowedRootDomains: ['pickle.pnuops.com', 'lab.pnuops.com'],
  reservedSubdomains: ['www', 'api', 'admin', 'ssh', 'mail'],
}

/* ─── handlers ─── */

export const referenceHandlers: RequestHandler[] = [
  http.get('*/api/v1/orgs', () => HttpResponse.json(orgs, { status: 200 })),
  http.get('*/api/v1/templates', () => HttpResponse.json(templates, { status: 200 })),
  http.get('*/api/v1/meta/request-options', () =>
    HttpResponse.json(requestOptions, { status: 200 }),
  ),
]
