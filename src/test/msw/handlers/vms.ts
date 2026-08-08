import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type VmDetail = Schemas['VmDetailResponse']
type VmEvent = Schemas['VmEventResponse']

/** 오늘(로컬) 기준 offset일 뒤의 날짜 문자열 (YYYY-MM-DD) — 만료 픽스처용. */
export function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function initialVms(): VmDetail[] {
  return [
    {
      id: 55,
      name: 'capstone-team3-api',
      hostname: 'capstone-team3-api',
      status: 'CREATING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 102,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: null,
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-07-15',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: {
        kind: 'PROVISION',
        status: 'RUNNING',
        currentStep: 3,
        totalSteps: 10,
        stepLabel: 'OS 이미지 복제 중',
        attempts: 1,
        lastError: null,
        updatedAt: '2026-07-08T14:03:40+09:00',
      },
      deletion: null,
      createdAt: '2026-07-08T14:03:05+09:00',
      updatedAt: '2026-07-08T14:03:05+09:00',
    },
    {
      // 서브도메인 선지정 + 미공개 RUNNING — "처음 공개" 흐름 대상.
      id: 56,
      name: 'algo-judge',
      hostname: 'algo-judge',
      status: 'RUNNING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 15,
      groupName: '알고리즘 스터디',
      requestId: 90,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.56',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-06-20',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: true,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-06-20T10:00:00+09:00',
      updatedAt: '2026-06-20T10:05:00+09:00',
    },
    {
      // 서브도메인 선지정 없음 — 공개 폼에서 이름을 직접 입력해야 하는 흐름
      // (그룹 12 OWNER라 공개 폼을 실제로 조작할 수 있다).
      id: 57,
      name: 'web-lab',
      hostname: 'web-lab',
      status: 'STOPPED',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 91,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.57',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-06-20',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-06-21T10:00:00+09:00',
      updatedAt: '2026-07-01T09:00:00+09:00',
    },
    {
      id: 58,
      name: 'stuck-vm',
      hostname: 'stuck-vm',
      status: 'NEEDS_ADMIN',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 103,
      statusDetail: '프로비저닝 재시도가 소진되어 관리자 확인이 필요합니다.',
      orgId: 1,
      imageId: 1,
      ipAddress: null,
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: null,
      endDate: null,
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: {
        kind: 'PROVISION',
        status: 'NEEDS_ADMIN',
        currentStep: 5,
        totalSteps: 10,
        stepLabel: 'cloud-init 설정 중',
        attempts: 3,
        lastError: 'Proxmox API 응답 시간 초과 (qm set 5058)',
        updatedAt: '2026-07-08T13:00:00+09:00',
      },
      deletion: null,
      createdAt: '2026-07-08T12:00:00+09:00',
      updatedAt: '2026-07-08T13:00:00+09:00',
    },
    {
      id: 59,
      name: 'broken-vm',
      hostname: 'broken-vm',
      status: 'ERROR',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 104,
      statusDetail: '생성이 실패해 부분 자원이 정리되었습니다.',
      orgId: 1,
      imageId: 1,
      ipAddress: null,
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: null,
      endDate: null,
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-07T12:00:00+09:00',
      updatedAt: '2026-07-07T13:00:00+09:00',
    },
    {
      id: 60,
      name: 'retiring-vm',
      hostname: 'retiring-vm',
      status: 'DELETING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 15,
      groupName: '알고리즘 스터디',
      requestId: 92,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.60',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-05-01',
      endDate: '2026-07-01',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: {
        kind: 'SELF',
        scheduledFor: '2026-07-15T14:10:00+09:00',
        requestedAt: '2026-07-08T14:10:00+09:00',
        requestedById: 42,
        reason: null,
        cancelable: true,
      },
      createdAt: '2026-05-01T10:00:00+09:00',
      updatedAt: '2026-07-08T14:10:00+09:00',
    },
    {
      // 이미 공개됨 — 플랫폼 희망 서브도메인(PLATFORM), 라우트 APPLIED, 와일드카드 인증서.
      // 포트 변경·공개 해제 흐름 대상 (org 2).
      id: 61,
      name: 'ai-train',
      hostname: 'ai-train',
      status: 'RUNNING',
      vcpu: 4,
      memoryMb: 4096,
      diskGb: 40,
      groupId: 21,
      groupName: 'AI 동아리',
      requestId: 105,
      statusDetail: null,
      orgId: 2,
      imageId: 2,
      ipAddress: '10.10.0.61',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'ai-team.pusan.dev',
        domain: {
          id: 21,
          vmId: 61,
          kind: 'PLATFORM',
          fqdn: 'ai-team.pusan.dev',
          rootDomain: 'pusan.dev',
          status: 'ACTIVE',
          verifiedAt: null,
          createdAt: '2026-07-05T09:00:00+09:00',
          verification: null,
        },
        route: {
          targetPort: 3000,
          protocol: 'HTTP',
          status: 'APPLIED',
          appliedAt: '2026-07-05T09:01:00+09:00',
          lastError: null,
        },
        certificate: {
          kind: 'ORIGIN_CA_WILDCARD',
          status: 'ACTIVE',
          notAfter: '2040-01-01T00:00:00+09:00',
          lastError: null,
        },
      }],
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-01T10:00:00+09:00',
      updatedAt: '2026-07-05T09:01:00+09:00',
    },
    {
      // 커스텀 도메인 검증 중(VERIFYING) — A는 확인, TXT 미확인. 검증 안내·재검증 대상.
      id: 62,
      name: 'demo-web',
      hostname: 'demo-web',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 106,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.62',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-07-10',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'demo.example.com',
        domain: {
          id: 34,
          vmId: 62,
          kind: 'CUSTOM',
          fqdn: 'demo.example.com',
          rootDomain: null,
          status: 'VERIFYING',
          verifiedAt: null,
          createdAt: '2026-07-10T09:00:00+09:00',
          verification: {
            token: 'pv-3f6c1b2ae94d',
            requiredRecords: [
              { type: 'A', name: 'demo.example.com', value: '164.125.249.87' },
              {
                type: 'TXT',
                name: '_pickle-verify.demo.example.com',
                value: 'pv-3f6c1b2ae94d',
              },
            ],
            aVerified: true,
            txtVerified: false,
            lastCheckedAt: '2026-07-10T09:05:00+09:00',
            lastError: 'TXT 레코드를 아직 찾을 수 없습니다.',
          },
        },
        route: {
          targetPort: 80,
          protocol: 'HTTP',
          status: 'PENDING',
          appliedAt: null,
          lastError: null,
        },
        certificate: null,
      }],
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-10T09:00:00+09:00',
      updatedAt: '2026-07-10T09:05:00+09:00',
    },
    {
      // 도메인 2개 서빙 — 플랫폼 서브도메인(정상) + 커스텀(검증 완료지만 라우트
      // 적용 실패, nginx 오류 노출). 커스텀 인증서(LE)는 발급 완료, 만료 임박.
      id: 63,
      name: 'shop-app',
      hostname: 'shop-app',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 107,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.63',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-07-01',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'shop-app.pusan.dev',
        domain: {
          id: 30,
          vmId: 63,
          kind: 'PLATFORM',
          fqdn: 'shop-app.pusan.dev',
          rootDomain: 'pusan.dev',
          status: 'ACTIVE',
          verifiedAt: null,
          createdAt: '2026-07-01T11:00:00+09:00',
          verification: null,
        },
        route: {
          targetPort: 8080,
          protocol: 'HTTP',
          status: 'APPLIED',
          appliedAt: '2026-07-01T11:01:00+09:00',
          lastError: null,
        },
        certificate: {
          kind: 'ORIGIN_CA_WILDCARD',
          status: 'ACTIVE',
          notAfter: '2040-01-01T00:00:00+09:00',
          lastError: null,
        },
      }, {
        fqdn: 'shop.example.com',
        domain: {
          id: 35,
          vmId: 63,
          kind: 'CUSTOM',
          fqdn: 'shop.example.com',
          rootDomain: null,
          status: 'ACTIVE',
          verifiedAt: '2026-07-02T09:00:00+09:00',
          createdAt: '2026-07-01T12:00:00+09:00',
          verification: {
            token: 'pv-77aa22bb44cc',
            requiredRecords: [
              { type: 'A', name: 'shop.example.com', value: '164.125.249.87' },
              {
                type: 'TXT',
                name: '_pickle-verify.shop.example.com',
                value: 'pv-77aa22bb44cc',
              },
            ],
            aVerified: true,
            txtVerified: true,
            lastCheckedAt: '2026-07-02T09:00:00+09:00',
            lastError: null,
          },
        },
        route: {
          targetPort: 8080,
          protocol: 'HTTP',
          status: 'FAILED',
          appliedAt: null,
          lastError: 'nginx -t 실패: upstream 10.10.0.63:8080 연결을 확인할 수 없습니다.',
        },
        certificate: {
          kind: 'LETS_ENCRYPT',
          status: 'ACTIVE',
          notAfter: '2026-07-24T00:00:00+09:00',
          lastError: null,
        },
      }],
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-01T12:00:00+09:00',
      updatedAt: '2026-07-02T09:10:00+09:00',
    },
    {
      // 커스텀 도메인 ACTIVE + 라우트 APPLIED, 그러나 인증서(LE) 발급 실패(FAILED).
      // 재검증으로 인증서 재발급을 트리거하는 대상 (org 2).
      id: 64,
      name: 'api-svc',
      hostname: 'api-svc',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 21,
      groupName: 'AI 동아리',
      requestId: 108,
      statusDetail: null,
      orgId: 2,
      imageId: 2,
      ipAddress: '10.10.0.64',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'api.example.org',
        domain: {
          id: 36,
          vmId: 64,
          kind: 'CUSTOM',
          fqdn: 'api.example.org',
          rootDomain: null,
          status: 'ACTIVE',
          verifiedAt: '2026-07-03T09:00:00+09:00',
          createdAt: '2026-07-02T12:00:00+09:00',
          verification: {
            token: 'pv-91ff00aa11bb',
            requiredRecords: [
              { type: 'A', name: 'api.example.org', value: '164.125.249.87' },
              {
                type: 'TXT',
                name: '_pickle-verify.api.example.org',
                value: 'pv-91ff00aa11bb',
              },
            ],
            aVerified: true,
            txtVerified: true,
            lastCheckedAt: '2026-07-03T09:00:00+09:00',
            lastError: null,
          },
        },
        route: {
          targetPort: 8000,
          protocol: 'HTTP',
          status: 'APPLIED',
          appliedAt: '2026-07-03T09:05:00+09:00',
          lastError: null,
        },
        certificate: {
          kind: 'LETS_ENCRYPT',
          status: 'FAILED',
          notAfter: null,
          lastError: "Let's Encrypt 발급 실패: rateLimited (재시도 대기)",
        },
      }],
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-02T12:00:00+09:00',
      updatedAt: '2026-07-03T09:05:00+09:00',
    },
    /* ─── 만료 큐 픽스처 — 날짜는 테스트 실행일 기준으로 동적 생성 ─── */
    {
      // 7일 이내 만료 임박 (D-3)
      id: 45,
      name: 'expiring-api',
      hostname: 'expiring-api',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 109,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.45',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: localDateStr(-90),
      endDate: localDateStr(3),
      expiryStoppedAt: null,
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-04-14T10:00:00+09:00',
      updatedAt: '2026-04-14T10:00:00+09:00',
    },
    {
      // 이미 만료되어 스위퍼가 자동 중지 (D+2)
      id: 46,
      name: 'expired-lab',
      hostname: 'expired-lab',
      status: 'STOPPED',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 15,
      groupName: '알고리즘 스터디',
      requestId: 110,
      statusDetail: null,
      orgId: 1,
      imageId: 1,
      ipAddress: '10.10.0.46',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: localDateStr(-120),
      endDate: localDateStr(-2),
      expiryStoppedAt: new Date().toISOString(),
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-03-15T10:00:00+09:00',
      updatedAt: '2026-03-15T10:00:00+09:00',
    },
    {
      // 30일 이내 만료 예정 (D-20) — 7일 탭에는 나오지 않는다 (org 2)
      id: 47,
      name: 'semester-web',
      hostname: 'semester-web',
      status: 'RUNNING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 21,
      groupName: 'AI 동아리',
      requestId: 111,
      statusDetail: null,
      orgId: 2,
      imageId: 1,
      ipAddress: '10.10.0.47',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      myGroupRole: 'OWNER',
      passwordRevealAllowed: true,
      startDate: localDateStr(-60),
      endDate: localDateStr(20),
      expiryStoppedAt: null,
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-05-14T10:00:00+09:00',
      updatedAt: '2026-05-14T10:00:00+09:00',
    },
  ]
}

