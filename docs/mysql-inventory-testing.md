# MySQL seat inventory integration tests

The backend unit suite uses mocked database behavior. The separate MySQL suite exercises the real search, seat-selection, and booking services against a local, isolated MySQL 8 database named exactly `railway_reservation_issue10_test`.

## Safety checks

The test refuses a remote host or any database name other than the exact allowlisted test database. Before writing, it checks the selected schema, table set, InnoDB engines, and existing row counts. It creates schema only when the database has no tables; a partial or populated schema causes a clear refusal. It applies the repository migrations `001`, `002`, and `003` and does not drop or truncate tables. It creates uniquely named fixtures and removes only rows created by the current test run, including its booking audit entries.

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

Cancellation routes/services are not present on this branch. The database can represent cancellation history, and released allocation rows become available to search and seat selection, but cancellation workflow behavior is not claimed as implemented or verified here.

The GitHub Actions workflow provisions a fresh MySQL 8 service database and supplies temporary test-only credentials to this suite. Local MySQL results must be recorded separately from CI results.
