import { expect, test } from 'vitest'
import { fetchMyNotificationPreferences, updateMyNotificationPreferences, fetchNotifications } from '../../api/queries'
import { setAccessToken } from '../../api/token'
import { seedUsageAlertNotifications, seedUsageMailFixture } from './handlers/notifications'

test('personal mock settings default ON and persist only for their authenticated account', async () => {
  setAccessToken('access-user')
  seedUsageAlertNotifications('demo')
  expect((await fetchMyNotificationPreferences()).usageMailEnabled).toBe(true)
  const before = await fetchNotifications()
  expect(await updateMyNotificationPreferences({ usageMailEnabled: false })).toEqual({ usageMailEnabled: false })
  expect((await fetchMyNotificationPreferences()).usageMailEnabled).toBe(false)
  expect(await fetchNotifications()).toEqual(before)
  setAccessToken('access-user-b')
  expect((await fetchMyNotificationPreferences()).usageMailEnabled).toBe(true)
  setAccessToken('access-user')
  expect((await fetchMyNotificationPreferences()).usageMailEnabled).toBe(false)
})

test('a mock save failure does not change the saved personal flag', async () => {
  setAccessToken('access-user')
  seedUsageMailFixture('save-error')
  await expect(updateMyNotificationPreferences({ usageMailEnabled: false })).rejects.toMatchObject({ problem: { status: 503 } })
  expect((await fetchMyNotificationPreferences()).usageMailEnabled).toBe(true)
})
