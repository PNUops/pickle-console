# pickle-console

Pickle(피클)은 부산대학교 구성원을 위한 셀프서비스 클라우드 플랫폼이다. 사용자가 웹
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
scripts/verify.sh        # lint(oxlint) → typecheck → vitest → build → npm audit
```

## 구성

콘솔은 API를 **동일 오리진 `/api`**로 호출한다(런타임 API 베이스 URL 환경변수 없음).
로컬 개발에서는 Vite 프록시가 `/api`·`/terminal/ws`를 로컬 pickle-api(`:8080`)로
넘기고(`vite.config.ts`), 운영에서는 nginx가 정적 산출물을 서빙하며 같은 도메인의
`/api`를 백엔드로 프록시한다.

## 저장소 구조

- `src/api/` — 생성된 API 타입(`schema.d.ts`) + 쿼리 래퍼
- `src/auth/` — 권한·역할 판정 / `src/layouts/`·`src/components/` — 공용 UI
- `src/pages/` — 화면(랜딩·사용자·관리자·터미널) / `src/terminal/` — 웹 터미널
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
