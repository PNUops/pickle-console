import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OAUTH_RETURN_TO_KEY } from '../lib/google-oauth'
import {
  EXISTING_ACCOUNT_CODE,
  MFA_ACCOUNT_CODE,
  NEW_ACCOUNT_CODE,
  OUTSIDE_DOMAIN_CODE,
} from '../test/msw/handlers/google-oauth'
import { renderApp } from '../test/render'

const callback = (code: string) => `/auth/google/callback?code=${code}&state=state-1`

describe('구글 콜백 착지', () => {
  test('계정이 있으면 콘솔로 들어간다', async () => {
    renderApp(callback(EXISTING_ACCOUNT_CODE))
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
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

    await screen.findByRole('option', { name: '학부생' })
    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    await user.type(screen.getByLabelText('학번'), '202012345')
    await user.selectOptions(screen.getByLabelText('소속'), 'COMPUTER_SCIENCE')
    for (const box of await screen.findAllByRole('checkbox')) await user.click(box)

    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('직책을 비학생으로 바꾸면 학번 입력이 사라진다', async () => {
    const user = userEvent.setup()
    renderApp(callback(NEW_ACCOUNT_CODE))
    await screen.findByRole('heading', { name: '가입 정보 입력' })
    await screen.findByRole('option', { name: '학부생' })

    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    expect(screen.getByLabelText('학번')).toBeInTheDocument()

    // 남겨 두면 교수 계정에 학번이 딸려 가고, 값이 형식에 안 맞으면 화면에 없는
    // 필드에 대한 422를 받게 된다.
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    expect(screen.queryByLabelText('학번')).not.toBeInTheDocument()
  })

  test('토큰 없이 직접 들어오면 로그인 화면으로 돌린다', async () => {
    renderApp('/google-onboarding')
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })
})
