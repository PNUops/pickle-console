/**
 * 수신자가 다른 문장 셋.
 *
 * 사용량 카드는 소유자와 관리자가 같은 컴포넌트를 쓴다. 숫자와 차트와 표는 같아야
 * 하고(두 화면이 다른 답을 내면 관리자가 받고 싶지 않은 문의가 생긴다), 그런데
 * **문장 일부는 소유자에게 말하고 있어서 관리자 화면에서는 틀린 말이 된다.**
 *
 * - 「개요 탭에서 키를 발급하면」 — 관리자 화면에는 그 카드가 없다.
 * - 「한도 상향을 신청해 주세요」 — 관리자는 신청하지 않는다. 바로 그 화면의
 *   명령 막대에 한도를 바꾸는 버튼이 있다.
 *
 * 값이 늘면 컴파일이 깨지도록 `Record<UsageAudience, …>`로 둔다 —
 * `passthrough-endpoints.ts`와 같은 이유이고, 수신자가 하나 늘었을 때 문구가
 * 조용히 빠지지 않게 하는 것이 목적이다.
 */
export type UsageAudience = 'owner' | 'admin'

export interface KeyUsageCopy {
  /** 발급 전 키에 무엇을 하면 되는지. */
  unissuedHint: string
  /** 한도 거부가 있을 때 다음 행동. */
  rateLimitedAction: string
}

export const KEY_USAGE_COPY: Record<UsageAudience, KeyUsageCopy> = {
  owner: {
    unissuedHint: '개요 탭에서 키를 발급하면 그때부터 쌓입니다.',
    rateLimitedAction: '계속 거부된다면 한도 상향을 신청해 주세요.',
  },
  admin: {
    unissuedHint: '신청자가 키를 발급하면 그때부터 쌓입니다.',
    rateLimitedAction: '한도를 올릴지는 위 「한도 변경」에서 정합니다.',
  },
}