function initialVmEvents(): Record<number, VmEvent[]> {
  return {
    56: [
      {
        id: 902,
        type: 'START',
        actorId: 42,
        detail: null,
        createdAt: '2026-07-01T09:12:00+09:00',
      },
      {
        id: 901,
        type: 'CREATE',
        actorId: null,
        detail: '승인 신청 90에 따라 자동 생성',
        createdAt: '2026-06-20T10:00:00+09:00',
      },
    ],
  }
}

export let vmStore: VmDetail[] = initialVms()
export let vmEventStore: Record<number, VmEvent[]> = initialVmEvents()
let nextEventId = 950

/* ─── VM별 설정 레지스트리 — 계약 v0.8.0 카탈로그 ─── */
type VmSettingView = Schemas['VmSettingView']
type GroupMemberRole = Schemas['GroupMemberRole']

interface VmSettingCatalogEntry {
  valueType: VmSettingView['valueType']
  allowedValues: string[] | null
  defaultValue: unknown
  label: string
  description: string
  requiredRole: GroupMemberRole
}

export const VM_SETTING_CATALOG: Record<string, VmSettingCatalogEntry> = {
  ssh_password_enabled: {
    valueType: 'BOOLEAN',
    allowedValues: null,
    defaultValue: false,
    label: '비밀번호 SSH 허용',
    description:
      'SSH 게이트웨이에서 비밀번호 접속을 허용합니다. 켜면 접속자 개인을 식별할 수 없습니다.',
    requiredRole: 'EDITOR',
  },
  password_reveal_min_role: {
    valueType: 'ENUM',
    allowedValues: ['MEMBER', 'EDITOR', 'OWNER'],
    defaultValue: 'MEMBER',
    label: '비밀번호 열람 최소 역할',
    description: 'VM 비밀번호(= sudo 자격)를 열람할 수 있는 최소 그룹 역할입니다.',
    requiredRole: 'OWNER',
  },
}

