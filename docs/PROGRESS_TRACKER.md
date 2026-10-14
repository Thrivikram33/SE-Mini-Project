# Progress Tracker

Last audited: 2026-10-14

Use only the project status labels: **NOT STARTED**, **IN PROGRESS**, **IMPLEMENTED — NOT VERIFIED**, **VERIFIED LOCALLY**, **COMMITTED**, **PUSHED**, **ACCEPTED/CLOSED**. A unit test for a service does not verify an end-to-end requirement.

| Phase | Scope | Status | Evidence / remaining work |
|---|---|---|---|
| 1 | Repository and requirements audit | VERIFIED LOCALLY | Branch, worktree, project docs, and source test-plan discrepancies reviewed. |
| 2 | Frontend flows and responsive UI | IMPLEMENTED — NOT VERIFIED | ESLint and production build pass locally. Browser, mobile, accessibility, and end-to-end runs remain. |
| 3 | 3D hero scene and fallback | IMPLEMENTED — NOT VERIFIED | Source includes lazy WebGL scene, context/load fallback, reduced-motion static branch, and responsive CSS. Browser behavior not run; Three.js chunk remains 736.50 kB raw. |
| 4 | Backend and schema | IMPLEMENTED — NOT VERIFIED | API and additive migration exist; backend unit tests pass. MySQL not reachable and migration not applied. |
| 5 | Authentication and authorization | IMPLEMENTED — NOT VERIFIED | bcrypt, JWT cookie/bearer support, current-role lookup, and RBAC routes exist; DB-backed registration/login and account roles not verified. |
| 6 | Train search and availability | IMPLEMENTED — NOT VERIFIED | Service/repository and mocked unit cases exist; actual database results not verified. |
| 7 | Booking, payment simulation, PNR | IMPLEMENTED — NOT VERIFIED | Transaction paths and mocked success/failure tests exist; persistence and concurrent allocation not verified in MySQL. |
| 8 | Booking history, cancellation, refund, seat release | IMPLEMENTED — NOT VERIFIED | Query/routes/services and mocked cancellation tests exist; actual owner access and seat release not verified. |
| 9 | Administration | IMPLEMENTED — NOT VERIFIED | Admin API/UI and mocked authorization/validation tests exist; DB-backed edits not verified. |
| 10 | Database integration and concurrency | IN PROGRESS | Target is `railway_reservation_dev`; local `.env` has a non-placeholder password, but MySQL rejects `rrs_app` with `ER_ACCESS_DENIED_ERROR`. Schema inspection, migration, integration tests, and concurrency tests cannot run. Database changes require explicit approval. |
| 11 | CI and release preparation | IN PROGRESS | Workflow now runs locked frontend/backend checks on Node 22. Local equivalents are run; GitHub CI and remote branch lookup are unverified. No files staged or committed. |

No SRS requirement is marked fully verified until its acceptance evidence exists. The mock/sample train cards are not evidence of database-backed schedules. The requirement-by-requirement map is [`RTM_IMPLEMENTATION.md`](RTM_IMPLEMENTATION.md); STP source mismatches are recorded in [`STP_DISCREPANCIES.md`](STP_DISCREPANCIES.md) without editing the approved source document.
