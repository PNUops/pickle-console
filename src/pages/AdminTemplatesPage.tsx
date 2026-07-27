import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminTemplates,
  updateAdminTemplate,
  type AdminTemplate,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly } from '../auth/permissions'
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  PermissionNotice,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatSpec } from '../lib/format'

/**
 * 템플릿 관리 — 전 상태 목록 + ACTIVE/DISABLED 토글(구 리비전 은퇴 사이클).
 * 의도적 최소형: 템플릿 등록·사양 편집은 후속 개편에서 다룬다.
 */
export function AdminTemplatesPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  const [message, setMessage] = useState<string | null>(null)
  const [toggleTarget, setToggleTarget] = useState<AdminTemplate | null>(null)

  const templates = useQuery({ queryKey: ['admin', 'templates'], queryFn: fetchAdminTemplates })

  const activeCount = templates.data?.filter((t) => t.status === 'ACTIVE').length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">템플릿 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          신청 위저드에 노출되는 VM 템플릿과 은퇴한 구 리비전입니다. 은퇴(비활성)해도
          기존 VM은 영향받지 않습니다.
        </p>
      </div>

      {!isSysAdmin && (
        <PermissionNotice>템플릿 상태 변경은 시스템 관리자만 수행할 수 있습니다.</PermissionNotice>
      )}
      {message && <Alert variant="info">{message}</Alert>}

      {templates.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="템플릿 목록 불러오는 중" />
        </div>
      )}
      {templates.isError && <Alert variant="danger">{templates.error.message}</Alert>}
      {templates.isSuccess && templates.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">등록된 템플릿이 없습니다.</Card>
      )}
      {templates.isSuccess && templates.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>표시명</TH>
                <TH>이름 / 버전</TH>
                <TH>상태</TH>
                <TH>노드 / VMID</TH>
                <TH>기본 사양</TH>
                <TH>비고</TH>
                <TH>
                  <span className="sr-only">작업</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {templates.data.map((template) => (
                <TR key={template.id}>
                  <TD className="font-medium text-neutral-900">{template.displayName}</TD>
                  <TD className="font-mono text-xs text-neutral-500">
                    {template.name} · v{template.version}
                  </TD>
                  <TD>
                    <Badge variant={template.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {template.status === 'ACTIVE' ? '활성' : '은퇴'}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-neutral-500">
                    {template.nodeId} / {template.proxmoxVmid}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatSpec(
                      template.defaultVcpu,
                      template.defaultMemoryMb,
                      template.defaultDiskGb,
                    )}
                  </TD>
                  <TD className="max-w-xs truncate text-xs text-neutral-500">
                    {template.notes ?? '—'}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!isSysAdmin}
                      onClick={() => setToggleTarget(template)}
                    >
                      {template.status === 'ACTIVE' ? '은퇴' : '되살리기'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {toggleTarget && (
        <ToggleTemplateModal
          template={toggleTarget}
          lastActive={toggleTarget.status === 'ACTIVE' && activeCount <= 1}
          onClose={() => setToggleTarget(null)}
          onDone={(text) => {
            setToggleTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

function ToggleTemplateModal({
  template,
  lastActive,
  onClose,
  onDone,
}: {
  template: AdminTemplate
  lastActive: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const retiring = template.status === 'ACTIVE'

  const toggle = useMutation({
    mutationFn: () =>
      updateAdminTemplate(template.id, { status: retiring ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: async () => {
      setError(null)
      onDone(retiring ? '템플릿을 은퇴시켰습니다.' : '템플릿을 다시 활성화했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] })
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (err) => setError(toApiError(err, '템플릿 상태를 변경하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={retiring ? '템플릿 은퇴' : '템플릿 활성화'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button
            variant={retiring ? 'danger' : 'primary'}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {retiring ? '은퇴' : '활성화'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {retiring ? (
          <p className="text-sm text-neutral-600">
            <strong>{template.displayName}</strong> (v{template.version})을(를) 은퇴시키면
            신청 위저드에서 사라지고 새 신청 검증에서 거부됩니다. 기존 VM은 영향받지
            않으며, 언제든 다시 활성화할 수 있습니다.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            <strong>{template.displayName}</strong> (v{template.version})을(를) 다시 신청
            위저드에 노출합니다.
          </p>
        )}
        {lastActive && (
          <Alert variant="warning">
            마지막 ACTIVE 템플릿입니다 — 은퇴시키면 신규 VM 신청이 불가능해집니다.
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}
