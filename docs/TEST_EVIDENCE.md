# Test evidence

## Local unit validation

Command:

```sh
cd backend
npm test -- --test-reporter=spec
```

Expected result: backend unit tests pass when the repository dependencies are installed and no unrelated tests fail.

## MySQL integration validation

When the environment provides:

- `RRS_MYSQL_TEST_HOST`
- `RRS_MYSQL_TEST_USER`
- `RRS_MYSQL_TEST_PASSWORD`
- `RRS_MYSQL_TEST_DATABASE=railway_reservation_issue4_test`

run:

```sh
cd backend
npm run test:mysql
```

This exercises the real MySQL schema and active-allocation uniqueness rule in the isolated test database.
