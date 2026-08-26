import type { TermsVersionView } from '../../api/queries'
import { TransitionLink } from '../TransitionLink'
import { Checkbox } from '../ui'

interface ConsentCheckboxesProps {
  documents: TermsVersionView[]
  agreed: Record<string, boolean>
  onChange: (agreed: Record<string, boolean>) => void
  disabled?: boolean
}

/**
 * 약관 동의 체크박스.
 *
 * 가입 폼과 구글 온보딩 폼이 같은 문서 목록에 같은 방식으로 동의를 받는다. 두 곳에
 * 복붙하면 문서가 늘거나 문구가 바뀔 때 한쪽만 고쳐진다.
 */
export function ConsentCheckboxes({
  documents,
  agreed,
  onChange,
  disabled,
}: ConsentCheckboxesProps) {
  return (
    <>
      {documents.map((doc) => (
        <Checkbox
          key={doc.docType}
          checked={agreed[doc.docType] ?? false}
          disabled={disabled}
          onChange={(event) => onChange({ ...agreed, [doc.docType]: event.target.checked })}
          label={
            <span>
              <TransitionLink
                to={`/terms/${doc.docType}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary-300 hover:underline"
              >
                {doc.title}
              </TransitionLink>
              <span className="text-neutral-500">에 동의합니다.</span>
            </span>
          }
        />
      ))}
    </>
  )
}
