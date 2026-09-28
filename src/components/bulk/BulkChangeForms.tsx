import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminUsers, type AdminBulkListOp } from '../../api/queries'
import type { UserRole } from '../../auth/auth-context'
import {
  ACCESS_ACTION_LABELS,
  ACCESS_ROLES,
  LIMIT_FIELD_LABELS,
  LIST_OP_LABELS,
  POWER_ACTIONS,
  POWER_ACTION_LABELS,
  STATUS_ACTION_LABELS,
  clearingLists,
  limitFieldsFor,
  statusActionsFor,
  type BulkDraft,
  type BulkFamily,
  type LimitFieldKey,
} from '../../lib/bulk-change'
import { isShortNotice, kstDateString, todayKstDate } from '../../lib/format'
import {
  CREDIT_LIMIT_RESET_LABELS,
  LLM_KEY_RESOURCE_ROLE_HINTS,
  RESOURCE_ROLE_HINTS,
  RESOURCE_ROLE_LABELS,
} from '../../lib/labels'
import { useDebouncedValue } from '../../lib/use-debounced-value'
import { CreditModelRulesField } from '../CreditModelRulesField'
import { LimitField } from '../llm-key/LimitField'
import { PassthroughEndpointField } from '../PassthroughEndpointField'
import {
  Button,
  CardRadioGroup,
  Checkbox,
  FormField,
  Input,
  MessageBar,
  Select,
  Spinner,
  Textarea,
} from '../ui'

type Errors = Record<string, string>

const LIMITS = 'change.llmKeyLimits'

// Replacing reads like the single key's editor, so it keeps that field's own
// description; adding and removing touch only the named entries.
const MODEL_RULE_DESCRIPTIONS: Record<AdminBulkListOp, string | undefined> = {
  REPLACE: undefined,
  ADD: '한 줄에 하나씩, 허용 목록에 넣을 모델은 +, 차단 목록에 넣을 모델은 -를 붙입니다. 적은 줄만 각 키의 목록에 더합니다.',
  REMOVE: '한 줄에 하나씩, 허용 목록에서 뺄 모델은 +, 차단 목록에서 뺄 모델은 -를 붙입니다. 적은 줄만 각 키의 목록에서 뺍니다.',
}

const PASSTHROUGH_DESCRIPTIONS: Record<AdminBulkListOp, string | undefined> = {
  REPLACE: undefined,
  ADD: '체크한 기능을 각 키에 더합니다.',
  REMOVE: '체크한 기능을 각 키에서 뺍니다.',
}

function ListOpSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: AdminBulkListOp
  onChange: (op: AdminBulkListOp) => void
}) {
  return (
    <FormField label={label} className="w-full sm:w-40">
      <Select value={value} onChange={(event) => onChange(event.target.value as AdminBulkListOp)}>
        {(['ADD', 'REMOVE', 'REPLACE'] as const).map((op) => (
          <option key={op} value={op}>
            {LIST_OP_LABELS[op]}
          </option>
        ))}
      </Select>
    </FormField>
  )
}

