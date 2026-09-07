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
    // 워커 수를 환경이 정할 수 있게 연다. 기본값(코어 수에 맞춘 vitest 기본)은
    // 그대로 두고, 값이 있을 때만 덮는다.
    //
    // **이 손잡이가 필요한 곳은 배포 호스트 한 군데다.** 그 기계는 40코어이지만
    // 플랫폼(api, 게이트웨이, VM)이 함께 돌고, 코어 수에 맞춰 워커를 띄우면
    // 1분 부하 평균이 15까지 올라간다. 그 상태에서 타이밍에 민감한 시험이
    // 떨어지는데, 그 부하를 만든 것이 시험 자신이라 재시도할수록 나빠진다.
    // 실제로 2026-09-06 배포가 두 번 막혔고 두 번 다 다른 시험이었으며,
    // 같은 파일을 격리해 돌리면 통과했다.
    //
    // 개발 기계와 CI는 값을 주지 않으므로 아무것도 달라지지 않는다.
    ...(process.env.PICKLE_TEST_MAX_WORKERS
      ? {
          maxWorkers: process.env.PICKLE_TEST_MAX_WORKERS,
          minWorkers: 1,
        }
      : {}),
  },
})
