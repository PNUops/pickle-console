# pickle-console

Frontend of Pickle (부산대학교 클라우드 플랫폼): public landing page and the
user / org-admin / sys-admin console. React 19 + Vite + TypeScript.
All user-facing text is Korean.

Design documents live in the `pickle-docs` repository (`docs/plan/`).

## Development

```bash
scripts/setup-hooks.sh   # once: install git hooks
npm install
npm run dev              # local dev server (proxies /api to pickle-api)
scripts/verify.sh        # lint + typecheck + build
```

API types are generated from the pickle-api OpenAPI document; the spec is the
single contract between the repos.
