import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { offerablePeriods, requestOptions } from '../test/msw/handlers/reference'
import { createdRequestBodies } from '../test/msw/handlers/requests'
import { REQUEST_DRAFT_KEY } from '../lib/request-draft'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

type User = ReturnType<typeof userEvent.setup>

function renderWizard(path = '/console/requests/new') {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

/** 종류 단계. 가상머신이 기본이라 넘어가기만 하면 된다. */
async function passKindStep(user: User) {
  await screen.findByRole('radio', { name: /가상머신/ })
  await user.click(screen.getByRole('button', { name: '다음' }))
}

/** 만들 리소스 단계를 프리셋 그대로 채운다. */
async function fillResourceStep(user: User) {
  await user.type(await screen.findByLabelText('이름'), '캡스톤 백엔드 서버')
  await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
  await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

/** 신청 내용 단계를 기간 항목으로 채운다. */
async function fillRequestStep(user: User) {
  await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
  await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
  await user.type(screen.getByLabelText('사용 목적'), '캡스톤 백엔드 API 서버 운영')
  await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('신청 위저드 — 종류를 알고 들어온 경우', () => {
  // 목록의 신청 버튼은 무엇을 신청하는지 이미 말하고 있다. 그것을 두 번 고르게 하지 않는다.
  test('?kind=로 들어오면 종류 단계를 건너뛰고 그 종류로 연다', async () => {
    renderWizard('/console/requests/new?kind=LLM_API_KEY')

    expect(await screen.findByLabelText('이름')).toBeInTheDocument()
    expect(screen.getByLabelText('사용 계획')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /가상머신/ })).not.toBeInTheDocument()
    expect(screen.getByText('LLM API 키')).toBeInTheDocument()
    // 3단계다: 만들 리소스, 신청 내용, 확인.
    expect(screen.getByText(/3단계 중 1단계/)).toBeInTheDocument()
  })

  test('종류를 모르고 들어오면 종류 단계가 있다', async () => {
    renderWizard()
    expect(await screen.findByRole('radio', { name: /가상머신/ })).toBeInTheDocument()
    expect(screen.getByText(/4단계 중 1단계/)).toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 단계 검증', () => {
  test('이름과 OS와 사양이 없으면 다음으로 넘어가지 않는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('이름을 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('OS를 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('사양을 선택해 주세요.')).toBeInTheDocument()
  })

  test('워크스페이스와 기관과 목적과 기간이 없으면 넘어가지 않는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await fillResourceStep(user)

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('신청할 워크스페이스를 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('기관을 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('사용 목적을 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('사용 기간을 선택해 주세요.')).toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — OS는 계열을 고른 뒤 버전을 고른다', () => {
  test('계열을 고르면 그 계열의 버전만 나오고 최신이 골라져 있다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await screen.findByLabelText('이름')

    // 계열을 고르기 전에는 버전을 묻지 않는다.
    expect(screen.queryByRole('radio', { name: /Ubuntu 24\.04/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    // 서버가 계열 안에서 최신을 먼저 주므로 첫 항목이 기본 선택이다.
    expect(screen.getByRole('radio', { name: /Ubuntu 24\.04 LTS/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Ubuntu 22\.04 LTS/ })).not.toBeChecked()
    // 다른 계열의 버전은 섞이지 않는다.
    expect(screen.queryByRole('radio', { name: /Debian 13/ })).not.toBeInTheDocument()
  })

  test('버전이 하나뿐인 계열은 두 번째 물음을 건너뛴다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await screen.findByLabelText('이름')

    await user.click(screen.getByRole('radio', { name: 'Debian' }))
    expect(screen.queryByRole('group', { name: /버전/ })).not.toBeInTheDocument()
    // 골라 두지 않으면 검증에 걸리므로, 건너뛴다는 것은 이미 골랐다는 뜻이어야 한다.
    await user.type(screen.getByLabelText('이름'), '데비안 서버')
    await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.queryByText('OS를 선택해 주세요.')).not.toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 사양', () => {
  test('준비된 사양을 고르면 숫자 칸이 나오지 않고 결과만 글로 보인다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await screen.findByLabelText('이름')

    await user.click(screen.getByRole('radio', { name: /메모리 최적화/ }))
    expect(screen.queryByLabelText('vCPU')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('사양 사유')).not.toBeInTheDocument()
    expect(screen.getByText('1 vCPU, 2 GiB 메모리, 32 GiB 디스크')).toBeInTheDocument()
  })

  test('직접 입력을 고르면 숫자 칸과 사유가 나오고 사유가 필수다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '큰 서버')
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))

    await user.click(screen.getByRole('radio', { name: /직접 입력/ }))
    expect(screen.getByLabelText('vCPU')).toBeInTheDocument()
    expect(screen.getByLabelText('사양 사유')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('사양을 직접 적을 때는 사유를 입력해 주세요.')).toBeInTheDocument()
  })

  /**
   * 이 초기화가 빠지면 화면에서 사라진 초과 사양이 사유 없이 제출된다. 서버에 그것을
   * 잡는 검사가 없으므로 여기가 유일한 방어다.
   */
  test('준비된 사양으로 되돌아오면 숫자와 사유가 그 사양의 값으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '큰 서버')
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    await user.click(screen.getByRole('radio', { name: /직접 입력/ }))

    const memory = screen.getByLabelText('메모리 (MiB)')
    await user.clear(memory)
    await user.type(memory, '16384')
    await user.type(screen.getByLabelText('사양 사유'), '큰 모델을 올립니다')

    await user.click(screen.getByRole('radio', { name: /메모리 최적화/ }))
    expect(screen.queryByLabelText('메모리 (MiB)')).not.toBeInTheDocument()
    expect(screen.getByText('1 vCPU, 2 GiB 메모리, 32 GiB 디스크')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    // 요약에도 초과 사양과 사유가 남아 있지 않다.
    expect(screen.getByText('1 vCPU, 2 GiB 메모리, 32 GiB 디스크')).toBeInTheDocument()
    expect(screen.queryByText('큰 모델을 올립니다')).not.toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 사용 기간', () => {
  test('직접 입력을 고르면 날짜 칸이 나오고 과거는 거절한다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await fillResourceStep(user)

    await user.click(await screen.findByRole('radio', { name: /직접 입력/ }))
    const field = screen.getByLabelText('사용 종료일')
    fireEvent.change(field, { target: { value: '2020-01-01' } })
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('종료일은 오늘 이후여야 합니다.')).toBeInTheDocument()
  })

  test('종료일이 없는 항목은 무기한으로 읽힌다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await fillResourceStep(user)

    const indefinite = offerablePeriods().find((period) => period.endDate == null)!
    const radios = await screen.findAllByRole('radio')
    await user.click(
      radios.find((radio) => radio.closest('label')?.textContent?.includes(indefinite.displayName))!,
    )
    await user.click(screen.getByRole('radio', { name: '캡스톤 3조' }))
    await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.type(screen.getByLabelText('사용 목적'), '교내 서비스')
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText(/무기한/)).toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 서버가 되돌려준 오류', () => {
  /**
   * 이 개편이 존재하는 이유다. 접속 이름 중복은 서버만 아는 실패인데, 종전에는 그
   * 문구가 마지막 단계에 목록으로만 떠서 고칠 칸까지 「이전」을 세 번 눌러야 했다.
   */
  test('422가 그 값을 입력한 단계로 되돌리고 해당 칸에 붙는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/requests', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '입력값이 올바르지 않습니다',
            status: 422,
            detail: '입력값을 확인해 주세요.',
            code: 'VALIDATION_FAILED',
            errors: [{ field: 'vm.desiredSlug', message: '이미 사용 중인 이름입니다.' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderWizard()
    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '캡스톤 백엔드 서버')
    await user.type(screen.getByLabelText('접속 이름'), 'capstone-api-server')
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '신청 제출' }))

    const slug = await screen.findByLabelText('접속 이름')
    expect(slug).toHaveAttribute('aria-invalid', 'true')
    expect(slug).toHaveFocus()
    expect(screen.getByText('이미 사용 중인 이름입니다.')).toBeInTheDocument()
    expect(screen.getByText(/되돌아왔습니다/)).toBeInTheDocument()
    // 원시 경로가 그대로 새지 않는다.
    expect(screen.queryByText(/vm\.desiredSlug/)).not.toBeInTheDocument()
  })

  test('입력을 고치면 되돌려받은 오류가 사라진다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/requests', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '입력값이 올바르지 않습니다',
            status: 422,
            detail: '입력값을 확인해 주세요.',
            code: 'VALIDATION_FAILED',
            errors: [{ field: 'vm.desiredSlug', message: '이미 사용 중인 이름입니다.' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderWizard()
    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '캡스톤 백엔드 서버')
    await user.type(screen.getByLabelText('접속 이름'), 'capstone-api-server')
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '신청 제출' }))

    await screen.findByText('이미 사용 중인 이름입니다.')
    await user.type(screen.getByLabelText('접속 이름'), '-2')
    await waitFor(() =>
      expect(screen.queryByText('이미 사용 중인 이름입니다.')).not.toBeInTheDocument(),
    )
  })
})

