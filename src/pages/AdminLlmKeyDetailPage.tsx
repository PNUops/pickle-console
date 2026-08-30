import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import {
  fetchAdminLlmKey,
  replaceAdminLlmKeyLimits,
  resumeAdminLlmKey,
  revokeLlmKey,
  suspendAdminLlmKey,
  type AdminLlmKeyDetail,
  type AdminLlmKeyLimits,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import {
  canAdminRevokeLlmKey,
  canManageLlmCredit,
  canOperateLlmKey,
} from '../auth/permissions'
import {
  Button,
  CommandBar,
  ConfirmNameModal,
  DescriptionList,
  FormField,
  Input,
  LlmKeyStatusBadge,
  LoadingBlock,
  MessageBar,
  Modal,
  PageHeader,
  Select,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { CREDIT_LIMIT_RESET_LABELS } from '../lib/labels'
import { adminPaths } from '../lib/paths'
import { effectiveLlmKeyStatus, type LlmApiKeyStatus } from '../lib/status'
import { useAdminScope } from '../lib/use-admin-scope'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

const EDITABLE_STATUSES = new Set<LlmApiKeyStatus>(['PENDING', 'ACTIVE', 'SUSPENDED'])
const REVOKABLE_STATUSES = new Set<LlmApiKeyStatus>(['PENDING', 'ACTIVE', 'SUSPENDED'])

function limitText(value: number | null | undefined): string {
  return value == null ? '서비스 기본값' : value.toLocaleString('ko-KR')
}

function creditText(value: number): string {
  return value === 0 ? '미부여' : `$${value.toLocaleString('ko-KR')}`
}

export function AdminLlmKeyDetailPage() {
  const { keyId: keyIdParam } = useParams()
  const keyId = keyIdParam ?? ''
  const idValid = isUuid(keyId)
  const { user } = useAuth()
  const scope = useAdminScope()
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const queryClient = useQueryClient()
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [resumeOpen, setResumeOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const detail = useQuery({
    queryKey: ['admin', 'llm-keys', 'detail', { keyId, orgId: scope.activeOrgId ?? null }],
    queryFn: () => fetchAdminLlmKey(keyId),
    enabled: idValid,
  })

  const revoke = useMutation({
    mutationFn: () => revokeLlmKey(keyId),
    onSuccess: async () => {
      setRevokeOpen(false)
      setError(null)
      setNotice('LLM API 키를 폐기했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'llm-keys'] })
    },
    onError: (failure) => {
      setRevokeOpen(false)
      setError(toApiError(failure, 'LLM API 키를 폐기하지 못했습니다.').message)
    },
  })

  if (!idValid) return <MessageBar variant="danger">{INVALID_ID_MESSAGE}</MessageBar>
  if (detail.isPending) return <LoadingBlock label="LLM API 키 상세 불러오는 중" />
  if (detail.isError) return <MessageBar variant="danger">{detail.error.message}</MessageBar>
  if (scope.activeOrgId != null && detail.data.orgId !== scope.activeOrgId) {
    return <MessageBar variant="danger">현재 관리 범위에서 이 LLM API 키를 찾을 수 없습니다.</MessageBar>
  }

  const key = detail.data
  const status = effectiveLlmKeyStatus(key.status, key.expiresAt)
  const canOperate = !!role && canOperateLlmKey(role)
  const canEditLimits = canOperate && EDITABLE_STATUSES.has(status)
  const canEditCredit = !!role && canManageLlmCredit(role)
  const canSuspend = canOperate && status === 'ACTIVE'
  const canResume = canOperate && status === 'SUSPENDED'
  const canRevoke = !!role && canAdminRevokeLlmKey(role) && REVOKABLE_STATUSES.has(status)
  const hasActions = canEditLimits || canSuspend || canResume || canRevoke

  const updateCached = (updated: AdminLlmKeyDetail, message: string) => {
    queryClient.setQueryData(
      ['admin', 'llm-keys', 'detail', { keyId, orgId: scope.activeOrgId ?? null }],
      updated,
    )
    void queryClient.invalidateQueries({ queryKey: ['admin', 'llm-keys'] })
    setError(null)
    setNotice(message)
  }

  return (
    <div className="space-y-5">
      <Link
        to={adminPaths.llmKeys(scope.activeOrgId)}
        className="text-sm text-brand-foreground hover:underline"
      >
        ← LLM API 키
      </Link>
      <PageHeader
        eyebrow={`${key.orgName} · ${key.workspaceName}`}
        title={key.name}
        description={key.purpose ?? '용도가 기록되지 않았습니다.'}
        actions={<LlmKeyStatusBadge status={status} />}
      />

      {hasActions && (
        <CommandBar
          aria-label="LLM API 키 동작"
          primary={
            <>
              {canEditLimits && (
                <Button size="sm" variant="secondary" onClick={() => setLimitsOpen(true)}>
                  한도 변경
                </Button>
              )}
              {canSuspend && (
                <Button size="sm" variant="secondary" onClick={() => setSuspendOpen(true)}>
                  키 정지
                </Button>
              )}
              {canResume && (
                <Button size="sm" variant="secondary" onClick={() => setResumeOpen(true)}>
                  정지 해제
                </Button>
              )}
            </>
          }
          secondary={
            canRevoke ? (
              <Button size="sm" variant="danger" onClick={() => setRevokeOpen(true)}>
                키 폐기
              </Button>
            ) : undefined
          }
        />
      )}

      {notice && <MessageBar variant="success">{notice}</MessageBar>}
      {error && <MessageBar variant="danger">{error}</MessageBar>}

      <DescriptionList
        columns={3}
        items={[
          { term: '기관', description: key.orgName },
          { term: '워크스페이스', description: key.workspaceName },
          { term: '생성일', description: formatDateTime(key.createdAt) },
          { term: '마지막 사용', description: key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '사용 기록 없음' },
          { term: '만료', description: key.expiresAt ? formatDateTime(key.expiresAt) : '만료 없음' },
          { term: '금액 축 연결', description: key.creditAxisConnected ? '연결됨' : '연결되지 않음' },
        ]}
      />

      <section className="space-y-3 rounded-panel border border-stroke-subtle bg-surface-card p-4">
        <h2 className="type-section-title">현재 한도</h2>
        <DescriptionList
          columns={3}
          items={[
            { term: 'RPM', description: limitText(key.rpm) },
            { term: 'TPM', description: limitText(key.tpm) },
            { term: '일일 토큰', description: limitText(key.dailyTokens) },
            { term: '동시 요청', description: limitText(key.concurrency) },
            { term: '금액 한도', description: creditText(key.creditLimit) },
            {
              term: '금액 리셋',
              description: key.creditLimitReset
                ? CREDIT_LIMIT_RESET_LABELS[key.creditLimitReset]
                : '리셋 없는 총액 상한',
            },
          ]}
        />
      </section>

      {key.requestId && (
        <MessageBar
          title="승인 신청"
          actions={
            <Link
              to={adminPaths.requestDetail(key.requestId, scope.activeOrgId)}
              className="font-semibold underline underline-offset-2"
            >
              정확한 신청 보기
            </Link>
          }
        >
          이 키를 생성한 승인 신청과 검토 결과를 확인할 수 있습니다.
        </MessageBar>
      )}

      {limitsOpen && (
        <LimitsModal
          llmKey={key}
          canEditCredit={canEditCredit}
          onClose={() => setLimitsOpen(false)}
          onSaved={(updated) => {
            setLimitsOpen(false)
            updateCached(updated, 'LLM API 키 한도를 변경했습니다.')
          }}
        />
      )}
      {suspendOpen && (
        <SuspendModal
          open
          llmKey={key}
          onClose={() => setSuspendOpen(false)}
          onSaved={(updated) => {
            setSuspendOpen(false)
            updateCached(updated, 'LLM API 키를 정지했습니다.')
          }}
        />
      )}
      {resumeOpen && (
        <ResumeModal
          open
          llmKey={key}
          onClose={() => setResumeOpen(false)}
          onSaved={(updated) => {
            setResumeOpen(false)
            updateCached(updated, 'LLM API 키 정지를 해제했습니다.')
          }}
        />
      )}
      <ConfirmNameModal
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title="LLM API 키 폐기"
        expectedName={key.name}
        confirmLabel="폐기"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      >
        <MessageBar variant="danger" title="되돌릴 수 없습니다">
          폐기 뒤에는 이 키로 보낸 모든 요청이 거부됩니다.
        </MessageBar>
      </ConfirmNameModal>
    </div>
  )
}

function valueOf(raw: string, allowZero = false): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) return Number.NaN
  return value
}

function LimitsModal({
  llmKey,
  canEditCredit,
  onClose,
  onSaved,
}: {
  llmKey: AdminLlmKeyDetail
  canEditCredit: boolean
  onClose: () => void
  onSaved: (updated: AdminLlmKeyDetail) => void
}) {
  const [rpm, setRpm] = useState(llmKey.rpm == null ? '' : String(llmKey.rpm))
  const [tpm, setTpm] = useState(llmKey.tpm == null ? '' : String(llmKey.tpm))
  const [dailyTokens, setDailyTokens] = useState(
    llmKey.dailyTokens == null ? '' : String(llmKey.dailyTokens),
  )
  const [concurrency, setConcurrency] = useState(
    llmKey.concurrency == null ? '' : String(llmKey.concurrency),
  )
  const [creditLimit, setCreditLimit] = useState(String(llmKey.creditLimit))
  const [creditLimitReset, setCreditLimitReset] = useState(llmKey.creditLimitReset ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (body: AdminLlmKeyLimits) => replaceAdminLlmKeyLimits(llmKey.id, body),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(toApiError(failure, 'LLM API 키 한도를 변경하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = {
      rpm: valueOf(rpm),
      tpm: valueOf(tpm),
      dailyTokens: valueOf(dailyTokens, true),
      concurrency: valueOf(concurrency),
    }
    const errors: Record<string, string> = {}
    for (const [field, value] of Object.entries(parsed)) {
      if (Number.isNaN(value)) {
        errors[field] = `${field === 'dailyTokens' ? '0' : '1'} 이상의 올바른 정수를 입력하거나 비워 주세요.`
      }
    }
    if (
      !Number.isNaN(parsed.rpm) &&
      !Number.isNaN(parsed.tpm) &&
      parsed.rpm != null &&
      parsed.tpm != null &&
      parsed.tpm < parsed.rpm
    ) {
      errors.tpm = 'TPM은 RPM보다 작을 수 없습니다.'
    }
    const credit = Number(creditLimit)
    if (canEditCredit && (!Number.isFinite(credit) || credit < 0)) {
      errors.creditLimit = '금액 한도는 0 이상의 숫자여야 합니다.'
    }
    if (canEditCredit && creditLimitReset && !(credit > 0)) {
      errors.creditLimit = '리셋 창을 두려면 0보다 큰 금액 한도가 필요합니다.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    save.mutate({
      rpm: parsed.rpm,
      tpm: parsed.tpm,
      dailyTokens: parsed.dailyTokens,
      concurrency: parsed.concurrency,
      creditLimit: canEditCredit ? credit : llmKey.creditLimit,
      creditLimitReset: canEditCredit
        ? (creditLimitReset as AdminLlmKeyLimits['creditLimitReset']) || null
        : llmKey.creditLimitReset ?? null,
    })
  }

  return (
    <Modal open onClose={onClose} title="LLM API 키 한도 변경">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <MessageBar variant="danger">{error}</MessageBar>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LimitField label="RPM" min={1} value={rpm} onChange={setRpm} error={fieldErrors.rpm} />
          <LimitField label="TPM" min={1} value={tpm} onChange={setTpm} error={fieldErrors.tpm} />
          <LimitField
            label="일일 토큰"
            min={0}
            value={dailyTokens}
            onChange={setDailyTokens}
            error={fieldErrors.dailyTokens}
          />
          <LimitField
            label="동시 요청"
            min={1}
            value={concurrency}
            onChange={setConcurrency}
            error={fieldErrors.concurrency}
          />
        </div>
        {canEditCredit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="금액 한도 (USD)" error={fieldErrors.creditLimit}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={creditLimit}
                onChange={(event) => setCreditLimit(event.target.value)}
              />
            </FormField>
            <FormField label="금액 리셋 창">
              <Select
                value={creditLimitReset}
                onChange={(event) => setCreditLimitReset(event.target.value)}
              >
                <option value="">리셋 없음</option>
                {Object.entries(CREDIT_LIMIT_RESET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={save.isPending}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function LimitField({
  label,
  min,
  value,
  onChange,
  error,
}: {
  label: string
  min: 0 | 1
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <FormField
      label={label}
      error={error}
      description={min === 0 ? '0이면 토큰 축을 닫고, 비우면 무제한입니다.' : '비우면 서비스 기본값을 따릅니다.'}
    >
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}

function SuspendModal({
  open,
  llmKey,
  onClose,
  onSaved,
}: {
  open: boolean
  llmKey: AdminLlmKeyDetail
  onClose: () => void
  onSaved: (updated: AdminLlmKeyDetail) => void
}) {
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suspend = useMutation({
    mutationFn: () => suspendAdminLlmKey(llmKey.id, reason.trim()),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(toApiError(failure, 'LLM API 키를 정지하지 못했습니다.').message),
  })
  return (
    <Modal open={open} onClose={onClose} title="LLM API 키 정지">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (reason.trim()) suspend.mutate()
        }}
      >
        {error && <MessageBar variant="danger">{error}</MessageBar>}
        <FormField
          label="정지 사유"
          required
          error={submitted && !reason.trim() ? '정지 사유를 입력해 주세요.' : undefined}
        >
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button type="submit" loading={suspend.isPending} disabled={!reason.trim()}>정지</Button>
        </div>
      </form>
    </Modal>
  )
}

function ResumeModal({
  open,
  llmKey,
  onClose,
  onSaved,
}: {
  open: boolean
  llmKey: AdminLlmKeyDetail
  onClose: () => void
  onSaved: (updated: AdminLlmKeyDetail) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const resume = useMutation({
    mutationFn: () => resumeAdminLlmKey(llmKey.id),
    onSuccess: onSaved,
    onError: (failure) =>
      setError(toApiError(failure, 'LLM API 키 정지를 해제하지 못했습니다.').message),
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="LLM API 키 정지 해제"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button loading={resume.isPending} onClick={() => resume.mutate()}>정지 해제</Button>
        </>
      }
    >
      {error ? (
        <MessageBar variant="danger">{error}</MessageBar>
      ) : (
        <p className="text-sm text-foreground-secondary">이 키의 API 호출을 다시 허용합니다.</p>
      )}
    </Modal>
  )
}
