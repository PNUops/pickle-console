import type { ReactNode } from 'react'
import { SSH_GATEWAY_HOST } from '../../lib/hosts'

/**
 * 랜딩 본문 섹션의 데이터(리소스/절차/기능)와 스트로크 아이콘 모음.
 * 카피는 제품 표준 용어(가상머신/LLM API 키/준비 중/신청서/검토/승인 등)를
 * 따르며, 목록은 현재 구현 현황을 기준으로 한다.
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
  // 아래 리소스 아이콘들은 콘솔 사이드바(components/nav-icons.tsx)와 같은 도형을
  // 이 파일의 팩토리로 다시 그린 것 — navIcons는 사이드바 크기(size-4.5)에 고정돼
  // 있어 엘리먼트를 직접 재사용하지 못한다. 도형이 바뀌면 양쪽을 같이 고친다.
  server: (
    icon(<>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01" />
      <path d="M6 17.5h.01" />
    </>)
  ),
  chip: (
    icon(<>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9.5 2v4M14.5 2v4M9.5 18v4M14.5 18v4" />
      <path d="M2 9.5h4M2 14.5h4M18 9.5h4M18 14.5h4" />
    </>)
  ),
  container: (
    icon(<>
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z" />
      <path d="M3.5 7 12 11.5 20.5 7" />
      <path d="M12 11.5v10" />
    </>)
  ),
  registry: (
    icon(<>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>)
  ),
  database: (
    icon(<>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.66 3.58 3 8 3s8-1.34 8-3v-13" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </>)
  ),
  gpu: (
    icon(<>
      <rect x="2" y="6.5" width="20" height="11" rx="2" />
      <circle cx="8" cy="12" r="2.5" />
      <path d="M13.5 10h5M13.5 14h5" />
      <path d="M6 17.5v3M18 17.5v3" />
    </>)
  ),
} satisfies Record<string, ReactNode>

/* ─── 리소스 종류 (서비스 중 + 준비 중) ─── */

export interface ResourceType {
  icon: keyof typeof icons
  title: string
  status: 'live' | 'planned'
  badge?: string
  description?: string
  meta?: string
}

/**
 * 라인업은 콘솔 사이드바(layouts/ConsoleLayout.tsx)와 같게 유지한다 — 사이드바의
 * 준비 중 항목이 바뀌면 여기도 같이 바뀐다(ResourceShowcase.test.tsx가 7종을 고정
 * 단언한다). 사이드바는 폭 때문에 '컨테이너 레지스트리'를 '레지스트리'로 줄이지만
 * 여기는 정식 명칭을 쓴다.
 */
export const resourceTypes: ResourceType[] = [
  {
    icon: 'server',
    title: '가상머신',
    status: 'live',
    description:
      '신청한 사양대로 만들어지는 리눅스 서버입니다. SSH와 웹 터미널로 접속하고, 무료 서브도메인으로 웹 서비스를 공개합니다.',
    meta: `ssh <vm-slug>@${SSH_GATEWAY_HOST}`,
  },
  {
    icon: 'chip',
    title: 'LLM API 키',
    status: 'live',
    badge: 'Beta',
    description:
      'OpenAI 호환 API를 호출하는 키를 콘솔에서 발급합니다. 키마다 요청과 토큰 한도가 있고, 사용량을 콘솔에서 확인합니다.',
    meta: 'POST /v1/chat/completions',
  },
  { icon: 'container', title: '컨테이너', status: 'planned' },
  { icon: 'registry', title: '컨테이너 레지스트리', status: 'planned' },
  { icon: 'database', title: '데이터베이스', status: 'planned' },
  { icon: 'gpu', title: 'GPU', status: 'planned' },
  { icon: 'globe', title: '도메인', status: 'planned' },
]

/* ─── 이용 절차 (신청 → 검토 → 승인 → 사용) ─── */

export interface Step {
  title: string
  description: string
}

export const steps: Step[] = [
  {
    title: '신청',
    description: '쓰려는 리소스 종류를 골라 사용 목적과 사양을 적어 제출합니다.',
  },
  {
    title: '검토',
    description: '기관 관리자가 리소스 여유와 신청 내용을 검토합니다. 반려 시 사유가 안내됩니다.',
  },
  {
    title: '승인',
    description: '승인과 동시에 리소스가 자동으로 준비되고, 완료되면 알림이 도착합니다.',
  },
  {
    title: '사용',
    description: '가상머신은 SSH나 웹 터미널로 접속하고, LLM API 키는 발급된 키로 바로 호출합니다.',
  },
]

/* ─── 신뢰 스트립 ─── */

export const trustItems: string[] = [
  '승인 즉시 자동 준비',
  'SSH와 웹 터미널 접속',
  'OpenAI 호환 LLM API',
  '무료 서브도메인 할당',
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
      '리소스 준비부터 완료 알림까지 자동으로 이어집니다. 가상머신도 보통 몇 분이면 접속할 수 있습니다.',
  },
  {
    icon: 'chip',
    title: 'LLM API 키도 콘솔에서',
    description:
      '발급한 키를 OpenAI 호환 SDK에 그대로 넣어 씁니다. 키마다 요청과 토큰 한도가 있고, 사용량도 콘솔에서 확인합니다.',
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
    title: '워크스페이스와 역할',
    description:
      '팀과 프로젝트 단위로 리소스를 함께 쓰고, 멤버마다 권한을 다르게 줄 수 있습니다. 팀 가상머신이라도 각자 자기 SSH 키로 접속합니다.',
  },
  {
    icon: 'power',
    title: '전원 제어',
    description: '시작과 종료, 재부팅을 콘솔에서 바로 실행합니다.',
  },
  {
    icon: 'clock',
    title: '만료돼도 데이터는 안전',
    description: '만료 전에 미리 알리고, 만료돼도 삭제가 아니라 종료됩니다. 삭제에도 7일의 유예가 있습니다.',
  },
]