const ROLE_RANK: Record<GroupMemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  EDITOR: 2,
  OWNER: 3,
}

/** VM별 설정 저장 오버라이드 ({vmId: {key: value}}) — 미저장 키는 기본값. */
export let vmSettingStore: Record<number, Record<string, unknown>> = {}

/** 레지스트리 + 저장 오버라이드를 병합해 VmSettingView[]를 만든다 (요청자 기준 editable 계산). */
export function vmSettingsOf(vm: VmDetail): VmSettingView[] {
  const overrides = vmSettingStore[vm.id] ?? {}
  const stateEditable = vm.status !== 'DELETING' && vm.status !== 'DELETED'
  return Object.entries(VM_SETTING_CATALOG).map(([key, meta]) => {
    const stored = key in overrides
    return {
      key,
      value: stored ? overrides[key] : meta.defaultValue,
      valueType: meta.valueType,
      allowedValues: meta.allowedValues,
      defaultValue: meta.defaultValue,
      label: meta.label,
      description: meta.description,
      requiredRole: meta.requiredRole,
      editable:
        stateEditable && vm.myGroupRole != null
        && ROLE_RANK[vm.myGroupRole] >= ROLE_RANK[meta.requiredRole],
      updatedByName: stored ? '홍길동' : null,
      updatedAt: stored ? '2026-07-18T14:00:00+09:00' : null,
    }
  })
}

