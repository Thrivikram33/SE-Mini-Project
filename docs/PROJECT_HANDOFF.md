# Project handoff

Last verified locally: 2026-11-08
Current branch: `feature/issue-15-completion`
Issue #10 pull request: [#44](https://github.com/Thrivikram33/SE-Mini-Project/pull/44), merged into `main`; its latest recorded CI-verified commit is `6433806`.

## Issue #10 — RRS-F-010

The booking service validates the schedule, route, class and selected seats in a transaction; locks selected seat rows in sorted database order; associates each seat to the passenger in the same request position; and atomically writes the booking, passengers, active allocations and payment result. Failed simulated payment commits a failed booking without a PNR and marks temporary allocations `RELEASED`. The database's unique generated active-seat key prevents duplicate `HELD` or `CONFIRMED` allocation for one seat.

Continuation changes preserve submitted seat order for passenger mapping, add an additive composite booking/passenger FK in migration `003`, and extend real MySQL tests to cover actual booking-service same-seat and different-seat concurrency, rollback, payment failure, allocation release, and passenger association constraints. The integration test refuses remote hosts, the wrong DB name, partial/unexpected table sets, non-InnoDB tables, and populated test schemas. It does not drop or truncate anything.

## Database and lifecycle limits

- Migrations `001` and `002` are existing project files; migration `003_enforce_booking_passenger_pair.sql` adds a unique `(booking_id, passenger_id)` index and a composite FK. It preserves rows and uses restrictive deletion behavior.
- The schema and booking logic use InnoDB transactions. MySQL's unique-key conflict is an additional guard; actual local behavior remains unverified until the dedicated suite runs.
- This branch has no cancellation route or service. Cancellation history exists in the schema, and released allocations become available in search and seat selection, but cancellation itself is not implemented or verified here.
- The integration test targets only `railway_reservation_issue10_test` on localhost/loopback. It requires a dedicated account and an empty or fully migrated, empty test schema. The test creates schema tables if none exist, applies project migrations, and cleans only its fixture records.

## Verification results

- `cd backend; npm.cmd test -- --test-reporter=spec`: **PASS, 92/92** after `npm.cmd ci`.
- `cd backend; node --check integration/mysql-inventory.integration.js; node --check src/services/bookingService.js; node --check test/booking.test.js`: **PASS**.
- `cd backend; npm.cmd audit --omit=dev`: **PASS, zero vulnerabilities** after the lockfile remediation.
- `cd frontend; npm.cmd run build`: **PASS** after `npm.cmd ci`.
- `cd frontend; npm.cmd run lint`: **PASS**.
- `cd backend; npm.cmd run test:mysql`: **BLOCKED before connecting locally** because `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are absent. Docker Desktop's engine is not running. No local test database was changed.
- GitHub Actions run [#42163380848](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42163380848) on `6433806`: **PASS** — repository checks, backend tests, isolated MySQL inventory/concurrency tests, and frontend production build all succeeded.

Continuation changes are split into implementation, MySQL test/schema, dependency security, and documentation commits. The code and current documentation commits are listed in `docs/PROGRESS_TRACKER.md`.

## Exact next steps

1. Provide an isolated local MySQL 8 test service and dedicated credentials through the required test-only environment variables, then run `npm.cmd run test:mysql` from `backend/`.
2. Review migration `003` against any persistent development database before applying it there; preflight for existing mismatched booking/passenger associations.
3. Implement and verify cancellation only after the project provides the cancellation eligibility and refund policy for this branch.
4. PR #44 is merged; its implementation and CI history are retained above for Issue #10 reference.

## Issue #15 — RRS-F-012 Booking retrieval

The current Issue #15 branch adds passenger-only booking history at `GET /api/bookings` and owner-scoped ticket retrieval at `GET /api/bookings/:pnr`. PNR input is normalized and malformed, unknown, and non-owned values share a safe not-found response. SQL access is parameterized and isolated in `bookingQueryRepository`. The frontend `/bookings` page provides account history and PNR lookup; `/ticket?pnr=...` retrieves a ticket while immediate post-booking ticket navigation remains supported. No schema migration is required.

Local verification on 2026-11-08: backend unit/API suite **PASS (107 tests)**; frontend ESLint **PASS**; frontend production build **PASS**; backend changed-file syntax checks **PASS**. The real MySQL integration run is **BLOCKED locally** because the dedicated `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` variables are absent. The existing `backend/.env` development connection was checked read-only and rejected with `ER_ACCESS_DENIED_ERROR`; no migration or database write was attempted. Issue #15's added MySQL assertions remain subject to CI or a correctly provisioned isolated test database.

Issue #15 PR: [#49](https://github.com/Thrivikram33/SE-Mini-Project/pull/49), open against `main`; Issue #15 remains open. GitHub Actions run [#42475826312](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42475826312) on test commit `e2a322c` **PASSED**: backend unit tests, isolated MySQL inventory/retrieval/concurrency integration, repository checks, and frontend production build. The workflow was triggered by the PR. This is CI evidence, separate from the blocked local MySQL connection. Do not merge the Issue #15 PR or close Issue #15 as part of this task.
