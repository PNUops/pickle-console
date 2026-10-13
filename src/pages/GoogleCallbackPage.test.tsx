import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { http, HttpResponse } from 'msw'
import { getAccessToken } from '../api/token'
import { POST_LOGIN_OVERLAY_KEY } from '../lib/storage-keys'
import { OAUTH_RETURN_TO_KEY } from '../lib/google-oauth'
import {
  EXISTING_ACCOUNT_CODE,
  LINK_CODE,
  MFA_ACCOUNT_CODE,
  NEW_ACCOUNT_CODE,
  OUTSIDE_DOMAIN_CODE,
} from '../test/msw/handlers/google-oauth'
import { MFA_VALID_CODE, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

const callback = (code: string) => `/auth/google/callback?code=${code}&state=state-1`

describe('구글 콜백 착지', () => {
  test('계정이 있으면 콘솔로 들어간다', async () => {
    renderApp(callback(EXISTING_ACCOUNT_CODE))
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('연동 왕복은 토큰 없이 계정 화면으로 돌아온다', async () => {
    // 이 왕복이 증명한 것은 구글 계정의 소유이지 이 계정의 소유가 아니다. 세션은 떠나기
    // 전부터 있었고, 액세스 토큰은 메모리에만 살아 전체 페이지 이동에서 사라지므로
    // 돌아온 콘솔은 리프레시 쿠키로 스스로를 복구한다 — 그 상태를 그대로 재현한다.
    server.use(refreshSuccessHandler('access-user'))
    renderApp(callback(LINK_CODE))
    expect(await screen.findByRole('heading', { name: '계정 설정' })).toBeInTheDocument()
  })

  test('2FA 를 켠 계정은 인증 코드 화면으로 이어진다', async () => {
    // 구글 로그인은 첫 번째 요소다. 여기서 챌린지를 떨어뜨리면 2FA 를 켠 사람만
    // 구글로 로그인할 수 없게 되고, 아무 말 없이 로그인 화면에 떨어진다.
    renderApp(callback(MFA_ACCOUNT_CODE))
    expect(await screen.findByLabelText(/인증 코드/)).toBeInTheDocument()
  })

  test('계정이 없으면 온보딩 폼으로 보낸다', async () => {
    renderApp(callback(NEW_ACCOUNT_CODE))
    expect(await screen.findByRole('heading', { name: '가입 정보 입력' })).toBeInTheDocument()
    // 주소는 검증된 신원의 것이라 폼에서 바꿀 수 없다.
    expect(screen.getByText('new.google@pusan.ac.kr')).toBeInTheDocument()
  })

  test('학교 밖 계정이면 이유를 보여준다', async () => {
    renderApp(callback(OUTSIDE_DOMAIN_CODE))
    // 이 라우트가 따로 있는 첫째 이유. 콘솔 홈으로 바로 보내면 비인증으로 착지해
    // 로그인 화면으로 튕기고 이유는 어디에도 남지 않는다.
    expect(await screen.findByRole('heading', { name: '로그인하지 못했습니다' })).toBeInTheDocument()
    expect(screen.getByText(/@pusan\.ac\.kr/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인 화면으로 돌아가기' })).toBeInTheDocument()
  })

  test('구글이 취소를 돌려주면 그렇게 말한다', async () => {
    renderApp('/auth/google/callback?error=access_denied')
    expect(await screen.findByText('구글 로그인을 취소했습니다.')).toBeInTheDocument()
  })

  test('돌아갈 경로가 외부 주소면 무시하고 홈으로 간다', async () => {
    // 세션 저장소는 같은 탭 안이라도 신뢰 대상이 아니다. '//evil.com'은 스킴 상대
    // URL이라 브라우저가 외부 호스트로 읽는다.
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, '//evil.com')
    renderApp(callback(EXISTING_ACCOUNT_CODE))
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })
})

describe('구글 온보딩 폼', () => {
  test('약관에 모두 동의해야 제출할 수 있다', async () => {
    const user = userEvent.setup()
    renderApp(callback(NEW_ACCOUNT_CODE))
    await screen.findByRole('heading', { name: '가입 정보 입력' })

    const submit = screen.getByRole('button', { name: '가입 완료' })
    expect(submit).toBeDisabled()

    // 직책과 소속 학과는 여기서 묻지 않는다. 남는 것은 이름과 약관뿐이다.
    expect(screen.queryByLabelText('직책')).not.toBeInTheDocument()
    for (const box of await screen.findAllByRole('checkbox')) await user.click(box)

    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('토큰 없이 직접 들어오면 로그인 화면으로 돌린다', async () => {
    renderApp('/google-onboarding')
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })

})

describe('Google login completion and return path', () => {
  const failProfile = (status = 503) => {
    server.use(http.get('*/api/v1/me', () => HttpResponse.json({
      type: 'about:blank', title: 'Profile unavailable', status,
      code: 'INTERNAL_ERROR', detail: '사용자 정보를 불러올 수 없습니다.',
    }, { status, headers: { 'Content-Type': 'application/problem+json' } })))
  }

  test('shows a profile error without a welcome or console navigation', async () => {
    failProfile()
    renderApp(callback(EXISTING_ACCOUNT_CODE))
    await screen.findByRole('heading', { name: '로그인하지 못했습니다' })
    expect(screen.getByRole('alert')).toHaveTextContent('사용자 정보를 불러올 수 없습니다.')
    expect(currentPath()).toBe(callback(EXISTING_ACCOUNT_CODE))
    expect(getAccessToken()).toBeNull()
    expect(sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY)).toBeNull()
  })

  test('ends pending login visibly when the new session expires during profile loading', async () => {
    failProfile(401)
    renderApp(callback(EXISTING_ACCOUNT_CODE))
    await screen.findByRole('heading', { name: '로그인하지 못했습니다' })
    expect(screen.getByRole('alert')).toHaveTextContent('로그인 세션이 만료되었습니다.')
    expect(getAccessToken()).toBeNull()
    expect(sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY)).toBeNull()
  })

  test('retains the original destination through Google MFA completion', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, '/console/vms')
    renderApp(callback(MFA_ACCOUNT_CODE))
    await user.type(await screen.findByLabelText('인증 코드'), MFA_VALID_CODE)
    await user.click(screen.getByRole('button', { name: '로그인' }))
    await screen.findByRole('link', { name: '가상머신 신청' })
    expect(currentPath()).toBe('/console/vms')
    expect(sessionStorage.getItem(OAUTH_RETURN_TO_KEY)).toBeNull()
  })

  test('retains the original destination when cancelling Google MFA and using a password', async () => {
    const { regularUser, USER_PASSWORD } = await import('../test/msw/handlers/auth')
    const user = userEvent.setup()
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, '/console/vms')
    renderApp(callback(MFA_ACCOUNT_CODE))
    await screen.findByLabelText('인증 코드')
    await user.click(screen.getByRole('button', { name: '처음으로' }))
    await user.type(screen.getByLabelText('이메일'), regularUser.email)
    await user.type(screen.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '로그인' }))
    await screen.findByRole('link', { name: '가상머신 신청' })
    expect(currentPath()).toBe('/console/vms')
  })

  test('does not enter the console when onboarding succeeds but its profile fails', async () => {
    const user = userEvent.setup()
    failProfile()
    renderApp(callback(NEW_ACCOUNT_CODE))
    await screen.findByRole('heading', { name: '가입 정보 입력' })
    for (const box of await screen.findAllByRole('checkbox')) await user.click(box)
    await user.click(screen.getByRole('button', { name: '가입 완료' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('사용자 정보를 불러올 수 없습니다.')
    expect(currentPath()).toBe('/google-onboarding')
    expect(getAccessToken()).toBeNull()
    expect(sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY)).toBeNull()
  })
})
