import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      // 웹 터미널 WebSocket. dev에서는 api와 같은 백엔드로 프록시하고,
      // 운영에서는 nginx가 `/terminal/ws`를 브리지(LXC 102)로 분기한다.
      // 정확 경로만 프록시한다 — 프리픽스('/terminal')로 잡으면 dev에서
      // '/terminal'로 시작하는 미래 SPA 라우트까지 백엔드로 넘어가 버린다.
      '/terminal/ws': { target: 'http://localhost:8080', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // asyncUtilTimeout(5s, setup.ts)보다 넉넉히 커야, findBy가 정말 실패할 때
    // 무의미한 "test timed out" 대신 RTL의 정확한 "unable to find" 오류가 뜨고
    // 부하 상황에서 다단계 대기가 이어져도 여유가 남는다.
    testTimeout: 20_000,
  },
})
