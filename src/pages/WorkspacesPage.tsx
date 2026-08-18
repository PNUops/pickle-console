import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchWorkspaces } from '../api/queries'
import {
  Alert,
  Button,
  Card,
  WorkspaceKindBadge,
  WorkspaceRoleBadge,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { CreateWorkspaceModal } from '../components/workspace/CreateWorkspaceModal'

export function WorkspacesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">내 워크스페이스</h1>
          <p className="mt-1 text-sm text-neutral-500">
            내가 속한 워크스페이스 목록입니다. VM은 워크스페이스 명의로 신청합니다.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>새 워크스페이스 만들기</Button>
      </div>

      {workspaces.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="워크스페이스 목록 불러오는 중" />
        </div>
      )}
      {workspaces.isError && <Alert variant="danger">{workspaces.error.message}</Alert>}
      {workspaces.isSuccess && workspaces.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          속한 워크스페이스가 없습니다. 새 워크스페이스를 만들어 시작해 보세요.
        </Card>
      )}
      {workspaces.isSuccess && workspaces.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>종류</TH>
                <TH>내 역할</TH>
                <TH>구성원</TH>
                <TH>설명</TH>
              </TR>
            </THead>
            <TBody>
              {workspaces.data.map((workspace) => (
                <TR key={workspace.id}>
                  <TD>
                    <Link
                      to={`/console/workspaces/${workspace.id}`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      {workspace.name}
                    </Link>
                  </TD>
                  <TD>
                    <WorkspaceKindBadge kind={workspace.kind} />
                  </TD>
                  <TD>
                    <WorkspaceRoleBadge role={workspace.myRole} />
                  </TD>
                  <TD>{workspace.memberCount}명</TD>
                  <TD className="max-w-xs truncate">{workspace.description ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
