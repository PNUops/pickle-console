import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchNotices, type NoticeView } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { NOTICE_POPUP_DISMISSED_KEY, NOTICE_POPUP_SEEN_KEY } from '../lib/storage-keys'
import { NoticeImage } from './NoticeImage'
import { NoticePopupCard } from './NoticePopupCard'
import { Button } from './ui'

/** 팝업 후보를 찾기 위해 훑는 공개 목록의 크기(고정 먼저 최신순 첫 페이지). */
const POPUP_SCAN_SIZE = 20

/**
 * 배치 상수. 카드 폭은 `NoticePopupCard` 의 `w-80` 과 같아야 하고, 위 여백은
 * 랜딩의 고정 헤더(h-16)와 콘솔 헤더를 둘 다 비킬 만큼이어야 한다.
 */
const CARD_WIDTH = 320
const GAP = 12
const MARGIN = 16
const TOP_INSET = 80
/** 계단 한 칸. 카드 제목 줄보다 낮아야 뒤엣것의 제목이 보인다. */
const CASCADE_STEP = 28
/** 계단이 아무리 길어져도 카드가 이만큼은 화면 안에 남는다. */
const MIN_VISIBLE_HEIGHT = 120

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

/** 한 줄에 들어가는 카드 수. 좁은 화면에서는 1이 되고 둘째부터 전부 계단이 된다. */
function cardsPerRow(viewportWidth: number): number {
  const usable = viewportWidth - MARGIN * 2 + GAP
  return Math.max(1, Math.floor(usable / (CARD_WIDTH + GAP)))
}

/**
 * i 번째 카드의 자리. 한 줄을 채울 때까지는 가로로 이어 붙이고, 그 뒤로는
 * 계단식으로 포갠다 — 줄바꿈이 아니라 겹침이다.
 *
 * **좌표는 뷰포트 안으로 clamp 한다.** 팝업 수에 상한이 없으므로 계단이
 * 길어지면 오른쪽·아래로 끝없이 나가고, clamp 가 없으면 그 공지는 화면 밖에서
 * 아무도 못 본다. clamp 에 걸린 카드들은 마지막 자리에 겹쳐 쌓이고, 맨 위를
 * 닫으면 다음이 드러나므로 전부 도달 가능하다.
 */
function slotOf(
  index: number,
  perRow: number,
  viewport: { width: number; height: number },
): CSSProperties {
  const inRow = index < perRow
  const step = inRow ? 0 : index - perRow + 1
  const rowLeft = MARGIN + (inRow ? index : perRow - 1) * (CARD_WIDTH + GAP)

  const maxLeft = Math.max(MARGIN, viewport.width - CARD_WIDTH - MARGIN)
  const maxTop = Math.max(0, viewport.height - TOP_INSET - MIN_VISIBLE_HEIGHT)

  return {
    left: Math.min(rowLeft + step * CASCADE_STEP, maxLeft),
    top: Math.min(step * CASCADE_STEP, maxTop),
  }
}

function readViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * 팝업 공지 호스트. 인증 셸(AppShell)에 달려 사용자 콘솔과 관리자 콘솔 양쪽에
 * 뜨고 — 장애 공지는 기관 관리자에게도 닿아야 한다 — 랜딩과 인증 화면에도 같은
 * 호스트가 선다. 인증에 기대는 것이 하나도 없어서 그럴 수 있다: 대상 판정은
 * 서버가 호출자의 인증 상태로 하므로 익명 방문자는 공개 공지만 받는다.
 *
 * **뜬 것은 전부 동시에 보인다.** 좌상단부터 가로로 이어 붙이고 한 줄이 차면
 * 계단식으로 포갠다. 뒤 화면은 그대로 살아 있다 — 컨테이너가 이벤트를 받지
 * 않고 카드만 받으므로, 공지를 읽는 동안에도 하던 일을 계속할 수 있다.
 *
 * 닫는 방법이 둘이고 되돌아오는 시점이 다르다:
 *
 * - 그냥 닫기(X·Esc·확인) → sessionStorage. 이 세션에만 조용하고 다음 접속에 다시 뜬다.
 * - 다시 보지 않기 → localStorage. 이 브라우저에서 계속 조용하되, 공지를 고치면
 *   updatedAt이 달라져 다시 뜬다.
 *
 * 조회가 실패해도 아무 말도 하지 않는다 — 공지 하나 때문에 콘솔에 오류가 뜨지 않는다.
 */
