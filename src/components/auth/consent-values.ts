import type { TermsVersionView } from '../../api/queries'

/** 전 문서에 동의했는지. 문서가 하나도 없으면 아직 목록을 못 받은 것이다. */
export function allConsented(
  documents: TermsVersionView[],
  agreed: Record<string, boolean>,
): boolean {
  return documents.length > 0 && documents.every((doc) => agreed[doc.docType])
}
