import type { NotificationView } from '../api/queries'
import { uuid } from './msw/ids'

/** Literal server-style snapshots; the browser does not derive threshold facts. */
export function usageAlertFixture(axis: 'TOKEN' | 'CREDIT' = 'TOKEN'): NotificationView {
  const token = axis === 'TOKEN'
  const body = token
    ? '공유 실습 키의 일일 토큰 한도를 80% 이상 사용했어요.'
    : '공유 실습 키의 월간 금액 한도를 모두 사용했어요.'
  return { id: uuid(token ? 9920 : 9921), event: 'llm.usage.threshold',
    title: '키 사용량 알림', body,
    linkPath: `/console/llm-keys/${uuid(70)}`, importance: 'NORMAL',
    createdAt: '2026-11-01T16:01:00Z', readAt: null }
}
