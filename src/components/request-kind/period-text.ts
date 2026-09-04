/**
 * 신청이 요청한 사용 기간을 읽는 말.
 *
 * 종료일이 없는 것은 무기한이다. 신청 화면이 그것을 종료일 없는 기간 항목으로만
 * 받으므로, 여기서 빈 값은 "안 적었다"가 아니라 "무기한을 골랐다"는 뜻이다.
 */
export function periodText(request: {
  reqEndDate?: string | null
  periodName?: string | null
}): string {
  const until = request.reqEndDate ? `${request.reqEndDate}까지` : '무기한'
  return request.periodName ? `${request.periodName} (${until})` : until
}
