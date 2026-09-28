import { Alert, Checkbox, Spinner } from '../ui'
import type { RecipientCandidate } from './recipients'

export function RecipientPicker({
  candidates,
  loading,
  error,
  selected,
  onChange,
  required,
  description,
  fieldError,
}: {
  candidates: RecipientCandidate[]
  loading: boolean
  error: string | null
  selected: readonly string[]
  onChange: (next: string[]) => void
  required: boolean
  description?: string
  fieldError?: string
}) {
  const chosen = new Set(selected)
  const allChosen = candidates.length > 0 && candidates.every((candidate) => chosen.has(candidate.key))
  const toggle = (key: string, on: boolean) =>
    onChange(on ? [...selected.filter((k) => k !== key), key] : selected.filter((k) => k !== key))

  return (
    <fieldset className="space-y-2" aria-invalid={fieldError ? true : undefined}>
      <legend className="text-sm font-medium text-foreground-primary">
        대상자
        {required && <span className="ml-0.5 text-danger-600" aria-hidden="true">*</span>}
      </legend>
      {description && <p className="text-xs text-foreground-muted">{description}</p>}
      {fieldError && <p className="text-xs text-danger-700">{fieldError}</p>}
      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner label="대상자 불러오는 중" />
        </div>
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-foreground-muted">고를 수 있는 사람이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          <Checkbox
            label={`전체 선택 (${candidates.length}명)`}
            checked={allChosen}
            onChange={(event) =>
              onChange(event.target.checked ? candidates.map((candidate) => candidate.key) : [])
            }
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {candidates.map((candidate) => (
              <Checkbox
                key={candidate.key}
                label={candidate.label}
                description={candidate.description ?? undefined}
                checked={chosen.has(candidate.key)}
                onChange={(event) => toggle(candidate.key, event.target.checked)}
              />
            ))}
          </div>
        </div>
      )}
    </fieldset>
  )
}
