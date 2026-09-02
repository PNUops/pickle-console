import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { REQUEST_KINDS, requestKind } from '../components/request-kind'
import { RequestWizard } from '../components/request-kind/RequestWizard'
import { loadDraft } from '../lib/request-draft'

/**
 * 리소스 신청.
 *
 * 이 페이지가 하는 일은 어느 종류를 신청하는지 정하는 것뿐이고, 나머지는 위저드가
 * 맡는다. 종류가 바뀌면 위저드를 통째로 다시 마운트한다. 스펙 상태와 카탈로그 훅이
 * 종류의 것이라, key 리마운트가 훅 순서와 상태 초기화를 함께 보장한다.
 */
export function NewRequestPage() {
  const [searchParams] = useSearchParams()
  const [initialDraft] = useState(loadDraft)
  // `?kind=`로 들어왔다면 방금 그 종류의 목록에서 신청을 누른 것이므로, 남은 초안보다
  // 그 뜻이 앞선다. 그리고 이미 말한 선택이므로 그 단계를 접는다.
  const locked = requestKind(searchParams.get('kind') ?? '')
  const [kindType, setKindType] = useState(() => locked?.type ?? initialDraft.kindType)
  const kind = requestKind(locked?.type ?? kindType) ?? REQUEST_KINDS[0]

  return (
    <RequestWizard
      key={kind.type}
      kind={kind}
      kindLocked={locked != null}
      onSelectKind={setKindType}
    />
  )
}
