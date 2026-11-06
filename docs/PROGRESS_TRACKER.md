# Progress tracker

## Issue #10 — RRS-F-010: Seat allocation and inventory updates

GitHub Issue: [#10](https://github.com/Thrivikram33/SE-Mini-Project/issues/10)
Pull Request: [#44](https://github.com/Thrivikram33/SE-Mini-Project/pull/44) (`feature/seat-allocation-inventory` → `main`, open)

| Area | Status | Evidence / remaining work |
|---|---|---|
| Transactional seat allocation | VERIFIED LOCALLY | Booking service validates schedule, class, seat ownership/status, creates `HELD` allocations, then confirms booking/payment/allocation in one transaction. Mocked unit tests cover success, failure, unavailable seats, and rollback. |
| Passenger-to-seat association | VERIFIED LOCALLY | A regression fix preserves submitted seat order while SQL locks rows in seat ID order; a unit test verifies each passenger retains their selected seat. Migration `003` adds a composite booking/passenger foreign key. |
| Inventory reads and release | VERIFIED IN CI | Search and seat-selection exclude `HELD`/`CONFIRMED` allocations and include released ones. The Issue #10 MySQL suite verified release/reallocation and search counts in CI; local DB credentials remain unavailable. |
| Database-level duplicate prevention | VERIFIED IN CI | `booking_seats.active_seat_id` unique key and new booking/passenger composite FK were exercised against MySQL in CI. The application concurrency test allowed only one same-seat winner. |
| MySQL booking/payment/rollback/concurrency | VERIFIED IN CI | GitHub Actions run [#42163027664](https://github.com/Thrivikram33/SE-Mini-Project/actions/runs/42163027664) passed backend tests and the real MySQL inventory/concurrency step at `036c3c6`. Local MySQL credentials/service are unavailable. |
| Cancellation release | NOT IMPLEMENTED | This branch has no cancellation service or route. Released allocations are reflected by search and seat selection, but an end-to-end cancellation workflow is outside the code currently present and remains a blocker to the broader acceptance list. |
| Dependency security | VERIFIED LOCALLY | `npm audit fix` updated the locked transitive `body-parser`; production dependency audit reports zero vulnerabilities. |
| Documentation | IN PROGRESS | Handoff, progress, test evidence, and MySQL test instructions are being updated with current local and CI evidence. |
| Release | IN PROGRESS | Continuation commits are pushed to existing PR #44. All checks passed at `036c3c6`; PR remains open and Issue #10 remains open. |

### Changes in this continuation

- `backend/src/services/bookingService.js`: preserve passenger-to-seat request ordering while keeping deterministic sorted row locks.
- `backend/test/booking.test.js`: regression test for two passengers with seats submitted in reverse seat-ID order.
- `database/migrations/003_enforce_booking_passenger_pair.sql`: additive composite FK prevents a booking from referencing another booking's passenger.
- `backend/integration/mysql-inventory.integration.js`: strict test-schema preflight; actual migration application; wrong passenger association, real service rollback, different-seat concurrency, same-seat concurrency, and audit-fixture cleanup coverage.
- `.github/workflows/main.yml`: use the Issue #10 test database name in the existing MySQL CI service.
- `backend/package-lock.json`: security-only transitive dependency patch.
- `docs/PROJECT_HANDOFF.md`, `docs/TEST_EVIDENCE.md`, and `docs/mysql-inventory-testing.md`: actual evidence, setup boundaries, and limitations.

### Commit references

Original PR commits: `baa5e3a` (service), `5dcbba1` (tests), `302e94c` (docs), `bc9dec5` (integration merge). Continuation commits: `8963a04` (preserve passenger-seat mapping), `0f2433c` (MySQL lifecycle tests and FK migration), `282421d` (body-parser security update), and `036c3c6` (documentation). The latest continuation commit passed backend, MySQL integration/concurrency, repository, and frontend CI jobs.
