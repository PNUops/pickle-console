import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, regularProfile, regularUser } from '../test/msw/handlers/auth'
import { currentTerms } from '../test/msw/handlers/consent'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('약관 재동의 게이트', () => {
  test('pendingConsents가 있으면 게이트가 뜨고, 동의하면 사라진다', async () => {
    const user = userEvent.setup()
    let accepted = false
    server.use(
      refreshSuccessHandler('access-user', regularUser),
      http.get('*/api/v1/me', () =>
        HttpResponse.json(
          accepted ? regularProfile : { ...regularProfile, pendingConsents: currentTerms },
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

  test('제출이 409(버전 불일치)면 프로필을 새로고침하고 재동의로 성공한다', async () => {
    const user = userEvent.setup()
    let accepted = false
    let postCount = 0
    const revisedTerms = currentTerms.map((t) => ({ ...t, version: t.version + 1 }))
    server.use(
      refreshSuccessHandler('access-user', regularUser),
      http.get('*/api/v1/me', () =>
        HttpResponse.json(
          accepted
            ? regularProfile
            : {
                ...regularProfile,
                // after the 409 the reload serves the revised versions
                pendingConsents: postCount === 0 ? currentTerms : revisedTerms,
              },
          { status: 200 },
        ),
      ),
      http.post('*/api/v1/me/consents', () => {
        postCount += 1
        if (postCount === 1) {
          // documents were revised again between load and submit
          return HttpResponse.json(
            {
              code: 'CONSENT_VERSION_MISMATCH',
              status: 409,
              title: '약관 버전이 갱신되었습니다',
              detail: '약관이 개정되었습니다. 최신 내용을 확인한 뒤 다시 동의해 주세요.',
            },
            { status: 409 },
          )
        }
        accepted = true
        return HttpResponse.json([], { status: 200 })
      }),
    )

    renderApp('/console')
    expect(
      await screen.findByRole('heading', { name: '약관 재동의가 필요합니다' }),
    ).toBeInTheDocument()

    // first submit → 409 → the gate refetches the profile (new versions), not a loop
    let boxes = await screen.findAllByRole('checkbox')
    for (const box of boxes) await user.click(box)
    await user.click(screen.getByRole('button', { name: '동의하고 계속하기' }))
    expect(
      await screen.findByText('약관이 갱신되었습니다. 새 내용을 확인한 뒤 다시 동의해 주세요.'),
    ).toBeInTheDocument()

    // re-agree to the revised documents → second submit succeeds → dashboard
    boxes = await screen.findAllByRole('checkbox')
    for (const box of boxes) await user.click(box)
    await user.click(screen.getByRole('button', { name: '동의하고 계속하기' }))
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })
})
