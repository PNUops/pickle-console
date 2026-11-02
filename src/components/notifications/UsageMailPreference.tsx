import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyNotificationPreferences, updateMyNotificationPreferences } from '../../api/queries'
import { ApiError, toApiError } from '../../api/problem'
import { sameNotificationReader, useCurrentNotificationReader, type NotificationReader } from '../../lib/notification-reader'
import { UsageMailPreferenceCard } from './UsageMailPreferenceCard'

const preferenceKey = (reader: NotificationReader) => ['notification-preferences', reader.account, reader.context] as const

export function UsageMailPreference({ reader }: { reader: NotificationReader }) {
  const client = useQueryClient()
  const current = useCurrentNotificationReader(reader)
  const [result, setResult] = useState<{ reader: NotificationReader; message: string; failed: boolean } | null>(null)
  const query = useQuery({ queryKey: preferenceKey(reader), staleTime: 0, refetchOnMount: 'always',
    queryFn: async ({ signal }) => {
      if (!sameNotificationReader(current.current, reader)) throw new ApiError(null, '로그인 상태가 바뀌었습니다.')
      const response = await fetchMyNotificationPreferences(signal)
      if (!sameNotificationReader(current.current, reader)) throw new ApiError(null, '로그인 상태가 바뀌었습니다.')
      return { reader, response }
    } })
  const data = sameNotificationReader(query.data?.reader, reader) ? query.data?.response : undefined
  const save = useMutation({ mutationKey: ['notification-preference-write', reader.account, reader.context],
    mutationFn: (operation: { reader: NotificationReader; value: boolean }) => {
      if (!sameNotificationReader(current.current, operation.reader)) throw new ApiError(null, '로그인 상태가 바뀌었습니다.')
      return updateMyNotificationPreferences({ usageMailEnabled: operation.value })
    },
    onSuccess: async (response, operation) => {
      if (!sameNotificationReader(current.current, operation.reader)) return
      await client.cancelQueries({ queryKey: preferenceKey(operation.reader), exact: true })
      if (!sameNotificationReader(current.current, operation.reader)) return
      client.setQueryData(preferenceKey(operation.reader), { reader: operation.reader, response })
      setResult({ reader: operation.reader, message: '사용량 알림 메일 설정을 저장했습니다.', failed: false })
    },
    onError: (error, operation) => {
      if (!sameNotificationReader(current.current, operation.reader)) return
      setResult({ reader: operation.reader, message: toApiError(error, '메일 설정을 저장하지 못했습니다.').message, failed: true })
    } })
  const ownResult = sameNotificationReader(result?.reader, reader) ? result : null
  const saving = save.isPending && sameNotificationReader(save.variables?.reader, reader)
  return <UsageMailPreferenceCard enabled={data?.usageMailEnabled} loading={query.isFetching && !data}
    saving={saving} error={ownResult?.failed ? ownResult.message : query.isError ? query.error.message : null}
    message={ownResult && !ownResult.failed && !query.isError ? ownResult.message : null}
    onEdited={() => setResult(null)} onSave={(value) => save.mutate({ reader, value })}
    onRetry={() => { if (sameNotificationReader(current.current, reader)) void query.refetch() }} />
}
