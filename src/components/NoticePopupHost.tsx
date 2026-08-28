import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNotices, type NoticeView } from '../api/queries'
import { NOTICE_POPUP_DISMISSED_KEY, NOTICE_POPUP_SEEN_KEY } from '../lib/storage-keys'
import { NoticeImage } from './NoticeImage'
import { Button, Modal } from './ui'

/** 한 세션에 띄우는 팝업의 상한 — 넘치면 나머지는 공지사항 목록에서 읽는다. */
const MAX_POPUPS_PER_SESSION = 3

/** 팝업 후보를 찾기 위해 훑는 공개 목록의 크기(고정 먼저 최신순 첫 페이지). */
const POPUP_SCAN_SIZE = 20

/**
 * 억제 맵 읽기 — `공지 id → updatedAt`. 저장소가 막혀 있거나 값이 깨졌으면
 * 빈 맵으로 되돌아간다. 억제 기록을 잃는 것이 공지를 못 띄우는 것보다 낫다.
 */
function readSuppressionMap(storage: Storage, key: string): Record<string, string> {
  try {
    const raw = storage.getItem(key)
    if (raw == null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function recordSuppression(storage: Storage, key: string, notice: NoticeView): void {
  try {
    const map = readSuppressionMap(storage, key)
    map[notice.id] = notice.updatedAt
    storage.setItem(key, JSON.stringify(map))
  } catch {
    // 저장소가 막힌 브라우저 — 억제만 기억하지 못한다.
  }
}

/** 게시 기간 안인가. 목록 엔드포인트가 이미 걸러 주지만, 캐시가 묵으면 어긋난다. */
function isActive(notice: NoticeView, now: number): boolean {
  if (Date.parse(notice.startsAt) > now) return false
  return notice.endsAt == null || Date.parse(notice.endsAt) > now
}

/**
 * 팝업 공지 호스트. 인증 셸(AppShell)에 달려 사용자 콘솔과 관리자 콘솔 양쪽에
 * 뜨고 — 장애 공지는 기관 관리자에게도 닿아야 한다 — 랜딩과 인증 화면에도 같은
 * 호스트가 선다. 인증에 기대는 것이 하나도 없어서 그럴 수 있다: 대상 판정은
 * 서버가 호출자의 인증 상태로 하므로 익명 방문자는 공개 공지만 받는다.
 *
 * 한 번에 하나씩, 고정 먼저 최신순으로 줄을 세워 띄운다. 닫는 방법이 둘이고
 * 되돌아오는 시점이 다르다:
 *
 * - 그냥 닫기(X·배경·Esc) → sessionStorage. 이 세션에만 조용하고 다음 접속에 다시 뜬다.
 * - 다시 보지 않기 → localStorage. 이 브라우저에서 계속 조용하되, 공지를 고치면
 *   updatedAt이 달라져 다시 뜬다.
 *
 * 조회가 실패해도 아무 말도 하지 않는다 — 공지 하나 때문에 콘솔에 오류가 뜨지 않는다.
 */
export function NoticePopupHost() {
  const notices = useQuery({
    queryKey: ['notices', 'popup'],
    queryFn: () => fetchNotices({ page: 0, size: POPUP_SCAN_SIZE }),
    staleTime: 5 * 60_000,
  })

  // 억제 기록은 마운트 시점의 한 장면만 쓴다. StrictMode는 초기화 함수를 두 번
  // 부르므로 여기서는 읽기만 하고, 쓰기는 모두 이벤트 핸들러에서 한다.
  const [suppressed] = useState<Record<string, string>>(() => ({
    ...readSuppressionMap(localStorage, NOTICE_POPUP_DISMISSED_KEY),
    ...readSuppressionMap(sessionStorage, NOTICE_POPUP_SEEN_KEY),
  }))
  const [index, setIndex] = useState(0)

  const content = notices.data?.content
  const queue = useMemo(() => {
    const now = Date.now()
    return (content ?? [])
      .filter((notice) => notice.popup && isActive(notice, now))
      .filter((notice) => suppressed[notice.id] !== notice.updatedAt)
      .slice(0, MAX_POPUPS_PER_SESSION)
  }, [content, suppressed])

  const current = queue[index]
  if (!current) return null

  const advance = (storage: Storage, key: string) => {
    recordSuppression(storage, key, current)
    setIndex((previous) => previous + 1)
  }

  const firstImage = current.images[0]

  return (
    <Modal
      open
      onClose={() => advance(sessionStorage, NOTICE_POPUP_SEEN_KEY)}
      title={current.title}
      /* Modal 의 max-w-md 가 클래스에 그대로 남는다 — cn 은 tailwind-merge 가
         아니라 단순 연결이다. Tailwind 는 같은 유틸리티를 접미사 알파벳순으로
         깔아 md 가 lg 보다 뒤에 오므로, ! 로 눌러야 lg 가 이긴다. 공지는
         제목·본문·이미지를 한 화면에 실으므로 md 는 좁다. */
      className="max-w-lg!"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => advance(localStorage, NOTICE_POPUP_DISMISSED_KEY)}
          >
            다시 보지 않기
          </Button>
          <Button onClick={() => advance(sessionStorage, NOTICE_POPUP_SEEN_KEY)}>확인</Button>
        </>
      }
    >
      <div className="space-y-4">
        {firstImage && (
          <NoticeImage image={firstImage} className="h-auto w-full rounded-lg" />
        )}
        <p className="text-sm/6 whitespace-pre-line text-neutral-700">
          {current.body}
        </p>
      </div>
    </Modal>
  )
}
