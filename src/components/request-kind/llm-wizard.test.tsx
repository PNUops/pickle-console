import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { createdRequestBodies } from '../../test/msw/handlers/requests'
import { REQUEST_DRAFT_KEY } from '../../lib/request-draft'
import { server } from '../../test/msw/server'
import { renderApp } from '../../test/render'
import { uuid } from '../../test/msw/ids'

function renderWizard() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console/requests/new')
}

/** 종류를 고르고 이름까지 채워, 축과 한도를 고르는 자리에서 멈춘다. */
async function reachSpecStep(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: '리소스 신청' })
  await user.click(await screen.findByRole('radio', { name: /LLM API 키/ }))
  await user.type(await screen.findByLabelText('이름'), '캡스톤 챗봇 키')
  await screen.findByRole('checkbox', { name: /Pickle LLM/ })
}

/** 한도 뒤의 신청 내용 단계를 채운다. */
async function fillRequestStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
  await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
  await user.type(screen.getByLabelText('사용 목적'), '실습')
  await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
}

describe('LLM API 키 신청 위저드 — 축을 골라야 한다', () => {
  /**
   * 축은 한도와 다르다. 빈 한도는 "서비스 기본값"이지만 빈 축은 무엇을 달라는 것인지
   * 말하지 않은 것이다. 그래서 화면은 둘 다 끈 채로 열리고, 하나는 골라야 넘어간다.
   */
  test('아무것도 고르지 않으면 넘어가지 못한다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    expect(screen.getByRole('checkbox', { name: /Pickle LLM/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /유료 모델/ })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('Pickle LLM과 유료 모델 중 최소 하나는 선택해 주세요.'),
    ).toBeInTheDocument()
  })

  // 축을 켜야 그 축의 한도가 나온다. 묻지 않은 값이 제출되지도, 요약에 나타나지도 않는다.
  test('한도는 그 축을 켠 뒤에만 보인다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    expect(screen.queryByLabelText('희망 일일 토큰 수')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/희망 금액 한도/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    expect(screen.getByLabelText('희망 일일 토큰 수')).toBeInTheDocument()
    expect(screen.queryByLabelText(/희망 금액 한도/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /유료 모델/ }))
    expect(screen.getByLabelText(/희망 금액 한도/)).toBeInTheDocument()
  })

  test('일일 토큰만 적어도 끝까지 진행되고, 분당 한도는 싣지 않는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByRole('heading', { name: '리소스 구성' })).toBeInTheDocument()
    expect(screen.getByText('서비스 기본값')).toBeInTheDocument()
    expect(screen.getByText('한도 확정 안내')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })

    expect(createdRequestBodies.at(-1)).toEqual({
      type: 'LLM_API_KEY',
      workspaceId: uuid(12),
      orgId: uuid(1),
      purpose: '실습',
      extraNote: null,
      periodPresetId: uuid(21),
      reqEndDate: null,
      reqIndefinite: null,
      displayName: '캡스톤 챗봇 키',
      llmKey: {
        useCampusModels: true,
        useCommercialModels: false,
        reqCreditLimit: null,
        // 이 화면은 분당 한도를 묻지 않는다. 배포된 기본 한도를 받는다는 뜻이다.
        reqRpm: null,
        reqTpm: null,
        reqDailyTokens: null,
      },
    })
  })

  // 용도는 신청 정보 단계의 사용 목적이 묻는다. 이 단계가 또 묻지 않는다.
  test('적어 넣은 일일 토큰이 그대로 실려 나간다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    expect(screen.queryByLabelText('사용 계획')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    await user.type(screen.getByLabelText('희망 일일 토큰 수'), '1000000')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('1,000,000')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })

    expect(createdRequestBodies.at(-1)).toMatchObject({
      type: 'LLM_API_KEY',
      llmKey: {
        reqDailyTokens: 1000000,
      },
    })
  })
})

