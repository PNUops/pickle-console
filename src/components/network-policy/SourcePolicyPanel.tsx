import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SourcePolicyPresetView,
  SourcePolicyTarget,
  SourcePolicyView,
  UpdateSourcePolicyRequest,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import { publicSourcePolicyEnabled } from '../../lib/public-source-policy'
import { Alert, Button, Spinner } from '../ui'
import { NetworkPolicyStatus } from './NetworkPolicyStatus'
import { SourcePolicyForm } from './SourcePolicyForm'
import type { NetworkPolicyObservation, SourcePolicyDraft, SourcePolicyValue } from './model'

interface SourcePolicyPanelProps {
  queryKey: readonly unknown[]
  target: SourcePolicyTarget
  loadPolicy: () => Promise<SourcePolicyView>
  savePolicy: (body: UpdateSourcePolicyRequest) => Promise<SourcePolicyView>
  loadPreset: (target: SourcePolicyTarget) => Promise<SourcePolicyPresetView>
  canEdit: boolean
  surface?: 'user' | 'admin'
  ipv4Only?: boolean
}

const UNAVAILABLE_CODES = new Set(['SOURCE_POLICY_UNAVAILABLE', 'SOURCE_POLICY_DISABLED'])
const PENDING_POLL_MS = import.meta.env.MODE === 'test' ? 50 : 5_000

function draftOf(policy: SourcePolicyView): SourcePolicyDraft {
  return { cidrsText: policy.allowedCidrs.join('\n') }
}

function observationOf(policy: SourcePolicyView): NetworkPolicyObservation {
  return policy.applyState === 'FAILED'
    ? { state: 'FAILED', message: policy.lastError ?? '정책 반영에 실패했습니다.' }
    : { state: policy.applyState }
}

function policySummary(policy: SourcePolicyView): string {
  if (!policy.explicit) {
    return '직접 저장한 정책이 없습니다. 기능 활성화 기본값은 새 연결 차단입니다.'
  }
  if (policy.allowedCidrs.length === 0) {
    return '빈 allowlist가 저장되어 새 연결을 모두 차단합니다.'
  }
  if (policy.allowedCidrs.some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0')) {
    return '전체 출발지를 허용하는 CIDR이 명시적으로 저장되어 있습니다.'
  }
  return '저장된 CIDR 목록만 새 연결을 허용합니다.'
}

export function SourcePolicyPanel(props: SourcePolicyPanelProps) {
  return <SourcePolicyPanelState key={JSON.stringify(props.queryKey)} {...props} />
}

function SourcePolicyPanelState({
  queryKey,
  target,
  loadPolicy,
  savePolicy,
  loadPreset,
  canEdit,
  surface = 'user',
  ipv4Only = false,
}: SourcePolicyPanelProps) {
  const enabled = publicSourcePolicyEnabled()
  const queryClient = useQueryClient()
  const resourceKey = JSON.stringify(queryKey)
  const [draftResourceKey, setDraftResourceKey] = useState(resourceKey)
  const [draft, setDraft] = useState<SourcePolicyDraft>({ cidrsText: '' })
  const [baseRevision, setBaseRevision] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const policy = useQuery({
    queryKey,
    queryFn: loadPolicy,
    enabled,
    refetchInterval: (query) => query.state.data?.applyState === 'PENDING'
      ? PENDING_POLL_MS
      : false,
  })
  const preset = useQuery({
    queryKey: ['source-policy-preset', target],
    queryFn: () => loadPreset(target),
    enabled: enabled && canEdit,
    retry: false,
  })

  useEffect(() => {
    if (draftResourceKey === resourceKey) return
    setDraftResourceKey(resourceKey)
    setDraft({ cidrsText: '' })
    setBaseRevision(null)
    setDirty(false)
    setConflict(false)
    setSaveError(undefined)
  }, [draftResourceKey, resourceKey])

  useEffect(() => {
    if (!policy.data || draftResourceKey !== resourceKey) return
    if (dirty) {
      if (baseRevision != null && policy.data.revision !== baseRevision) {
        setConflict(true)
        setSaveError('편집 중 다른 변경이 저장되었습니다. 입력은 보존했습니다. 최신 정책을 불러와 다시 확인해 주세요.')
      }
      return
    }
    setDraft(draftOf(policy.data))
    setBaseRevision(policy.data.revision)
  }, [policy.data, dirty, baseRevision, draftResourceKey, resourceKey])

  const save = useMutation({
    mutationFn: (value: SourcePolicyValue) => {
      if (baseRevision == null) throw new Error('정책 기준 revision을 불러오지 못했습니다.')
      return savePolicy({ expectedRevision: baseRevision, allowedCidrs: value.allowedCidrs })
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved)
      setDraft(draftOf(saved))
      setBaseRevision(saved.revision)
      setDirty(false)
      setConflict(false)
      setSaveError(undefined)
    },
    onError: async (failure) => {
      const error = toApiError(failure, '출발지 정책을 저장하지 못했습니다.')
      if (error.code === 'SOURCE_POLICY_REVISION_CONFLICT') {
        setConflict(true)
        setSaveError('다른 변경이 먼저 저장되었습니다. 입력은 보존했습니다. 최신 정책을 불러와 다시 확인해 주세요.')
        await policy.refetch()
      } else {
        setSaveError(error.message)
      }
    },
  })

  if (!enabled) return null
  if (policy.isPending) return <Spinner label="출발지 정책 불러오는 중" />
  if (policy.isError) {
    return (
      <Alert variant="danger" title="출발지 정책을 불러오지 못했습니다">
        <p>{policy.error.message}</p>
        <Button variant="secondary" size="sm" onClick={() => void policy.refetch()}>
          다시 시도
        </Button>
      </Alert>
    )
  }
  if (draftResourceKey !== resourceKey || baseRevision == null) {
    return <Spinner label="출발지 정책 편집값 준비 중" />
  }

  const policyValue = policy.data
  const presetError = preset.isError
    ? toApiError(preset.error, '교내 출발지 목록을 불러오지 못했습니다.')
    : null
  const campusPresetCidrs = preset.data?.allowedCidrs ?? null

  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 p-4" aria-label="출발지 정책">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">출발지 정책</h3>
          <p className="text-xs text-neutral-500">{policySummary(policyValue)}</p>
        </div>
        <NetworkPolicyStatus observation={observationOf(policyValue)} />
      </div>
      {policyValue.applyState === 'FAILED' && (
        <p className="text-xs text-neutral-500">같은 값을 다시 저장하면 새 반영 요청으로 재처리합니다.</p>
      )}
      {presetError && !UNAVAILABLE_CODES.has(presetError.code ?? '') && (
        <Alert variant="warning">{presetError.message}</Alert>
      )}
      {saveError && <Alert variant="danger">{saveError}</Alert>}
      {conflict && (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const latest = await policy.refetch()
            if (latest.isSuccess && latest.data) {
              setDraft(draftOf(latest.data))
              setBaseRevision(latest.data.revision)
              setDirty(false)
              setConflict(false)
              setSaveError(undefined)
            }
          }}
        >
          최신 정책 불러오기
        </Button>
      )}
      <SourcePolicyForm
        value={draft}
        onChange={(next) => { setDraft(next); setDirty(true) }}
        onSubmit={(value) => save.mutate(value)}
        canEdit={canEdit}
        surface={surface}
        ipv4Only={ipv4Only}
        campusPresetCidrs={campusPresetCidrs}
        busy={save.isPending}
        submitBlocked={conflict || baseRevision == null}
      />
    </section>
  )
}
