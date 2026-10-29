import type { UserProfile } from '../../auth/auth-context'
import { hasWork, hasSameSourceWorks, SYS_ADMIN, SYS_OPERATORS, SYS_READERS, type AuthorityActor, type InstitutionAuthority, type InstitutionWorkView, type WorkTarget, type WorkGroup } from '../../auth/institution-authority'

/** Fixed synthetic fixture data. Production authority always comes from the authenticated endpoint. */
export const MOCK_WORK_CATALOGUE: InstitutionWorkView[] = [
  {
    "id": "vm.request.read",
    "name": "VM 신청 조회",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.request.decide",
    "name": "VM 신청 승인·반려",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.roster.issue",
    "name": "VM 학번 명단 지급",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.recipient.retry",
    "name": "VM 실패 대상자 재시도",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.metadata.read",
    "name": "VM 정보 조회",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.observe",
    "name": "VM 관측 조회",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.power",
    "name": "VM 전원 제어",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.period",
    "name": "VM 기간 변경",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.deletion.schedule",
    "name": "VM 삭제 예약·취소",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.network-policy.read",
    "name": "VM 네트워크 정책 조회",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.network-policy.write",
    "name": "VM 네트워크 정책 변경",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.publication.read",
    "name": "VM 게시 정보 조회",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.publication.operate",
    "name": "VM 게시 운영",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.custom-domain.verify",
    "name": "VM 커스텀 도메인 검증",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.terminal-session.read",
    "name": "VM 터미널 세션 정보 조회",
    "group": "VM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.request.support.read",
    "name": "VM 신청 지원 조회",
    "group": "VM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.metadata.support.read",
    "name": "VM 정보 지원 조회",
    "group": "VM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.acl.support.read",
    "name": "VM 접근권한 지원 조회",
    "group": "VM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "vm.acl.support.manage",
    "name": "VM 접근권한 지원 변경",
    "group": "VM",
    "boundary": "RESOURCE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.request.read",
    "name": "LLM 신청 조회",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.request.decide",
    "name": "LLM 신청 승인·반려",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.roster.issue",
    "name": "LLM 학번 명단 지급",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.recipient.retry",
    "name": "LLM 실패 대상자 재시도",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.metadata.read",
    "name": "LLM 정보 조회",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.observe",
    "name": "LLM 관측 조회",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.token.operate",
    "name": "LLM 토큰 한도 변경",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.state.operate",
    "name": "LLM 정지·재개",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.period",
    "name": "LLM 기간 변경",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.revoke",
    "name": "LLM 키 폐기",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.key.cost.read",
    "name": "LLM 키 비용 조회",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": true
  },
  {
    "id": "llm.key.budget",
    "name": "LLM 키 예산 관리",
    "group": "LLM",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.request.support.read",
    "name": "LLM 신청 지원 조회",
    "group": "LLM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.metadata.support.read",
    "name": "LLM 정보 지원 조회",
    "group": "LLM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.observe.support.read",
    "name": "LLM 관측 지원 조회",
    "group": "LLM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.acl.support.read",
    "name": "LLM 접근권한 지원 조회",
    "group": "LLM",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.acl.support.manage",
    "name": "LLM 접근권한 지원 변경",
    "group": "LLM",
    "boundary": "RESOURCE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.request.read",
    "name": "외부 도메인 신청 조회",
    "group": "DOMAIN",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.request.decide",
    "name": "외부 도메인 신청 승인·반려",
    "group": "DOMAIN",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.metadata.read",
    "name": "외부 도메인 정보 조회",
    "group": "DOMAIN",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.observe",
    "name": "외부 도메인 관측 조회",
    "group": "DOMAIN",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.renewal",
    "name": "외부 도메인 갱신 기한 변경",
    "group": "DOMAIN",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.release",
    "name": "외부 도메인 해제",
    "group": "DOMAIN",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.request.support.read",
    "name": "외부 도메인 신청 지원 조회",
    "group": "DOMAIN",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.metadata.support.read",
    "name": "외부 도메인 정보 지원 조회",
    "group": "DOMAIN",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.acl.support.read",
    "name": "외부 도메인 접근권한 지원 조회",
    "group": "DOMAIN",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "domain.acl.support.manage",
    "name": "외부 도메인 접근권한 지원 변경",
    "group": "DOMAIN",
    "boundary": "RESOURCE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.request.read",
    "name": "GPU 신청 조회",
    "group": "GPU",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.request.decide",
    "name": "GPU 신청 승인·반려",
    "group": "GPU",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.metadata.read",
    "name": "GPU 정보 조회",
    "group": "GPU",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.observe",
    "name": "GPU 관측 조회",
    "group": "GPU",
    "boundary": "RESOURCE",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.period",
    "name": "GPU 기간 변경",
    "group": "GPU",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.recall",
    "name": "GPU 회수",
    "group": "GPU",
    "boundary": "RESOURCE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.request.support.read",
    "name": "GPU 신청 지원 조회",
    "group": "GPU",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.metadata.support.read",
    "name": "GPU 정보 지원 조회",
    "group": "GPU",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.observe.support.read",
    "name": "GPU 관측 지원 조회",
    "group": "GPU",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.acl.support.read",
    "name": "GPU 접근권한 지원 조회",
    "group": "GPU",
    "boundary": "RESOURCE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "gpu.acl.support.manage",
    "name": "GPU 접근권한 지원 변경",
    "group": "GPU",
    "boundary": "RESOURCE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.support.read",
    "name": "워크스페이스 지원 조회",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.info.update",
    "name": "워크스페이스 정보 변경",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.members.manage",
    "name": "워크스페이스 구성원 관리",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.invitations.manage",
    "name": "워크스페이스 초대 관리",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.owners.manage",
    "name": "워크스페이스 소유자 관리",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.terminate",
    "name": "워크스페이스 종료",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.recipient.cancel",
    "name": "미등록 지급 대상자 취소",
    "group": "WORKSPACE",
    "boundary": "WORKSPACE_SUPPORT",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "workspace.announcement.send",
    "name": "워크스페이스 안내 발송",
    "group": "WORKSPACE",
    "boundary": "QUALIFIED_WORKSPACE",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "student.lookup",
    "name": "사용자 찾기",
    "group": null,
    "boundary": "GLOBAL",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "student.support.read",
    "name": "사용자 지원 정보 조회",
    "group": null,
    "boundary": "GLOBAL",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "student.profile.correct",
    "name": "사용자 프로필 정정",
    "group": null,
    "boundary": "GLOBAL",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "notice.read",
    "name": "공지 관리 목록 조회",
    "group": null,
    "boundary": "GLOBAL",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "notice.manage",
    "name": "공지 작성·변경",
    "group": null,
    "boundary": "GLOBAL",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "shared-certificate.read",
    "name": "공유 인증서 조회",
    "group": null,
    "boundary": "GLOBAL",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "root-domain.catalogue.read",
    "name": "루트 도메인 목록 조회",
    "group": null,
    "boundary": "GLOBAL",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "llm.model-catalogue.read",
    "name": "LLM 모델 목록·가격 조회",
    "group": null,
    "boundary": "GLOBAL",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.audit.read",
    "name": "기관 감사 기록 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.staff.read",
    "name": "기관 담당자·업무 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.request-mail.read",
    "name": "기관 신청 메일 설정 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.request-mail.configure",
    "name": "기관 신청 메일 설정 변경",
    "group": null,
    "boundary": "INSTITUTION",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.announcement.read",
    "name": "기관 안내 발송 이력 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.announcement.send",
    "name": "기관 안내 발송",
    "group": null,
    "boundary": "INSTITUTION",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.account.read",
    "name": "기관 사업 계정 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.account.finance.read",
    "name": "기관 사업 계정 재무 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.account.manage",
    "name": "기관 사업 계정 관리",
    "group": null,
    "boundary": "INSTITUTION",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.account.credential.manage",
    "name": "기관 사업 계정 자격증명 관리",
    "group": null,
    "boundary": "INSTITUTION",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.root-policy.read",
    "name": "기관 루트 도메인 정책 조회",
    "group": null,
    "boundary": "INSTITUTION",
    "write": false,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.root-policy.write",
    "name": "기관 루트 도메인 정책 변경",
    "group": null,
    "boundary": "INSTITUTION",
    "write": true,
    "selectable": true,
    "includedInFull": true,
    "globalResourceReadInFull": false
  },
  {
    "id": "institution.delegate",
    "name": "기관 권한 위임",
    "group": null,
    "boundary": "INSTITUTION",
    "write": true,
    "selectable": false,
    "includedInFull": true,
    "globalResourceReadInFull": false
  }
]