describe('LLM API 키 신청 위저드 — 쓸 모델', () => {
  test('유료를 켜야 금액 칸이 나오고, 끄면 적어 둔 금액이 실려 나가지 않는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    expect(screen.queryByLabelText(/희망 금액 한도/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /유료 모델/ }))
    await user.type(screen.getByLabelText(/희망 금액 한도/), '20')

    // 껐다 켜도 금액이 되살아나지 않는다. 화면에 없는 값이 제출되면 안 된다.
    await user.click(screen.getByRole('checkbox', { name: /유료 모델/ }))
    await user.click(screen.getByRole('checkbox', { name: /유료 모델/ }))
    expect(screen.getByLabelText(/희망 금액 한도/)).toHaveValue(null)
  })

  test('축과 금액이 그대로 실려 나가고 요약에도 나온다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    await user.click(screen.getByRole('checkbox', { name: /유료 모델/ }))
    await user.type(screen.getByLabelText(/희망 금액 한도/), '20')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText('Pickle LLM, 유료 모델')).toBeInTheDocument()
    expect(screen.getByText('$20')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })

    expect(createdRequestBodies.at(-1)!.llmKey).toMatchObject({
      useCampusModels: true,
      useCommercialModels: true,
      reqCreditLimit: 20,
    })
  })
})

describe('LLM API 키 신청 위저드 — 한도 검증', () => {
  test('0과 계약 범위 밖의 값은 제출 전에 걸린다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    // 0은 "비움"이 아니다 — 비우려면 비워야 한다.
    await user.type(screen.getByLabelText('희망 일일 토큰 수'), '0')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('일일 토큰 수는 1 이상이어야 합니다.')).toBeInTheDocument()
    // 막힌 단계에서는 다음 단계의 입력이 나오지 않는다.
    expect(screen.queryByLabelText('사용 목적')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('희망 일일 토큰 수'))
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByLabelText('사용 목적')).toBeInTheDocument()
  })
})

describe('LLM API 키 신청 위저드 — 초안', () => {
  /**
   * 초안의 모양 판정은 없앴다. 초안을 쓰는 곳이 이 화면 하나뿐이라 남의 모양이 들어올
   * 자리가 없고, 판정을 두면 없어질 초안을 계속 걸러 내는 코드가 남는다. 대신 지켜야
   * 할 것은 이것이다. 남의 모양이 섞여 있어도 제출 본문에는 이 종류의 필드만 실린다.
   */
  test('남의 종류 모양이 섞인 초안도 제출 본문을 오염시키지 않는다', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem(
      REQUEST_DRAFT_KEY,
      JSON.stringify({
        kind: 'LLM_API_KEY',
        common: { displayName: '실습 키' },
        // VM 초안의 스펙 모양이 남아 있는 경우.
        spec: { imageId: uuid(1), flavorId: uuid(31), reqVcpu: 2, useCampus: true },
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?kind=LLM_API_KEY')

    expect(await screen.findByLabelText('이름')).toHaveValue('실습 키')
    // 초안이 축을 들고 있으므로 다시 고르지 않는다.
    expect(screen.getByRole('checkbox', { name: /Pickle LLM/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })

    const body = createdRequestBodies.at(-1)!
    expect(body).not.toHaveProperty('vm')
    expect(body.llmKey).toEqual({
      useCampusModels: true,
      useCommercialModels: false,
      reqCreditLimit: null,
      reqRpm: null,
      reqTpm: null,
      reqDailyTokens: null,
    })
  })

  test('이 종류의 spec은 초안에서 그대로 복원된다', async () => {
    sessionStorage.setItem(
      REQUEST_DRAFT_KEY,
      JSON.stringify({
        kind: 'LLM_API_KEY',
        common: { displayName: '실습 키' },
        spec: { useCampus: true, reqDailyTokens: '500000' },
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?kind=LLM_API_KEY')

    expect(await screen.findByRole('checkbox', { name: /Pickle LLM/ })).toBeChecked()
    expect(screen.getByLabelText('희망 일일 토큰 수')).toHaveValue(500000)
  })
})