export function LimitsForm({
  role,
  draft,
  onChange,
  errors,
}: {
  role: UserRole
  draft: BulkDraft['limits']
  onChange: (next: BulkDraft['limits']) => void
  errors: Errors
}) {
  const fields = limitFieldsFor(role)
  const chosen = new Set(draft.chosen)
  const set = <K extends keyof BulkDraft['limits']>(key: K, value: BulkDraft['limits'][K]) =>
    onChange({ ...draft, [key]: value })
  const toggle = (field: LimitFieldKey, on: boolean) =>
    set('chosen', on ? [...draft.chosen.filter((f) => f !== field), field] : draft.chosen.filter((f) => f !== field))
  const clearing = clearingLists(draft)
  const error = (field: string) => errors[`${LIMITS}.${field}`]

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground-primary">바꿀 항목</legend>
        {errors[LIMITS] && (
          <p role="alert" className="text-sm text-danger-600">
            {errors[LIMITS]}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <Checkbox
              key={field}
              label={LIMIT_FIELD_LABELS[field]}
              checked={chosen.has(field)}
              onChange={(event) => toggle(field, event.target.checked)}
            />
          ))}
        </div>
      </fieldset>

      {(['rpm', 'tpm', 'dailyTokens', 'concurrency'] as const).some((f) => chosen.has(f)) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(['rpm', 'tpm', 'dailyTokens', 'concurrency'] as const)
            .filter((field) => chosen.has(field))
            .map((field) => (
              <LimitField
                key={field}
                label={LIMIT_FIELD_LABELS[field]}
                min={field === 'dailyTokens' ? 0 : 1}
                value={draft[field]}
                onChange={(value) => set(field, value)}
                error={error(field)}
              />
            ))}
        </div>
      )}

      {(chosen.has('creditLimit') || chosen.has('creditLimitReset')) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {chosen.has('creditLimit') && (
            <FormField label={LIMIT_FIELD_LABELS.creditLimit} required error={error('creditLimit')}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={draft.creditLimit}
                onChange={(event) => set('creditLimit', event.target.value)}
              />
            </FormField>
          )}
          {chosen.has('creditLimitReset') && (
            <FormField label={LIMIT_FIELD_LABELS.creditLimitReset} error={error('creditLimitReset')}>
              <Select
                value={draft.creditLimitReset}
                onChange={(event) => set('creditLimitReset', event.target.value)}
              >
                <option value="">리셋 없음</option>
                {Object.entries(CREDIT_LIMIT_RESET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>
      )}

      {chosen.has('creditModels') && (
        <div className="space-y-3">
          <ListOpSelect
            label="유료 모델 목록 변경 방식"
            value={draft.modelsOp}
            onChange={(op) => set('modelsOp', op)}
          />
          <CreditModelRulesField
            value={draft.modelRules}
            onChange={(value) => set('modelRules', value)}
            error={error('creditModels')}
            description={MODEL_RULE_DESCRIPTIONS[draft.modelsOp]}
          />
          {clearing.models && (
            <MessageBar variant="warning">
              선택한 모든 키의 유료 모델 허용·차단 목록이 비워집니다.
            </MessageBar>
          )}
        </div>
      )}

      {chosen.has('passthroughEndpoints') && (
        <div className="space-y-3">
          <ListOpSelect
            label="기능 권한 변경 방식"
            value={draft.passthroughOp}
            onChange={(op) => set('passthroughOp', op)}
          />
          <PassthroughEndpointField
            label={`${LIST_OP_LABELS[draft.passthroughOp]}할 기능 권한`}
            value={draft.passthrough}
            onChange={(next) => set('passthrough', next)}
            error={error('passthroughEndpoints')}
            description={PASSTHROUGH_DESCRIPTIONS[draft.passthroughOp]}
          />
          {clearing.passthrough && (
            <MessageBar variant="warning" title="모든 기능 권한이 회수됩니다">
              선택한 모든 키에서 이미지 생성과 임베딩을 쓸 수 없게 됩니다.
            </MessageBar>
          )}
        </div>
      )}
    </div>
  )
}

export function StatusForm({
  role,
  draft,
  onChange,
  errors,
}: {
  role: UserRole
  draft: BulkDraft['status']
  onChange: (next: BulkDraft['status']) => void
  errors: Errors
}) {
  return (
    <div className="space-y-4">
      <CardRadioGroup
        legend="바꿀 상태"
        value={draft.action}
        onChange={(action) => onChange({ ...draft, action })}
        options={statusActionsFor(role).map((action) => ({
          value: action,
          title: STATUS_ACTION_LABELS[action],
        }))}
        columns={3}
      />
      {draft.action === 'SUSPEND' && (
        <FormField label="정지 사유" required error={errors['change.llmKeyStatus.reason']}>
          <Input
            value={draft.reason}
            onChange={(event) => onChange({ ...draft, reason: event.target.value })}
          />
        </FormField>
      )}
    </div>
  )
}

export function DateForm({
  label,
  value,
  onChange,
  error,
  description,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  description?: string
}) {
  return (
    <FormField
      label={label}
      required
      error={error}
      description={description}
      className="w-full sm:w-56"
    >
      <Input
        type="date"
        min={todayKstDate()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}

export function PeriodForm({
  draft,
  onChange,
  errors,
}: {
  draft: BulkDraft['period']
  onChange: (next: BulkDraft['period']) => void
  errors: Errors
}) {
  return (
    <div className="space-y-4">
      <CardRadioGroup
        legend="종료일"
        value={draft.mode}
        onChange={(mode) => onChange({ ...draft, mode })}
        options={[
          { value: 'date', title: '종료일 지정' },
          { value: 'clear', title: '종료일 없음' },
        ]}
        columns={2}
      />
      {draft.mode === 'date' && (
        <DateForm
          label="새 종료일"
          value={draft.endDate}
          onChange={(endDate) => onChange({ ...draft, endDate })}
          error={errors['change.vmPeriod.endDate']}
        />
      )}
    </div>
  )
}

export function PowerForm({
  draft,
  onChange,
}: {
  draft: BulkDraft['power']
  onChange: (next: BulkDraft['power']) => void
}) {
  return (
    <CardRadioGroup
      legend="전원 동작"
      value={draft.action}
      onChange={(action) => onChange({ action })}
      options={POWER_ACTIONS.map((action) => ({ value: action, title: POWER_ACTION_LABELS[action] }))}
      columns={2}
    />
  )
}

/** The earliest `datetime-local` value the schedule accepts: now, in KST. */
function nowKstLocal(): string {
  const now = new Date()
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  return `${kstDateString(now)}T${time}`
}

export function DeletionForm({
  draft,
  onChange,
  errors,
}: {
  draft: BulkDraft['deletion']
  onChange: (next: BulkDraft['deletion']) => void
  errors: Errors
}) {
  const scheduleDate = draft.scheduledFor.slice(0, 10)
  return (
    <div className="space-y-4">
      <CardRadioGroup
        legend="삭제"
        value={draft.action}
        onChange={(action) => onChange({ ...draft, action })}
        options={[
          { value: 'SCHEDULE', title: '삭제 예약' },
          { value: 'CANCEL', title: '예약 취소' },
        ]}
        columns={2}
      />
      {draft.action === 'SCHEDULE' && (
        <>
          <FormField
            label="삭제 예정 시각"
            required
            error={errors['change.vmDeletion.scheduledFor']}
            className="w-full sm:w-64"
          >
            <Input
              type="datetime-local"
              min={nowKstLocal()}
              value={draft.scheduledFor}
              onChange={(event) => onChange({ ...draft, scheduledFor: event.target.value })}
            />
          </FormField>
          {scheduleDate && isShortNotice(scheduleDate) && (
            <MessageBar variant="warning">
              권장 통보 기간(7일)보다 이른 삭제 예정 시각입니다.
            </MessageBar>
          )}
          <FormField label="삭제 사유" required error={errors['change.vmDeletion.reason']}>
            <Textarea
              rows={2}
              value={draft.reason}
              onChange={(event) => onChange({ ...draft, reason: event.target.value })}
              placeholder="사용자 통보 메일에 그대로 포함됩니다."
            />
          </FormField>
        </>
      )}
    </div>
  )
}

export function AccessForm({
  family,
  orgId,
  draft,
  onChange,
  errors,
}: {
  family: BulkFamily
  orgId: string | undefined
  draft: BulkDraft['access']
  onChange: (next: BulkDraft['access']) => void
  errors: Errors
}) {
  const [queryInput, setQueryInput] = useState('')
  const q = useDebouncedValue(queryInput).trim()
  const users = useQuery({
    queryKey: ['admin', 'users', { q, orgId: orgId ?? null, for: 'bulk-access' }],
    queryFn: () => fetchAdminUsers({ q, orgId, status: 'ACTIVE', size: 10 }),
    enabled: q.length > 0 && draft.userId === '',
  })
  const hints = family === 'llm-keys' ? LLM_KEY_RESOURCE_ROLE_HINTS : RESOURCE_ROLE_HINTS

  return (
    <div className="space-y-4">
      {draft.userId ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-foreground-muted">대상 사용자</span>
          <span className="text-sm font-medium text-foreground-primary">{draft.userLabel}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...draft, userId: '', userLabel: '' })}
          >
            다시 고르기
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <FormField label="대상 사용자" required error={errors['change.access.userId']}>
            <Input
              type="search"
              placeholder="이름·이메일 검색"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
            />
          </FormField>
          {users.isFetching && <Spinner label="사용자 검색 중" />}
          {users.isError && <MessageBar variant="danger">{users.error.message}</MessageBar>}
          {users.isSuccess && users.data.content.length === 0 && (
            <p className="text-sm text-foreground-muted">찾은 사용자가 없습니다.</p>
          )}
          {users.isSuccess && users.data.content.length > 0 && (
            <ul aria-label="검색된 사용자" className="divide-y divide-stroke-subtle rounded-control border border-stroke-subtle">
              {users.data.content.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus-ring"
                    onClick={() =>
                      onChange({ ...draft, userId: user.id, userLabel: `${user.name} (${user.email})` })
                    }
                  >
                    <span className="font-medium text-foreground-primary">{user.name}</span>{' '}
                    <span className="text-foreground-muted">{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <CardRadioGroup
        legend="접근 권한 변경"
        value={draft.action}
        onChange={(action) => onChange({ ...draft, action })}
        options={(['GRANT', 'CHANGE', 'REVOKE'] as const).map((action) => ({
          value: action,
          title: ACCESS_ACTION_LABELS[action],
        }))}
        columns={3}
      />
      {draft.action !== 'REVOKE' && (
        <FormField
          label="등급"
          required
          error={errors['change.access.role']}
          description={hints[draft.role]}
          className="w-full sm:w-56"
        >
          <Select
            value={draft.role}
            onChange={(event) =>
              onChange({ ...draft, role: event.target.value as BulkDraft['access']['role'] })
            }
          >
            {ACCESS_ROLES.map((role) => (
              <option key={role} value={role}>
                {RESOURCE_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </FormField>
      )}
    </div>
  )
}
