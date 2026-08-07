import { useQuery } from '@tanstack/react-query'
import { fetchGroup, type VmDetail } from '../api/queries'
import { Alert, Button } from './ui'

/**
 * VM이 속한 그룹에서의 내 역할로 변경 권한을 판정한다 (계약: 생성·삭제는 EDITOR 이상).
 * 도메인·포트 탭과 네트워크 탭이 같은 기준을 쓰도록 한 곳에 둔다 — 두 탭이 같은
 * 쿼리 키를 쓰므로 요청은 한 번만 나간다.
 */
export function useVmGroupRole(vm: VmDetail) {
  const group = useQuery({
    queryKey: ['groups', vm.groupId],
    queryFn: () => fetchGroup(vm.groupId),
  })
  const canMutate = group.data?.myRole === 'OWNER' || group.data?.myRole === 'EDITOR'
  const roleFallback = group.isError ? (
    <Alert variant="warning" title="권한 정보를 불러오지 못했습니다">
      <div className="space-y-2">
        <p>변경 권한을 확인하지 못해 설정 기능을 잠시 숨겼습니다.</p>
        <Button
          size="sm"
          variant="secondary"
          loading={group.isFetching}
          onClick={() => void group.refetch()}
        >
          다시 시도
        </Button>
      </div>
    </Alert>
  ) : null

  return { canMutate, rolePending: group.isPending, roleFallback }
}
