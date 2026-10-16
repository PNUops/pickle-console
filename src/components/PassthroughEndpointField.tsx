import { Checkbox } from './ui'
import {
  PASSTHROUGH_ENDPOINTS,
  parentGranted,
  passthroughDescription,
  passthroughLabel,
  passthroughParent,
  togglePassthrough,
  type PassthroughEndpoint,
} from '../lib/passthrough-endpoints'

/**
 * Checkboxes for the features a key is granted.
 *
 * The values are a closed set, so they are ticked rather than typed: a typo
 * in a text box would be an approval that opens nothing.
 *
 * A child row (web search under Chat) sits indented under its parent and is
 * disabled while the parent is off, because the api refuses a child without
 * its parent. Unticking the parent drops its children.
 *
 * `rows` narrows the offered rows: the request form hides the paid-only rows
 * while paid models are off, and a role that cannot change money is offered
 * Chat alone. Values outside `rows` stay in the grant untouched.
 *
 * `flat` is for a bulk add or remove, where the ticks are names to apply to
 * each key rather than a grant: no row waits for its parent. `locked` rows
 * show their state but cannot be changed.
 *
 * A `fieldset` rather than `FormField`: that label points at one control and
 * there are several here.
 */
const GRANT_DESCRIPTION =
  '체크한 기능만 열립니다. 비워 두면 하나도 열리지 않습니다. 비우면 제한이 풀리는 위 두 모델 목록과 읽는 방향이 반대입니다. Chat 밖의 기능은 유료 모델에서만 동작합니다.'

export function PassthroughEndpointField({
  label,
  value,
  onChange,
  description = GRANT_DESCRIPTION,
  rows = PASSTHROUGH_ENDPOINTS,
  flat = false,
  locked = [],
  error,
}: {
  label: string
  value: readonly PassthroughEndpoint[]
  onChange: (next: PassthroughEndpoint[]) => void
  description?: string
  rows?: readonly PassthroughEndpoint[]
  flat?: boolean
  locked?: readonly PassthroughEndpoint[]
  error?: string
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground-secondary">{label}</legend>
      {description && <p className="text-xs text-foreground-muted">{description}</p>}
      <div className="space-y-2">
        {rows.map((endpoint) => (
          <div key={endpoint} className={passthroughParent(endpoint) ? 'ml-7' : undefined}>
            <Checkbox
              checked={value.includes(endpoint)}
              disabled={
                locked.includes(endpoint) || (!flat && !parentGranted(value, endpoint))
              }
              onChange={(event) =>
                onChange(togglePassthrough(value, endpoint, event.target.checked, { flat }))
              }
              label={passthroughLabel(endpoint)}
              description={passthroughDescription(endpoint)}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </fieldset>
  )
}
