import { Card, CardContent, CardHeader, CardTitle } from '../components/ui'
import { useAuth } from '../auth/auth-context'

export function AdminDashboardPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {user?.name}님, 환영합니다. 승인 대기 현황과 기관 자원을 한눈에 볼 수 있습니다.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>준비 중</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600">
            승인 대기 큐, 기관 자원 현황, VM 현황 타일이 곧 제공될 예정입니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
