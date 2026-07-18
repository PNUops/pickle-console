import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { setAccessToken } from './token'
import { api } from './client'
import { onMaintenanceDetected } from './maintenance'

describe('점검 모드 503 감지', () => {
  test('503 MAINTENANCE_MODE 응답이 점검 알림을 발화한다', async () => {
    setAccessToken('access-student')
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json(
          { type: 'about:blank', title: '서비스 점검 중', status: 503, code: 'MAINTENANCE_MODE' },
          { status: 503 },
        ),
      ),
    )
    let fired = false
    const off = onMaintenanceDetected(() => {
      fired = true
    })

    await api.GET('/notifications/unread-count')
    await waitFor(() => expect(fired).toBe(true))
    off()
  })

  test('다른 503(비-점검)은 알림을 발화하지 않는다', async () => {
    setAccessToken('access-student')
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json(
          { type: 'about:blank', title: '일시적 오류', status: 503, code: 'INTERNAL_ERROR' },
          { status: 503 },
        ),
      ),
    )
    let fired = false
    const off = onMaintenanceDetected(() => {
      fired = true
    })

    await api.GET('/notifications/unread-count')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fired).toBe(false)
    off()
  })
})