describe('VM 신청 위저드 — 확인 단계', () => {
  test('단계별 구획으로 나오고 수정 링크가 그 단계로 데려간다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await fillResourceStep(user)
    await fillRequestStep(user)

    expect(screen.getByRole('heading', { name: '만들 리소스' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '신청 내용' })).toBeInTheDocument()

    const [editResource] = screen.getAllByRole('button', { name: '수정' })
    await user.click(editResource)
    // 입력을 잃지 않고 그 단계로 돌아온다.
    expect(await screen.findByLabelText('이름')).toHaveValue('캡스톤 백엔드 서버')
  })
})

describe('VM 신청 위저드 — 초안', () => {
  test('새로고침해도 작성 중이던 값이 남는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '캡스톤 백엔드 서버')

    const saved = sessionStorage.getItem(REQUEST_DRAFT_KEY)
    expect(saved).toContain('캡스톤 백엔드 서버')

    renderWizard('/console/requests/new?step=resource')
    expect(await screen.findByLabelText('이름')).toHaveValue('캡스톤 백엔드 서버')
  })
})

describe('VM 신청 위저드 — 스코프', () => {
  test('워크스페이스 스코프로 들어오면 그 워크스페이스가 골라져 있다', async () => {
    const user = userEvent.setup()
    renderWizard(`/console/${uuid(12)}/requests/new`)
    await passKindStep(user)
    await fillResourceStep(user)

    expect(await screen.findByRole('radio', { name: '캡스톤 3조' })).toBeChecked()
  })
})

