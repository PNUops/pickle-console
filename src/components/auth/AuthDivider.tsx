/** 구글 버튼과 이메일 경로 사이의 구분선. */
export function AuthDivider({ label = '또는' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-white/15" />
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="h-px flex-1 bg-white/15" />
    </div>
  )
}
