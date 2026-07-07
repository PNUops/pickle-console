import { Card, CardContent, CardHeader, CardTitle } from '../components/ui'
import { useAuth } from '../auth/auth-context'

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
          <p className="text-sm text-neutral-600">
            VM 신청 기능은 곧 제공될 예정입니다. 신청이 승인되면 이곳에서 내 VM의 상태를
            확인하고 시작·중지할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
