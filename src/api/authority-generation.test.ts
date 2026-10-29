import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { api } from './client'
import { getAccessToken, setAccessToken } from './token'
import { advanceAuthorityGeneration } from './authority-generation'

test('an administrator response from an earlier authority cannot refill current caches', async () => {
  let finish!: () => void
  let started!: () => void
  const issued = new Promise<void>((resolve) => { started = resolve })
  const pending = new Promise<void>((resolve) => { finish = resolve })
  server.use(http.get('*/api/v1/admin/summary', async () => {
    started(); await pending
    return HttpResponse.json({ syntheticEarlierFinancialProjection: 73 })
  }))
  setAccessToken('access-org-admin')
  const response = api.GET('/admin/summary')
  await issued
  advanceAuthorityGeneration()
  finish()
  await expect(response).rejects.toThrow('관리 업무가 변경되었습니다')
  expect(getAccessToken()).toBe('access-org-admin')
})
