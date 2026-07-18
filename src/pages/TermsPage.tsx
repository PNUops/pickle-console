import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { fetchTermsDocument, type TermsDocType } from '../api/queries'
import { Alert, Card, CardContent, Spinner } from '../components/ui'

const DOC_TYPES: TermsDocType[] = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY']

/**
 * Public document viewer for /terms/:docType. The body is operator-authored
 * markdown; we render it as pre-wrapped text (no markdown library dependency —
 * see report). The seed text reads well as plain text.
 */
export function TermsPage() {
  const { docType } = useParams<{ docType: string }>()
  const isKnown = DOC_TYPES.includes(docType as TermsDocType)

  const doc = useQuery({
    queryKey: ['terms', docType],
    queryFn: () => fetchTermsDocument(docType as TermsDocType),
    enabled: isKnown,
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      {!isKnown ? (
        <Alert variant="danger">요청한 문서를 찾을 수 없습니다.</Alert>
      ) : doc.isPending ? (
        <Spinner label="문서를 불러오는 중" />
      ) : doc.isError ? (
        <Alert variant="danger">{doc.error.message}</Alert>
      ) : (
        <Card>
          <CardContent className="py-8">
            <h1 className="text-2xl font-bold text-neutral-900">{doc.data.title}</h1>
            <p className="mt-1 text-sm text-neutral-500">버전 {doc.data.version}</p>
            <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
              {doc.data.body}
            </div>
          </CardContent>
        </Card>
      )}
      <p className="mt-6 text-center text-sm text-neutral-500">
        <Link to="/" className="font-medium text-primary-700 hover:underline">
          홈으로
        </Link>
      </p>
    </div>
  )
}
