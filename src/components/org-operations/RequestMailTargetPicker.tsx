import { useState } from 'react'
import type { RequestMailTarget, RequestMailTargetOption } from '../../api/org-operations'
import type { ResourceType } from '../../api/queries'
import { RESOURCE_TYPES } from '../resource/registry'
import { isUuid } from '../../lib/validation'
import { Button, FormField, Input, Select } from '../ui'

export function RequestMailTargetPicker({ options, target, disabled, onChange }: {
  options: RequestMailTargetOption[] | null | undefined; target: RequestMailTarget | null; disabled: boolean
  onChange: (target: RequestMailTarget | null) => void
}) {
  const [requestType, setRequestType] = useState<ResourceType | ''>(target?.requestType ?? '')
  const [workspaceId, setWorkspaceId] = useState(target?.workspaceId ?? '')
  return <div className="min-w-0 space-y-3 rounded-md border p-3">
    <h3 className="font-semibold">종류·워크스페이스별 수신자 조회</h3>
    <p className="text-xs">이 기관의 실제 신청에 연결된 활성 공간만 선택 참조로 제공합니다. 목록에 없는 공간은 알고 있는 ID를 직접 입력할 수 있습니다. 전체 공간 조회나 권한 부여를 뜻하지 않습니다.</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2"><FormField label="미리보기 신청 종류"><Select value={requestType} disabled={disabled} onChange={(event) => { setRequestType(event.target.value as ResourceType); setWorkspaceId('') }}><option value="" disabled>종류 선택</option>{(Object.keys(RESOURCE_TYPES) as ResourceType[]).map((type) => <option key={type} value={type}>{RESOURCE_TYPES[type].label}</option>)}</Select></FormField>
      <FormField label="신청에 연결된 워크스페이스"><Select value={options?.some((option) => option.requestType === requestType && option.workspaceId === workspaceId) ? workspaceId : ''} disabled={disabled || !requestType} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">목록 선택 또는 아래 ID 직접 입력</option>{options?.filter((option) => option.requestType === requestType).map((option) => <option key={`${option.requestType}:${option.workspaceId}`} value={option.workspaceId}>{option.workspaceName}</option>)}</Select></FormField></div>
    <FormField label="수신 대상 워크스페이스 ID" description="종류와 실제 활성 공간 ID를 함께 지정합니다. 빈 값이나 잘못된 ID를 모든 공간으로 해석하지 않습니다."><Input disabled={disabled} value={workspaceId} aria-invalid={!!workspaceId && !isUuid(workspaceId.trim())} onChange={(event) => setWorkspaceId(event.target.value)} placeholder="워크스페이스 UUID" /></FormField>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={disabled || !requestType || !isUuid(workspaceId.trim())} onClick={() => requestType && onChange({ requestType, workspaceId: workspaceId.trim().toLowerCase() })}>선택 대상 수신자 조회</Button><Button size="sm" variant="secondary" disabled={disabled || target == null} onClick={() => { setRequestType(''); setWorkspaceId(''); onChange(null) }}>일반 자격 조회로 돌아가기</Button></div>
  </div>
}
