export function noticeWindowState(startsAt: string, endsAt?: string | null, now = Date.now()): 'scheduled' | 'published' | 'ended' {
  if (Date.parse(startsAt) > now) return 'scheduled'
  if (endsAt && Date.parse(endsAt) <= now) return 'ended'
  return 'published'
}
export const NOTICE_WINDOW_LABELS = { scheduled: '게시 예정', published: '게시 중', ended: '게시 종료' } as const
