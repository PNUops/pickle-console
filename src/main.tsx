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
import { ToastProvider } from './components/ui'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
