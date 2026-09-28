import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Button, CommandBar, MessageBar, TD, TH } from '../ui'
import {
  BULK_SELECTION_CAP,
  pageSelectionState,
  type BulkTarget,
} from '../../lib/bulk-selection'

const CHECKBOX_CLASS = 'size-4 cursor-pointer accent-brand-fill'

/** Router state the bulk page reads its targets from. */
export interface BulkRouteState {
  targets: BulkTarget[]
}

/** Header cell that selects or clears every row of the visible page. */
export function SelectPageHeader({
  rows,
  selected,
  onToggle,
}: {
  rows: readonly BulkTarget[]
  selected: readonly BulkTarget[]
  onToggle: (on: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const state = pageSelectionState(selected, rows)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <TH className="w-10">
      <input
        ref={ref}
        type="checkbox"
        aria-label="이 페이지 전체 선택"
        className={CHECKBOX_CLASS}
        checked={state === 'all'}
        onChange={(event) => onToggle(event.target.checked)}
      />
    </TH>
  )
}

/** Row cell. Clicks stop here so a row that opens a drawer does not open it. */
export function SelectRowCell({
  target,
  checked,
  onToggle,
}: {
  target: BulkTarget
  checked: boolean
  onToggle: (on: boolean) => void
}) {
  return (
    <TD className="w-10" onClick={(event) => event.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={`${target.name} 선택`}
        className={CHECKBOX_CLASS}
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
      />
    </TD>
  )
}

/** Count, clear and the way into the bulk page. Rendered only with a selection. */
export function BulkSelectionBar({
  selected,
  capped,
  onClear,
  to,
}: {
  selected: readonly BulkTarget[]
  capped: boolean
  onClear: () => void
  to: string
}) {
  const navigate = useNavigate()
  if (selected.length === 0) return null
  const state: BulkRouteState = { targets: [...selected] }
  return (
    <div className="space-y-2">
      <CommandBar
        aria-label="선택한 항목 동작"
        primary={
          <>
            <span className="text-sm font-medium text-foreground-primary">
              {selected.length}개 선택됨
            </span>
            <Button size="sm" variant="secondary" onClick={onClear}>
              선택 해제
            </Button>
          </>
        }
        secondary={
          <Button size="sm" onClick={() => navigate(to, { state })}>
            일괄 변경
          </Button>
        }
      />
      {capped && (
        <MessageBar variant="warning">
          한 번에 {BULK_SELECTION_CAP}개까지 선택할 수 있습니다.
        </MessageBar>
      )}
    </div>
  )
}
