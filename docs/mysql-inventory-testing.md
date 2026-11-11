# MySQL seat inventory integration tests

The backend unit suite uses mocked database behavior. The separate MySQL suite exercises the real search, seat-selection, and booking services against a local, isolated MySQL 8 database named exactly `railway_reservation_issue10_test`.

## Safety checks

The test refuses a remote host or any database name other than the exact allowlisted test database. Before writing, it checks the selected schema, table set, InnoDB engines, and existing row counts. It creates schema only when the database has no tables; a partial or populated schema causes a clear refusal. It applies the repository migrations `001` through `004` and does not drop or truncate tables. It creates uniquely named fixtures and removes only rows created by the current test run, including booking, cancellation, and audit rows.

Configure these variables only in the local test shell or test-only environment file. Never use the application or production credentials:

- `RRS_MYSQL_TEST_HOST` (`127.0.0.1`, `localhost`, or `::1` only)
- `RRS_MYSQL_TEST_PORT` (optional; defaults to `3306`)
- `RRS_MYSQL_TEST_USER`
- `RRS_MYSQL_TEST_PASSWORD`
- `RRS_MYSQL_TEST_DATABASE=railway_reservation_issue10_test`

From `backend/`, run:

```powershell
npm.cmd run test:mysql
```

The test database must be created and granted to the dedicated test account by an authorized MySQL administrator. The test does not create accounts or grant privileges. If it refuses because the schema is populated or partial, inspect the test database manually; the test will not repair or reset it.

## Coverage

The integration suite checks availability across available, blocked, held, confirmed, and released allocation states; consistency between train search and seat-selection results; application-level same-seat concurrency; successful and failed simulated payment; transaction rollback after a forced payment-adapter error; booking to passenger association constraints; independent booking attempts for different seats; and reallocation after an active allocation is released. The schema's unique active-seat key is exercised using two independent MySQL connections.

The Issue #16 MySQL suite also exercises confirmed booking cancellation, seat release, cancellation-history preservation, duplicate concurrent cancellation, a competing seat allocation, rollback, and post-cancellation reallocation. This database coverage remains unverified locally until the suite runs against the dedicated MySQL test schema or passes in CI. The cancellation endpoint does not calculate or process refunds because the repository has no configured refund policy.

The GitHub Actions workflow provisions a fresh MySQL 8 service database and supplies temporary test-only credentials to this suite. Local MySQL results must be recorded separately from CI results.


## Issue #22 — Concurrent Seat Consistency

### Database-level protection

The `booking_seats` table uses the generated column `active_seat_id` and unique index `uq_active_seat_allocation`.

- `HELD` and `CONFIRMED` allocations generate the corresponding seat ID.
- `RELEASED` allocations generate `NULL`, allowing the seat to be allocated again.
- The unique index prevents multiple active allocations for the same seat.

### Concurrency integration coverage

The MySQL integration test exercises:

1. Two simultaneous bookings competing for the same seat: exactly one succeeds.
2. Five simultaneous booking requests competing for one seat, repeated across three rounds.
3. Exactly one active allocation remains after each race.
4. The winning allocation is released and the seat is successfully booked again.
5. Concurrent bookings for distinct seats remain possible.

### Running the integration test

From the backend directory:

```cmd
npm run test:mysql
```

Configure the dedicated local test database using:

- `RRS_MYSQL_TEST_HOST`
- `RRS_MYSQL_TEST_USER`
- `RRS_MYSQL_TEST_PASSWORD`
- `RRS_MYSQL_TEST_DATABASE=railway_reservation_issue10_test`

The integration test must use the dedicated local test database. Do not point it at the development or production database.

### Verification status

The backend unit/API suite has passed 157 tests in the reported run. Real MySQL concurrency integration remains pending until the dedicated test configuration is supplied and the integration test completes successfully.

