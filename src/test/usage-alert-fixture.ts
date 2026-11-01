import type { NotificationView } from '../api/queries'
import { uuid } from './msw/ids'

/** Literal server-style snapshots; the browser does not derive threshold facts. */
export function usageAlertFixture(axis: 'TOKEN' | 'CREDIT' = 'TOKEN'): NotificationView {
  const token = axis === 'TOKEN'
  const body = token ? [
    '공유 실습 키의 TOKEN 80% 도달 안내입니다.',
    '키 전체 관측 사용량: 9007199254740993 토큰',
    '관측 당시 한도: 10000000000000000 토큰',
    '기준: 일일 (Asia/Seoul)',
    '관측 기간: 2026-11-02 00:00:00 KST 이상 ~ 2026-11-03 00:00:00 KST 미만',
    '관측 시각: 2026-11-02 01:00:00.125 KST',
    '서버 평가 시각: 2026-11-02 01:01:00 KST',
    '키 전체의 관측이며 개인별 사용량이 아닙니다.',
    '토큰 기록 전송과 관측, 메일 대기로 안내가 늦을 수 있으며 현재 값과 다를 수 있습니다.',
  ] : [
    '공유 실습 키의 CREDIT 100% 도달 안내입니다.',
    '관측 잔여 한도: -0.00000000000000005 USD',
    '동일 공급자 관측 한도: 0.00000010 USD',
    '기준: 월간 (UTC)',
    '관측 기간: 2026-11-01T00:00:00Z 이상 ~ 2026-12-01T00:00:00Z 미만',
    '관측 시각: 2026-11-02 01:00:00.125 KST',
    '서버 평가 시각: 2026-11-02 01:01:00 KST',
    '관측 잔여는 실제 기간 사용액이나 BYOK 지출을 뜻하지 않습니다.',
    '키 전체의 관측이며 개인별 사용량이 아닙니다. 키 한도는 계정이나 workspace 전체 예산, 모든 호출의 가용성을 보장하지 않습니다.',
    '유료 관측 갱신(약 30분)과 메일 대기로 안내가 늦을 수 있으며 현재 값과 다를 수 있습니다.',
  ]
  return { id: uuid(token ? 9920 : 9921), event: 'llm.usage.threshold',
    title: token ? '토큰 한도 도달 안내' : '유료 키 잔여 한도 안내', body: body.join('\n'),
    linkPath: `/console/llm-keys/${uuid(70)}`, importance: 'NORMAL',
    createdAt: '2026-11-01T16:01:00Z', readAt: null }
}
