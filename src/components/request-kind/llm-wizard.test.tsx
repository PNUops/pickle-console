import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { createdRequestBodies } from '../../test/msw/handlers/requests'
import { VM_REQUEST_DRAFT_KEY } from '../../lib/storage-keys'
import { server } from '../../test/msw/server'
import { renderApp } from '../../test/render'
import { uuid } from '../../test/msw/ids'
import { llmKeyRequestKind } from './llm-wizard'

function renderWizard() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console/requests/new')
}

/** 종류 선택 → 워크스페이스·기관·이름까지, 스펙 단계 앞에서 멈춘다. */
async function reachSpecStep(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: '리소스 신청' })
  await user.click(await screen.findByRole('button', { name: /LLM API 키/ }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.selectOptions(await screen.findByLabelText('신청 워크스페이스'), uuid(12))
  await user.selectOptions(screen.getByLabelText('기관'), uuid(1))
  await user.type(screen.getByLabelText('표시명'), '캡스톤 챗봇 키')
  await user.click(screen.getByRole('button', { name: '다음' }))
  await screen.findByLabelText('희망 분당 요청 수')
}

describe('LLM API 키 신청 위저드 — 비워 두는 것이 정상', () => {
  test('한도를 하나도 적지 않아도 끝까지 진행되고, 빈 칸은 기본값으로 제출된다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    // 빈 칸이 실수처럼 보이지 않도록 화면이 먼저 그렇게 말한다.
    expect(screen.getByText('한도는 비워 두어도 됩니다')).toBeInTheDocument()
    // VM의 사양 단계와 달리 필수 표시가 하나도 없다.
    expect(screen.queryByText('OS를 선택해 주세요.')).not.toBeInTheDocument()

    // 아무것도 채우지 않고 다음으로 넘어간다.
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.type(await screen.findByLabelText('사용 목적'), '캡스톤 챗봇 개발')
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 확인 단계: 비워 둔 한도는 '—'가 아니라 서비스 기본값으로 읽힌다.
    expect(await screen.findByText('신청 내용 확인')).toBeInTheDocument()
    expect(screen.getAllByText('서비스 기본값')).toHaveLength(3)
    expect(screen.getByText('한도 확정 안내')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })

    expect(createdRequestBodies.at(-1)).toEqual({
      type: 'LLM_API_KEY',
      workspaceId: uuid(12),
      orgId: uuid(1),
      purpose: '캡스톤 챗봇 개발',
      courseOrProject: null,
      extraNote: null,
      reqStartDate: null,
      reqEndDate: null,
      displayName: '캡스톤 챗봇 키',
      llmKey: {
        usagePlan: null,
        reqRpm: null,
        reqTpm: null,
        reqDailyTokens: null,
      },
    })
  })

  test('적어 넣은 한도와 사용 계획은 그대로 실려 나간다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    await user.type(screen.getByLabelText('사용 계획'), '문서 요약 배치 작업')
    await user.type(screen.getByLabelText('희망 분당 요청 수'), '600')
    await user.type(screen.getByLabelText('희망 분당 토큰 수'), '20000')
    await user.type(screen.getByLabelText('희망 일일 토큰 수'), '1000000')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.type(await screen.findByLabelText('사용 목적'), '캡스톤 챗봇 개발')
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('20,000')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })

    expect(createdRequestBodies.at(-1)).toMatchObject({
      type: 'LLM_API_KEY',
      llmKey: {
        usagePlan: '문서 요약 배치 작업',
        reqRpm: 600,
        reqTpm: 20000,
        reqDailyTokens: 1000000,
      },
    })
  })
})

