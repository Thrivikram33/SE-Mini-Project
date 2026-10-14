# SRS implementation and verification map

Audited 2026-10-14 against the 25 baseline requirements in SRS v1.0 and its RTM. `IMPLEMENTED — NOT VERIFIED` means relevant code exists, but the approved acceptance criterion has not been demonstrated end to end. Unit tests are service-level tests with mocked/test-double persistence unless explicitly stated otherwise.

| Requirement | Implementation locations | Related test evidence | Status |
|---|---|---|---|
| RRS-F-001 registration | `backend/src/auth/authRoutes.js`, `authService.js`, `userRepository.js`, `backend/db/migrations/001_initial_schema.sql` | `auth.test.js`: validation/hash and duplicate-email unit cases | IMPLEMENTED — NOT VERIFIED |
| RRS-F-002 login and roles | `backend/src/auth/authRoutes.js`, `authService.js`, `authMiddleware.js` | `auth.test.js`: login token, current-role/role-guard, and malformed cookie cases | IMPLEMENTED — NOT VERIFIED |
| RRS-F-003 train search | `backend/src/app.js`, `backend/src/trains/trainService.js`, `trainRepository.js` | `trains.test.js`: matching search and invalid date/station cases | IMPLEMENTED — NOT VERIFIED |
| RRS-F-004 schedule and availability display | `backend/src/trains/trainRepository.js`, `trainService.js`, `frontend/src/App.jsx` | `trains.test.js`: availability grouping/count case; mocked persistence | IMPLEMENTED — NOT VERIFIED |
| RRS-F-005 class/seat selection | `frontend/src/components/BookingDialog.jsx`, `backend/src/bookings/bookingService.js` | `booking.test.js`: unavailable seat rejected before payment; no browser run | IMPLEMENTED — NOT VERIFIED |
| RRS-F-006 passenger validation | `backend/src/bookings/bookingService.js`, `BookingDialog.jsx` | `booking.test.js`: invalid passenger data rejected before transaction | IMPLEMENTED — NOT VERIFIED |
| RRS-F-007 fare calculation | `backend/src/bookings/bookingService.js`, `BookingDialog.jsx`, `backend/src/admin/adminService.js` | `booking.test.js`: total fare assertion; no fare-rule acceptance test | IMPLEMENTED — NOT VERIFIED |
| RRS-F-008 successful/failed simulated payment | `backend/src/bookings/paymentSimulator.js`, `bookingService.js` | `booking.test.js`: success and failure unit cases; no MySQL run | IMPLEMENTED — NOT VERIFIED |
| RRS-F-009 unique PNR | `backend/src/bookings/bookingService.js`, migration unique PNR key | `booking.test.js`: deterministic PNR fixture only; no multi-request DB uniqueness test | IMPLEMENTED — NOT VERIFIED |
| RRS-F-010 atomic seat assignment | `backend/src/bookings/bookingService.js`, migration active-seat unique key | `booking.test.js`: mocked transaction path; no concurrent InnoDB test | IMPLEMENTED — NOT VERIFIED |
| RRS-F-011 confirmation/ticket details | `frontend/src/components/BookingDialog.jsx`, `backend/src/bookings/bookingService.js`, `bookingQueryRepository.js` | No UI/browser ticket acceptance test | IMPLEMENTED — NOT VERIFIED |
| RRS-F-012 PNR/history retrieval | `backend/src/bookings/bookingRoutes.js`, `bookingQueryRepository.js`, `frontend/src/App.jsx` | `bookingRoutes.test.js`: fake-DB HTTP test denies a non-owner; owner retrieval/history mapping not covered | IMPLEMENTED — NOT VERIFIED |
| RRS-F-013 cancellation and seat release | `backend/src/bookings/cancellationService.js`, booking routes, migration | `cancellation.test.js`: mocked cancellation/release, duplicate and conflict cases; STP also has `TC-CAN-04` discrepancy | IMPLEMENTED — NOT VERIFIED |
| RRS-F-014 refund calculation | `backend/src/bookings/cancellationService.js`, `paymentSimulator.js` | `cancellation.test.js`: cent rounding and simulated refund unit cases | IMPLEMENTED — NOT VERIFIED |
| RRS-F-015 admin management | `backend/src/admin/adminRoutes.js`, `adminService.js`, `frontend/src/components/AdminPanel.jsx` | `admin.test.js`: validation; `trains.test.js`: mocked unauthenticated/passenger denial; no DB admin acceptance run | IMPLEMENTED — NOT VERIFIED |
| RRS-NFR-001 search P95 ≤2s | Search API and repository | `TC-PERF-01` not run; no load harness/evidence | IMPLEMENTED — NOT VERIFIED |
| RRS-NFR-002 booking P95 ≤3s | Booking service and database transaction | `TC-PERF-02` not run; no load harness/evidence | IMPLEMENTED — NOT VERIFIED |
| RRS-NFR-003 ≥99% test-window availability | API/server runtime | `TC-REL-01` not run; no uptime window evidence | IMPLEMENTED — NOT VERIFIED |
| RRS-NFR-004 no duplicate concurrent seat | Booking transaction and unique allocation constraint | `TC-CONC-01` not run; mocked tests do not establish lock behavior | IMPLEMENTED — NOT VERIFIED |
| RRS-NFR-005 salted password hashing | `backend/src/auth/authService.js`, users schema | `auth.test.js`: checks stored value differs from plaintext; DB hash inspection not run | IMPLEMENTED — NOT VERIFIED |
| RRS-SR-001 password hash/no plaintext logging | `authService.js`, `errorHandler.js` | `auth.test.js` hash check; no DB/log inspection against running API | IMPLEMENTED — NOT VERIFIED |
| RRS-SR-002 authenticated private/admin routes | `authMiddleware.js`, booking/admin routes | `auth.test.js`, `trains.test.js`: mocked role/endpoint denial | IMPLEMENTED — NOT VERIFIED |
| RRS-SR-003 HTTPS/TLS production deployment | `backend/src/config.js`, secure cookie setting in auth routes | No TLS deployment test; local deployment only | IMPLEMENTED — NOT VERIFIED |
| RRS-SR-004 input validation/injection safety | Domain services, parameterized repositories, `backend/src/middleware/errorHandler.js` | Validation unit cases and new safe JSON parser error cases; no penetration test | IMPLEMENTED — NOT VERIFIED |
| RRS-SR-005 private booking owner check | `backend/src/bookings/bookingRoutes.js`, `cancellationService.js` | `bookingRoutes.test.js`: fake-DB HTTP denial for another user; `cancellation.test.js`: owner enforcement; no MySQL IDOR test | IMPLEMENTED — NOT VERIFIED |

Database-backed, browser, performance, reliability, security penetration, and concurrency evidence remain pending. The approved STP identifier/mapping discrepancies are recorded separately in [`STP_DISCREPANCIES.md`](STP_DISCREPANCIES.md); the STP and SRS source documents were not modified.
