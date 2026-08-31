import { describe, expect, test } from 'vitest'
import { documentTitleForPath } from './document-title'

describe('documentTitleForPath', () => {
  test.each([
    ['/', 'PNU Cloud, Pickle'],
    ['/login', '로그인 · Pickle'],
    ['/console', '개요 · Pickle'],
    ['/console/resources', '리소스 · Pickle'],
    ['/console/00000000-0000-0000-0000-000000000000/llm-keys', 'LLM API 키 · Pickle'],
    ['/admin', '관리자 개요 · Pickle'],
    ['/admin/requests/00000000-0000-0000-0000-000000000000', '신청 · Pickle'],
    ['/admin/llm/keys/00000000-0000-0000-0000-000000000000', 'LLM API 키 · Pickle'],
    ['/admin/llm/accounts/00000000-0000-0000-0000-000000000000', 'OpenRouter 사업 계정 · Pickle'],
    ['/admin/llm/status', 'LLM 서비스 · Pickle'],
    ['/admin/llm/usage', 'LLM 사용량 · Pickle'],
    ['/auth/google/callback', 'Google 로그인 · Pickle'],
    ['/no-such-page', '페이지를 찾을 수 없음 · Pickle'],
  ])('%s', (pathname, expected) => {
    expect(documentTitleForPath(pathname)).toBe(expected)
  })
})
