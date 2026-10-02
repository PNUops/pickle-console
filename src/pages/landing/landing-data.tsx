import type { ReactNode } from 'react'

/**
 * Shared resource lineup, application steps, and stroke icons for the landing page.
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
  storage: (
    icon(<>
      <rect x="2.5" y="3.5" width="19" height="5" rx="1.5" />
      <path d="M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10" />
      <path d="M10 12.5h4" />
    </>)
  ),
} satisfies Record<string, ReactNode>

/* Resource lineup */

interface ResourceIdentity {
  icon: keyof typeof icons
  title: string
}

export type ResourceType = ResourceIdentity & (
  | {
    status: 'live'
    description: string
    details: string[]
    guide: string
    guideLabel: string
  }
  | { status: 'planned' }
)

/**
 * Names and display order match the console sidebar. Keep live cards and planned
 * items in one list so a resource launch cannot leave a separate list behind.
 */
export const resourceTypes: ResourceType[] = [
  {
    icon: 'server',
    title: '가상머신',
    status: 'live',
    description: '리눅스 서버를 신청하고, 접속과 서비스 공개를 콘솔에서 관리합니다.',
    details: [
      'SSH와 웹 터미널 접속',
      '서브도메인과 커스텀 도메인, 자동 TLS',
      '포트포워딩과 시작, 종료, 재부팅',
    ],
    guide: '/docs/vm/request',
    guideLabel: '가상머신 이용 가이드',
  },
  {
    icon: 'chip',
    title: 'LLM API 키',
    status: 'live',
    description: 'OpenAI 호환 API로 모델을 호출하고, 키와 사용량을 콘솔에서 관리합니다.',
    details: [
      '자체 서빙 모델의 일일 토큰 한도',
      '유료 모델의 승인된 금액 한도',
      '콘솔에서 키 발급과 사용량 조회',
    ],
    guide: '/docs/llm/start',
    guideLabel: 'LLM API 이용 가이드',
  },
  {
    icon: 'globe',
    title: '도메인',
    status: 'live',
    description: 'VM 없이 이름을 발급받아 외부 서버나 호스팅 서비스에 연결합니다.',
    details: [
      'A, AAAA, CNAME, TXT 레코드 편집',
      '워크스페이스에서 이름과 사용 기한 관리',
      '변경한 레코드의 적용 상태 확인',
    ],
    guide: '/docs/network/domains',
    guideLabel: '도메인 이용 가이드',
  },
  { icon: 'container', title: '컨테이너', status: 'planned' },
  { icon: 'registry', title: '컨테이너 레지스트리', status: 'planned' },
  { icon: 'database', title: '데이터베이스', status: 'planned' },
  { icon: 'storage', title: '오브젝트 스토리지', status: 'planned' },
  { icon: 'gpu', title: 'GPU', status: 'planned' },
  { icon: 'link', title: '단축 링크', status: 'planned' },
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
