import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'
import { isMyWorkspace, workspaceMembersOf } from './workspaces'
import { uuid } from '../ids'

type Schemas = components['schemas']
type VmDetail = Schemas['VmDetailResponse']
type VmEvent = Schemas['VmEventResponse']
type ResourceRole = Schemas['ResourceRole']
type VmAccessGrant = Schemas['ResourceAccessGrantView']

/** 리소스 축 등급의 강약 (VIEWER < MEMBER < EDITOR < OWNER). */
const RESOURCE_ROLE_RANK: Record<ResourceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  EDITOR: 2,
  OWNER: 3,
}

/** 리소스 등급을 서버와 같은 규칙으로 능력 불리언으로 편다 (VmDetailResponse.from). */
export function accessOf(
  role: ResourceRole | null,
  { workspaceOwner = false }: { workspaceOwner?: boolean } = {},
): Pick<
  VmDetail,
  | 'myResourceRole'
  | 'accessAllowed'
  | 'powerControlAllowed'
  | 'settingsEditAllowed'
  | 'accessManageAllowed'
  | 'deleteAllowed'
> {
  // 워크스페이스 소유자는 목록에 없어도 상시로 조회는 된다 — 서버가 열람자로 셈한다.
  const effective: ResourceRole | null = role ?? (workspaceOwner ? 'VIEWER' : null)
  const rank = effective == null ? -1 : RESOURCE_ROLE_RANK[effective]
  const atLeastMember = rank >= RESOURCE_ROLE_RANK.MEMBER
  const atLeastEditor = rank >= RESOURCE_ROLE_RANK.EDITOR
  // 목록 관리·삭제는 리소스 소유자의 권한이거나 워크스페이스 소유자의 상시 권한이다.
  const manages = role === 'OWNER' || workspaceOwner
  return {
    myResourceRole: effective,
    accessAllowed: atLeastMember,
    powerControlAllowed: atLeastMember,
    settingsEditAllowed: atLeastEditor,
    accessManageAllowed: manages,
    deleteAllowed: manages,
  }
}

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
      id: uuid(55),
      name: 'capstone-team3-api',
      hostname: 'capstone-team3-api',
      status: 'CREATING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(102),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: null,
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      id: uuid(56),
      name: 'algo-judge',
      hostname: 'algo-judge',
      status: 'RUNNING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      workspaceId: uuid(15),
      workspaceName: '알고리즘 스터디',
      requestId: uuid(90),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.56',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      // (워크스페이스 12 OWNER라 공개 폼을 실제로 조작할 수 있다).
      id: uuid(57),
      name: 'web-lab',
      hostname: 'web-lab',
      status: 'STOPPED',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(91),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.57',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      id: uuid(58),
      name: 'stuck-vm',
      hostname: 'stuck-vm',
      status: 'NEEDS_ADMIN',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(103),
      statusDetail: '프로비저닝 재시도가 소진되어 관리자 확인이 필요합니다.',
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: null,
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      id: uuid(59),
      name: 'broken-vm',
      hostname: 'broken-vm',
      status: 'ERROR',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(104),
      statusDetail: '생성이 실패해 부분 리소스가 정리되었습니다.',
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: null,
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      id: uuid(60),
      name: 'retiring-vm',
      hostname: 'retiring-vm',
      status: 'DELETING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      workspaceId: uuid(15),
      workspaceName: '알고리즘 스터디',
      requestId: uuid(92),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.60',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
        requestedById: uuid(42),
        reason: null,
        cancelable: true,
      },
      createdAt: '2026-05-01T10:00:00+09:00',
      updatedAt: '2026-07-08T14:10:00+09:00',
    },
    {
      // 이미 공개됨 — 플랫폼 희망 서브도메인(PLATFORM), 라우트 APPLIED, 와일드카드 인증서.
      // 포트 변경·공개 해제 흐름 대상 (org 2).
      id: uuid(61),
      name: 'ai-train',
      hostname: 'ai-train',
      status: 'RUNNING',
      vcpu: 4,
      memoryMb: 4096,
      diskGb: 40,
      workspaceId: uuid(21),
      workspaceName: 'AI 동아리',
      requestId: uuid(105),
      statusDetail: null,
      orgId: uuid(2),
      imageId: uuid(2),
      ipAddress: '10.10.0.61',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
      passwordRevealAllowed: true,
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'ai-team.pusan.dev',
        domain: {
          id: uuid(21),
          vmId: uuid(61),
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
      id: uuid(62),
      name: 'demo-web',
      hostname: 'demo-web',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(106),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.62',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
      passwordRevealAllowed: true,
      startDate: '2026-07-10',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'demo.example.com',
        domain: {
          id: uuid(34),
          vmId: uuid(62),
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
      id: uuid(63),
      name: 'shop-app',
      hostname: 'shop-app',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(107),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.63',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
      passwordRevealAllowed: true,
      startDate: '2026-07-01',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'shop-app.pusan.dev',
        domain: {
          id: uuid(30),
          vmId: uuid(63),
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
          id: uuid(35),
          vmId: uuid(63),
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
      id: uuid(64),
      name: 'api-svc',
      hostname: 'api-svc',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(21),
      workspaceName: 'AI 동아리',
      requestId: uuid(108),
      statusDetail: null,
      orgId: uuid(2),
      imageId: uuid(2),
      ipAddress: '10.10.0.64',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
      passwordRevealAllowed: true,
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [{
        fqdn: 'api.example.org',
        domain: {
          id: uuid(36),
          vmId: uuid(64),
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
    {
      // 소속 워크스페이스의 VM이지만 접근 목록에 내가 없다 — 목록에서 제한 행으로 나오고
      // 상세는 404다. 워크스페이스 15에서 나는 구성원일 뿐이라 상시 권한도 없다.
      id: uuid(44),
      name: 'ml-notebook',
      hostname: 'ml-notebook',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(15),
      workspaceName: '알고리즘 스터디',
      requestId: uuid(112),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.44',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf(null),
      passwordRevealAllowed: false,
      startDate: '2026-07-01',
      endDate: '2026-12-20',
      sshGatewayBlocked: false,
      passwordAvailable: false,
      publications: [],
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-01T10:00:00+09:00',
      updatedAt: '2026-07-01T10:00:00+09:00',
    },
    /* ─── 만료 큐 픽스처 — 날짜는 테스트 실행일 기준으로 동적 생성 ─── */
    {
      // 7일 이내 만료 임박 (D-3)
      id: uuid(45),
      name: 'expiring-api',
      hostname: 'expiring-api',
      status: 'RUNNING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      requestId: uuid(109),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.45',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      id: uuid(46),
      name: 'expired-lab',
      hostname: 'expired-lab',
      status: 'STOPPED',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      workspaceId: uuid(15),
      workspaceName: '알고리즘 스터디',
      requestId: uuid(110),
      statusDetail: null,
      orgId: uuid(1),
      imageId: uuid(1),
      ipAddress: '10.10.0.46',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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
      id: uuid(47),
      name: 'semester-web',
      hostname: 'semester-web',
      status: 'RUNNING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      workspaceId: uuid(21),
      workspaceName: 'AI 동아리',
      requestId: uuid(111),
      statusDetail: null,
      orgId: uuid(2),
      imageId: uuid(1),
      ipAddress: '10.10.0.47',
      sshUsername: 'ubuntu',
      sshHost: 'ssh.pcl.kr',
      ...accessOf('OWNER'),
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

function initialVmEvents(): Record<string, VmEvent[]> {
  return {
    [uuid(56)]: [
      {
        id: uuid(903),
        type: 'GATEWAY_BLOCK',
        // 관리자 개입: 서버가 신원을 비워서 내려보내므로 목록 핸들러가 같은
        // 모양으로 만든다(여기에 이름이 있어도 사용자 화면에는 안 나간다).
        actorId: uuid(7),
        actorKind: 'ADMIN',
        actorName: '운영 담당자',
        detail: '관리자 차단',
        createdAt: '2026-07-02T11:00:00+09:00',
      },
      {
        id: uuid(902),
        type: 'START',
        actorId: uuid(42),
        actorKind: 'MEMBER',
        actorName: '홍길동',
        detail: null,
        createdAt: '2026-07-01T09:12:00+09:00',
      },
      {
        id: uuid(901),
        type: 'CREATE',
        actorId: null,
        actorKind: 'SYSTEM',
        detail: '승인 신청 90에 따라 자동 생성',
        createdAt: '2026-06-20T10:00:00+09:00',
      },
    ],
  }
}

export let vmStore: VmDetail[] = initialVms()
export let vmEventStore: Record<string, VmEvent[]> = initialVmEvents()
let nextEventId = 950

/* ─── VM별 설정 레지스트리 — 계약 v0.8.0 카탈로그 ─── */
type VmSettingView = Schemas['VmSettingView']

interface VmSettingCatalogEntry {
  valueType: VmSettingView['valueType']
  allowedValues: string[] | null
  defaultValue: unknown
  label: string
  description: string
  requiredRole: ResourceRole
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
    description: 'VM 비밀번호(= sudo 자격)를 열람할 수 있는 최소 접근 등급입니다.',
    requiredRole: 'OWNER',
  },
}

/** VM별 설정 저장 오버라이드 ({vmId: {key: value}}) — 미저장 키는 기본값. */
export let vmSettingStore: Record<string, Record<string, unknown>> = {}

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
        stateEditable && vm.myResourceRole != null
        && RESOURCE_ROLE_RANK[vm.myResourceRole] >= RESOURCE_ROLE_RANK[meta.requiredRole],
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
let detailFetchCounts: Record<string, number> = {}

/** 라우트가 PENDING→APPLIED로 전이하기까지의 GET 횟수 — 도메인별 계수 (폴링 테스트). */
export const ROUTE_APPLIED_AFTER_FETCHES = 2
let routeFetchCounts: Record<string, number> = {}

export function resetVmFixtures() {
  vmStore = initialVms()
  vmEventStore = initialVmEvents()
  vmSettingStore = {}
  vmAccessStore = initialVmAccessGrants()
  nextEventId = 950
  nextGrantId = 400
  detailFetchCounts = {}
  routeFetchCounts = {}
}

/**
 * 그 VM의 접근 목록을 관리할 수 있는 사람으로 만든다 — 부여 없는 워크스페이스 소유자가
 * 그렇다. 상세는 여전히 막히고 목록 관리만 열리는, 서버와 같은 조합이다.
 * {@link resetVmFixtures}가 되돌린다.
 */
export function asGrantManager(vmId: string) {
  const vm = vmStore.find((v) => v.id === vmId)
  if (vm) vm.accessManageAllowed = true
}

/** Prepend a lifecycle event for assertions on event history refreshes. */
export function recordVmEvent(vmId: string, event: Omit<VmEvent, 'id'>) {
  const list = (vmEventStore[vmId] ??= [])
  list.unshift({ id: uuid(nextEventId++), ...event })
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

/**
 * 목록 행. 접근 목록에 없는 사람에게는 서버가 기계에 대한 값을 아예 빼고
 * 이름·상태·소유자만 내려주므로(VmSummaryResponse.restricted), mock도 값을
 * 비우는 대신 필드를 지운다 — 콘솔이 null을 견디는지가 여기서 드러난다.
 */
export function toVmSummary(vm: VmDetail): Schemas['VmSummaryResponse'] {
  const {
    id, name, hostname, status, vcpu, memoryMb, diskGb, workspaceId, workspaceName,
    requestId, statusDetail, sshGatewayBlocked, endDate, expiryStoppedAt, createdAt,
  } = vm
  return {
    id, name, hostname, status, vcpu, memoryMb, diskGb, workspaceId, workspaceName,
    requestId, statusDetail, sshGatewayBlocked, endDate, expiryStoppedAt, createdAt,
    accessLimited: false, ownerNames: [], accessManageAllowed: vm.accessManageAllowed,
  }
}

/** 접근 권한이 없는 사람이 보는 행 — 이름·상태·소유자뿐이다. */
export function toRestrictedVmSummary(
  vm: VmDetail,
  ownerNames: string[],
  accessManageAllowed = false,
): Schemas['VmSummaryResponse'] {
  const { id, name, status, workspaceId, workspaceName, createdAt } = vm
  return {
    id, name, status, workspaceId, workspaceName, createdAt,
    hostname: null, vcpu: null, memoryMb: null, diskGb: null, requestId: null,
    statusDetail: null, sshGatewayBlocked: null, endDate: null, expiryStoppedAt: null,
    orgName: null, accessLimited: true, ownerNames, accessManageAllowed,
  }
}

/**
 * 같은 행을 종류 무관 인벤토리 모양으로 옮긴다.
 *
 * 제한 여부 판단은 VM 목록과 이 한 곳에서만 내린다 — 두 화면이 같은 행을 두고
 * 서로 다른 말을 하면, 권한 결함이 테스트에 걸리지 않고 지나간다.
 * 이름은 서버가 주는 대로 옮긴다 (표시명·호스트명 중 무엇을 주는지는 서버가 정한다).
 */
export function toResourceSummary(vm: VmDetail): Schemas['ResourceSummaryResponse'] {
  const limited = vm.myResourceRole == null
  return {
    id: vm.id,
    type: 'VM',
    name: vm.name,
    displayName: vm.displayName ?? null,
    status: vm.status,
    workspaceId: vm.workspaceId!,
    workspaceName: vm.workspaceName,
    accessLimited: limited,
    ownerNames: limited ? grantOwnerNames(vm.id) : [],
    accessManageAllowed: vm.accessManageAllowed,
    createdAt: vm.createdAt,
  }
}

/* ─── VM 접근 목록 (계약 v0.33.0) ─── */

/** 접근 목록의 소유자 이름 — 제한 행이 "누구에게 요청하라"고 말할 때 쓴다. */
function grantOwnerNames(vmId: string): string[] {
  return (vmAccessStore[vmId] ?? [])
    .filter((grant) => grant.role === 'OWNER' && grant.user)
    .map((grant) => grant.user!.name)
}

function initialVmAccessGrants(): Record<string, VmAccessGrant[]> {
  return {
    // algo-judge — 나(42)는 소유자, 김철수(57)는 참여자, 워크스페이스 전체는 열람자.
    [uuid(56)]: [
      {
        id: uuid(301),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-06-20T10:00:00+09:00',
      },
      {
        id: uuid(302),
        granteeType: 'USER',
        user: { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr' },
        role: 'MEMBER',
        createdAt: '2026-06-21T10:00:00+09:00',
      },
      {
        id: uuid(303),
        granteeType: 'WORKSPACE',
        user: null,
        role: 'VIEWER',
        createdAt: '2026-06-22T10:00:00+09:00',
      },
    ],
    // web-lab — 신청자였던 나만 소유자로 올라가 있는 갓 만들어진 상태.
    [uuid(57)]: [
      {
        id: uuid(305),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-06-21T10:00:00+09:00',
      },
    ],
    // ml-notebook — 나는 목록에 없다 (제한 행의 근거).
    [uuid(44)]: [
      {
        id: uuid(311),
        granteeType: 'USER',
        user: { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-07-01T10:00:00+09:00',
      },
    ],
  }
}

export let vmAccessStore: Record<string, VmAccessGrant[]> = initialVmAccessGrants()
let nextGrantId = 400

export const vmHandlers: RequestHandler[] = [
  http.get('*/api/v1/vms', ({ request }) => {
    const url = new URL(request.url)
    const workspaceId = url.searchParams.get('workspaceId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = vmStore
      // 서버와 같은 조회 범위: 내가 구성원인 워크스페이스의 VM만 보인다.
      // (범위 질의는 그 위에 얹히는 필터일 뿐, 범위를 넓히지 못한다.)
      .filter((vm) => isMyWorkspace(vm.workspaceId))
      .filter((vm) => !workspaceId || vm.workspaceId === workspaceId)
      .sort((a, b) => b.id.localeCompare(a.id))
    const body: Schemas['PageResponseVmSummaryResponse'] = {
      content: filtered
        .slice(page * size, (page + 1) * size)
        // 접근 목록에 없고 워크스페이스 소유자도 아니면 제한 행으로 내려간다.
        .map((vm) =>
          vm.myResourceRole == null
            ? toRestrictedVmSummary(vm, grantOwnerNames(vm.id), vm.accessManageAllowed)
            : toVmSummary(vm),
        ),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/vms/:vmId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '요청한 리소스가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    // 소속 워크스페이스의 VM이지만 접근 목록에 없으면 존재만 알고 안은 못 본다 (403).
    if (vm.myResourceRole == null) {
      return accessDeniedProblem(
        `/api/v1/vms/${vm.id}`,
        '이 VM에 접근할 권한이 없습니다',
        '이 VM의 접근 목록에 등록되어 있지 않습니다. 리소스 소유자에게 접근 권한을 요청해 주세요.',
      )
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
    const vm = vmStore.find((v) => v.id === String(params.vmId))
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
      requestedById: uuid(42),
      reason: null,
      cancelable: !immediate,
    }
    vm.status = immediate ? 'DELETED' : 'DELETING'
    vm.deletion = deletion
    // 실서버: 접수 시 SELF_DELETE 이벤트, ERROR 즉시 삭제는 종결 DELETE 이벤트를 추가로 기록.
    recordVmEvent(vm.id, {
      type: 'SELF_DELETE',
      actorId: uuid(42),
      actorKind: 'MEMBER',
      detail: immediate ? '생성 실패 VM 즉시 삭제' : null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    if (immediate) {
      recordVmEvent(vm.id, {
        type: 'DELETE',
        actorId: uuid(42),
        actorKind: 'MEMBER',
        detail: null,
        createdAt: '2026-07-08T15:00:00+09:00',
      })
    }
    return HttpResponse.json(deletion, { status: 202 })
  }),

  /* ─── power ops: 계약의 409 상태 조건을 그대로 강제한다 ─── */

  http.post('*/api/v1/vms/:vmId/start', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
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
      actorId: uuid(42),
      actorKind: 'MEMBER',
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 시작 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/shutdown', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
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
      actorId: uuid(42),
      actorKind: 'MEMBER',
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/reboot', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
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
      actorId: uuid(42),
      actorKind: 'MEMBER',
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 재부팅 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/force-stop', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
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
      actorId: uuid(42),
      actorKind: 'MEMBER',
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
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    if (!['RUNNING', 'STOPPED', 'REBOOTING'].includes(vm.status)) {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/password`,
        'VM 생성이 완료된 뒤에 비밀번호를 열람할 수 있습니다.',
      )
    }
    // password_reveal_min_role 게이트: 서버가 계산한 passwordRevealAllowed를 그대로 강제.
    if (!vm.passwordRevealAllowed) {
      return accessDeniedProblem(
        `/api/v1/vms/${vm.id}/password`,
        '비밀번호를 열람할 권한이 없습니다',
        '이 VM은 접근 목록의 참여자 이상만 비밀번호를 열람할 수 있습니다.',
      )
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
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    if (!vm.settingsEditAllowed) {
      return accessDeniedProblem(
        `/api/v1/vms/${vm.id}/password/regenerate`,
        '비밀번호를 재생성할 권한이 없습니다',
        '이 VM의 편집자 이상만 비밀번호를 재생성할 수 있습니다.',
      )
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
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    if (!vm.settingsEditAllowed) {
      return accessDeniedProblem(
        `/api/v1/vms/${vm.id}/settings`,
        'VM 설정에 접근할 권한이 없습니다',
        '이 VM의 편집자 이상만 VM 설정을 볼 수 있습니다.',
      )
    }
    return HttpResponse.json(vmSettingsOf(vm), { status: 200 })
  }),

  // VM별 설정 변경 (부분 맵, 원자적) — 갱신된 전체 목록 반환.
  http.patch('*/api/v1/vms/:vmId/settings', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    if (!vm.settingsEditAllowed) {
      return accessDeniedProblem(
        `/api/v1/vms/${vm.id}/settings`,
        '설정에 접근할 권한이 없습니다',
        '이 VM의 편집자 이상만 VM 설정을 변경할 수 있습니다.',
      )
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
      // password_reveal_min_role은 리소스 소유자 전용 — 편집자가 바꾸려 하면 403.
      if (key === 'password_reveal_min_role' && vm.myResourceRole !== 'OWNER') {
        return accessDeniedProblem(
          `/api/v1/vms/${vm.id}/settings`,
          '설정을 변경할 권한이 없습니다',
          '`password_reveal_min_role` 설정은 이 VM의 소유자만 변경할 수 있습니다.',
        )
      }
      vmSettingStore[vm.id] = { ...(vmSettingStore[vm.id] ?? {}), [key]: value }
    }
    return HttpResponse.json(vmSettingsOf(vm), { status: 200 })
  }),

  http.get('*/api/v1/vms/:vmId/events', ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    // 서버와 같은 모양: 관리자 개입 행은 사용자 화면용 응답에서 신원이 비워져
    // 나간다(가리는 일을 클라이언트에 맡기지 않는다).
    const events = (vmEventStore[vm.id] ?? []).map((event) =>
      event.actorKind === 'ADMIN'
        ? { ...event, actorId: null, actorName: null }
        : event,
    )
    const body: Schemas['PageResponseVmEventResponse'] = {
      content: events.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: events.length,
      totalPages: Math.max(1, Math.ceil(events.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  /* ─── VM 접근 목록 — 리소스 소유자와 워크스페이스 소유자만 읽고 쓴다 ─── */

  http.get('*/api/v1/vms/:vmId/access', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    const denied = requireGrantManager(vm)
    if (denied) return denied
    // 서버와 같은 모양: 목록만이 아니라 어느 리소스의 것인지도 함께 — 이
    // 화면을 여는 사람은 그 리소스의 상세를 못 여는 경우가 있다.
    return HttpResponse.json({
      resource: {
        id: vm.id,
        type: 'VM',
        name: vm.name,
        displayName: vm.displayName ?? null,
        status: vm.status,
        workspaceId: vm.workspaceId!,
        workspaceName: vm.workspaceName,
      },
      grants: vmAccessStore[vm.id] ?? [],
    } satisfies Schemas['ResourceAccessListResponse'], { status: 200 })
  }),

  http.post('*/api/v1/vms/:vmId/access', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    const denied = requireGrantManager(vm)
    if (denied) return denied
    const body = (await request.json()) as Schemas['AddResourceAccessGrantRequest']
    const grants = (vmAccessStore[vm.id] ??= [])
    if (body.granteeType === 'WORKSPACE') {
      const capped = workspaceWideRoleProblem(body.role)
      if (capped) return capped
      if (grants.some((grant) => grant.granteeType === 'WORKSPACE')) {
        return alreadyListedProblem()
      }
      const grant: VmAccessGrant = {
        id: uuid(nextGrantId++),
        granteeType: 'WORKSPACE',
        user: null,
        role: body.role,
        createdAt: '2026-08-09T10:00:00+09:00',
      }
      grants.push(grant)
      return HttpResponse.json(grant, { status: 201 })
    }
    const member = workspaceMembersOf(vm.workspaceId).find((m) => m.userId === body.userId)
    if (!member) {
      return validationProblem(
        `/api/v1/vms/${vm.id}/access`,
        'userId',
        '이 VM을 소유한 워크스페이스의 구성원만 접근 권한을 받을 수 있습니다. 먼저 워크스페이스에 추가해 주세요.',
      )
    }
    if (grants.some((grant) => grant.user?.userId === member.userId)) {
      return alreadyListedProblem()
    }
    const grant: VmAccessGrant = {
      id: uuid(nextGrantId++),
      granteeType: 'USER',
      user: { userId: member.userId, name: member.name, email: member.email },
      role: body.role,
      createdAt: '2026-08-09T10:00:00+09:00',
    }
    grants.push(grant)
    return HttpResponse.json(grant, { status: 201 })
  }),

  http.patch('*/api/v1/vms/:vmId/access/:grantId', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    const denied = requireGrantManager(vm)
    if (denied) return denied
    const grant = (vmAccessStore[vm.id] ?? []).find((g) => g.id === String(params.grantId))
    if (!grant) return notFoundProblem()
    const body = (await request.json()) as Schemas['UpdateResourceAccessGrantRequest']
    if (grant.granteeType === 'WORKSPACE') {
      const capped = workspaceWideRoleProblem(body.role)
      if (capped) return capped
    }
    grant.role = body.role
    return HttpResponse.json(grant, { status: 200 })
  }),

  http.delete('*/api/v1/vms/:vmId/access/:grantId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFoundProblem()
    const denied = requireGrantManager(vm)
    if (denied) return denied
    const grants = vmAccessStore[vm.id] ?? []
    const index = grants.findIndex((g) => g.id === String(params.grantId))
    if (index < 0) return notFoundProblem()
    grants.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]

function requireGrantManager(vm: VmDetail) {
  return vm.accessManageAllowed
    ? null
    : accessDeniedProblem(
        `/api/v1/vms/${vm.id}/access`,
        '접근 권한을 관리할 권한이 없습니다',
        '이 VM의 소유자 또는 워크스페이스 소유자만 접근 권한을 관리할 수 있습니다.',
      )
}

/** 워크스페이스 전체 항목은 참여자·열람자까지만 — 서버와 같은 상한. */
function workspaceWideRoleProblem(role: ResourceRole) {
  if (role !== 'OWNER' && role !== 'EDITOR') return null
  return problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: '워크스페이스 전체에는 참여자 또는 열람자까지만 부여할 수 있습니다.',
    code: 'VALIDATION_FAILED',
    errors: [
      {
        field: 'role',
        message:
          '워크스페이스 전체에는 참여자 또는 열람자까지만 부여할 수 있습니다. 그보다 높은 등급은 '
          + '구성원을 지정해 부여해 주세요.',
      },
    ],
  })
}

const alreadyListedProblem = () =>
  problemResponse({
    type: 'about:blank',
    title: '이미 접근 권한이 있습니다',
    status: 409,
    detail: '이 대상은 이미 이 VM의 접근 목록에 있습니다. 등급을 바꾸려면 기존 항목을 수정해 주세요.',
    code: 'VM_ACCESS_GRANT_EXISTS',
  })

const validationProblem = (instance: string, field: string, message: string) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: message,
    instance,
    code: 'VALIDATION_FAILED',
    errors: [{ field, message }],
  })

/** 접근 권한 분기 테스트용 — 이 VM 상세를 지정한 리소스 등급으로 내려주는 임시 핸들러. */
export function vmDetailAs(
  vmId: string,
  role: ResourceRole | null,
  overrides: Partial<VmDetail> = {},
): RequestHandler {
  return http.get(`*/api/v1/vms/${vmId}`, () => {
    const vm = vmStore.find((v) => v.id === vmId)!
    return HttpResponse.json({ ...vm, ...accessOf(role), ...overrides }, { status: 200 })
  })
}

/**
 * 목록 한 행만 바꿔 내려주는 임시 핸들러. 제한 행에서만 드러나는 것(관리 진입점
 * 등)을 그 행 하나로 재현하려고 쓴다 — 상세용 {@link vmDetailAs}의 목록판이다.
 */
export function vmSummaryAs(
  vmId: string,
  patch: Partial<Schemas['VmSummaryResponse']>,
): RequestHandler {
  return http.get('*/api/v1/vms', () => {
    const rows = vmStore
      .filter((vm) => isMyWorkspace(vm.workspaceId))
      .sort((a, b) => b.id.localeCompare(a.id))
      .map((vm) => {
        const row = vm.myResourceRole == null
          ? toRestrictedVmSummary(vm, grantOwnerNames(vm.id), vm.accessManageAllowed)
          : toVmSummary(vm)
        return vm.id === vmId ? { ...row, ...patch } : row
      })
    return HttpResponse.json({
      content: rows,
      page: 0,
      size: 20,
      totalElements: rows.length,
      totalPages: 1,
    } satisfies Schemas['PageResponseVmSummaryResponse'], { status: 200 })
  })
}

/** 접근 목록이 막는 403 — 계약상 코드는 WORKSPACE_ROLE_INSUFFICIENT 하나다. */
function accessDeniedProblem(instance: string, title: string, detail: string) {
  return problemResponse({
    type: 'about:blank',
    title,
    status: 403,
    detail,
    instance,
    code: 'WORKSPACE_ROLE_INSUFFICIENT',
  })
}

function notFoundProblem() {
  return problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })
}
