# Project handoff

Last verified locally: 2026-11-06
Branch: `feature/seat-allocation-inventory`
Latest implementation commit: `282421d` (`fix(security): update vulnerable body parser`)
Pull request: [#44](https://github.com/Thrivikram33/SE-Mini-Project/pull/44), open against `main`

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
- `cd backend; npm.cmd run test:mysql`: **BLOCKED before connecting** because `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are absent. Docker Desktop's engine is not running. No local test database was changed.
- GitHub Actions on the original PR head `bc9dec5` reported backend tests (including the MySQL integration job) and frontend build successful on 2026-11-02. The continuation commits require a fresh run; its status is not yet known.

Continuation commits: `8963a048c9f3fda5f68ece20febe61fd6187ce34`, `0f2433ce117a3f9e1819d56420e5b4a34e69a6b9`, and `282421dff7bae0ec63c650b56ab09a74a532b221`. The documentation commit follows these implementation commits.

## Exact next steps

1. Provide an isolated local MySQL 8 test service and dedicated credentials through the required test-only environment variables, then run `npm.cmd run test:mysql` from `backend/`.
2. Review migration `003` against any persistent development database before applying it there; preflight for existing mismatched booking/passenger associations.
3. Implement and verify cancellation only after the project provides the cancellation eligibility and refund policy for this branch.
4. Review the new CI run on PR #44. Do not merge the PR or close Issue #10 as part of this handoff.
