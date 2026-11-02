# MySQL inventory integration test

The backend unit suite mocks database calls. The real inventory test is separate and must run against an isolated MySQL database.

## Prepare the database

Create a dedicated database named exactly `railway_reservation_issue4_test` on a local MySQL instance. The test rejects remote hosts and any database name other than this exact name. Do not point it at `railway_reservation`, a shared team database, or production. The test applies only the `CREATE TABLE IF NOT EXISTS` statements from migration `001` to this exact database; it never executes the migration's `USE railway_reservation` statement and never drops a database or table.

Set these variables in the shell running the test. Use credentials for the isolated test database and do not commit them:

- `RRS_MYSQL_TEST_HOST`
- `RRS_MYSQL_TEST_PORT` (optional; defaults to `3306`)
- `RRS_MYSQL_TEST_USER`
- `RRS_MYSQL_TEST_PASSWORD`
- `RRS_MYSQL_TEST_DATABASE=railway_reservation_issue4_test`

Run from `backend`:

```sh
npm run test:mysql
```

The test refuses to start if required configuration is missing or the database name differs from the allowlisted test database. It creates uniquely named fixture records and removes only records created by that run, including when assertions fail.

## Coverage and boundaries

The test calls the real train-search and seat-selection services against MySQL. It checks available, blocked, held, confirmed, released, failed-payment, and cancelled-booking allocation states; verifies released seats return to availability; and compares search counts with seat-selection availability. Two independent connections compete for the same seat to verify the schema's unique active-allocation constraint, then the test releases and reallocates the seat and checks the updated search count.

This repository has no booking, payment-failure, cancellation, or seat-allocation write service. The concurrent insert therefore verifies the database constraint at the SQL layer, not an application allocation API. The test verifies the effect of changing allocations to `RELEASED`, but cannot verify that absent lifecycle services perform that transition.
