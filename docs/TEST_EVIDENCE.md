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
| Real MySQL integration, previous PR head | GitHub Actions run for `bc9dec5`, 2026-11-02: [run #41510157924](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/41510157924) | Backend job (unit suite and MySQL integration step) and frontend build reported successful for the previous PR head. The new migration and added scenarios are not covered by this older run. |
| Same-seat MySQL concurrency | `backend/integration/mysql-inventory.integration.js` | **Added, pending fresh CI/local execution:** independent API booking-service attempts for one seat must produce one success and one safe conflict; direct independent connection inserts also verify the unique active-seat key. |
| Different-seat MySQL concurrency | `backend/integration/mysql-inventory.integration.js` | **Added, pending fresh CI/local execution:** concurrent booking-service requests for separate seats must both confirm and reduce availability by two. |
| Successful simulated payment | Unit and MySQL integration tests | Unit case **PASS (mocked)**. Real MySQL case exists, but new-head execution is pending. |
| Failed simulated payment / release | Unit and MySQL integration tests | Unit case **PASS (mocked)**. Real MySQL case checks failed status, null PNR, failed payment, released allocation, and unchanged availability; new-head execution is pending. |
| Transaction rollback | Unit and MySQL integration tests | Unit write-failure cases **PASS (mocked)**. Real MySQL test forces payment-adapter failure after transaction writes and compares booking/payment counts and inventory; new-head execution is pending. |
| Search and seat selection inventory | Unit and MySQL integration tests | Unit cases **PASS (mocked)**. Real DB suite compares search and seat-selection counts and verifies release/reallocation; new-head execution is pending. |
| Booking/passenger FK | Migration 003 and MySQL integration test | **Added, pending fresh CI/local execution:** a booking/passenger mismatch must fail its composite FK. |
| Cancellation | Source inspection | **NOT IMPLEMENTED on this branch:** no cancellation route/service exists. No cancellation release result is claimed. |
| CI for continuation | PR #44 | Previous head passed; new workflow run is pending push. |
| Git release state | Repository inspection | Existing branch `feature/seat-allocation-inventory`; existing PR #44 remains open; not merged and Issue #10 not closed. |

## Test database guard

The integration suite only accepts localhost/loopback and `RRS_MYSQL_TEST_DATABASE=railway_reservation_issue10_test`. It checks the connected schema, expected tables, InnoDB engines, row counts, and migration shape before fixture writes. Populated, partial, or unexpected schemas cause refusal. The suite does not create users/grants, drop, or truncate anything. It removes only uniquely identified fixture records and related audit entries created by that run.

## Remaining verification

- Run `npm.cmd run test:mysql` against an authorized isolated local MySQL 8 test database.
- Review and apply migration `003` only after checking any existing database for booking/passenger association mismatches.
- Run and inspect the new GitHub Actions checks after pushing the continuation commits.
- Implement cancellation after its eligibility/refund policy is confirmed; the current branch does not contain this behavior.
