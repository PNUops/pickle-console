import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { acceptConsents, type TermsVersionView } from '../api/queries'
import { toApiError } from '../api/problem'
import { Alert, Button, Card, CardContent, Checkbox } from '../components/ui'
import { useAuth } from './auth-context'

/**
 * Lazy consent enforcement: shown in place of the authenticated shell when the
 * profile carries pendingConsents (a document was revised after signup). The API
 * is not blocked — this is a UI gate. Accepting records consent and refreshes
 * the profile, which clears the gate.
 */
export function ConsentGate({ pending }: { pending: TermsVersionView[] }) {
  const { refreshProfile, logout } = useAuth()
  const [agreed, setAgreed] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const allAgreed = pending.every((doc) => agreed[doc.docType])

  const accept = useMutation({
    mutationFn: () =>
      acceptConsents(pending.map((doc) => ({ docType: doc.docType, version: doc.version }))),
    onSuccess: async () => {
      setError(null)
      await refreshProfile()
    },
    onError: async (err) => {
      const apiError = toApiError(err, '약관 동의를 기록하지 못했습니다.')
      if (apiError.code === 'CONSENT_VERSION_MISMATCH') {
        // The documents were revised again between load and submit. Reload the
        // profile so the gate re-renders with the new pendingConsents versions
        // — otherwise it would loop, resubmitting the stale versions the 409
        // rejects. Require a fresh agreement to the updated documents.
        setAgreed({})
        setError('약관이 갱신되었습니다. 새 내용을 확인한 뒤 다시 동의해 주세요.')
        await refreshProfile()
        return
      }
      setError(apiError.message)
    },
  })

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardContent className="space-y-4 py-8">
          <h1 className="text-xl font-bold text-neutral-900">약관 재동의가 필요합니다</h1>
          <p className="text-sm text-neutral-600">
            약관이 개정되었습니다. 계속 이용하시려면 아래 문서에 다시 동의해 주세요.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <ul className="space-y-3">
            {pending.map((doc) => (
              <li key={doc.docType}>
                <Checkbox
                  checked={agreed[doc.docType] ?? false}
                  onChange={(event) =>
                    setAgreed((prev) => ({ ...prev, [doc.docType]: event.target.checked }))
                  }
                  label={
                    <span>
                      <Link
                        to={`/terms/${doc.docType}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary-700 hover:underline"
                      >
                        {doc.title}
                      </Link>
                      <span className="text-neutral-500"> (v{doc.version})에 동의합니다.</span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            className="w-full"
            disabled={!allAgreed}
            loading={accept.isPending}
            onClick={() => accept.mutate()}
          >
            동의하고 계속하기
          </Button>
          {/*
            이 게이트는 인증된 셸 전체를 대신하므로 나갈 길이 없으면 동의하지 않기로
            한 사람이 갇힌다. 공용 PC 에서 남의 계정으로 열린 경우도 마찬가지다.
          */}
          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => void logout()}
              className="font-medium text-neutral-500 hover:underline"
            >
              로그아웃
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
