import type { ReactNode } from 'react'

/**
 * 랜딩 본문 섹션의 데이터(절차/기능/로드맵)와 스트로크 아이콘 모음.
 * 카피는 docs/glossary.md 표준 용어를 따른다(신청서/검토/승인·반려/전원 제어/
 * 상시 재열람 등). 기능 목록은 docs/product-spec.md의 구현 현황 기준.
 */

// 컴포넌트가 아니라 모듈 로드 시 한 번 호출되는 팩토리 — 데이터 파일이므로
// react-refresh(only-export-components) 규칙을 건드리지 않는다.
const icon = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const icons = {
  zap: (
    icon(<>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </>)
  ),
  key: (
    icon(<>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </>)
  ),
  clipboardCheck: (
    icon(<>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 13.5 2 2 4-4" />
    </>)
  ),
  terminal: (
    icon(<>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </>)
  ),
  globe: (
    icon(<>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>)
  ),
  link: (
    icon(<>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>)
  ),
  users: (
    icon(<>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>)
  ),
  eye: (
    icon(<>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>)
  ),
  shieldCheck: (
    icon(<>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>)
  ),
  clock: (
    icon(<>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>)
  ),
  fileText: (
    icon(<>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>)
  ),
  camera: (
    icon(<>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>)
  ),
  chart: (
    icon(<>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>)
  ),
  plug: (
    icon(<>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </>)
  ),
  sliders: (
    icon(<>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </>)
  ),
  calendarPlus: (
    icon(<>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M12 14v4" />
      <path d="M10 16h4" />
    </>)
  ),
  layers: (
    icon(<>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </>)
  ),
  activity: (
    icon(<>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </>)
  ),
  userCheck: (
    icon(<>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>)
  ),
} satisfies Record<string, ReactNode>

/* ─── 이용 절차 (신청 → 검토 → 승인 → 접속) ─── */

export interface Step {
  title: string
  description: string
}

export const steps: Step[] = [
  {
    title: '신청',
    description: '신청서에 사용 목적과 희망 사양(CPU·메모리·디스크)을 적어 제출합니다.',
  },
  {
    title: '검토',
    description: '기관 관리자가 자원 여유와 신청 내용을 검토합니다. 반려 시 사유가 안내됩니다.',
  },
  {
    title: '승인',
    description: '승인과 동시에 서버가 자동으로 만들어집니다. 기다리는 것 말고는 할 일이 없습니다.',
  },
  {
    title: '접속',
    description: 'SSH 키 또는 브라우저 웹 터미널로 바로 접속해 사용을 시작합니다.',
  },
]

/* ─── 신뢰 스트립 ─── */

export const trustItems: string[] = [
  '@pusan.ac.kr 이메일 인증 가입',
  '관리자 승인 기반 생성',
  '9단계 자동 프로비저닝',
  '감사 로그 영구 보존',
]

/* ─── 주요 기능 (현재 구현) ─── */

export interface Feature {
  icon: keyof typeof icons
  title: string
  description: string
}

/** 벤토 그리드의 대형 카드 2장 — 제품의 가장 강한 축. */
export const featuredCards: Feature[] = [
  {
    icon: 'zap',
    title: '승인되면, 나머지는 자동',
    description:
      '9단계 파이프라인이 클론부터 부팅 검증까지 알아서 진행합니다. 상태가 어긋나면 스스로 맞추고, 판단이 필요한 문제만 관리자에게 넘깁니다. 실패해도 서버를 함부로 지우지 않습니다.',
  },
  {
    icon: 'key',
    title: '팀 서버도, 각자의 키로',
    description:
      '팀 VM이라도 모두가 자기 SSH 키로 접속합니다. 멤버가 빠지면 접근 권한도 즉시 회수되고, 모든 세션은 실제 사용자 이름으로 기록됩니다. 키가 없다면 콘솔에서 만들어 드립니다.',
  },
]

export const features: Feature[] = [
  {
    icon: 'clipboardCheck',
    title: '승인 워크플로',
    description: '모든 신청은 검토를 거쳐 승인·반려됩니다. 반려에는 반드시 사유가 남습니다.',
  },
  {
    icon: 'terminal',
    title: '웹 터미널',
    description: 'SSH 클라이언트 없이 브라우저에서 바로 셸을 엽니다. 실습실 PC에서도 그대로.',
  },
  {
    icon: 'globe',
    title: 'HTTP(S) 퍼블리싱',
    description: '서브도메인 하나로 웹 서비스를 인터넷에 공개합니다. TLS는 자동입니다.',
  },
  {
    icon: 'link',
    title: '커스텀 도메인',
    description: '보유한 도메인도 소유권 확인을 거쳐 그대로 연결할 수 있습니다.',
  },
  {
    icon: 'users',
    title: '그룹과 역할',
    description: '개인·팀·프로젝트 그룹으로 서버를 공유하고 소유자/편집자/참여자/열람자로 권한을 나눕니다.',
  },
  {
    icon: 'eye',
    title: '초기 비밀번호 상시 재열람',
    description: '초기 계정 비밀번호는 암호화 보관되어 언제든 다시 볼 수 있고, 열람은 기록됩니다.',
  },
  {
    icon: 'clock',
    title: '만료·삭제 안전장치',
    description: '만료 전 미리 알리고, 만료돼도 삭제가 아니라 종료됩니다. 삭제에는 7일 유예가 있습니다.',
  },
  {
    icon: 'shieldCheck',
    title: '다단계 인증',
    description: '관리자 계정에는 TOTP 기반 2단계 인증이 적용됩니다.',
  },
  {
    icon: 'fileText',
    title: '감사 로그',
    description: '생성·삭제·접속·권한 변경까지, 중요한 일은 전부 영구 기록됩니다.',
  },
]

/* ─── 로드맵 (예정 기능) ─── */

export const roadmapItems: Feature[] = [
  {
    icon: 'camera',
    title: '스냅샷·복원',
    description: '실험 전에 스냅샷을 찍고, 망가지면 그 시점으로 되돌립니다.',
  },
  {
    icon: 'chart',
    title: '사용량 차트',
    description: 'CPU·메모리·디스크·네트워크 사용량을 콘솔에서 확인합니다.',
  },
  {
    icon: 'plug',
    title: '포트 공개',
    description: 'HTTP 밖의 서비스(DB, 게임 서버 등)도 외부에 공개합니다.',
  },
  {
    icon: 'sliders',
    title: '사양 변경 신청',
    description: '디스크가 부족해지면 삭제 후 재신청 대신 사양 변경을 신청합니다.',
  },
  {
    icon: 'calendarPlus',
    title: '사용 기간 연장 신청',
    description: '만료 전에 연장을 직접 신청하고 승인받습니다.',
  },
  {
    icon: 'layers',
    title: 'OS 템플릿 추가',
    description: 'Ubuntu 외 다른 배포판과 버전을 선택지로 넓혀 갑니다.',
  },
  {
    icon: 'activity',
    title: '모니터링 스택',
    description: '플랫폼 전반의 자원·상태를 시계열로 관측합니다.',
  },
  {
    icon: 'userCheck',
    title: '대학 SSO 로그인',
    description: '학교 계정 하나로 로그인하는 통합 인증을 준비합니다.',
  },
]
