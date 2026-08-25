import { cn } from '../../lib/cn'

/** 구글 브랜드 가이드가 허용하는 문구만 쓴다. 임의 문구는 위반이다. */
const LABELS = {
  signin: 'Google 계정으로 로그인',
  signup: 'Google 계정으로 가입하기',
  continue: 'Google 계정으로 계속하기',
} as const

interface GoogleAuthButtonProps {
  onClick: () => void
  label?: keyof typeof LABELS
  className?: string
  loading?: boolean
}

/**
 * 구글 로그인 진입 버튼.
 *
 * 공용 `Button`을 쓰지 않는다. `button-style.ts`가 이 프로젝트의 틸 포커스 링과 반경을
 * 강제하는데, 틸 버튼에 구글 로고를 얹는 것은 브랜드 가이드 위반이다. 표면색은 승인된
 * light 조합(`#FFFFFF` 배경, `#1F1F1F` 텍스트, `#747775` 테두리)만 쓴다.
 *
 * 버튼 안에서 `.text-neutral-500` 같은 토큰 클래스를 쓰면 안 된다. `.auth-dark` 스코프
 * CSS가 그 토큰들을 밝은 톤으로 승격시켜 브랜드 색이 조용히 바뀐다. 임의값 hex 만 쓴다.
 *
 * `<a href>`가 아니라 `<button>`이다. 인가 주소는 서버가 state 와 nonce 를 저장한 뒤에야
 * 정해지므로 누르기 전에는 링크 대상이 없다. 가운데 클릭과 새 탭을 잃지만, 링크로 만들려면
 * 화면을 여는 사람마다 단회 소비 행을 하나씩 만들어 두어야 한다.
 */
export function GoogleAuthButton({
  onClick,
  label = 'signin',
  className,
  loading = false,
}: GoogleAuthButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-3 rounded-lg border',
        'border-[#747775] bg-white text-sm font-medium text-[#1f1f1f]',
        'transition-colors hover:bg-[#f7f8f8] active:bg-[#eef0f1]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      <GoogleMark />
      {LABELS[label]}
    </button>
  )
}

/** 공식 4색 마크. 재색상·회전·효과 금지. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
