import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui'
import { useAuth } from '../auth/auth-context'

const SHORTCUTS = [
  {
    to: '/console/requests/new',
    title: 'VM 신청',
    description: '그룹 명의로 새 VM 사용 신청서를 작성합니다.',
  },
  {
    to: '/console/groups',
    title: '내 그룹',
    description: '팀·프로젝트 그룹을 만들고 멤버를 관리합니다.',
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
