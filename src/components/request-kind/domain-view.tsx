import { useState } from 'react'
import { FormField, Textarea } from '../ui'
import { Field } from './Field'
import type { DecisionFormApi, RequestKindView } from './types'
import type { RequestDetail } from '../../api/queries'

/** 신청한 이름. 발급 전에는 아직 아무것도 잡고 있지 않은 이름이다. */
function askedFqdn(request: RequestDetail): string {
  const spec = request.domain
  return spec ? `${spec.label}.${spec.rootDomain}` : '—'
}

function useDomainApproveForm(request: RequestDetail): DecisionFormApi {
  const [comment, setComment] = useState('')
  return {
    validate: () => ({}),
    fields: (errors) => (
      <>
        {/* 정할 것이 없다. 이 종류의 승인은 이름을 내주느냐 마느냐 하나뿐이고,
            사용 기한은 도메인이 발급되는 날부터 스스로 센다. */}
        <p className="text-sm text-neutral-600">
          승인하면 <span className="font-mono">{askedFqdn(request)}</span> 이름이 바로 발급되고,
          신청자가 레코드를 넣을 수 있게 됩니다. 사용 기한은 발급 시점부터 다시 셉니다.
        </p>
        <FormField label="검토 의견" error={errors.comment}>
          <Textarea
            value={comment}
            maxLength={2000}
            onChange={(event) => setComment(event.target.value)}
          />
        </FormField>
      </>
    ),
    body: () => ({
      // 도메인은 자기 연장 기한을 갖는다. 승인이 기간을 하나 더 적으면 두 기한이
      // 나란히 남고, 어느 쪽이 이기는지를 화면이 설명해야 한다.
      grantedStartDate: null,
      grantedEndDate: null,
      comment: comment.trim() || null,
    }),
    confirmBody: <p>{askedFqdn(request)} 이름을 발급합니다.</p>,
    successMessage: '도메인 신청을 승인했습니다.',
  }
}

export const domainRequestView: RequestKindView = {
  decisionPrefetchQueries: [],
  summaryCell: (request) => askedFqdn(request),
  contentFields: (request) => (
    <>
      <Field label="워크스페이스">{request.workspaceName}</Field>
      <Field label="기관">{request.orgName}</Field>
      {/* 사용 기간을 싣지 않는다. 이 종류는 묻지 않으므로 어느 값도 없고,
          「미지정」은 신청자가 빠뜨린 것처럼 읽힌다. 수명은 발급된 도메인의
          사용 기한이 다스린다. */}
      <Field label="신청한 이름">{askedFqdn(request)}</Field>
      <Field label="용도">{request.purpose}</Field>
      <Field label="기타 참고">{request.extraNote ?? '—'}</Field>
    </>
  ),
  resultFields: (request) =>
    request.domain?.grantedFqdn ? (
      <Field label="발급된 이름">{request.domain.grantedFqdn}</Field>
    ) : null,
  useDecisionData: () => ({ status: 'ready', value: null }),
  useApproveForm: useDomainApproveForm,
}
