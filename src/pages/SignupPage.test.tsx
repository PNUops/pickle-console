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
      email: 'example@gmail.com',
      password: 'long-enough-pw',
      passwordConfirm: 'long-enough-pw',
    })

    expect(
      await screen.findByText('@pusan.ac.kr 이메일만 가입할 수 있습니다.'),
    ).toBeInTheDocument()
  })

  test('8자 미만 비밀번호는 거부한다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'example@pusan.ac.kr',
      password: 'ab3d5f7', // 7자
      passwordConfirm: 'ab3d5f7',
    })

    expect(
      await screen.findByText('비밀번호는 8자 이상 72자 이하여야 합니다.'),
    ).toBeInTheDocument()
  })

  test('8자 비밀번호는 통과시킨다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'example@pusan.ac.kr',
      password: 'ab3d5f7g', // 8자 (경계값)
      passwordConfirm: 'ab3d5f7g',
    })

    expect(
      await screen.findByRole('heading', { name: '인증 메일을 확인해 주세요' }),
    ).toBeInTheDocument()
  })

  test('비밀번호 안내 체크리스트가 입력에 따라 갱신된다', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })
    const user = userEvent.setup()

    const lengthRule = () => screen.getByText('8자 이상 72자 이하').closest('li')
    // 입력 전에는 어느 규칙도 성공/미충족으로 단정하지 않는다.
    expect(lengthRule()).toHaveTextContent('미입력')

    await user.type(screen.getByLabelText('비밀번호'), 'ab3d5f7')
    expect(lengthRule()).toHaveTextContent('미충족')

    await user.type(screen.getByLabelText('비밀번호'), 'g')
    expect(lengthRule()).toHaveTextContent('성공')

    // 이메일을 아직 입력하지 않았으면 이메일 의존 규칙은 통과로 단정하지 않는다.
    expect(screen.getByText('이메일 주소를 포함하지 않기').closest('li')).toHaveTextContent(
      '서버에서 확인',
    )

    // 이메일 아이디를 포함하면 해당 규칙이 미충족으로 바뀐다.
    await user.type(screen.getByLabelText('이메일'), 'example@pusan.ac.kr')
    expect(screen.getByText('이메일 주소를 포함하지 않기').closest('li')).toHaveTextContent(
      '성공',
    )
    await user.clear(screen.getByLabelText('비밀번호'))
    await user.type(screen.getByLabelText('비밀번호'), 'example-4321!')
    expect(screen.getByText('이메일 주소를 포함하지 않기').closest('li')).toHaveTextContent(
      '미충족',
    )
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

  test('이미 가입된 이메일도 동일한 인증 메일 안내 화면을 보여준다', async () => {
    // 계정 열거 방지: 가입 여부가 응답으로 드러나지 않으므로 화면도 같아야 한다.
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await fillSignupForm({
      name: '홍길동',
      email: 'duplicate@pusan.ac.kr',
      password: 'long-enough-pw',
      passwordConfirm: 'long-enough-pw',
    })

    expect(
      await screen.findByRole('heading', { name: '인증 메일을 확인해 주세요' }),
    ).toBeInTheDocument()
  })
})