const MANAGER_WORK = [
  "vm.request.read",
  "vm.request.decide",
  "vm.roster.issue",
  "vm.recipient.retry",
  "vm.metadata.read",
  "vm.observe",
  "vm.power",
  "vm.period",
  "vm.network-policy.read",
  "vm.network-policy.write",
  "vm.publication.read",
  "vm.publication.operate",
  "vm.custom-domain.verify",
  "vm.terminal-session.read",
  "vm.request.support.read",
  "vm.metadata.support.read",
  "vm.acl.support.read",
  "vm.acl.support.manage",
  "llm.request.read",
  "llm.request.decide",
  "llm.roster.issue",
  "llm.recipient.retry",
  "llm.metadata.read",
  "llm.observe",
  "llm.token.operate",
  "llm.state.operate",
  "llm.period",
  "llm.key.cost.read",
  "llm.key.budget",
  "llm.request.support.read",
  "llm.metadata.support.read",
  "llm.acl.support.read",
  "llm.acl.support.manage",
  "domain.request.read",
  "domain.request.decide",
  "domain.metadata.read",
  "domain.observe",
  "domain.renewal",
  "domain.release",
  "domain.request.support.read",
  "domain.metadata.support.read",
  "domain.acl.support.read",
  "domain.acl.support.manage",
  "gpu.request.read",
  "gpu.request.decide",
  "gpu.metadata.read",
  "gpu.observe",
  "gpu.request.support.read",
  "gpu.metadata.support.read",
  "gpu.acl.support.read",
  "gpu.acl.support.manage",
  "workspace.support.read",
  "workspace.info.update",
  "workspace.members.manage",
  "workspace.invitations.manage",
  "workspace.owners.manage",
  "workspace.terminate",
  "workspace.recipient.cancel",
  "student.lookup",
  "student.support.read",
  "student.profile.correct",
  "notice.read",
  "shared-certificate.read",
  "root-domain.catalogue.read",
  "institution.audit.read",
  "institution.staff.read",
  "institution.request-mail.read",
  "institution.announcement.read",
  "institution.account.read",
  "institution.account.finance.read",
  "institution.account.manage",
  "institution.account.credential.manage",
  "institution.root-policy.read",
  "institution.root-policy.write",
  "llm.model-catalogue.read",
  "llm.observe.support.read",
  "gpu.observe.support.read"
]
const VIEWER_WORK = [
  "vm.request.read",
  "vm.metadata.read",
  "vm.observe",
  "vm.network-policy.read",
  "vm.publication.read",
  "vm.terminal-session.read",
  "vm.request.support.read",
  "vm.metadata.support.read",
  "vm.acl.support.read",
  "llm.request.read",
  "llm.metadata.read",
  "llm.observe",
  "llm.key.cost.read",
  "llm.request.support.read",
  "llm.metadata.support.read",
  "llm.acl.support.read",
  "domain.request.read",
  "domain.metadata.read",
  "domain.observe",
  "domain.request.support.read",
  "domain.metadata.support.read",
  "domain.acl.support.read",
  "gpu.request.read",
  "gpu.metadata.read",
  "gpu.observe",
  "gpu.request.support.read",
  "gpu.metadata.support.read",
  "gpu.acl.support.read",
  "workspace.support.read",
  "student.lookup",
  "student.support.read",
  "notice.read",
  "shared-certificate.read",
  "root-domain.catalogue.read",
  "institution.staff.read",
  "institution.request-mail.read",
  "institution.announcement.read",
  "institution.account.read",
  "institution.account.finance.read",
  "institution.root-policy.read",
  "llm.model-catalogue.read",
  "llm.observe.support.read",
  "gpu.observe.support.read"
]

