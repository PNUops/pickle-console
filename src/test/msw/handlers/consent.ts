import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'

type Schemas = components['schemas']

export const currentTerms: Schemas['TermsVersionView'][] = [
  {
    docType: 'TERMS_OF_SERVICE',
    version: 1,
    title: '부산대학교 클라우드 플랫폼 서비스 이용약관',
    effectiveAt: '2026-07-20T00:00:00+09:00',
  },
  {
    docType: 'PRIVACY_POLICY',
    version: 1,
    title: '부산대학교 클라우드 플랫폼 개인정보처리방침',
    effectiveAt: '2026-07-20T00:00:00+09:00',
  },
]

const termsBodies: Record<Schemas['TermsDocType'], string> = {
  TERMS_OF_SERVICE: '# 부산대학교 클라우드 플랫폼 서비스 이용약관\n\n제1조(목적) 이 약관은 ...',
  PRIVACY_POLICY: '# 부산대학교 클라우드 플랫폼 개인정보처리방침\n\n1. 수집하는 개인정보 항목 ...',
}

export const consentHandlers: RequestHandler[] = [
  http.get('*/api/v1/meta/terms', () => HttpResponse.json(currentTerms, { status: 200 })),

  http.get('*/api/v1/meta/terms/:docType', ({ params }) => {
    const docType = params.docType as Schemas['TermsDocType']
    const meta = currentTerms.find((t) => t.docType === docType)
    if (!meta) return new HttpResponse(null, { status: 404 })
    const response: Schemas['TermsDocumentView'] = { ...meta, body: termsBodies[docType] }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.get('*/api/v1/me/consents', () => HttpResponse.json([], { status: 200 })),

  http.post('*/api/v1/me/consents', async ({ request }) => {
    const body = (await request.json()) as { consents: Schemas['ConsentInput'][] }
    const history: Schemas['ConsentView'][] = body.consents.map((c) => ({
      docType: c.docType,
      version: c.version,
      consentedAt: '2026-07-20T10:00:00+09:00',
    }))
    return HttpResponse.json(history, { status: 200 })
  }),
]
