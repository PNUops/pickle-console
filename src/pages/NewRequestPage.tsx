import { useSearchParams } from 'react-router'
import { requestKind } from '../components/request-kind'
import { KindPicker } from '../components/request-kind/KindPicker'
import { RequestWizard } from '../components/request-kind/RequestWizard'
import { GuideLink } from '../docs/links'

/**
 * 리소스 신청.
 *
 * 이 페이지가 하는 일은 갈림길 하나뿐이다. `?kind=`가 무엇을 신청할지 말하고
 * 있으면 위저드를, 아니면 고르는 화면을 연다.
 *
 * **고르는 화면은 위저드의 첫 단계가 아니다.** 종류를 아는 자리(가상머신 목록의
 * 신청 버튼처럼)에서 들어오면 그 화면을 지나지 않으므로, 단계로 두면 같은
 * 위저드가 진입마다 길이가 달라진다. 위저드는 어느 쪽에서 왔든 3단계다.
 *
 * 모르는 `?kind=` 값은 고르는 화면으로 떨어진다. 그것이 링크의 오타든 은퇴한
 * 종류든, 사용자가 할 수 있는 일은 다시 고르는 것뿐이다.
 */
export function NewRequestPage() {
  const [searchParams] = useSearchParams()
  const kind = requestKind(searchParams.get('kind') ?? '')

  const guide = kind?.type === 'VM' ? 'vm/request' : kind?.type === 'LLM_API_KEY' ? 'llm/start' : 'requests/submit'
  return (
    <div className="space-y-4">
      <div className="text-right text-sm"><GuideLink slug={guide}>신청 작성 가이드</GuideLink></div>
      {/* Changing the kind remounts its catalog hooks and specification state. */}
      {kind ? <RequestWizard key={kind.type} kind={kind} /> : <KindPicker />}
    </div>
  )
}
