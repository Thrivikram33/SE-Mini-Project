# Progress tracker

## Issue #15 — RRS-F-012: Booking retrieval

GitHub Issue: [#15](https://github.com/Thrivikram33/SE-Mini-Project/issues/15) (open)
Branch: `feature/issue-15-completion`
Pull Request: pending creation after verification.

| Area | Status | Evidence / remaining work |
|---|---|---|
| Passenger booking history | IMPLEMENTED; UNIT/API VERIFIED | `GET /api/bookings` uses the session owner; the page displays each passenger's history. Backend suite passes. |
| PNR ticket retrieval | IMPLEMENTED; UNIT/API VERIFIED | `GET /api/bookings/:pnr` returns booking and passenger seat details; `/ticket?pnr=...` uses the endpoint. Immediate booking ticket navigation remains supported. |
| Ownership and PNR privacy | UNIT/API VERIFIED | Passenger role required; repository SQL filters by both normalized PNR and session user ID; invalid and non-owned PNRs share `404 BOOKING_NOT_FOUND`. |
| Database-backed retrieval | VERIFIED IN CI | GitHub Actions run [#42475826312](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42475826312) passed the isolated MySQL inventory/retrieval/concurrency step. Local test credentials are absent; the configured dev DB denied read-only access. |
| Frontend lint and production build | VERIFIED LOCALLY | `npm.cmd run lint` and `npm.cmd run build` pass. |
| Backend tests and syntax | VERIFIED LOCALLY | `npm.cmd test`: 107 pass, 0 fail. `node --check` passed for changed backend files. |
| Database migration | NOT REQUIRED | Issue #15 uses existing booking, passenger, payment, station, route, and seat schema. No migration was added or applied. |
| PR and CI | VERIFIED ON TEST COMMIT | [PR #49](https://github.com/Thrivikram33/SE-Mini-Project/pull/49) targets `main`, links #15, and remains open. CI run [#42475826312](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42475826312) passed all three jobs on `e2a322c`; rerun on the final documentation commit before handoff. |

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
