import { Alert } from './Alert'

export interface ErrorSummaryProps {
  /** 폼 전체에 해당하는 오류 문구. null이면 아무것도 그리지 않는다. */
  error: string | null
  /** 서버가 준 필드별 오류 (필드키 → 문구). */
  fieldErrors: Record<string, string>
  /** 폼 안에 표시 자리가 있는 필드 키 목록. */
  slots: string[]
  /** 자리 없는 필드를 목록으로 보여줄 때 쓸 한국어 이름. */
  fieldLabels?: Record<string, string>
}

/**
 * 폼 오류 요약 Alert — 폼에 표시 자리가 있는 필드 오류(slots)는 필드 밑에 이미
 * 보이므로 요약을 숨기고, 자리가 없는 키는 목록으로 노출해 서버 메시지가 조용히
 * 사라지지 않게 한다.
 */
export function ErrorSummary({
  error,
  fieldErrors,
  slots,
  fieldLabels = {},
}: ErrorSummaryProps) {
  if (!error) return null
  const unslotted = Object.entries(fieldErrors).filter(([field]) => !slots.includes(field))
  const hasSlotted = slots.some((key) => fieldErrors[key] != null)
  if (unslotted.length === 0 && hasSlotted) return null

  return (
    <Alert variant="danger" title={error}>
      {unslotted.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {unslotted.map(([field, message]) => (
            <li key={field}>
              {fieldLabels[field] ?? field}: {message}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
