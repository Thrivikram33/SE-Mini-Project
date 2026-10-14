# Railway Reservation System

An academic Railway Reservation System project. The authoritative requirements are in the SRS, Software Architecture and Design (SAD), and Software Test Plan (STP) in [`docs/`](docs/).

## Current status

The workspace contains the project documents, a GitHub Actions workflow, a React/Vite frontend, and an Express/MySQL API with a schema migration. The frontend uses database-backed search and booking flows when the API is configured; the initial home cards are clearly labelled illustrative sample content. Backend unit tests and local frontend checks pass, but MySQL integration, end-to-end acceptance, and concurrency behavior have not been verified. No external railway operator or real payment provider is connected.

See [Project Handoff](docs/PROJECT_HANDOFF.md), [Progress Tracker](docs/PROGRESS_TRACKER.md), and [Test Evidence](docs/TEST_EVIDENCE.md) for the verified implementation state.
The current requirement-to-code-to-test map is [RTM Implementation](docs/RTM_IMPLEMENTATION.md); source STP discrepancies are recorded in [STP Discrepancies](docs/STP_DISCREPANCIES.md) without changing the approved test plan.

## Frontend setup

Requirements: Node.js compatible with the versions in `frontend/package.json` and npm.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Build and lint:

```powershell
npm.cmd run build
npm.cmd run lint
```

## Backend setup

The Express/MySQL API, local database setup, migration, and explicitly gated fictional seed instructions are in [`backend/README.md`](backend/README.md). Current endpoint contracts and implementation status are in [`docs/API.md`](docs/API.md). Database integration is pending a successful read-only inspection of the selected development database, followed by migration and database-backed verification.

## Architecture and scope

The SRS/SAD specify a responsive React client, a layered Node.js/Express REST API, and MySQL as the system of record. Railway inventory and payments are simulated within the project; there is no external railway or payment-provider integration in scope.

## Source documents

- [Software Requirements Specification](docs/Railway_Reservation_System_SRS.docx)
- [Software Architecture and Design](docs/Railway_Reservation_System_SAD.docx)
- [Software Test Plan](docs/Railway_Reservation_System_Test_Plan.docx)
