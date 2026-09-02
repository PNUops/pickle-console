import { setupWorker } from 'msw/browser'
import { handlers } from '../test/msw/server'

/**
 * 브라우저에서 도는 목 API.
 *
 * 이 콘솔의 테스트가 이미 API 전체를 목으로 덮고 있다. 같은 핸들러를 브라우저에
 * 물리면 데이터베이스도 api도 Proxmox도 없이 `npm run dev` 하나로 화면을 눌러 볼 수
 * 있고, 접속 이름 중복 같은 서버만 아는 실패도 결정적으로 재현된다. 실서버로는
 * 그 상태를 만들어 두기가 오히려 어렵다.
 *
 * 운영 번들에서는 통째로 사라진다. `import.meta.env.DEV` 가드가 호출부에 있어
 * 이 모듈은 개발 빌드에서만 동적으로 불린다.
 */
export async function startMockApi(): Promise<void> {
  const worker = setupWorker(...handlers)
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
  // 눈으로 보는 사람에게 지금 무엇을 보고 있는지 말해 준다.
  console.info('[pickle] 목 API로 실행 중입니다. 저장되는 것은 없습니다.')
}
