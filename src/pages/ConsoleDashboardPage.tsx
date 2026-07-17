import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '../components/ui'
import { useAuth } from '../auth/auth-context'
import { fetchMySshKeys, fetchVms } from '../api/queries'

const SHORTCUTS = [
  {
    to: '/console/requests/new',
    title: 'VM 신청',
    description: '그룹 명의로 새 VM 사용 신청서를 작성합니다.',
  },
  {
    to: '/console/groups',
    title: '내 그룹',
    description: '팀·프로젝트 그룹을 만들고 구성원을 관리합니다.',
  },
  {
    to: '/console/requests',
    title: '내 신청',
    description: '제출한 신청의 검토 상태와 결과를 확인합니다.',
  },
  {
    to: '/console/vms',
    title: '내 VM',
    description: '내가 속한 그룹의 VM 상태를 확인합니다.',
  },
]

export function ConsoleDashboardPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {user?.name}님, 환영합니다. 피클에서 VM을 신청하고 관리할 수 있습니다.
        </p>
      </div>
      <SshKeyReminder />
      <Card>
        <CardHeader>
          <CardTitle>시작하기</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SHORTCUTS.map((shortcut) => (
              <Link
                key={shortcut.to}
                to={shortcut.to}
                className="rounded-lg border border-neutral-200 p-4 hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                <p className="font-medium text-neutral-900">{shortcut.title}</p>
                <p className="mt-1 text-sm text-neutral-500">{shortcut.description}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** VM이 있는데 SSH 키가 하나도 없으면 접속 불가 — 등록을 유도하는 닫기 가능 배너. */
function SshKeyReminder() {
  const [dismissed, setDismissed] = useState(false)
  const vms = useQuery({ queryKey: ['vms', { page: 0, size: 1 }], queryFn: () => fetchVms({ size: 1 }) })
  const keys = useQuery({ queryKey: ['me', 'ssh-keys'], queryFn: fetchMySshKeys })

  const hasVm = vms.isSuccess && vms.data.totalElements > 0
  const noKeys = keys.isSuccess && keys.data.length === 0
  if (dismissed || !hasVm || !noKeys) return null

  return (
    <Alert variant="info" title="SSH 키를 등록해 주세요">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          VM에 SSH로 접속하려면 SSH 키가 필요합니다. 아직 등록된 키가 없어 접속할 수
          없습니다.
        </p>
        <div className="flex items-center gap-3">
          <Link
            to="/console/ssh-keys"
            className="font-medium text-primary-700 hover:underline"
          >
            SSH 키 등록하기 →
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-700"
          >
            닫기
          </button>
        </div>
      </div>
    </Alert>
  )
}
