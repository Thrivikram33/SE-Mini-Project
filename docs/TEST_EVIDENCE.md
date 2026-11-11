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

## Issue #15 — RRS-F-012 booking retrieval (2026-11-08)

| Area | Command / evidence | Result |
|---|---|---|
| Backend unit and API tests | `cd backend; npm.cmd test` | **PASS: 107 tests, 0 failures, 0 skipped.** Includes new repository owner filters, PNR normalization/not-found behavior, and session/role route checks. |
| Frontend lint | `cd frontend; npm.cmd run lint` | **PASS.** |
| Frontend production build | `cd frontend; npm.cmd run build` | **PASS** with Vite 8.3.4. |
| Changed backend syntax | `node --check` for new repository, booking service, booking routes, added repository test, and MySQL integration test | **PASS.** |
| MySQL integration | `cd backend; npm.cmd run test:mysql` | **BLOCKED before database connection:** `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are absent. The suite requires the specifically named local-only `railway_reservation_issue10_test` database. |
| Development DB read-only preflight | Connected using local `backend/.env`, issued only database identity and table/migration metadata reads | **BLOCKED:** MySQL returned `ER_ACCESS_DENIED_ERROR`. No migration or write was attempted. Secrets were not printed. |
| MySQL ticket integration assertions | `backend/integration/mysql-inventory.integration.js`, run #42475826312 | **PASS in CI** against the disposable local MySQL 8 service: ticket payment/route/date/passenger seat, owner history, and cross-owner denial. |
| GitHub Actions | [Run #42475826312](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42475826312), test commit `e2a322c` | **PASS:** backend tests, isolated MySQL inventory/retrieval/concurrency integration, repository checks, and frontend production build. Final docs commit requires its own CI verification. |

The local MySQL limitation is not represented as a passing database or end-to-end result. The frontend build and unit/API tests do not substitute for running the real MySQL integration test.

## Issue #20 — RRS-NFR-002 booking response time (2026-11-11)

| Area | Command / evidence | Result |
|---|---|---|
| Booking timing boundary | `Server-Timing` on successful `POST /api/bookings`; monotonic `performance.now()` in service and simulator | **PASS (unit/API):** reports backend processing separately from simulator time; total client-observed duration is measured by the benchmark. JSON body remains unchanged. |
| Payment behavior | `backend/test/paymentSimulator.test.js`, booking success/failure regression tests | **PASS (unit):** success/failure semantics retained; current simulator has no artificial delay. |
| Backend regression suite | `cd backend; npm.cmd test` | **PASS: 151 tests, 0 failures, 0 skipped.** |
| Backend syntax | `node --check` for changed backend JavaScript | **PASS.** |
| Booking performance baseline | `npm run benchmark:booking` against the pre-change booking path | **NOT MEASURED:** no representative local MySQL database or dedicated benchmark inventory is configured. No baseline values are claimed. |
| Booking performance result | `npm run benchmark:booking` with documented isolated test inventory | **IMPLEMENTED — NOT VERIFIED:** needs API cookie, schedule, at least 105 reserved seats for defaults, and representative MySQL/runtime environment. Benchmark explicitly refuses to run without required inputs. |
| RRS-NFR-002 threshold | Successful request P95, request-to-response minus measured simulator duration, target <= 3,000 ms | **NOT VERIFIED:** no actual percentile is available. No optimization or passing claim is made absent measured evidence. |
| MySQL concurrency and persistence | Existing `npm.cmd run test:mysql` | **Not run locally:** dedicated test credentials/environment are not configured. Existing CI workflow runs functional MySQL tests but not this load benchmark. |

## Issue #16 — RRS-F-013 booking cancellation and seat release (2026-11-09)

| Area | Command / evidence | Result |
|---|---|---|
| Cancellation service and API | `cd backend; npm.cmd test -- --test-name-pattern='cancellation|booking cancellation|booking endpoint'` | **PASS:** 25 tests, 0 failures. Covers ownership, roles, invalid/missing/ineligible IDs, repeated requests, safe errors, status/release transaction ordering, and rollback behavior with mocks. |
| Full backend regression suite | `cd backend; npm.cmd test` | **PASS: 115 tests, 0 failures, 0 skipped.** |
| MySQL cancellation integration | `cd backend; npm.cmd run test:mysql` | **BLOCKED before connection:** dedicated `RRS_MYSQL_TEST_HOST`, `RRS_MYSQL_TEST_USER`, and `RRS_MYSQL_TEST_PASSWORD` are not configured. The integration test refuses to run without these explicit test-only settings. |
| MySQL assertions added | `backend/integration/mysql-inventory.integration.js` | **IMPLEMENTED — NOT VERIFIED LOCALLY:** covers concurrent duplicate cancellation and booking allocation, persisted cancelled status, released allocation, history/audit, reallocation, and rollback after a failure within a real MySQL transaction. Requires CI or an isolated local MySQL 8 test database. |
| Frontend lint | `cd frontend; npm.cmd run lint` | **PASS.** |
| Frontend production build | `cd frontend; npm.cmd run build` | **PASS** with Vite. |
| Database migration | Schema inspection | **NOT REQUIRED:** existing cancellation and generated active-seat columns are sufficient. No migration was added or applied. |
| Refund processing | Code and schema inspection | **OUT OF SCOPE / POLICY UNDEFINED:** no refund amount or payment reversal is calculated. Existing payment history is retained and no refund is presented as completed. |
| GitHub Actions | Associated Issue #16 pull request checks | Review the actual workflow result there; local test results do not substitute for MySQL CI. |

## Issue #18 — RRS-F-015 administrator management (2026-11-09)

| Area | Command / evidence | Result |
|---|---|---|
| Backend unit/API regression suite | `cd backend; npm.cmd test` | **PASS: 146 tests, 0 failures, 0 skipped.** Includes admin service validation/transactions, repository placeholders, RBAC, safe errors, and existing regression tests. |
| Frontend lint | `cd frontend; npm.cmd run lint` | **PASS.** |
| Frontend production build | `cd frontend; npm.cmd run build` | **PASS** with Vite 8.3.4. |
| Backend syntax and whitespace | `node --check` on changed backend files; `git diff --check` | **PASS.** |
| Production dependency audit | `cd backend; npm.cmd audit --omit=dev` | **PASS: 0 vulnerabilities.** |
| Local MySQL integration | `cd backend; npm.cmd run test:mysql` | **BLOCKED before connection:** dedicated test-only host/user/password variables are absent. No test database was modified. |
| MySQL admin integration scenario | `backend/integration/mysql-inventory.integration.js`, run #42583012006 | **PASS in CI** against the isolated MySQL 8 service: train/route create and update, schedule creation/update/cancel, fare upsert, coach/seat creation, inventory status changes, audit writes, and reflected train-search results. |
| Frontend component tests | `frontend/package.json` scripts | **NOT AVAILABLE:** no frontend test runner/script is configured. The new admin UI is checked by the existing lint and production build. |
| Database migration | Schema inspection | **NOT REQUIRED:** used fields and audit logging exist in migrations 001–004. No migration was added or executed. |
| GitHub Actions | [Run #42583012006](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42583012006), test commit `13bad56` | **PASS:** backend tests, isolated MySQL admin lifecycle/search integration, repository checks, and frontend production build. A final run is still needed after the documentation commit. |
