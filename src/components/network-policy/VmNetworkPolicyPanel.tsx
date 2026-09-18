import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminVmNetworkPolicy,
  fetchVmNetworkPolicy,
  updateAdminVmNetworkPolicy,
  updateVmNetworkPolicy,
  type UpdateVmNetworkPolicyRequest,
  type VmNetworkPolicyRuleView,
  type VmNetworkPolicyView,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import { vmNetworkPolicyEnabled } from '../../lib/vm-network-policy'
import { Alert, Badge, Button, Spinner, type BadgeVariant } from '../ui'
import { VmPolicyForm } from './VmPolicyForm'
import type { VmRuleDraft, VmRuleValue } from './model'

const PENDING_POLL_MS = import.meta.env.MODE === 'test' ? 50 : 5_000
const UNAVAILABLE_CODES = new Set(['VM_NETWORK_POLICY_DISABLED', 'VM_NETWORK_POLICY_UNAVAILABLE'])

interface VmNetworkPolicyPanelProps {
  vmId: string
  canEdit: boolean
  surface?: 'user' | 'admin'
  loadPolicy?: () => Promise<VmNetworkPolicyView>
  savePolicy?: (body: UpdateVmNetworkPolicyRequest) => Promise<VmNetworkPolicyView>
}

function draftOf(policy: VmNetworkPolicyView): VmRuleDraft[] {
  return policy.rules.map((rule, index) => ({
    id: `${policy.revision}-${index}`,
    direction: rule.direction,
    action: rule.action,
    protocol: rule.protocol,
    cidr: rule.peer,
    ports: formatPorts(rule),
  }))
}

function formatPorts(rule: VmNetworkPolicyRuleView): string {
  if (rule.portStart == null || rule.portEnd == null) return ''
  return rule.portStart === rule.portEnd
    ? String(rule.portStart)
    : `${rule.portStart}-${rule.portEnd}`
}

function toRequestRules(rules: VmRuleValue[]): UpdateVmNetworkPolicyRequest['rules'] {
  return rules.map((rule) => ({
    direction: rule.direction,
    action: rule.action,
    protocol: rule.protocol,
    peer: rule.peer,
    portStart: rule.portStart,
    portEnd: rule.portEnd,
  }))
}

export function VmNetworkPolicyPanel(props: VmNetworkPolicyPanelProps) {
  const resourceKey = `${props.surface ?? 'user'}:${props.vmId}`
  return <VmNetworkPolicyPanelState key={resourceKey} resourceKey={resourceKey} {...props} />
}

