# Input validation and injection protection (RRS-SR-004)

GitHub Issue #24 defines two acceptance criteria: invalid or malicious inputs are handled safely, and input handling prevents the tested injection cases.

## Request validation

Backend validation remains in the existing service and route layers. Passenger fields use `passengerDetailsValidator`; account registration now reuses its Unicode-aware person-name rule with the existing registration length limit. Values are trimmed only where the API already normalizes them. Passwords are passed unchanged to bcrypt. Booking, train search, fare, seat selection, and administrator services retain their existing type, range, identifier, date, enum, and nested-structure checks. Administrator and booking writes remain transactional, so validation completes before database mutation.

Malformed JSON returns `400 INVALID_REQUEST`; a body above the existing 10 KB parser limit returns `413 REQUEST_TOO_LARGE`; unsupported encodings return `415 UNSUPPORTED_MEDIA_TYPE`. Unexpected failures return a generic 500 response. The shared error handler logs only a safe error code/type, not parser excerpts, SQL details, or submitted values.

## SQL and browser rendering

The backend query audit found user-controlled values passed through MySQL `execute` bind parameters. Search ordering is a fixed SQL expression. The only generated placeholder list is sized from validated route stops; no user-controlled table, column, sort expression, or SQL fragment is interpolated. No SQL migration or dependency was needed.

Frontend source inspection found user values rendered through normal React text interpolation. No `dangerouslySetInnerHTML`, `innerHTML`, or user-controlled URL navigation was found. React's server renderer regression test confirms markup, event-handler, SVG, encoded, malformed, and JavaScript-URL text remains non-executable text. No HTML sanitization package was added.

## Verification recorded 2026-11-12

- `cd backend; npm.cmd test -- --test-reporter=spec`: **PASS, 174/174**.
- `cd backend; node --test test/trainSearch.test.js`: **PASS, 25/25**. Injection payloads were absent from SQL text and remained bound values; caller sort input did not change ordering or SQL structure.
- `cd backend; npm.cmd run test:mysql`: **BLOCKED before connecting** because `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are not configured. The test guard refused to connect; no database was changed.
- `cd frontend; npm.cmd test`: **PASS, 12/12**.
- `cd frontend; npm.cmd run lint`: **PASS**.
- `cd frontend; npm.cmd run build`: **PASS** with Vite 8.3.4.
- `npm.cmd audit --omit=dev` in both backend and frontend: **PASS, zero production dependency vulnerabilities**. Frontend `npm ci` reported four moderate findings across the full dependency tree; no dependency or lockfile change was made for this issue.
- `git diff --check`: **PASS** before commits.

Backend and frontend tests use mocks and React server rendering where applicable. The repository's GitHub Actions workflow runs backend tests, an isolated MySQL 8 integration suite, and a frontend build. GitHub Actions run [#43215110468](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/43215110468) **PASSED** repository checks, backend tests, isolated MySQL integration, and frontend build on code commit `78fe96b`. This provides CI database evidence; local MySQL remains unverified. A documentation-only push triggers a follow-up run.

## Scope note

This change applies field-appropriate validation and relies on bound SQL parameters and React output escaping. It does not strip markup from free-form administrative train names because those values are displayed as escaped text, not HTML. No browser-based XSS runner is configured in this repository.
