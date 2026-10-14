# RRS API

Layered Express API with MySQL persistence. Implemented endpoints are listed in [`../docs/API.md`](../docs/API.md). Railway data is local and fictional; payment behavior is simulated and never settles real payments. Never use the demonstration seed as operational data.

## Local setup (PowerShell)

1. Install Node.js 20.19 or later and MySQL 8.x. Create a local database/user in MySQL Workbench or the MySQL shell:

   ```sql
   CREATE DATABASE railway_reservation_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'rrs_app'@'localhost' IDENTIFIED BY 'choose-a-local-password';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON railway_reservation_dev.* TO 'rrs_app'@'localhost';
   ```

   These SQL statements change database state. Verify the MySQL instance is an isolated development instance and obtain project-owner approval before running them; never run them on production or shared data.

2. In `backend/`, install locked dependencies and create a private environment file. The example defaults to `railway_reservation_dev`:

   ```powershell
   npm.cmd ci
   Copy-Item .env.example .env
   ```

   Set a unique `API_JWT_SECRET`, local MySQL password, and `MYSQL_DATABASE` in `.env`. Do not commit `.env`. In a local development environment only, set `DEMO_SEED_ENABLED=1` if you want the fictional demo train; the default is disabled.

3. Apply the additive migration, optionally load demo data, and start the server:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run db:seed:demo
   npm.cmd run dev
   ```

   Migration and demo seed commands are restricted to `MYSQL_DATABASE=railway_reservation_dev` and `NODE_ENV=development`; the seed also requires `DEMO_SEED_ENABLED=1`. Inspect existing database contents before either command. Do not use them for production or shared data.

4. Verify liveness at `http://localhost:4000/api/health/live` and database connectivity at `http://localhost:4000/api/health`. Search is `GET /api/trains/search?source=DMB&destination=DMC&date=2030-05-12&class=CC` when the demo seed is loaded.

Register a local passenger using `POST /api/auth/register`, then use the development-only promotion script if a local administrator account is needed. It requires interactive confirmation and writes an audit record:

```powershell
npm.cmd run admin:promote-demo -- passenger@example.test
```

## Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Runtime mode. Keep `development` for local setup; database mutation scripts refuse other modes. |
| `PORT` | API listen port (default `4000`). |
| `CLIENT_ORIGIN` | Exact browser origin allowed by CORS (local default `http://localhost:5173`). |
| `PUBLIC_API_URL` | Public API URL; production configuration requires HTTPS. |
| `TRUST_PROXY` | Set to `1` only behind a trusted proxy that is the only path to Node. |
| `API_JWT_SECRET` | Private JWT signing key. Required in all modes and at least 32 characters in production. Never put it in frontend `VITE_*` variables. |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | MySQL connection settings. Use `railway_reservation_dev` locally; do not share the password. |
| `DEMO_SEED_ENABLED` | Must be `1` to enable fictional development data; default is disabled. |
| `CANCELLATION_REFUND_PERCENT` | Project simulated-refund percentage, default `80`, allowed range `0` to `100`. |

## Security and deployment notes

- The server hashes passwords with bcrypt and ignores any client-supplied role on registration.
- Login uses a signed, short-lived JWT in an HttpOnly, SameSite=Strict cookie; production cookies are Secure. Passenger/Admin checks must use the server-side role and the included authorization middleware.
- Production startup rejects a short JWT secret and a non-HTTPS `PUBLIC_API_URL`. Terminate TLS at a trusted reverse proxy; set `TRUST_PROXY=1` only when the Node process is reachable exclusively through that proxy.
- SQL values use parameterized statements. Database errors and stack traces are not returned to clients.
- The included schema migration has no destructive statements. Review it and back up any existing database before applying migrations in a shared environment.

## Development checks

```powershell
npm.cmd test
npm.cmd run lint
```

Integration against the selected MySQL development database, deployment TLS, load, and concurrency behavior still require separate evidence. The current unit tests use mocked database behavior.
