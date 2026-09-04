import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Pretendard self-host — 필요한 굵기만 로드한다. 각 파일은 unicode-range 서브셋이라
// 실제 사용하는 글자 범위만 지연 로드되며, index.css --font-sans의 "Pretendard"
// 폴백과 family 이름이 매칭된다.
import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/600.css'
import '@fontsource/pretendard/700.css'
import '@fontsource/pretendard/800.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { ReauthProvider } from './auth/ReauthProvider.tsx'
import { ToastProvider } from './components/ui'
import { parseTerminalWindowVmId } from './lib/paths'
import { TerminalWindowRoot } from './terminal/TerminalWindowRoot'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// 터미널 팝업은 콘솔과 다른 문서다. 라우터 안이 아니라 여기서 갈라야
// AuthProvider가 아예 마운트되지 않고, 그래야 팝업이 `/auth/refresh`를 칠 수
// 없다 — 리프레시 토큰이 회전+재사용 탐지 방식이라 부모 탭과 겹치면 체인 전체가
// 폐기되어 모든 탭이 로그아웃된다. 완화하는 대신 레이스를 만들지 않는다.
const terminalVmId = parseTerminalWindowVmId(window.location.pathname)

/**
 * 목 API로 띄우는 개발 모드. `VITE_MOCK_API=1 npm run dev`로 켠다.
 *
 * 동적 import라 운영 번들에는 이 모듈도 msw도 들어가지 않는다. `import.meta.env.DEV`가
 * 함께 걸려 있어 프로덕션 빌드에서는 조건 자체가 상수 false로 접힌다.
 */
async function startMockApiIfRequested(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_MOCK_API !== '1') return
  const { startMockApi } = await import('./dev/mock-browser')
  await startMockApi()
}

await startMockApiIfRequested()

createRoot(document.getElementById('root')!).render(
  terminalVmId !== null ? (
    <StrictMode>
      <TerminalWindowRoot vmId={terminalVmId} />
    </StrictMode>
  ) : (
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ReauthProvider>
              <App />
            </ReauthProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
  ),
)
