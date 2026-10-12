import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { resolve } from 'node:path'
import { scanDevelopmentOutput } from './scripts/scan-development-output.ts'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const PRODUCTION_HOST = 'pickle.pusan.ac.kr'
const DEVELOPMENT_HOST = 'pickle.pnuops.com'
const PRODUCTION_SSH_HOST = 'ssh.pcl.kr'
const PRODUCTION_LLM_BASE_URL = 'https://llm.pcl.kr/v1'

function devHost(value: string, name: string): string {
  if (!value) return ''
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pnuops\.com$/.test(value)) {
    throw new Error(`${name} must be a dedicated pnuops.com hostname`)
  }
  return value
}

function devLlmBaseUrl(value: string): string {
  if (!value) return ''
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('VITE_DEV_LLM_BASE_URL must be an HTTPS URL under pnuops.com')
  }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pnuops\.com$/.test(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/v1') {
    throw new Error('VITE_DEV_LLM_BASE_URL must be an HTTPS /v1 URL under pnuops.com')
  }
  return url.href.replace(/\/$/, '')
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const target = env.VITE_DEPLOY_TARGET || (command === 'serve' && mode !== 'test' ? 'development' : 'production')
  if (target !== 'production' && target !== 'development') {
    throw new Error('VITE_DEPLOY_TARGET must be production or development')
  }
  if (target === 'production' && (env.VITE_DEV_SSH_HOST || env.VITE_DEV_LLM_BASE_URL)) {
    throw new Error('Development endpoints are not accepted in a production build')
  }

  const publicHost = target === 'production' ? PRODUCTION_HOST : DEVELOPMENT_HOST
  const sshHost = target === 'production' ? PRODUCTION_SSH_HOST : devHost(env.VITE_DEV_SSH_HOST || '', 'VITE_DEV_SSH_HOST')
  const llmBaseUrl = target === 'production' ? PRODUCTION_LLM_BASE_URL : devLlmBaseUrl(env.VITE_DEV_LLM_BASE_URL || '')

  let outputDirectory = ''
  let writeOutput = true

  return {
    plugins: [react(), tailwindcss(), {
      name: 'deployment-social-preview-origin',
      transformIndexHtml(html) {
        return html.replaceAll('PICKLE_PUBLIC_HOST', publicHost)
      },
    }, {
      name: 'reject-production-hosts-in-development',
      apply: 'build',
      configResolved(config) {
        outputDirectory = resolve(config.root, config.build.outDir)
        writeOutput = config.build.write
      },
      closeBundle() {
        if (target === 'development' && writeOutput) {
          scanDevelopmentOutput(outputDirectory, [PRODUCTION_HOST, PRODUCTION_SSH_HOST, 'llm.pcl.kr'])
        }
      },
    }],
    define: {
      PICKLE_DEPLOY_TARGET: JSON.stringify(target),
      PICKLE_PUBLIC_HOST: JSON.stringify(publicHost),
      PICKLE_SSH_GATEWAY_HOST: JSON.stringify(sshHost),
      PICKLE_LLM_API_BASE_URL: JSON.stringify(llmBaseUrl),
    },
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
  }
})
