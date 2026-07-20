import type { ReactNode } from 'react'

/**
 * 랜딩 본문 섹션의 데이터(절차/기능)와 스트로크 아이콘 모음.
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
  power: (
    icon(<>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
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
  clock: (
    icon(<>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
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
    description: '승인과 동시에 서버가 자동으로 만들어지고, 완료되면 알림이 도착합니다.',
  },
  {
    title: '접속',
    description: 'SSH 키 또는 브라우저 웹 터미널로 접속합니다.',
  },
]

/* ─── 신뢰 스트립 ─── */

export const trustItems: string[] = [
  '승인 즉시 자동 생성',
  'SSH · 웹 터미널 접속',
  '무료 서브도메인 할당',
  '팀 단위 서버 공유',
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
    title: '신청하고 승인되면, 나머지는 자동',
    description:
      '서버 생성부터 준비 완료 알림까지 자동으로 이어집니다. 보통 몇 분이면 접속할 수 있습니다.',
  },
  {
    icon: 'key',
    title: '팀 서버도, 각자의 키로',
    description:
      '팀 VM이라도 각자 자기 SSH 키로 접속합니다. 멤버가 나가면 접근 권한도 바로 회수됩니다. 키가 없다면 콘솔에서 만들어 드립니다.',
  },
]

export const features: Feature[] = [
  {
    icon: 'terminal',
    title: '웹 터미널',
    description: 'SSH 클라이언트 없이 브라우저에서 바로 셸을 엽니다.',
  },
  {
    icon: 'globe',
    title: 'HTTP(S) 퍼블리싱',
    description: '서브도메인을 무료로 할당받아 웹 서비스를 인터넷에 공개합니다. TLS는 자동입니다.',
  },
  {
    icon: 'link',
    title: '커스텀 도메인',
    description: '보유한 도메인도 소유권 확인을 거쳐 그대로 연결할 수 있습니다.',
  },
  {
    icon: 'users',
    title: '그룹과 역할',
    description: '팀·프로젝트 단위로 서버를 함께 쓰고, 멤버마다 권한을 다르게 줄 수 있습니다.',
  },
  {
    icon: 'power',
    title: '전원 제어',
    description: '시작·종료·재부팅을 콘솔에서 바로 실행합니다.',
  },
  {
    icon: 'clock',
    title: '만료돼도 데이터는 안전',
    description: '만료 전에 미리 알리고, 만료돼도 삭제가 아니라 종료됩니다. 삭제에도 7일의 유예가 있습니다.',
  },
]

