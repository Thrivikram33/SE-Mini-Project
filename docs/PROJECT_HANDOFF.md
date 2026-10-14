# Project Handoff

Last audited: 2026-10-14

## Repository state

- Branch: `feature/project-foundation`
- HEAD: `406f319` (same commit as `main` at audit time)
- Existing workspace work is preserved: `README.md` and the CI workflow are modified; root ignore rules, frontend, backend, and docs additions are untracked. Do not reset, clean, or discard these files.
- No files were staged, committed, or pushed. The feature branch has no upstream set; remote lookup failed, so remote state is unverified.

## Implemented code

- Frontend: React 19/Vite app with railway search, account and booking dialogs, passenger booking history/PNR lookup, cancellation, and admin workspace. Search uses the API when available; home cards are explicitly marked sample content.
- Hero art: React Three Fiber procedural train scene is now imported only when WebGL is available and reduced motion is off; unsupported WebGL, scene-load/context-loss errors, and reduced-motion preference use the static fallback. CSS includes responsive breakpoints and a reduced-motion rule. Build passes, but no browser/device visual run was available in this audit.
- Backend: Express API with MySQL repositories, bcrypt password hashing, JWT HttpOnly cookie and bearer support, role checks, parameterized SQL, train search/availability, booking and cancellation transactions, payment/refund simulator, and admin routes.
- Database: additive `001_initial_schema.sql` migration and opt-in fictional demo seed exist. Migration, seed, and demo-admin scripts refuse to run outside `NODE_ENV=development` and `MYSQL_DATABASE=railway_reservation_dev`; the seed additionally requires `DEMO_SEED_ENABLED=1`. Guard tests invoked the scripts with a wrong target and verified refusal before any connection; no database mutation was attempted.

## Verified locally on 2026-10-14

- Frontend `npm.cmd run lint`: PASS after correcting the admin panel mount loading effect.
- Frontend `npm.cmd run build`: PASS (38 modules). The conditional lazy Three.js chunk is 736.50 kB raw / 186.65 kB gzip; build completes but reports the chunk-size advisory.
- Backend `npm.cmd test`: PASS, 31/31 tests. Twenty-three direct unit/script-guard tests and eight local HTTP/API tests use fake/test-double persistence; none exercises MySQL.
- Backend `npm.cmd run lint`: PASS. Note: this script only runs `node --check` on `src/server.js` and `src/app.js`, not a comprehensive lint configuration.
- Redacted local config check: `backend/.env` is ignored and targets `railway_reservation_dev`; its JWT secret was replaced with a cryptographically random local development secret after a redacted entropy check found the previous value malformed. The local MySQL password is now non-placeholder, but a read-only connection as `rrs_app` to `railway_reservation_dev` is rejected with `ER_ACCESS_DENIED_ERROR`; this does not establish whether the password, account host, or grants are the cause.
- MySQL80 is running. A sanitized read-only connection using configured app credentials failed with `ER_ACCESS_DENIED_ERROR` (`rrs_app` at localhost, password supplied); the schema/data could not be inspected. No database migration, seed, or account promotion was run. No DB-backed or browser end-to-end verification was completed.
- CI workflow YAML parses locally and now defines Node 22 frontend lint/build and backend syntax/unit-test jobs. GitHub Actions was not run or observed.

## Required continuation

1. In MySQL Workbench or an authenticated local administrator terminal, verify the local server identity and inspect `rrs_app` host entries, grants, and `railway_reservation_dev` schema/table/data state. Do not send credentials in chat.
2. Report the read-only inspection results. If setup is needed, request explicit approval for the exact account/schema/grant/migration operations before any writes; stop if the target contains unexpected data.
3. After approval and safe inspection, review migration impact and correct schema drift handling before applying an approved non-destructive development migration. Seed only if separately needed and approved.
4. Add/run actual MySQL-backed integration and concurrent-seat tests for passenger and admin workflows.
5. Re-run checks, then stage only intended files after explicit user authorization. Do not commit or push until separately authorized.

## Review findings to carry forward

- Error responses do not expose unknown error messages; this audit also removed the unknown-message log field and moved request-ID creation before JSON parsing.
- Malformed/oversized JSON now returns safe 400/413 errors, malformed session-cookie encoding returns 401, and focused tests cover the HTTP request ID and safe internal-error logging.
- Booking and cancellation services use transactions and row locks; the uniqueness constraint on active seat allocations is a useful database backstop. Actual InnoDB locking behavior and duplicate prevention remain unverified without the target database.
- WebGL reduced-motion, static fallback, and responsive behavior were reviewed in source only. No browser, narrow-device, keyboard, or screen-reader run was performed.
- Setup docs now use the selected development database name consistently; actual local credential setup remains pending.
- Requirement-by-requirement code/test status is in [`RTM_IMPLEMENTATION.md`](RTM_IMPLEMENTATION.md). STP duplicate admin cases and the cancellation seat-release mapping discrepancy are in [`STP_DISCREPANCIES.md`](STP_DISCREPANCIES.md); approved source documents remain untouched.
