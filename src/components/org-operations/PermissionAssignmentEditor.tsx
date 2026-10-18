import { useState } from 'react'
import type { AdminWorkspaceOption } from '../../api/queries'
import type { PermissionInput } from '../../api/org-operations'
import type { InstitutionWorkView, WorkGroup } from '../../auth/institution-authority'
import { Alert, Button, Checkbox, FormField, Input, Select } from '../ui'
import { permissionProblem, permissionRole, selectedFromFull, WORK_GROUP_LABELS, WORK_GROUPS } from '../../lib/org-operations'

const BOUNDARY_HINTS: Record<InstitutionWorkView['boundary'], string> = {
  GLOBAL: '전역 범위', INSTITUTION: '이 기관', RESOURCE: '실제 대상 기관과 그룹 공간 범위 적용',
  RESOURCE_SUPPORT: '기관을 넘는 지원 · 그룹 공간 범위 적용',
  WORKSPACE_SUPPORT: '워크스페이스 지원 · 그룹 공간 범위 적용',
  QUALIFIED_WORKSPACE: '서버가 이 기관과의 연결을 확인한 공간 · 그룹 공간 범위 적용',
}

export function PermissionAssignmentEditor({ name, value, catalogue, workspaces, disabled, onChange }: {
  name: string; value: PermissionInput; catalogue: readonly InstitutionWorkView[]; workspaces: AdminWorkspaceOption[]
  disabled: boolean; onChange: (value: PermissionInput) => void
}) {
  const [search, setSearch] = useState('')
  const selected = catalogue.filter((work) => work.selectable)
  const issue = permissionProblem(value, catalogue)
  const toggle = (id: string, checked: boolean) => {
    const work = checked ? [...value.work, id] : value.work.filter((item) => item !== id)
    const scopes = structuredClone(value.scopes)
    for (const group of WORK_GROUPS) if (!catalogue.some((item) => item.group === group && work.includes(item.id))) delete scopes[group]
    onChange({ ...value, work: [...new Set(work)].sort(), scopes })
  }
  const groupScope = (group: WorkGroup) => {
    const scope = value.scopes[group]
    return <div className="space-y-3 rounded-md bg-neutral-50 p-3">
      <FormField label={`${name} ${WORK_GROUP_LABELS[group]} 범위`} description="이 그룹에서 선택한 모든 업무가 아래 범위 하나를 함께 사용합니다.">
        <Select disabled={disabled} value={scope?.mode ?? ''} onChange={(event) => onChange({ ...value, scopes: { ...value.scopes,
          [group]: { mode: event.target.value as 'ALL' | 'LISTED', workspaceIds: event.target.value === 'ALL' ? [] : scope?.workspaceIds ?? [] } } })}>
          <option value="" disabled>범위를 선택하세요</option><option value="ALL">모든 워크스페이스 (향후 생성 포함)</option><option value="LISTED">지정한 워크스페이스만</option>
        </Select>
      </FormField>
      {scope?.mode === 'LISTED' && <div className="space-y-2">
        <p className="text-sm">지정 {scope.workspaceIds.length}곳. 빈 목록은 이 그룹의 어떤 워크스페이스도 허용하지 않습니다.</p>
        {workspaces.filter((workspace) => `${workspace.name} ${workspace.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || scope.workspaceIds.includes(workspace.id)).map((workspace) => <Checkbox
          key={workspace.id} label={`${name} ${WORK_GROUP_LABELS[group]} 공간: ${workspace.name}`} description={workspace.id}
          aria-label={`${name} ${WORK_GROUP_LABELS[group]} 공간: ${workspace.name}`}
          checked={scope.workspaceIds.includes(workspace.id)} disabled={disabled} onChange={(event) => {
            const workspaceIds = event.target.checked ? [...scope.workspaceIds, workspace.id] : scope.workspaceIds.filter((id) => id !== workspace.id)
            onChange({ ...value, scopes: { ...value.scopes, [group]: { mode: 'LISTED', workspaceIds: [...new Set(workspaceIds)].sort() } } })
          }} />)}
        {scope.workspaceIds.filter((id) => !workspaces.some((workspace) => workspace.id === id)).map((id) => <Checkbox key={id}
          label={`${name} ${WORK_GROUP_LABELS[group]} 보관된 공간: ${id}`} description="현재 목록에 없는 ID입니다. 삭제되었거나 조회할 수 없어도 범위를 전체로 바꾸지 않고 보존합니다."
          aria-label={`${name} ${WORK_GROUP_LABELS[group]} 보관된 공간: ${id}`}
          checked disabled={disabled} onChange={() => onChange({ ...value, scopes: { ...value.scopes, [group]: { mode: 'LISTED', workspaceIds: scope.workspaceIds.filter((item) => item !== id) } } })} />)}
      </div>}
      {scope?.mode === 'ALL' && <p className="text-xs text-neutral-600">이 그룹에 운영 업무를 더 선택하면 그 업무도 모든 워크스페이스에 적용됩니다.</p>}
    </div>
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <legend className="sr-only">{name} 기관 권한</legend>
    <FormField label={`${name} 부여 방식`}><Select value={value.mode} onChange={(event) => onChange(event.target.value === 'FULL'
      ? { mode: 'FULL', work: [], scopes: {}, expectedRevision: value.expectedRevision }
      : selectedFromFull(catalogue, value.expectedRevision))}>
      <option value="FULL">전체 관리자 (FULL)</option><option value="SELECTED">선택 업무 (SELECTED)</option>
    </Select></FormField>
    <p className="text-sm">표시 역할: {permissionRole(value, catalogue)} · 역할은 선택한 권한에서 계산되며 직접 수정하지 않습니다.</p>
    {value.mode === 'FULL' ? <Alert variant="warning">전체 관리자는 이 기관의 등록된 전체 업무, 모든 워크스페이스와 명시된 전역 지원·기관 위임 권한을 갖습니다. 선택 업무에서 바꾸면 지정 공간 제한이 사라집니다.</Alert> : <>
      <Alert variant="info">모든 선택 업무를 골라도 전체 관리자나 기관 위임 권한이 생기지 않습니다. 전체 관리자에서 전환하면 위임·미래 업무 자동 포함과 이 출처의 전역 개별 키 비용 읽기 예외가 사라집니다. 다른 FULL 출처의 영향은 저장 전 미리보기에서 확인하세요.</Alert>
      <Button type="button" variant="secondary" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal py-2" disabled={disabled} onClick={() => onChange(selectedFromFull(catalogue, value.expectedRevision))}>현재 FULL의 선택 가능한 업무 모두 선택</Button>
      <FormField label={`${name} 범위 공간 검색`}><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="워크스페이스 이름 또는 ID" /></FormField>
      {[null, ...WORK_GROUPS].map((group) => <section key={group ?? 'global'} className="space-y-3">
        <h4 className="font-semibold">{group ? WORK_GROUP_LABELS[group] : '기관·전역 업무'}</h4>
        <div className="grid min-w-0 gap-2 md:grid-cols-2">{selected.filter((work) => work.group === group).map((work) => <Checkbox key={work.id}
          label={`${name} 업무: ${work.name}`} description={`${work.write ? '변경' : '조회'} · ${BOUNDARY_HINTS[work.boundary]}`}
          aria-label={`${name} 업무: ${work.name}`}
          checked={value.work.includes(work.id)} onChange={(event) => toggle(work.id, event.target.checked)} />)}</div>
        {group && selected.some((work) => work.group === group && value.work.includes(work.id)) && groupScope(group)}
      </section>)}
      {issue && <p role="alert" className="text-sm text-danger-700">{issue}</p>}
    </>}
  </fieldset>
}
