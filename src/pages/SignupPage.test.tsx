import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

async function fillSignupForm(values: {
  name?: string
  email?: string
  password?: string
  passwordConfirm?: string
  agree?: boolean
}) {
  const user = userEvent.setup()
  if (values.name) await user.type(screen.getByLabelText('이름'), values.name)
  if (values.email) await user.type(screen.getByLabelText('이메일'), values.email)
  if (values.password) await user.type(screen.getByLabelText('비밀번호'), values.password)
  if (values.passwordConfirm) {
    await user.type(screen.getByLabelText('비밀번호 확인'), values.passwordConfirm)
  }
  if (values.agree !== false) {
    // consent checkboxes appear once /meta/terms loads
    const boxes = await screen.findAllByRole('checkbox')
    for (const box of boxes) await user.click(box)
  }
  await user.click(screen.getByRole('button', { name: '회원가입' }))
  return user
}

describe('회원가입 폼 검증', () => {
  test('학교 도메인이 아닌 이메일은 거부한다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'yejun@gmail.com',
      password: 'long-enough-pw',
      passwordConfirm: 'long-enough-pw',
    })

    expect(
      await screen.findByText('@pusan.ac.kr 이메일만 가입할 수 있습니다.'),
    ).toBeInTheDocument()
  })

  test('10자 미만 비밀번호는 거부한다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'example@pusan.ac.kr',
      password: 'short',
      passwordConfirm: 'short',
    })

    expect(await screen.findByText('비밀번호는 10자 이상이어야 합니다.')).toBeInTheDocument()
  })

  test('비밀번호 확인이 다르면 거부한다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'example@pusan.ac.kr',
      password: 'long-enough-pw',
      passwordConfirm: 'different-pw-123',
    })

    expect(await screen.findByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument()
  })

  test('가입 성공 시 인증 메일 안내 화면과 재발송 버튼을 보여준다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    const user = await fillSignupForm({
      name: '홍길동',
      email: 'example@pusan.ac.kr',
      password: 'long-enough-pw',
      passwordConfirm: 'long-enough-pw',
    })

    expect(
      await screen.findByRole('heading', { name: '인증 메일을 확인해 주세요' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '인증 메일 다시 받기' }))
    expect(
      await screen.findByText('해당 주소가 등록되어 있다면 인증 메일을 다시 발송했습니다.'),
    ).toBeInTheDocument()
  })

  test('약관에 동의하지 않으면 가입 버튼이 비활성화된다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })
    // 약관 체크박스가 로드될 때까지 대기
    await screen.findAllByRole('checkbox')

    await fillSignupForm({
      name: '홍길동',
      email: 'example@pusan.ac.kr',
      password: 'long-enough-pw',
      passwordConfirm: 'long-enough-pw',
      agree: false,
    })

    expect(screen.getByRole('button', { name: '회원가입' })).toBeDisabled()
  })

  test('이미 가입된 이메일이면 서버 메시지를 보여준다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'duplicate@pusan.ac.kr',
      password: 'long-enough-pw',
      passwordConfirm: 'long-enough-pw',
    })

    expect(
      await screen.findByText('해당 이메일로 가입된 계정이 이미 존재합니다.'),
    ).toBeInTheDocument()
  })
})