export const AUTHORITY_OVERRIDES: Record<string, InstitutionAuthority> = {}

export function mockAuthorityActor(profile: UserProfile): UserProfile {
  const institutionAuthority = mockInstitutionAuthority(profile)
  return { ...profile, role: institutionAuthority.accountRole, institutionAuthority }
}

/** Query-source admission is independent of matching rows and never combines assignments. */
export function mockHasAggregateMoneySource(actor: AuthorityActor): boolean {
  if (actor.role.startsWith('SYS_')) return SYS_READERS.includes(actor.role)
  const context = actor.institutionAuthority
  if (context?.state !== 'VALID_SOURCES') return false
  return context.assignments.some((grant) => {
    const scope = grant.permission.mode === 'FULL' ? undefined : grant.permission.scopes.LLM
    if (grant.permission.mode !== 'FULL' && (!scope || scope.mode === 'LISTED' && scope.workspaceIds.length === 0)) return false
    const one = { ...actor, institutionAuthority: { ...context, assignments: [grant] } }
    return hasSameSourceWorks(one, ['llm.observe', 'llm.key.cost.read'], { orgId: grant.institutionId,
      workspaceId: scope?.mode === 'LISTED' ? scope.workspaceIds[0] : undefined })
  })
}

const SYSTEM_ROUTINE_WORK = new Set([
  'vm.power', 'vm.period', 'vm.network-policy.write', 'vm.publication.operate', 'vm.custom-domain.verify',
  'llm.token.operate', 'llm.state.operate', 'llm.period', 'domain.renewal', 'domain.release', 'gpu.period', 'gpu.recall',
])

