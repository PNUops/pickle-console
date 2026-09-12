import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { createdRequestBodies } from '../../test/msw/handlers/requests'
import { renderApp } from '../../test/render'
import { server } from '../../test/msw/server'

beforeEach(() => vi.stubEnv('VITE_GPU_PREVIEW', '1'))
afterEach(() => vi.unstubAllEnvs())

describe('GPU request wizard', () => {
  test('requires a duration and submits days as hours without a VM', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?kind=GPU')
    await user.type(await screen.findByLabelText('이름'), '연구용 GPU')
    expect(screen.getByLabelText('희망 GPU 임대 기간')).toHaveValue(null)
    expect(screen.queryByText('나중에 바꿀 수 있습니다.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('대상 VM')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('희망 임대 기간을 1 이상의 정수로 입력해 주세요.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('희망 GPU 임대 기간'), '2')
    await user.selectOptions(screen.getByLabelText('기간 단위'), 'days')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.type(screen.getByLabelText('사용 목적'), '모델 학습 실습')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('2일')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await waitFor(() => expect(createdRequestBodies.at(-1)?.gpu).toEqual({ vmId: null, leaseHours: 48 }))
    expect(createdRequestBodies.at(-1)?.type).toBe('GPU')
  })
})