describe('LLM API 키 신청 위저드 — 한도 검증', () => {
  test('계약 범위를 벗어난 값과 토큰·요청 수 역전은 제출 전에 걸린다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await reachSpecStep(user)

    await user.type(screen.getByLabelText('희망 분당 요청 수'), '20000')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('분당 요청 수는 10,000 이하로 입력해 주세요.'),
    ).toBeInTheDocument()
    // 막힌 단계에서는 다음 단계의 입력이 나오지 않는다.
    expect(screen.queryByLabelText('사용 목적')).not.toBeInTheDocument()

    // 분당 토큰 수가 분당 요청 수보다 작을 수는 없다 (서버와 같은 규칙).
    await user.clear(screen.getByLabelText('희망 분당 요청 수'))
    await user.type(screen.getByLabelText('희망 분당 요청 수'), '600')
    await user.type(screen.getByLabelText('희망 분당 토큰 수'), '100')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('분당 토큰 수는 분당 요청 수보다 작을 수 없습니다.'),
    ).toBeInTheDocument()

    // 0은 "비움"이 아니다 — 비우려면 비워야 한다.
    await user.clear(screen.getByLabelText('희망 분당 토큰 수'))
    await user.type(screen.getByLabelText('희망 분당 토큰 수'), '0')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('분당 토큰 수는 1 이상이어야 합니다.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('희망 분당 토큰 수'))
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByLabelText('사용 목적')).toBeInTheDocument()
  })
})

describe('LLM API 키 신청 위저드 — 초안 호환성', () => {
  test('이 종류의 모양이 아닌 spec은 초안 자체를 거른다', () => {
    const compatible = llmKeyRequestKind.isCompatibleSpecDraft
    // 비어 있는 초안과 이 종류의 모양은 통과한다.
    expect(compatible(null)).toBe(true)
    expect(compatible(undefined)).toBe(true)
    expect(compatible({})).toBe(true)
    expect(compatible({ usagePlan: '요약', reqRpm: '600' })).toBe(true)
    // 다른 종류(VM)의 초안은 모르는 키 때문에 걸린다.
    expect(
      compatible({ imageId: uuid(1), flavorId: uuid(2), reqVcpu: 2, reqDiskGb: 20 }),
    ).toBe(false)
    // 한도를 숫자로 적어 둔 옛 초안은 빈 칸과 0을 구분하지 못한다.
    expect(compatible({ reqRpm: 600 })).toBe(false)
    expect(compatible('reqRpm=600')).toBe(false)
    // null은 이 화면이 쓰지 않는 값이다 — 그대로 들어오면 trim()에서 터진다.
    expect(compatible({ usagePlan: null })).toBe(false)
    expect(compatible({ reqRpm: null })).toBe(false)
  })

  test('다른 종류의 spec이 남은 초안은 통째로 버려진다', async () => {
    sessionStorage.setItem(
      VM_REQUEST_DRAFT_KEY,
      JSON.stringify({
        kind: 'LLM_API_KEY',
        common: {
          workspaceId: uuid(12),
          orgId: uuid(1),
          purpose: '실습',
          displayName: '실습 키',
        },
        // VM 초안의 스펙 모양 — 타입만 보면 통과할 수도 있는 값이다.
        spec: { imageId: uuid(1), flavorId: uuid(2), reqVcpu: 2, reqDiskGb: 20 },
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?step=3')

    // 초안이 버려졌으므로 공통 입력까지 비어 있고, 첫 미완료 단계로 돌아온다.
    expect(await screen.findByLabelText('표시명')).toHaveValue('')
  })

  test('이 종류의 spec은 초안에서 그대로 복원된다', async () => {
    sessionStorage.setItem(
      VM_REQUEST_DRAFT_KEY,
      JSON.stringify({
        kind: 'LLM_API_KEY',
        common: {
          workspaceId: uuid(12),
          orgId: uuid(1),
          purpose: '실습',
          displayName: '실습 키',
        },
        spec: { usagePlan: '요약 호출', reqRpm: '600', reqTpm: '', reqDailyTokens: '' },
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?step=3')

    expect(await screen.findByLabelText('희망 분당 요청 수')).toHaveValue(600)
    expect(screen.getByLabelText('사용 계획')).toHaveValue('요약 호출')
    expect(screen.getByLabelText('희망 분당 토큰 수')).toHaveValue(null)
  })
})