/** Derive synthetic row projections from explicit fixture grants and the existing SYS operation subset. */
export function mockAllowedWorkIds(profile: UserProfile, target: WorkTarget, group?: WorkGroup): string[] {
  const actor = mockAuthorityActor(profile)
  return MOCK_WORK_CATALOGUE.filter((work) => (!group || work.group === group)
    && hasWork(actor, work.id, target, work.write ? SYSTEM_ROUTINE_WORK.has(work.id) ? SYS_OPERATORS : SYS_ADMIN : SYS_READERS))
    .map((work) => work.id)
}

export function mockInstitutionAuthority(profile: UserProfile): InstitutionAuthority {
  if (AUTHORITY_OVERRIDES[profile.id]) return AUTHORITY_OVERRIDES[profile.id]
  if (profile.institutionAuthority) return profile.institutionAuthority
  const assignments = profile.role.startsWith('SYS_') ? [] : profile.managedOrgs.map((org) => ({
    institutionId: org.orgId, institutionName: org.orgName,
    permission: org.role === 'ORG_ADMIN'
      ? { mode: 'FULL' as const, work: [], scopes: {}, revision: 1 }
      : { mode: 'SELECTED' as const, work: [...(org.role === 'ORG_MANAGER' ? MANAGER_WORK : VIEWER_WORK)],
        scopes: { VM: { mode: 'ALL' as const, workspaceIds: [] }, LLM: { mode: 'ALL' as const, workspaceIds: [] },
          DOMAIN: { mode: 'ALL' as const, workspaceIds: [] }, GPU: { mode: 'ALL' as const, workspaceIds: [] }, WORKSPACE: { mode: 'ALL' as const, workspaceIds: [] } }, revision: 1 },
  }))
  return { state: assignments.length ? 'VALID_SOURCES' : 'VALID_EMPTY', failure: null, accountRole: profile.role,
    catalogueRevision: '4', authorityFingerprint: assignments.length ? JSON.stringify(assignments) : null,
    catalogue: profile.role === 'USER' ? [] : MOCK_WORK_CATALOGUE, assignments }
}
