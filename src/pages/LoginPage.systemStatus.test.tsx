import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { setSystemStatus } from '../test/msw/handlers/reference'
import { renderApp } from '../test/render'

describe('로그인 화면의 공지·문의처', () => {
  test('공지 배너와 문의 이메일이 로그인 화면에 노출된다', async () => {
    setSystemStatus({ bannerMessage: '서비스 점검 안내입니다', contactEmail: 'ops@pickle.local' })
    renderApp('/login')

    expect(await screen.findByText('서비스 점검 안내입니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ops@pickle.local' })).toHaveAttribute(
      'href',
      'mailto:ops@pickle.local',
    )
  })
})
