import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OAUTH_RETURN_TO_KEY } from '../lib/google-oauth'
import {
  EXISTING_ACCOUNT_CODE,
  LINK_CODE,
  MFA_ACCOUNT_CODE,
  NEW_ACCOUNT_CODE,
  OUTSIDE_DOMAIN_CODE,
  REVERIFY_CODE,
  REVERIFY_TOKEN,
} from '../test/msw/handlers/google-oauth'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { getReauthToken } from '../api/reauth'

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

  test('본인 확인 왕복은 토큰을 심고 원래 있던 자리로 돌려보낸다', async () => {
    // 확인이 필요한 동작 앞에서 시작하므로 이미 로그인해 있다. 액세스 토큰은
    // 메모리에만 살아 전체 이동에서 사라지고, 돌아온 콘솔이 리프레시 쿠키로
    // 스스로를 복구한다.
    server.use(refreshSuccessHandler('access-user'))
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, '/console/account')
    renderApp(callback(REVERIFY_CODE))

    // 콜백이 이 갈래를 몰랐을 때는 「응답을 이해하지 못했습니다」로 끝났다. 서버는
    // v0.44.0 부터 이 응답을 돌려주고 있었다.
    expect(await screen.findByRole('heading', { name: '계정 설정' })).toBeInTheDocument()
    expect(getReauthToken()).toBe(REVERIFY_TOKEN)
    // 동작은 저절로 이어지지 않는다. 대기 중이던 요청은 페이지를 떠나는 순간
    // 취소로 마감됐으므로 사용자가 다시 눌러야 하고, 그 사실을 말해야 한다.
    expect(await screen.findByText(/다시 시도해 주세요/)).toBeInTheDocument()
  })
})
