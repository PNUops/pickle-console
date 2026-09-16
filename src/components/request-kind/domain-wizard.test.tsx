import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { createdRequestBodies, domainRootPolicy, resetRequestFixtures } from '../../test/msw/handlers/requests'
import { renderApp } from '../../test/render'
import { server } from '../../test/msw/server'

function startWizard() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console/requests/new?kind=DOMAIN')
}

/** 이름과 워크스페이스와 목적까지, 확인 단계 직전의 공통 입력. */
async function fillTheForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('도메인 이름'), 'myblog')
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
  await user.type(screen.getByLabelText('사용 목적'), '학과 동아리 소개 페이지')
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('domain request wizard', () => {
  beforeEach(() => resetRequestFixtures())

  test('asks neither the organisation nor the period, and does not lock on them', async () => {
    const user = userEvent.setup()
    startWizard()

    // 감춘 칸을 검증까지 함께 감추지 않으면, 채울 방법이 없는 필수 항목이
    // 다음 단계를 잠근다 — 위저드가 자기가 안 그린 칸에서 막힌다.
    await fillTheForm(user)
    expect(await screen.findByRole('button', { name: '신청 제출' })).toBeInTheDocument()
    expect(screen.queryByText('기관을 선택해 주세요.')).not.toBeInTheDocument()
    expect(screen.queryByText('사용 기간을 선택해 주세요.')).not.toBeInTheDocument()
    // 확인 단계도 같은 규칙을 말한다: 묻지 않은 것은 「미선택」으로도 서지 않는다.
    expect(screen.queryByText('기관')).not.toBeInTheDocument()
    expect(screen.queryByText('사용 기간')).not.toBeInTheDocument()
  })

  test('sends no organisation and takes its name from the label', async () => {
    const user = userEvent.setup()
    startWizard()

    await fillTheForm(user)
    await user.click(await screen.findByRole('button', { name: '신청 제출' }))

    await waitFor(() => expect(createdRequestBodies.at(-1)?.type).toBe('DOMAIN'))
    const sent = createdRequestBodies.at(-1)!
    expect(sent.domain).toEqual({ label: 'myblog', rootDomain: 'pusan.dev' })
    // 기관은 고른 루트가 정한다. 값을 지어내 보내면 루트가 말하는 것과 어긋날 수 있다.
    expect(sent.orgId).toBeNull()
    expect(sent.periodPresetId).toBeNull()
    expect(sent.reqEndDate).toBeNull()
    // 리소스의 이름이 곧 신청의 이름이다.
    expect(sent.displayName).toBe('myblog.pusan.dev')
  })

  test('an automatically approved request does not say a reviewer will look at it', async () => {
    const user = userEvent.setup()
    startWizard()

    await fillTheForm(user)
    await user.click(await screen.findByRole('button', { name: '신청 제출' }))

    expect(await screen.findByText('신청이 승인되었습니다')).toBeInTheDocument()
    expect(screen.queryByText(/관리자가 검토한 뒤/)).not.toBeInTheDocument()
    // 이름만으로는 아직 아무 곳도 가리키지 않는다 — 그 말을 하지 않으면
    // 침묵이 고장으로 읽힌다.
    expect(screen.getByRole('link', { name: '내 도메인' })).toHaveAttribute(
      'href',
      '/console/domains',
    )
  })

  test('a root that reviews sends the same request to the queue', async () => {
    const user = userEvent.setup()
    domainRootPolicy.autoApprove = false
    startWizard()

    await fillTheForm(user)
    await user.click(await screen.findByRole('button', { name: '신청 제출' }))

    expect(await screen.findByText('신청이 접수되었습니다')).toBeInTheDocument()
    expect(screen.getByText(/관리자가 검토한 뒤/)).toBeInTheDocument()
  })

  test('refuses a label the server would refuse, before it is sent', async () => {
    const user = userEvent.setup()
    startWizard()

    await user.type(await screen.findByLabelText('도메인 이름'), '-nope')
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(
      await screen.findByText(/소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요/),
    ).toBeInTheDocument()
    expect(createdRequestBodies).toHaveLength(0)
  })
})
