import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
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
 * 배치 상수. `CARD_WIDTH` 는 `NoticePopupCard` 의 `w-80` 과 같아야 하고,
 * `TOP_INSET` 은 랜딩과 콘솔의 헤더(h-16)를 비킨다. 줄 높이는 상수가 아니라
 * 그 줄에서 가장 높은 카드를 재서 정한다.
 */
const CARD_WIDTH = 320
const GAP = 12
const MARGIN = 16
const TOP_INSET = 80
const CASCADE_STEP = 28
const MIN_VISIBLE_HEIGHT = 120
/** 아직 재기 전 한 프레임 동안 쓰는 줄 높이. */
const ASSUMED_CARD_HEIGHT = 200

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

/** 한 줄에 들어가는 카드 수. 좁은 화면에서는 1이 되어 전부 세로로 쌓인다. */
function cardsPerRow(viewportWidth: number): number {
  const usable = viewportWidth - MARGIN * 2 + GAP
  return Math.max(1, Math.floor(usable / (CARD_WIDTH + GAP)))
}

/**
 * i 번째 자리. 줄을 채우면 다음 줄로 접고, 줄마다 오른쪽으로 들여쓴다.
 *
 * ```
 *   1  2  3  4
 *     5  6  7  8
 *       9 10 11 12
 * ```
 *
 * 줄의 세로 위치는 `rowTops` 가 준다 — 실제로 잰 카드 높이에서 나온 값이라
 * 짧은 카드만 있는 줄은 바짝 붙는다. 팝업 수에 상한이 없으므로 좌표는 뷰포트
 * 안으로 clamp 한다.
 */
function slotOf(
  index: number,
  perRow: number,
  rowTops: readonly number[],
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const row = Math.floor(index / perRow)
  const column = index % perRow

  const maxLeft = Math.max(MARGIN, viewport.width - CARD_WIDTH - MARGIN)
  const maxTop = Math.max(0, viewport.height - TOP_INSET - MIN_VISIBLE_HEIGHT)

  return {
    left: Math.min(MARGIN + column * (CARD_WIDTH + GAP) + row * CASCADE_STEP, maxLeft),
    top: Math.min(rowTops[row] ?? row * (ASSUMED_CARD_HEIGHT + GAP), maxTop),
  }
}

function readViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * 팝업 공지 호스트. 인증 셸과 랜딩·로그인·가입 화면에 각각 선다 — 로그인한
 * 독자를 요구하지 않고, 대상 판정은 서버가 호출자의 인증 상태로 한다.
 *
 * 뜬 것은 전부 동시에 보이고 배치는 {@link slotOf} 가 정한다. 닫는 방법 둘의
 * 수명이 다르다: 그냥 닫기는 sessionStorage, 다시 보지 않기는 localStorage 라
 * 공지를 고쳐 `updatedAt` 이 달라질 때까지 조용하다. 조회 실패는 침묵한다.
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
  // 저장소와 별개로 둔다 — 저장소가 막힌 브라우저에서도 닫기는 동작해야 한다.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())

  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [rowTops, setRowTops] = useState<readonly number[]>([])
  // 사용자가 끌어 옮긴 만큼. 자리에 더해진다. 끌기 중에는 리렌더보다 자주
  // 읽어야 해서 ref 로도 들고 있는다.
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})
  const movedRef = useRef(moved)
  movedRef.current = moved
  // 마지막으로 만진 카드가 위로 온다. 끌어서 다른 카드 밑으로 들어가면
  // 내려놓고 나서 손댈 수 없다.
  const [raised, setRaised] = useState<Record<string, number>>({})
  const raiseCounter = useRef(0)

  const startDrag = useCallback(
    (id: string) => (event: PointerEvent<HTMLDivElement>) => {
      const origin = { x: event.clientX, y: event.clientY }
      setRaised((previous) => {
        raiseCounter.current += 1
        return { ...previous, [id]: raiseCounter.current }
      })
      const base = movedRef.current[id] ?? { x: 0, y: 0 }
      const onMove = (moveEvent: globalThis.PointerEvent) => {
        setMoved((previous) => ({
          ...previous,
          [id]: {
            x: base.x + moveEvent.clientX - origin.x,
            y: base.y + moveEvent.clientY - origin.y,
          },
        }))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [],
  )

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

  // 목록은 고정 먼저 최신순이다. 뒤집어 놓아 왼쪽 위가 가장 오래된 것이 되고,
  // 뒤에 오는 것이 위에 포개지므로 최신과 고정 공지가 맨 위에 온다.
  const ordered = useMemo(() => queue.slice().reverse(), [queue])
  const perRow = cardsPerRow(viewport.width)

  // 자리는 닫힌 것을 뺀 목록이 아니라 `ordered` 의 색인으로 정한다. 남은
  // 카드를 당기면 사용자가 방금 읽던 카드가 손 밑에서 움직인다.
  useLayoutEffect(() => {
    const tops: number[] = []
    let y = 0
    for (let row = 0; row * perRow < ordered.length; row += 1) {
      tops.push(y)
      let tallest = 0
      for (let column = 0; column < perRow; column += 1) {
        const notice = ordered[row * perRow + column]
        const element = notice && cardRefs.current.get(notice.id)
        if (element) tallest = Math.max(tallest, element.offsetHeight)
      }
      y += (tallest || ASSUMED_CARD_HEIGHT) + GAP
    }
    setRowTops((previous) =>
      previous.length === tops.length && previous.every((value, i) => value === tops[i])
        ? previous
        : tops,
    )
  }, [ordered, perRow])

  const slotIndex = new Map(ordered.map((notice, index) => [notice.id, index]))
  const visible = ordered.filter((notice) => !closed.has(notice.id))
  if (visible.length === 0) return null

  const dismiss = (notice: NoticeView, storage: Storage, key: string) => {
    recordSuppression(storage, key, notice)
    setClosed((previous) => new Set(previous).add(notice.id))
  }

  return createPortal(
    // pointer-events-none 이 「뒤를 막지 않는다」의 전부다 — 받는 것은 카드뿐.
    // z-40 은 팝오버 위, 모달·드로어 아래(Popover.tsx 의 서열 주석).
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40"
      style={{ top: TOP_INSET }}
    >
      {visible.map((notice) => {
        const firstImage = notice.images[0]
        const slot = slotOf(slotIndex.get(notice.id) ?? 0, perRow, rowTops, viewport)
        const offset = moved[notice.id]
        return (
          <NoticePopupCard
            key={notice.id}
            ref={(element) => {
              if (element) cardRefs.current.set(notice.id, element)
              else cardRefs.current.delete(notice.id)
            }}
            title={notice.title}
            onClose={() => dismiss(notice, sessionStorage, NOTICE_POPUP_SEEN_KEY)}
            onHandlePointerDown={startDrag(notice.id)}
            style={{
              left: slot.left + (offset?.x ?? 0),
              top: slot.top + (offset?.y ?? 0),
              zIndex: raised[notice.id],
            }}
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
