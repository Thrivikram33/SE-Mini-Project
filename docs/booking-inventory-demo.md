# Route-scoped booking demo inventory

Imported station/train data contains routes, timetable times, and operating
weekdays. It does not contain application schedules, fares, coaches, or seats.
The optional seed below creates clearly marked **simulated project-demo**
inventory for a chosen route pair; it does not represent official railway
fares, coach composition, or live availability.

## Seed command

Run from the repository's `backend/` directory after migrations, station/train
imports, and `verify:train-data` have passed. The default is a read-only dry run:

```cmd
npm.cmd run seed:booking-demo -- --source SBC --destination MYS --days 30
```

Review the planned counts. Apply the demo data only with both explicit flags:

```cmd
npm.cmd run seed:booking-demo -- --source SBC --destination MYS --days 30 --apply --confirm-simulated
```

Replace `SBC` and `MYS` with the station codes for another route. `--days` is
limited to 1–90 and counts boarding dates starting today. A schedule is planned
only when the train's actual imported running weekday matches its origin date,
after accounting for the source stop's day offset. Trains with missing endpoint
times or invalid duration are excluded.

For each newly seeded schedule the script creates the six schema-supported
classes (`1A`, `2A`, `3A`, `SL`, `CC`, `2S`), one simulated coach per class, ten
available seats per coach, and one illustrative INR fare per class. The fare is
derived from the selected route-leg duration using a fixed demo formula. The
search page labels these fares and seats as simulated project data.

## Safety and repeatability

- The command refuses any target except local `railway_reservation_dev` with
  `NODE_ENV=development`.
- Dry run is the default. Write mode requires `--apply --confirm-simulated`.
- All inserted rows are written in one InnoDB transaction using parameterized
  reads and `INSERT IGNORE`; no existing row is updated or deleted.
- Existing schedules are reused. Schedules with any booking, coach, fare, or
  seat inventory are skipped and reported, so seed data cannot replace or mix
  with existing booking inventory.
- Re-running the same apply command creates no duplicate schedules/classes,
  fares, coaches, or seats.

## Teammate setup from a clean local development database

1. Install local MySQL 8 and create the empty `railway_reservation_dev` schema.
   Configure `backend/.env` locally with `NODE_ENV=development`, a loopback
   `DB_HOST`, the database name, credentials, and `SESSION_SECRET`. Do not share
   `.env` or commit it.
2. From the repository root, install dependencies:

   ```cmd
   npm.cmd --prefix "backend" ci
   npm.cmd --prefix "frontend" ci
   ```

3. From `backend/`, apply the schema and additive migrations:

   ```cmd
   npm.cmd run migrate:initial
   npm.cmd run migrate:booking
   npm.cmd run migrate:train-search-indexes
   npm.cmd run migrate:train-days
   ```

4. Import source station/train route data and verify it:

   ```cmd
   npm.cmd run import:stations -- --apply
   npm.cmd run import:trains -- --apply
   npm.cmd run verify:train-data
   ```

5. Run the route-scoped dry run, review its output, then run the apply command
   above if simulated demo inventory is wanted.
6. Start backend and frontend in separate terminals from the repository root:

   ```cmd
   npm.cmd --prefix "backend" run dev
   npm.cmd --prefix "frontend" run dev
   ```

An existing database must be inspected before applying migrations or seeds.
`migrate:initial` is designed for an empty development schema and refuses
populated or unexpected tables. Never use it to reset an existing database.

The booking API remains responsible for seat locks, one active allocation per
seat, simulated payment results, PNR creation, booking ownership, cancellation,
and refund calculation. The demo seed only prepares schedule/class/fare/coach/
seat records; it does not create users or bookings.
