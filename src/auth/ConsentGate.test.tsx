import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, studentProfile, studentUser } from '../test/msw/handlers/auth'
import { currentTerms } from '../test/msw/handlers/consent'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('약관 재동의 게이트', () => {
  test('pendingConsents가 있으면 게이트가 뜨고, 동의하면 사라진다', async () => {
    const user = userEvent.setup()
    let accepted = false
    server.use(
      refreshSuccessHandler('access-student', studentUser),
      http.get('*/api/v1/me', () =>
        HttpResponse.json(
          accepted ? studentProfile : { ...studentProfile, pendingConsents: currentTerms },
          { status: 200 },
        ),
      ),
      http.post('*/api/v1/me/consents', () => {
        accepted = true
        return HttpResponse.json([], { status: 200 })
      }),
    )

    renderApp('/console')
    expect(
      await screen.findByRole('heading', { name: '약관 재동의가 필요합니다' }),
    ).toBeInTheDocument()

    const boxes = await screen.findAllByRole('checkbox')
    for (const box of boxes) await user.click(box)
    await user.click(screen.getByRole('button', { name: '동의하고 계속하기' }))

    // 게이트가 사라지고 콘솔 대시보드가 렌더링된다
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })
})
