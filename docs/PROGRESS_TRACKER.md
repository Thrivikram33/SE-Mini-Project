# Progress tracker

## Issue #23 — RRS-SR-003: Secure network communication (2026-11-11)

GitHub Issue: [#23](https://github.com/Thrivikram33/SE-Mini-Project/issues/23)
Branch: `feature/issue-23-completion`
Pull Request: not yet created.

| Area | Status | Evidence / remaining work |
|---|---|---|
| Production startup configuration | VERIFIED LOCALLY | Startup requires HTTPS `PUBLIC_API_URL` and `CLIENT_ORIGIN`, plus `TRUST_PROXY` from 1 through 10; invalid/missing values are covered by backend tests. |
| API transport enforcement | VERIFIED LOCALLY | The production middleware returns `426 HTTPS_REQUIRED` unless Express sees TLS directly or through the configured proxy; local HTTP development remains allowed. |
| Session and browser security | VERIFIED LOCALLY | Production enables secure session cookies, HSTS, and exact-origin credentialed CORS. Frontend production builds reject unsafe API URLs, and runtime refuses to render over HTTP. |
| Backend suite | VERIFIED LOCALLY | `cd backend; npm test`: 168 passed, 0 failed, 0 skipped. |
| Frontend tests, lint, build | VERIFIED LOCALLY | `cd frontend; npm test`: 11 passed; `npm run lint`: passed; `npm run build`: passed. |
| Live deployment TLS | NOT VERIFIED | No deployment/reverse-proxy configuration exists in this repository. Certificate, public HTTPS, edge redirect, header sanitation, and network isolation need a real hosting environment. |
| Release | IN PROGRESS | Work is isolated on `feature/issue-23-completion`; no push or PR has been created yet. |

## Issue #18 — RRS-F-015: Administrator management

GitHub Issue: [#18](https://github.com/Thrivikram33/SE-Mini-Project/issues/18) (open)
Branch: `feature/issue-18-completion`
Pull Request: pending push and verification.

| Area | Status | Evidence / remaining work |
|---|---|---|
| Admin authorization | VERIFIED LOCALLY (API tests) | Every `/api/admin/*` route requires `ADMIN`; route coverage verifies unauthenticated 401 and passenger 403 on reads and writes. |
| Train and route management | IMPLEMENTED; UNIT VERIFIED | Create/update/deactivate/list routes, station reference checks, route validation, transactional writes, and audit logging. Route edits blocked once schedules exist. |
| Schedule management | IMPLEMENTED; UNIT VERIFIED | Create/update/list; active train and configured route required. Date changes with booking history and cancellation with active bookings are rejected. |
| Fare and inventory management | IMPLEMENTED; UNIT VERIFIED | Fare upsert and coach/seat creation are transactional; seats with active allocations cannot be altered. |
| Search consistency | VERIFIED IN CI | GitHub Actions [run #42583012006](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42583012006) passed real MySQL assertions for created/updated schedule, fare, seat status, schedule cancellation and train deactivation. Local MySQL test configuration is absent. |
| Frontend admin workspace | IMPLEMENTED; LINT/BUILD VERIFIED | Responsive `/admin` workspace covers routes, schedules, fares and inventory. No frontend test script exists in package.json. |
| Database migration | NOT REQUIRED | Existing train, route-stop, schedule, fare, coach, seat and audit tables support this feature. |
| Full regression suite | VERIFIED LOCALLY | `npm.cmd test`: 146 pass, 0 fail. Frontend lint/build pass; production dependency audit reports 0 vulnerabilities. |
| PR and CI | VERIFIED ON TEST COMMIT | [PR #52](https://github.com/Thrivikram33/SE-Mini-Project/pull/52) targets `main`, links #18, and remains open. CI run [#42583012006](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42583012006) passed all three jobs on `13bad56`; final documentation commit will receive its own CI run. |

### Issue #18 changed files

- `backend/src/repositories/adminManagementRepository.js`, `backend/src/services/adminManagementService.js`, `backend/src/routes/adminRoutes.js`, `backend/src/server.js`.
- `backend/test/admin-management.test.js`, `backend/test/admin-management-repository.test.js`, `backend/test/admin-route.test.js`, `backend/integration/mysql-inventory.integration.js`.
- `frontend/src/AdminManagementPage.jsx`, `frontend/src/App.jsx`.
- `docs/admin-management-api.md`, `docs/PROJECT_HANDOFF.md`, `docs/PROGRESS_TRACKER.md`, `docs/TEST_EVIDENCE.md`.

## Issue #16 — RRS-F-013: Booking cancellation and seat release

GitHub Issue: [#16](https://github.com/Thrivikram33/SE-Mini-Project/issues/16) (open)
Branch: `feature/issue-16-booking-cancellation-seat-release`

| Area | Status | Evidence / remaining work |
|---|---|---|
| Cancellation endpoint | IMPLEMENTED; UNIT/API VERIFIED | Passenger session required; only the owner of a `CONFIRMED` booking can cancel. Unknown/non-owned IDs share a not-found response; invalid and ineligible requests are rejected. |
| Atomic seat release | IMPLEMENTED; UNIT VERIFIED | Booking and schedule locks, booking status update, active allocation release, cancellation row, and audit event share one transaction. Failure rolls back. |
| History and availability | IMPLEMENTED; UNIT VERIFIED | Booking and allocation history is preserved; `RELEASED` no longer consumes the unique active-seat key. Real availability and reallocation coverage was added to the guarded MySQL suite but needs CI execution. |
| Duplicate/concurrent cancellation | UNIT VERIFIED; MYSQL TEST ADDED | Repeated requests return a conflict and do not add another cancellation. Two concurrent cancels plus a competing booking are covered by the MySQL suite; local database execution is blocked. |
| Payment/refund | NO REFUND POLICY IMPLEMENTED | Successful payment history is preserved. No amount, cancellation fee, refund deadline, or refund processing behavior is invented; the existing cancellation table defaults remain. |
| Frontend booking history | IMPLEMENTED; LINT/BUILD VERIFIED | Confirmed bookings show a confirmation prompt and cancel action, disable while submitting, update status on success, and display success/failure messages. |
| Local regression suite | VERIFIED LOCALLY | Backend `npm.cmd test`: 115 passed, 0 failed. Frontend lint and production build passed. |
| Real MySQL / CI | NOT VERIFIED LOCALLY | `npm.cmd run test:mysql` is blocked before connecting because dedicated test-only MySQL variables are absent. Consult the associated pull request's MySQL CI check for database-backed verification. |
| Schema migration | NOT REQUIRED | Existing `bookings`, `booking_seats`, `cancellations`, and `audit_logs` schema supports this workflow. |

## Issue #15 — RRS-F-012: Booking retrieval

GitHub Issue: [#15](https://github.com/Thrivikram33/SE-Mini-Project/issues/15) (closed after merge)
Branch: `feature/issue-15-completion`
Pull Request: [#49](https://github.com/Thrivikram33/SE-Mini-Project/pull/49) (merged into `main`).

| Area | Status | Evidence / remaining work |
|---|---|---|
| Passenger booking history | IMPLEMENTED; UNIT/API VERIFIED | `GET /api/bookings` uses the session owner; the page displays each passenger's history. Backend suite passes. |
| PNR ticket retrieval | IMPLEMENTED; UNIT/API VERIFIED | `GET /api/bookings/:pnr` returns booking and passenger seat details; `/ticket?pnr=...` uses the endpoint. Immediate booking ticket navigation remains supported. |
| Ownership and PNR privacy | UNIT/API VERIFIED | Passenger role required; repository SQL filters by both normalized PNR and session user ID; invalid and non-owned PNRs share `404 BOOKING_NOT_FOUND`. |
| Database-backed retrieval | VERIFIED IN CI | GitHub Actions run [#42475826312](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42475826312) passed the isolated MySQL inventory/retrieval/concurrency step. Local test credentials are absent; the configured dev DB denied read-only access. |
| Frontend lint and production build | VERIFIED LOCALLY | `npm.cmd run lint` and `npm.cmd run build` pass. |
| Backend tests and syntax | VERIFIED LOCALLY | `npm.cmd test`: 107 pass, 0 fail. `node --check` passed for changed backend files. |
| Database migration | NOT REQUIRED | Issue #15 uses existing booking, passenger, payment, station, route, and seat schema. No migration was added or applied. |
| PR and CI | VERIFIED | [PR #49](https://github.com/Thrivikram33/SE-Mini-Project/pull/49) was merged to `main` and closed Issue #15. CI run [#42476002787](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42476002787) passed on final commit `e2189a1`. |

### Issue #15 changed files

- `backend/src/repositories/bookingQueryRepository.js`: owner-scoped booking history and PNR ticket queries.
- `backend/src/services/bookingService.js`, `backend/src/routes/bookingRoutes.js`: normalization, authorization integration, and retrieval endpoints.
- `backend/test/booking-query-repository.test.js`, `backend/test/booking-route.test.js`, `backend/integration/mysql-inventory.integration.js`: repository, route, privacy, and real MySQL coverage.
- `frontend/src/BookingHistoryPage.jsx`, `frontend/src/BookingTicketPage.jsx`, `frontend/src/App.jsx`: history, PNR lookup, and ticket retrieval.
- `docs/booking-api.md`, `docs/PROJECT_HANDOFF.md`, `docs/PROGRESS_TRACKER.md`, `docs/TEST_EVIDENCE.md`: API and verified evidence.

## Issue #10 — RRS-F-010: Seat allocation and inventory updates

GitHub Issue: [#10](https://github.com/Thrivikram33/SE-Mini-Project/issues/10)
Pull Request: [#44](https://github.com/Thrivikram33/SE-Mini-Project/pull/44) (`feature/seat-allocation-inventory` → `main`, merged)

| Area | Status | Evidence / remaining work |
|---|---|---|
| Transactional seat allocation | VERIFIED LOCALLY | Booking service validates schedule, class, seat ownership/status, creates `HELD` allocations, then confirms booking/payment/allocation in one transaction. Mocked unit tests cover success, failure, unavailable seats, and rollback. |
| Passenger-to-seat association | VERIFIED LOCALLY | A regression fix preserves submitted seat order while SQL locks rows in seat ID order; a unit test verifies each passenger retains their selected seat. Migration `003` adds a composite booking/passenger foreign key. |
| Inventory reads and release | VERIFIED IN CI | Search and seat-selection exclude `HELD`/`CONFIRMED` allocations and include released ones. The Issue #10 MySQL suite verified release/reallocation and search counts in CI; local DB credentials remain unavailable. |
| Database-level duplicate prevention | VERIFIED IN CI | `booking_seats.active_seat_id` unique key and new booking/passenger composite FK were exercised against MySQL in CI. The application concurrency test allowed only one same-seat winner. |
| MySQL booking/payment/rollback/concurrency | VERIFIED IN CI | GitHub Actions run [#42163380848](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42163380848) passed backend tests and the real MySQL inventory/concurrency step at `6433806`. Local MySQL credentials/service are unavailable. |
| Cancellation release | NOT IMPLEMENTED | This branch has no cancellation service or route. Released allocations are reflected by search and seat selection, but an end-to-end cancellation workflow is outside the code currently present and remains a blocker to the broader acceptance list. |
| Dependency security | VERIFIED LOCALLY | `npm audit fix` updated the locked transitive `body-parser`; production dependency audit reports zero vulnerabilities. |
| Documentation | IN PROGRESS | Handoff, progress, test evidence, and MySQL test instructions are being updated with current local and CI evidence. |
| Release | IN PROGRESS | Continuation commits are pushed to existing PR #44. All checks passed at `6433806`; PR remains open and Issue #10 remains open. |

### Changes in this continuation

- `backend/src/services/bookingService.js`: preserve passenger-to-seat request ordering while keeping deterministic sorted row locks.
- `backend/test/booking.test.js`: regression test for two passengers with seats submitted in reverse seat-ID order.
- `database/migrations/003_enforce_booking_passenger_pair.sql`: additive composite FK prevents a booking from referencing another booking's passenger.
- `backend/integration/mysql-inventory.integration.js`: strict test-schema preflight; actual migration application; wrong passenger association, real service rollback, different-seat concurrency, same-seat concurrency, and audit-fixture cleanup coverage.
- `.github/workflows/main.yml`: use the Issue #10 test database name in the existing MySQL CI service.
- `backend/package-lock.json`: security-only transitive dependency patch.
- `docs/PROJECT_HANDOFF.md`, `docs/TEST_EVIDENCE.md`, and `docs/mysql-inventory-testing.md`: actual evidence, setup boundaries, and limitations.

### Commit references

Original PR commits: `baa5e3a` (service), `5dcbba1` (tests), `302e94c` (docs), `bc9dec5` (integration merge). Continuation commits: `8963a04` (preserve passenger-seat mapping), `0f2433c` (MySQL lifecycle tests and FK migration), `282421d` (body-parser security update), `036c3c6` (initial evidence update), and `6433806` (passing MySQL CI evidence). The latest pushed commit passed backend, MySQL integration/concurrency, repository, and frontend CI jobs.