/**
 * Mock provisioning: after this many GET /vms/{id} calls for a CREATING VM,
 * subsequent responses report it RUNNING (drives the polling test).
 */
export const VM_RUNNING_AFTER_FETCHES = 2
let detailFetchCounts: Record<number, number> = {}

/** 라우트가 PENDING→APPLIED로 전이하기까지의 GET 횟수 — 도메인별 계수 (폴링 테스트). */
export const ROUTE_APPLIED_AFTER_FETCHES = 2
let routeFetchCounts: Record<number, number> = {}

export function resetVmFixtures() {
  vmStore = initialVms()
  vmEventStore = initialVmEvents()
  vmSettingStore = {}
  nextEventId = 950
  detailFetchCounts = {}
  routeFetchCounts = {}
}

/** Prepend a lifecycle event for assertions on event history refreshes. */
export function recordVmEvent(vmId: number, event: Omit<VmEvent, 'id'>) {
  const list = (vmEventStore[vmId] ??= [])
  list.unshift({ id: nextEventId++, ...event })
}

export const invalidVmStateProblem = (instance: string, detail: string) =>
  problemResponse({
    type: 'about:blank',
    title: '현재 상태에서는 수행할 수 없는 작업입니다',
    status: 409,
    detail,
    instance,
    code: 'VM_INVALID_STATE',
  })