export function NoticePopupHost() {
  // 세션 복원이 끝나기 전에 물으면 익명으로 물은 답이 캐시에 남는다. 인증 셸
  // 안에서는 판정이 이미 서 있지만 랜딩과 인증 화면에서는 그렇지 않고, 복원은
  // 로그아웃과 달리 캐시를 비우지 않는다 — 이미 로그인한 사람이 랜딩을 새 탭에
  // 열면 익명 답이 캐시에 앉고, 콘솔로 넘어간 뒤에도 staleTime 동안 그것을 쓴다.
  // 그래서 판정을 기다리고, 키에도 실어 두 상태의 답이 섞이지 않게 한다.
  const { status } = useAuth()
  const notices = useQuery({
    queryKey: ['notices', 'popup', status === 'authenticated'],
    queryFn: () => fetchNotices({ page: 0, size: POPUP_SCAN_SIZE }),
    enabled: status !== 'loading',
    staleTime: 5 * 60_000,
  })

  // 억제 기록은 마운트 시점의 한 장면만 쓴다. StrictMode는 초기화 함수를 두 번
  // 부르므로 여기서는 읽기만 하고, 쓰기는 모두 이벤트 핸들러에서 한다.
  const [suppressed] = useState<Record<string, string>>(() => ({
    ...readSuppressionMap(localStorage, NOTICE_POPUP_DISMISSED_KEY),
    ...readSuppressionMap(sessionStorage, NOTICE_POPUP_SEEN_KEY),
  }))
  // 이번 화면에서 닫은 것들. 억제 저장소와 별개로 두는 것은, 저장소가 막힌
  // 브라우저에서도 닫기가 동작해야 하기 때문이다.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())

  const [viewport, setViewport] = useState(readViewport)
  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const content = notices.data?.content
  const queue = useMemo(() => {
    const now = Date.now()
    return (content ?? [])
      .filter((notice) => notice.popup && isActive(notice, now))
      .filter((notice) => suppressed[notice.id] !== notice.updatedAt)
  }, [content, suppressed])

  const visible = queue.filter((notice) => !closed.has(notice.id))
  if (visible.length === 0) return null

  const dismiss = (notice: NoticeView, storage: Storage, key: string) => {
    recordSuppression(storage, key, notice)
    setClosed((previous) => new Set(previous).add(notice.id))
  }

  const perRow = cardsPerRow(viewport.width)

  return createPortal(
    // 컨테이너는 뷰포트를 덮되 이벤트를 받지 않는다 — 이 한 줄이 「뒤를 막지
    // 않는다」의 전부다. 받는 것은 카드뿐이라 카드 사각형 밖은 그대로 눌린다.
    // z-40: 팝오버(z-30) 위, 모달·드로어(z-50) 아래. 공지가 떠 있어도 모달을
    // 열 수 있고 그때 모달이 위에 온다.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40"
      style={{ top: TOP_INSET }}
    >
      {visible.map((notice, index) => {
        const firstImage = notice.images[0]
        return (
          // 뒤에 오는 카드가 위에 포개진다 — DOM 순서 그대로다. 위를 닫으면
          // 아래가 드러나므로 앞으로 가져오는 조작이 따로 필요하지 않다.
          <NoticePopupCard
            key={notice.id}
            title={notice.title}
            onClose={() => dismiss(notice, sessionStorage, NOTICE_POPUP_SEEN_KEY)}
            style={slotOf(index, perRow, viewport)}
            className="pointer-events-auto absolute"
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => dismiss(notice, localStorage, NOTICE_POPUP_DISMISSED_KEY)}
                >
                  다시 보지 않기
                </Button>
                <Button onClick={() => dismiss(notice, sessionStorage, NOTICE_POPUP_SEEN_KEY)}>
                  확인
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              {firstImage && (
                <NoticeImage
                  image={firstImage}
                  className="max-h-40 w-full rounded-lg object-cover"
                />
              )}
              <p className="text-sm/6 whitespace-pre-line text-neutral-700">{notice.body}</p>
            </div>
          </NoticePopupCard>
        )
      })}
    </div>,
    document.body,
  )
}