describe('VM 신청 위저드 — 제출', () => {
  test('전체 단계를 통과하면 계약에 맞는 페이로드로 제출한다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: '리소스 신청' })

    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '캡스톤 백엔드 서버')
    await user.type(screen.getByLabelText('접속 이름'), 'capstone-api-server')
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.type(screen.getByLabelText('사용 목적'), '캡스톤 백엔드 API 서버 운영')
    await user.type(screen.getByLabelText('수업이나 프로젝트'), '2026-1 캡스톤디자인')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText('백업 책임 안내')).toBeInTheDocument()
    expect(screen.getByText('capstone-api-server')).toBeInTheDocument()
    expect(screen.getByText('2 vCPU, 1 GiB 메모리, 32 GiB 디스크')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))

    expect(
      await screen.findByRole('heading', { name: '신청이 접수되었습니다' }),
    ).toBeInTheDocument()

    expect(createdRequestBodies).toHaveLength(1)
    expect(createdRequestBodies[0]).toEqual({
      type: 'VM',
      workspaceId: uuid(12),
      orgId: uuid(1),
      purpose: '캡스톤 백엔드 API 서버 운영',
      courseOrProject: '2026-1 캡스톤디자인',
      extraNote: null,
      periodPresetId: uuid(21),
      reqEndDate: null,
      displayName: '캡스톤 백엔드 서버',
      vm: {
        imageId: uuid(1),
        flavorId: uuid(31),
        reqVcpu: 2,
        reqMemoryMb: 1024,
        reqDiskGb: 32,
        specReason: null,
        desiredSlug: 'capstone-api-server',
      },
    })
  })

  test('제출한 뒤 URL에 단계가 남지 않는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await fillResourceStep(user)
    await fillRequestStep(user)
    await user.click(screen.getByRole('button', { name: '신청 제출' }))

    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })
    expect(window.location.search).not.toContain('step=')
  })
})

describe('신청 위저드 — 사양 안내 문구', () => {
  test('예약된 접속 이름은 서버에 가기 전에 막는다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await passKindStep(user)
    await user.type(await screen.findByLabelText('이름'), '캡스톤 백엔드 서버')
    await user.type(screen.getByLabelText('접속 이름'), requestOptions.reservedSubdomains[0])
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText(/예약된 이름이라 쓸 수 없습니다/)).toBeInTheDocument()
  })
})