function VmNetworkPolicyPanelState({
  vmId,
  canEdit,
  surface = 'user',
  resourceKey,
  loadPolicy: providedLoader,
  savePolicy: providedSaver,
}: VmNetworkPolicyPanelProps & { resourceKey: string }) {
  const enabled = vmNetworkPolicyEnabled()
  const queryClient = useQueryClient()
  const queryKey = ['vm-network-policy', surface, vmId] as const
  const activeResource = useRef(resourceKey)
  const [draft, setDraft] = useState<VmRuleDraft[]>([])
  const [baseRevision, setBaseRevision] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const loadPolicy = providedLoader ?? (() => surface === 'admin'
    ? fetchAdminVmNetworkPolicy(vmId)
    : fetchVmNetworkPolicy(vmId))
  const savePolicy = providedSaver ?? ((body: UpdateVmNetworkPolicyRequest) =>
    surface === 'admin'
      ? updateAdminVmNetworkPolicy(vmId, body)
      : updateVmNetworkPolicy(vmId, body))
  const policy = useQuery({
    queryKey,
    queryFn: loadPolicy,
    enabled,
    retry: false,
    refetchInterval: (query) => query.state.data?.applyState === 'PENDING'
      ? PENDING_POLL_MS
      : false,
  })
  const policyError = policy.isError
    ? toApiError(policy.error, 'VM 통신 정책을 불러오지 못했습니다.')
    : null
  const unavailable = !!policyError && UNAVAILABLE_CODES.has(policyError.code ?? '')
  const inactive = policy.data?.applyState === 'INACTIVE'

  useEffect(() => {
    activeResource.current = resourceKey
    return () => { activeResource.current = '' }
  }, [resourceKey])

  useEffect(() => {
    if (enabled && !unavailable && !inactive) return
    setDraft([])
    setBaseRevision(null)
    setDirty(false)
    setConflict(false)
    setSaveError(undefined)
  }, [enabled, unavailable, inactive])

  useEffect(() => {
    if (!policy.data || policy.data.applyState === 'INACTIVE') return
    if (dirty) {
      if (baseRevision != null && policy.data.revision !== baseRevision) {
        setConflict(true)
        setSaveError('편집 중 다른 변경이 저장되었습니다. 작성 중인 규칙은 보존했습니다. 최신 정책을 불러와 다시 확인해 주세요.')
      }
      return
    }
    setDraft(draftOf(policy.data))
    setBaseRevision(policy.data.revision)
  }, [policy.data, dirty, baseRevision])

  const save = useMutation({
    mutationFn: (rules: VmRuleValue[]) => {
      if (baseRevision == null) throw new Error('정책 기준 revision을 불러오지 못했습니다.')
      const body = { expectedRevision: baseRevision, rules: toRequestRules(rules) }
      return savePolicy(body)
    },
    onSuccess: (saved) => {
      if (activeResource.current !== resourceKey) return
      const current = queryClient.getQueryData<VmNetworkPolicyView>(queryKey)
      if (current && current.revision > saved.revision) {
        setConflict(true)
        setSaveError('저장 응답보다 새로운 정책을 확인했습니다. 작성 중인 규칙은 보존했습니다. 최신 정책을 불러와 다시 확인해 주세요.')
        return
      }
      queryClient.setQueryData(queryKey, saved)
      setDraft(draftOf(saved))
      setBaseRevision(saved.revision)
      setDirty(false)
      setConflict(false)
      setSaveError(undefined)
    },
    onError: (failure) => {
      if (activeResource.current !== resourceKey) return
      const error = toApiError(failure, 'VM 통신 정책을 저장하지 못했습니다.')
      if (error.code === 'VM_NETWORK_POLICY_REVISION_CONFLICT') {
        setConflict(true)
        setSaveError('다른 변경이 먼저 저장되었습니다. 작성 중인 규칙은 보존했습니다. 최신 정책을 불러와 다시 확인해 주세요.')
      } else {
        setSaveError(error.message)
      }
    },
  })

  if (!enabled || unavailable || inactive) return null
  if (policy.isPending) return <Spinner label="VM 통신 정책 불러오는 중" />
  if (policyError) {
    return (
      <Alert variant="danger" title="VM 통신 정책을 불러오지 못했습니다">
        <p>{policyError.message}</p>
        <Button variant="secondary" size="sm" onClick={() => void policy.refetch()}>
          다시 시도
        </Button>
      </Alert>
    )
  }
  const policyValue = policy.data
  if (baseRevision == null || !policyValue) return <Spinner label="VM 통신 정책 편집값 준비 중" />

  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 p-4" aria-label="VM 통신 정책">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">VM 통신 정책</h3>
          <p className="text-xs text-neutral-500">규칙 순서대로 수신·송신 연결을 판정합니다.</p>
        </div>
        <VmPolicyStatus policy={policyValue} />
      </div>
      {saveError && <Alert variant="danger">{saveError}</Alert>}
      {conflict && (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const currentResource = resourceKey
            try {
              const latest = await loadPolicy()
              if (activeResource.current !== currentResource) return
              queryClient.setQueryData(queryKey, latest)
              setDraft(draftOf(latest))
              setBaseRevision(latest.revision)
              setDirty(false)
              setConflict(false)
              setSaveError(undefined)
            } catch (failure) {
              if (activeResource.current !== currentResource) return
              setSaveError(toApiError(failure, '최신 VM 통신 정책을 불러오지 못했습니다.').message)
            }
          }}
        >
          최신 정책 불러오기
        </Button>
      )}
      <VmPolicyForm
        value={draft}
        onChange={(next) => { setDraft(next); setDirty(true) }}
        onSubmit={(rules) => save.mutate(rules)}
        canEdit={canEdit}
        surface={surface}
        ipv4Only
        systemRules={policyValue.systemRules}
        busy={save.isPending}
        submitBlocked={conflict || baseRevision == null}
      />
    </section>
  )
}

const STATUS: Record<VmNetworkPolicyView['applyState'], { label: string; variant: BadgeVariant }> = {
  INACTIVE: { label: '준비되지 않음', variant: 'neutral' },
  PENDING: { label: '반영 대기', variant: 'info' },
  APPLIED: { label: '설정 확인됨', variant: 'success' },
  FAILED: { label: '반영 실패', variant: 'danger' },
  FAILED_CLOSED: { label: '실패(차단 설정 확인)', variant: 'warning' },
}

function VmPolicyStatus({ policy }: { policy: VmNetworkPolicyView }) {
  const status = STATUS[policy.applyState]
  return (
    <div className="space-y-2 text-right" aria-live="polite">
      <Badge variant={status.variant}>{status.label}</Badge>
      {(policy.applyState === 'APPLIED' || policy.applyState === 'FAILED_CLOSED') && (
        <p className="max-w-sm text-xs text-foreground-muted">
          {policy.applyState === 'FAILED_CLOSED'
            ? '차단 설정 반영을 확인했습니다. 실제 연결은 별도로 확인해 주세요.'
            : '설정 반영을 확인했습니다. 실제 연결은 별도로 확인해 주세요.'}
        </p>
      )}
      {(policy.applyState === 'FAILED' || policy.applyState === 'FAILED_CLOSED') && policy.lastError && (
        <p className="max-w-sm text-xs text-danger-600">{policy.lastError}</p>
      )}
    </div>
  )
}
