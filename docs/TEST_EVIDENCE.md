# Test evidence — Issue #10 (RRS-F-010)

Last updated: 2026-11-06. Unit/mock, local MySQL, GitHub Actions, and browser evidence are reported separately.

| Area | Command / evidence | Result |
|---|---|---|
| Backend regression suite | `cd backend; npm.cmd test -- --test-reporter=spec` | **PASS: 92 tests, 0 failures, 0 skipped.** Includes booking validation, payment success/failure, mocked write rollback, inventory query rules, and passenger-seat request-order regression. Run after `npm.cmd ci`. |
| Booking/seat association | `backend/test/booking.test.js` | **PASS (mocked):** submitted seat order remains paired with passenger order, even though seat rows are locked in ascending ID order. |
| Backend syntax | `node --check integration/mysql-inventory.integration.js; node --check src/services/bookingService.js; node --check test/booking.test.js` | **PASS.** |
| Backend dependency audit | `cd backend; npm.cmd audit --omit=dev` | **PASS: zero vulnerabilities** after updating the locked transitive `body-parser` from 2.3.0 to 2.4.0. |
| Frontend production build | `cd frontend; npm.cmd run build` | **PASS** after `npm.cmd ci`. |
| Real MySQL integration, local | `cd backend; npm.cmd run test:mysql` | **BLOCKED before DB connection:** dedicated `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are not configured. Docker client exists, but the Docker engine is unavailable. No local database writes occurred. |
| Real MySQL integration | GitHub Actions run [#42163380848](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42163380848), commit `6433806` | **PASS:** the `Run isolated MySQL inventory and concurrency tests` step completed successfully against the CI MySQL 8 service. Local test run remains blocked for lack of dedicated credentials. |
| Same-seat MySQL concurrency | `backend/integration/mysql-inventory.integration.js`, CI run #42163380848 | **PASS in CI:** independent API booking-service attempts for one seat yield one success and one safe conflict; direct independent connection inserts verify the unique active-seat key. |
| Different-seat MySQL concurrency | `backend/integration/mysql-inventory.integration.js`, CI run #42163380848 | **PASS in CI:** concurrent booking-service requests for separate seats both confirm and reduce availability by two. |
| Successful simulated payment | Unit and MySQL integration tests | Unit case **PASS (mocked)**; CI MySQL case **PASS** with confirmed booking, PNR, payment, and reduced availability. |
| Failed simulated payment / release | Unit and MySQL integration tests | Unit case **PASS (mocked)**; CI MySQL case **PASS** with failed status, null PNR, failed payment, released allocation, and unchanged availability. |
| Transaction rollback | Unit and MySQL integration tests | Unit write-failure cases **PASS (mocked)**; CI MySQL case **PASS** after forced payment-adapter failure, with unchanged booking/payment counts and inventory. |
| Search and seat selection inventory | Unit and MySQL integration tests | Unit cases **PASS (mocked)**; CI MySQL suite **PASS**, comparing search and seat-selection counts and verifying release/reallocation. |
| Booking/passenger FK | Migration 003 and MySQL integration test, CI run #42163380848 | **PASS in CI:** an allocation that pairs a booking with another booking's passenger is rejected. |
| Cancellation | Source inspection | **NOT IMPLEMENTED on this branch:** no cancellation route/service exists. No cancellation release result is claimed. |
| CI for continuation | PR #44, commit `6433806` | **PASS:** repository checks, backend tests, MySQL inventory/concurrency tests, and frontend build succeeded. |
| Git release state | Repository inspection | Existing branch `feature/seat-allocation-inventory`; existing PR #44 remains open; not merged and Issue #10 not closed. |

## Test database guard

The integration suite only accepts localhost/loopback and `RRS_MYSQL_TEST_DATABASE=railway_reservation_issue10_test`. It checks the connected schema, expected tables, InnoDB engines, row counts, and migration shape before fixture writes. Populated, partial, or unexpected schemas cause refusal. The suite does not create users/grants, drop, or truncate anything. It removes only uniquely identified fixture records and related audit entries created by that run.

## Remaining verification

- Run `npm.cmd run test:mysql` against an authorized isolated local MySQL 8 test database if local reproduction is needed; the same suite passed against CI MySQL 8.
- Review and apply migration `003` only after checking any existing database for booking/passenger association mismatches.
- Review the passing GitHub Actions checks on the pushed continuation commits.
- Implement cancellation after its eligibility/refund policy is confirmed; the current branch does not contain this behavior.
