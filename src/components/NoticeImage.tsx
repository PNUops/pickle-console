import { useEffect, useState } from 'react'
import { fetchAuthedBytes } from '../api/client'
import type { NoticeImageView } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { cn } from '../lib/cn'

/**
 * 공지 첨부 이미지.
 *
 * 왜 `<img src>` 하나로 끝나지 않는가: 이 API는 순수 Bearer이고 브라우저가 스스로
 * 거는 이미지 요청에는 인증 헤더가 실리지 않는다. 그래서 주소만 넘기면 서버는
 * 익명 호출로 판정하고, 로그인해야 보이는 공지(전역+로그인 대상, 모든 기관 공지)와
 * 게시 창 밖의 공지는 자격이 있는 사람에게도 404로 돌아온다. 로그인한 사람에게는
 * 바이트를 인증된 경로로 받아 objectURL로 그리고, 떠날 때 반드시 반납한다 —
 * 관리 화면처럼 드로어를 여닫는 자리에서는 반납하지 않으면 blob이 쌓인다.
 *
 * 세션이 없으면 원래대로 `<img src>`를 남긴다. 익명 방문자가 보는 것은 공개 공지의
 * 이미지뿐이라 자격이 필요 없고, 그 편이 브라우저의 평범한 캐시를 그대로 쓴다.
 */
export function NoticeImage({
  image,
  className,
}: {
  image: NoticeImageView
  className?: string
}) {
  const { status } = useAuth()
  const authenticated = status === 'authenticated'
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    let created: string | null = null
    setFailed(false)
    void (async () => {
      try {
        const response = await fetchAuthedBytes(image.url)
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        // 이미 떠난 뒤라면 만들지 않는다 — 만들고 나면 반납할 사람이 없다.
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
      setObjectUrl(null)
    }
  }, [authenticated, image.url])

  const alt = image.fileName ?? '공지 이미지'

  // 이미지 하나가 공지 본문을 지우지는 않는다 — 자리만 조용히 남긴다.
  if (failed) {
    return (
      <p
        role="note"
        className={cn(
          'flex items-center justify-center rounded border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-500',
          className,
        )}
      >
        이미지를 불러오지 못했습니다.
      </p>
    )
  }

  if (status === 'loading' || (authenticated && objectUrl == null)) {
    return (
      <span
        aria-hidden="true"
        className={cn('block min-h-24 animate-pulse rounded bg-neutral-100', className)}
      />
    )
  }

  return (
    <img
      src={authenticated ? objectUrl! : image.url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