export function toVmSummary(vm: VmDetail): Schemas['VmSummaryResponse'] {
  const {
    id, name, hostname, status, vcpu, memoryMb, diskGb, groupId, groupName,
    requestId, statusDetail, sshGatewayBlocked, endDate, expiryStoppedAt, createdAt,
  } = vm
  return {
    id, name, hostname, status, vcpu, memoryMb, diskGb, groupId, groupName,
    requestId, statusDetail, sshGatewayBlocked, endDate, expiryStoppedAt, createdAt,
  }
}

export const vmHandlers: RequestHandler[] = [
  http.get('*/api/v1/vms', ({ request }) => {
    const url = new URL(request.url)
    const groupId = url.searchParams.get('groupId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = vmStore
      .filter((vm) => !groupId || vm.groupId === Number(groupId))
      .sort((a, b) => b.id - a.id)
    const body: Schemas['PageResponseVmSummaryResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size).map(toVmSummary),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/vms/:vmId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '요청한 리소스가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    if (vm.status === 'CREATING') {
      const count = (detailFetchCounts[vm.id] = (detailFetchCounts[vm.id] ?? 0) + 1)
      if (count >= VM_RUNNING_AFTER_FETCHES) {
        vm.status = 'RUNNING'
        vm.ipAddress = '10.10.0.55'
        vm.passwordAvailable = true
        vm.provisioning = null
        vm.updatedAt = '2026-07-08T14:10:00+09:00'
      }
    }
    // 라우트 적용이 진행 중인 공개는 비동기 적용을 흉내내 PENDING→APPLIED로 수렴.
    // 검증 전(비ACTIVE) 커스텀 도메인은 소유권 검증이 끝나야 라우트가 적용되므로
    // 여기서 전이시키지 않는다. 도메인별로 따로 계수한다 (다중 도메인).
    for (const pub of vm.publications) {
      const route = pub.route
      if (
        route?.status === 'PENDING' &&
        (pub.domain.kind !== 'CUSTOM' || pub.domain.status === 'ACTIVE')
      ) {
        const count = (routeFetchCounts[pub.domain.id] =
          (routeFetchCounts[pub.domain.id] ?? 0) + 1)
        if (count >= ROUTE_APPLIED_AFTER_FETCHES) {
          route.status = 'APPLIED'
          route.appliedAt = '2026-07-12T09:05:00+09:00'
        }
      }
    }
    return HttpResponse.json(vm, { status: 200 })
  }),

  http.delete('*/api/v1/vms/:vmId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (
      vm.deletion != null ||
      ['CREATING', 'NEEDS_ADMIN', 'DELETING', 'DELETED'].includes(vm.status)
    ) {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}`,
        '이미 삭제가 예약되었거나 진행 중이거나, 삭제할 수 없는 상태의 VM입니다.',
      )
    }
    // ERROR 상태는 파기할 실체가 없으므로 유예 없이 즉시 DELETED로 전이 (계약 예외).
    const immediate = vm.status === 'ERROR'
    const deletion: NonNullable<VmDetail['deletion']> = {
      kind: 'SELF',
      scheduledFor: immediate ? '2026-07-08T15:00:00+09:00' : '2026-07-15T15:00:00+09:00',
      requestedAt: '2026-07-08T15:00:00+09:00',
      requestedById: 42,
      reason: null,
      cancelable: !immediate,
    }
    vm.status = immediate ? 'DELETED' : 'DELETING'
    vm.deletion = deletion
    // 실서버: 접수 시 SELF_DELETE 이벤트, ERROR 즉시 삭제는 종결 DELETE 이벤트를 추가로 기록.
    recordVmEvent(vm.id, {
      type: 'SELF_DELETE',
      actorId: 42,
      detail: immediate ? '생성 실패 VM 즉시 삭제' : null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    if (immediate) {
      recordVmEvent(vm.id, {
        type: 'DELETE',
        actorId: 42,
        detail: null,
        createdAt: '2026-07-08T15:00:00+09:00',
      })
    }
    return HttpResponse.json(deletion, { status: 202 })
  }),

  /* ─── power ops: 계약의 409 상태 조건을 그대로 강제한다 ─── */

  http.post('*/api/v1/vms/:vmId/start', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'STOPPED') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/start`,
        `STOPPED 상태의 VM만 시작할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    // 계약: 만료로 자동 정지되었거나 endDate가 지난 VM은 기간 연장 전까지 시작 거부.
    if (
      vm.expiryStoppedAt != null ||
      (vm.endDate != null && vm.endDate < localDateStr(0))
    ) {
      return problemResponse({
        type: 'about:blank',
        title: '사용 기간이 만료된 VM입니다',
        status: 409,
        detail:
          '사용 기간이 만료되어 시작할 수 없습니다. 연장이 필요하면 관리자에게 문의해 주세요.',
        instance: `/api/v1/vms/${vm.id}/start`,
        code: 'VM_EXPIRED',
      })
    }
    vm.status = 'RUNNING'
    recordVmEvent(vm.id, {
      type: 'START',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 시작 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/shutdown', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'RUNNING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/shutdown`,
        `RUNNING 상태의 VM만 종료할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'STOPPED'
    recordVmEvent(vm.id, {
      type: 'STOP',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/reboot', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'RUNNING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/reboot`,
        `RUNNING 상태의 VM만 재부팅할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'REBOOTING'
    recordVmEvent(vm.id, {
      type: 'REBOOT',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 재부팅 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/force-stop', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'RUNNING' && vm.status !== 'REBOOTING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/force-stop`,
        `RUNNING 또는 REBOOTING 상태의 VM만 강제 종료할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'STOPPED'
    recordVmEvent(vm.id, {
      type: 'FORCE_STOP',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 강제 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  // 계약 v0.8.0: 상시 재열람 (GET, 부수효과 없음). rename: initial-password → password.
  http.get('*/api/v1/vms/:vmId/password', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (!['RUNNING', 'STOPPED', 'REBOOTING'].includes(vm.status)) {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/password`,
        'VM 생성이 완료된 뒤에 비밀번호를 열람할 수 있습니다.',
      )
    }
    // password_reveal_min_role 게이트: 서버가 계산한 passwordRevealAllowed를 그대로 강제.
    if (!vm.passwordRevealAllowed) {
      return problemResponse({
        type: 'about:blank',
        title: '비밀번호를 열람할 권한이 없습니다',
        status: 403,
        detail: '이 VM은 그룹의 MEMBER 이상만 비밀번호를 열람할 수 있습니다.',
        instance: `/api/v1/vms/${vm.id}/password`,
        code: 'GROUP_ROLE_INSUFFICIENT',
      })
    }
    if (!vm.passwordAvailable) {
      return problemResponse({
        type: 'about:blank',
        title: '비밀번호를 열람할 수 없습니다',
        status: 410,
        detail: '저장된 비밀번호가 없습니다. 비밀번호 재생성으로 새 비밀번호를 만들 수 있습니다.',
        instance: `/api/v1/vms/${vm.id}/password`,
        code: 'VM_PASSWORD_ALREADY_VIEWED',
      })
    }
    const body: Schemas['VmPasswordResponse'] = {
      password: 'x7GmQ4vRk2LpWn9sCtYb8Zed',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      sshPort: 22,
    }
    return HttpResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }),

  // 비밀번호 재생성 (EDITOR 이상, RUNNING) — 새 비밀번호를 즉시 적용하고 반환.
  http.post('*/api/v1/vms/:vmId/password/regenerate', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.myGroupRole !== 'EDITOR' && vm.myGroupRole !== 'OWNER') {
      return problemResponse({
        type: 'about:blank',
        title: '비밀번호를 재생성할 권한이 없습니다',
        status: 403,
        detail: '그룹의 EDITOR 이상만 비밀번호를 재생성할 수 있습니다.',
        instance: `/api/v1/vms/${vm.id}/password/regenerate`,
        code: 'GROUP_ROLE_INSUFFICIENT',
      })
    }
    if (vm.status !== 'RUNNING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/password/regenerate`,
        'VM이 실행 중이고 게스트 에이전트가 응답할 때만 비밀번호를 재생성할 수 있습니다.',
      )
    }
    vm.passwordAvailable = true
    const body: Schemas['VmPasswordResponse'] = {
      password: 'nB4tWq8xKm2ZrPv6JcYh3Sdf',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      sshPort: 22,
    }
    return HttpResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }),

  // VM별 설정 조회 (EDITOR 이상) — 레지스트리 기반 카탈로그.
  http.get('*/api/v1/vms/:vmId/settings', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.myGroupRole !== 'EDITOR' && vm.myGroupRole !== 'OWNER') {
      return problemResponse({
        type: 'about:blank',
        title: 'VM 설정에 접근할 권한이 없습니다',
        status: 403,
        detail: '그룹의 EDITOR 이상만 VM 설정을 볼 수 있습니다.',
        instance: `/api/v1/vms/${vm.id}/settings`,
        code: 'GROUP_ROLE_INSUFFICIENT',
      })
    }
    return HttpResponse.json(vmSettingsOf(vm), { status: 200 })
  }),

  // VM별 설정 변경 (부분 맵, 원자적) — 갱신된 전체 목록 반환.
  http.patch('*/api/v1/vms/:vmId/settings', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.myGroupRole !== 'EDITOR' && vm.myGroupRole !== 'OWNER') {
      return problemResponse({
        type: 'about:blank',
        title: '설정에 접근할 권한이 없습니다',
        status: 403,
        detail: '그룹의 EDITOR 이상만 VM 설정을 변경할 수 있습니다.',
        instance: `/api/v1/vms/${vm.id}/settings`,
        code: 'GROUP_ROLE_INSUFFICIENT',
      })
    }
    const body = (await request.json()) as Schemas['VmSettingsUpdateRequest']
    const entries = Object.entries(body.settings ?? {})
    if (entries.length === 0) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '변경할 설정을 하나 이상 지정해 주세요.',
        instance: `/api/v1/vms/${vm.id}/settings`,
        code: 'VALIDATION_FAILED',
      })
    }
    for (const [key, value] of entries) {
      if (!(key in VM_SETTING_CATALOG)) {
        return problemResponse({
          type: 'about:blank',
          title: '입력값이 올바르지 않습니다',
          status: 422,
          detail: '알 수 없는 설정 키입니다.',
          instance: `/api/v1/vms/${vm.id}/settings`,
          code: 'VALIDATION_FAILED',
          errors: [{ field: `settings.${key}`, message: '알 수 없는 설정 키입니다.' }],
        })
      }
      // password_reveal_min_role은 OWNER 전용 — EDITOR가 바꾸려 하면 403.
      if (key === 'password_reveal_min_role' && vm.myGroupRole !== 'OWNER') {
        return problemResponse({
          type: 'about:blank',
          title: '설정을 변경할 권한이 없습니다',
          status: 403,
          detail: '`password_reveal_min_role` 설정은 그룹의 OWNER만 변경할 수 있습니다.',
          instance: `/api/v1/vms/${vm.id}/settings`,
          code: 'GROUP_ROLE_INSUFFICIENT',
        })
      }
      vmSettingStore[vm.id] = { ...(vmSettingStore[vm.id] ?? {}), [key]: value }
    }
    return HttpResponse.json(vmSettingsOf(vm), { status: 200 })
  }),

  http.get('*/api/v1/vms/:vmId/events', ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const events = vmEventStore[vm.id] ?? []
    const body: Schemas['PageResponseVmEventResponse'] = {
      content: events.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: events.length,
      totalPages: Math.max(1, Math.ceil(events.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),
]

function notFoundProblem() {
  return problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })
}
