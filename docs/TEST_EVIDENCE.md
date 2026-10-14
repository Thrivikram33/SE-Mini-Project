# Test Evidence

Last audited: 2026-10-14

The evidence below reflects commands run in this workspace. Unit, database integration, browser/E2E, GitHub CI, and remote-push evidence are separate and are not interchangeable.

| Category | Check | Result |
|---|---|---|
| Repository | `git status --short --branch`, `git branch --show-current`, `git log -5 --oneline --decorate` | Branch `feature/project-foundation`, HEAD `406f319`. Existing modified/untracked work preserved. No files staged or committed. |
| Whitespace | `git diff --check` plus a read-only scan of untracked text/source files | PASS; no whitespace errors/trailing spaces. Git printed only LF-to-CRLF conversion warnings for modified files. |
| Frontend unit/lint | `npm.cmd run lint` from `frontend/` | PASS, ESLint completed without diagnostics. |
| Frontend production build | `npm.cmd run build` from `frontend/` | PASS; Vite 8.3.4 transformed 38 modules. Three.js chunk is 736.50 kB raw / 186.65 kB gzip and emits the >500 kB size advisory. |
| Backend unit/API/script-guard tests | `npm.cmd test` from `backend/` | PASS, 31 tests, 0 failures, 0 skipped. Twenty-three direct unit/script-guard tests and eight local HTTP/API tests use fake/test-double persistence. No MySQL transaction was exercised. The three mutation-script guard tests use a deliberately wrong target DB name and confirm refusal before connection. |
| Backend syntax | `npm.cmd run lint` from `backend/` | PASS; this script checks `src/server.js` and `src/app.js` only. |
| DB script syntax | `node --check` on `scripts/migrate.js`, `scripts/seed-demo.js`, and `scripts/promote-demo-admin.js` | PASS. These mutation scripts contain target guards; they were not run. |
| Workflow syntax | Python `yaml.safe_load` parse of `.github/workflows/main.yml` and assertion that frontend/backend jobs exist | PASS. GitHub Actions itself was not run. |
| Secret and ignore check | Redacted inspection of `backend/.env`, `git check-ignore`, and high-risk credential-pattern scan outside environment files | PASS for ignore/config hygiene after replacing a malformed low-entropy development JWT value with fresh cryptographic randomness. The JWT value was never printed. Both environment templates remain placeholders. MySQL password in ignored `backend/.env` is non-placeholder; its value was not displayed. |
| MySQL service/connectivity | `Get-Service MySQL80`; read-only Node query through configured `rrs_app` settings | Service is running (Automatic). A sanitized read-only connection as configured `rrs_app` to `railway_reservation_dev` failed with `ER_ACCESS_DENIED_ERROR` (password supplied); no database identity/schema/table/data details could be verified. No credentials were displayed. |
| Database integration | MySQL-backed registration/login, search, booking success/failure, PNR ownership, cancellation/refund/release, Admin CRUD/RBAC | NOT RUN. Requires valid local development credentials, read-only inspection of `railway_reservation_dev`, and explicit approval before any DB modification. |
| Concurrency | Concurrent same-seat allocation and duplicate prevention with InnoDB | NOT RUN. Mock tests do not demonstrate real locking/index behavior. |
| Browser/E2E | Desktop/mobile layout, keyboard/screen-reader checks, 3D/WebGL/reduced-motion runtime, booking journeys | NOT RUN. Code/source review only. |
| Remote/CI | Sanitized origin identity and remote branch lookup | Origin identifies `github.com/Thrivikram33/SE-Mini-Project`; remote `ls-remote` lookup failed with details suppressed. Feature branch has no upstream. CI result and remote state are unverified. No push was attempted. |

Environment: Node.js `v25.1.0`; frontend toolchain engine requirement from installed Vite package is `^20.19.0 || >=22.12.0`. CI is configured for Node 22. Local build/test success does not prove CI success.

## Remaining evidence

- Use MySQL Workbench or an authenticated local administrator session to inspect the local server, account host/grants, and target database read-only. If account/schema/grant/migration changes are needed, obtain explicit approval for the proposed operations before writing.
- Run MySQL integration and concurrency checks after approved setup.
- Run browser/device checks for reduced-motion and WebGL fallbacks, responsive layout, accessibility, and passenger/admin workflows.
- Resolve STP discrepancies only with document-owner approval; see [`STP_DISCREPANCIES.md`](STP_DISCREPANCIES.md).
- Verify GitHub Actions and remote branch state when network access is available. Stage/commit/push only after explicit authorization.
