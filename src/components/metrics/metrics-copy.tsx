import type { ReactNode } from 'react'

/**
 * 수신자가 다른 문장 둘.
 *
 * 사용량 껍데기는 VM 상세의 모니터링 탭(소유자)과 관리자 노드 화면이 함께 쓴다.
 * 숫자와 차트는 같아야 하지만, **값을 읽을 수 없다는 사실을 어떻게 말하는지는
 * 갈린다** — 관리자에게는 무엇이 응답하지 않는지가 다음 행동을 정하는 정보이고,
 * 사용자 화면에 하이퍼바이저를 쓰는 것은 내부 어휘다(Screen copy 규칙 3).
 *
 * `key-usage-copy.ts`와 같은 이유로 `Record`다. 수신자가 하나 늘면 컴파일이
 * 깨져서 문구가 조용히 빠지지 않는다.
 */
export type MetricsAudience = 'owner' | 'admin'

export interface MetricsCopy {
  /** 그릴 자료가 아예 없고 읽지도 못할 때. */
  unreadable: string
  /** 이미 받아 둔 그림은 있고 새로 읽지 못할 때 — 언제 읽은 값인지를 함께 말한다. */
  unreadableStale: (moment: ReactNode) => ReactNode
}

export const METRICS_COPY: Record<MetricsAudience, MetricsCopy> = {
  owner: {
    unreadable: '지금은 사용량을 읽을 수 없습니다. 다시 시도하는 중입니다.',
    unreadableStale: (moment) => (
      <>지금은 사용량을 읽을 수 없어 {moment} 읽은 값으로 표시합니다. 다시 시도하는 중입니다.</>
    ),
  },
  admin: {
    unreadable: '하이퍼바이저가 응답하지 않아 사용량을 표시할 수 없습니다. 다시 시도하는 중입니다.',
    unreadableStale: (moment) => (
      <>하이퍼바이저가 응답하지 않아 {moment} 읽은 값으로 표시합니다. 다시 시도하는 중입니다.</>
    ),
  },
}
