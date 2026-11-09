# Project handoff

Last verified locally: 2026-11-09
Current branch: `feature/issue-18-completion`
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
3. Confirm the project's refund policy before implementing a separate refund workflow; Issue #16 cancellation does not calculate or process refunds.
4. PR #44 is merged; its implementation and CI history are retained above for Issue #10 reference.

## Issue #15 — RRS-F-012 Booking retrieval

The current Issue #15 branch adds passenger-only booking history at `GET /api/bookings` and owner-scoped ticket retrieval at `GET /api/bookings/:pnr`. PNR input is normalized and malformed, unknown, and non-owned values share a safe not-found response. SQL access is parameterized and isolated in `bookingQueryRepository`. The frontend `/bookings` page provides account history and PNR lookup; `/ticket?pnr=...` retrieves a ticket while immediate post-booking ticket navigation remains supported. No schema migration is required.

Local verification on 2026-11-08: backend unit/API suite **PASS (107 tests)**; frontend ESLint **PASS**; frontend production build **PASS**; backend changed-file syntax checks **PASS**. The real MySQL integration run is **BLOCKED locally** because the dedicated `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` variables are absent. The existing `backend/.env` development connection was checked read-only and rejected with `ER_ACCESS_DENIED_ERROR`; no migration or database write was attempted. Issue #15's added MySQL assertions remain subject to CI or a correctly provisioned isolated test database.

Issue #15 PR: [#49](https://github.com/Thrivikram33/SE-Mini-Project/pull/49), merged into `main`; Issue #15 is closed. GitHub Actions run [#42476002787](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42476002787) on final Issue #15 commit `e2189a1` **PASSED** all workflow jobs including isolated MySQL retrieval checks.

## Issue #16 — RRS-F-013 cancellation and seat release

The Issue #16 implementation adds `POST /api/bookings/:bookingId/cancel` for
the authenticated passenger who owns a `CONFIRMED` booking. It locks the
booking and schedule, changes the booking to `CANCELLED`, releases all active
allocations, writes a cancellation row and audit event, then commits atomically.
Booking, passenger, payment, and allocation history is preserved. The existing
unique active-seat key becomes available after an allocation is marked
`RELEASED`; no schema migration is required.

Eligibility uses only the confirmed status and session ownership. No cancellation
deadline or fee is introduced. The project has no configured refund policy or
refund simulator, so this Issue #16 change does not calculate a refund or change
the successful payment record. The existing cancellation row refund defaults
remain as defined by the schema; they are not reported as a refund result.

## Issue #18 — RRS-F-015 Administrator management

Issue #18 adds an admin-only management API and responsive `/admin` workspace for train routes, schedules, class fares, coaches, and seat inventory. Existing schema support is reused; no migration is required. Mutations are parameterized and transactional, write administrator audit records, and return safe validation/conflict errors. Train and schedule deactivation is non-destructive. Route, schedule-date, and seat changes are guarded to protect schedule and booking references. Passenger search reads the same underlying records.

Local checks on 2026-11-09: backend `npm.cmd test` **PASS (146 tests)**; frontend ESLint and Vite production build **PASS**; backend changed-file `node --check` **PASS**; `npm.cmd audit --omit=dev` **PASS (0 vulnerabilities)**. The real MySQL suite is **BLOCKED locally before connection** because `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are not configured. Admin lifecycle/search assertions were added to the existing MySQL CI suite and require CI confirmation before database-backed success is claimed. No local database writes or migrations were attempted.

Issue #18 PR: [#52](https://github.com/Thrivikram33/SE-Mini-Project/pull/52), open against `main`; Issue #18 remains open. GitHub Actions run [#42583012006](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42583012006) on test commit `13bad56` **PASSED**: backend tests, isolated MySQL admin lifecycle/search integration, repository checks, and frontend production build. This CI evidence verifies database-backed train/route/schedule/fare/seat writes and search reflection; the local MySQL run remains blocked for missing dedicated credentials. Issue #15 work remains preserved in its merged history.

Local verification on 2026-11-09: backend `npm.cmd test` **PASS (115/115)**;
frontend `npm.cmd run lint` and `npm.cmd run build` **PASS**. The dedicated
MySQL test is **BLOCKED before connection** because
`RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and
`RRS_MYSQL_TEST_PASSWORD` are not configured. The isolated MySQL suite now
contains cancellation, rollback, concurrent duplicate-cancel, availability,
and seat-reallocation checks, but those assertions are not yet locally verified.
Use the associated pull request's MySQL CI result as database-backed evidence.
