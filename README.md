# pickle-console

Pickle(피클)은 부산대학교 구성원을 위한 셀프서비스 클라우드 플랫폼 **PNU Cloud**(정식 명칭: 부산대학교 클라우드 플랫폼)의 코드네임이다. 사용자가 웹
콘솔에서 VM을 신청하면 관리자 승인 후 Proxmox VE에 자동 프로비저닝되며, SSH 접속과
도메인 기반 HTTP(S) 공개까지 제공한다. 이 저장소는 그중 웹 콘솔(랜딩 페이지 +
사용자 / 기관 관리자 / 시스템 관리자 콘솔)을 담당한다.

## 스택 · 요구사항

- **React 19 + Vite + TypeScript** 기반 정적 SPA (빌드 산출물을 nginx로 서빙).
- **Node.js 24**(LTS) 필요 — `package.json`의 `engines`에 명시.
- 사용자 대상 텍스트는 전부 한국어.

## 개발

```bash
scripts/setup-hooks.sh   # 최초 1회: git 훅 설치
npm install
npm run dev              # 로컬 개발 서버 (/api·/terminal/ws 를 로컬 pickle-api :8080 으로 프록시)
scripts/verify.sh        # 커밋 전 전체 검증 — lint·typecheck·test·build·audit + 공개 위생 검사 (아래 참조)
```

개별 스크립트:

| 명령 | 내용 |
|---|---|
| `npm run dev` | Vite 개발 서버 |
| `npm run lint` | oxlint (`--deny-warnings`, 경고도 실패로 취급) |
| `npm run typecheck` | `tsc -b` 타입 검사 |
| `npm run test` | vitest 1회 실행(`vitest run`) |
| `npm run test:watch` | vitest 워치 모드 |
| `npm run build` | `tsc -b` 후 프로덕션 빌드 |
| `npm run preview` | 빌드 산출물 로컬 미리보기 |
| `npm run gen:api` | API 타입 재생성(아래 "API 타입 생성" 참조) |

`scripts/verify.sh`는 lint → typecheck → test → build를 차례로 실행한 뒤
**차단 게이트**로 `npm audit --omit=dev --audit-level=high`를 돌린다. 런타임
의존성에 high 이상 취약점이 하나라도 있으면 검증이 실패한다. 그 뒤에 나오는 전체
트리 감사(`npm audit`, dev 의존성 포함)는 참고용 출력이며 검증을 실패시키지 않는다.

## 구성

콘솔은 API를 **동일 오리진 `/api`**로 호출한다(런타임 API 베이스 URL 환경변수 없음).
로컬 개발에서는 Vite 프록시가 `/api`·`/terminal/ws`를 로컬 pickle-api(`:8080`)로
넘기고(`vite.config.ts`), 운영에서는 nginx가 정적 산출물을 서빙하며 같은 도메인의
`/api`를 백엔드로 프록시한다.

## 저장소 구조

- `src/api/` — 생성된 API 타입(`schema.d.ts`) + 쿼리 래퍼
- `src/auth/` — 권한·역할 판정 / `src/layouts/`·`src/components/` — 공용 UI
- `src/pages/` — 화면(랜딩·사용자·관리자·터미널) / `src/terminal/` — 웹 터미널
- `src/lib/` — 공용 유틸(상태·라벨 매핑, 포맷, 검증, 폼 오류, 훅)
- `src/test/` — vitest + MSW 목

## API 타입 생성

```bash
npm run gen:api
```

공개된 pickle-api 계약 스펙(`../api/contract/openapi.yaml`)에서 `openapi-typescript`로
타입을 생성한다 — `gen:api`는 **pickle-api 저장소가 형제 디렉터리(`../api`)로 체크아웃돼
있다고 가정**한다. 산출물 `src/api/schema.d.ts`는 저장소에 커밋되어 있으며, 계약이
바뀌면 다시 생성해 커밋한다.

## 커밋 규약

커밋 메시지는 `type: subject` 형식(영어, 명령형, 72자 이내)을 따르며, `setup-hooks.sh`
로 설치되는 commit-msg 훅이 이를 강제한다.

`scripts/hygiene.sh`는 이 저장소가 공개물이라는 전제를 검사한다 — 비공개 문서 저장소나 인프라 저장소를 가리키는 참조, 내부 진행 표기(마일스톤·웨이브 등)가 있으면 검증이 실패한다. 수동 점검이 두 차례 위반을 놓친 뒤 자동화했다.
