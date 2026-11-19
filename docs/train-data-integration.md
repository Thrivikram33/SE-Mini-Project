# Train data integration

## Source files and dry-run results

The repository root contains `stations.json` (JSON array, 8,990 rows) and
`trains.txt` (JSON array, 5,208 rows). The import scripts validate them without
connecting to MySQL by default:

```cmd
cd /d "C:\SEM 5\SE LAB\SE Project\SE-Mini-Project-clone\backend"
npm.cmd run import:stations
npm.cmd run import:trains
```

Verified source-only results on 2026-11-19:

| Source | Rows | Eligible | Excluded / duplicate details |
|---|---:|---:|---|
| Stations | 8,990 | 8,965 unique codes | 25 invalid: 23 placeholder codes, 1 missing code/name, 1 code too long; no duplicate source codes |
| Trains | 5,208 | 4,808 unique eligible train records | 400 structurally ineligible; no duplicate train numbers |

The train validator reported 333 duplicate station stops within a selected
route, 54 declared destinations not after the source, 6 invalid station codes,
2 missing source stops, 2 station codes absent from the station dataset, and 3
invalid train details. For 620 other records, route stops before the declared
source or after the declared destination were excluded from that declared
journey; 17,296 such stops were trimmed. The order and source values of stops
inside the declared source-to-destination segment are preserved.

The 4,808 eligible routes contain 346,404 route-stop rows and 30,232 weekly
operating-day rows. Among these candidates, 49 lack a source departure time, 15
lack a destination arrival time, and 22 have chronology warnings; these warning
counts can overlap. Missing times remain `NULL`, and inconsistent times are
never rewritten. Search omits a requested leg if its selected departure or
arrival time is absent or its calculated duration is impossible.

Station records with no locality in the source are stored with an empty `city`
value; a station name is not substituted as a city. Source train and station
names are preserved for insertion. Existing database rows with conflicting
names are reported and left unchanged.

## Database tables and import order

The existing schema uses `stations`, `trains`, `route_stops`, and
`train_running_days`. Each route stop links a train and station with an ordered
sequence, optional times, and a day offset. The weekday table stores Sunday as
0 through Saturday as 6. Migration
[`006_train_running_days.sql`](../database/migrations/006_train_running_days.sql)
already exists in the repository and only creates the weekday table.

The database writes are explicitly restricted to a local development server
using `NODE_ENV=development` and `DB_NAME=railway_reservation_dev`. On
2026-11-19, the configured connection was verified as MySQL 8.0.43 on the local
server and the target database was confirmed empty before migration. The base
schema, booking migrations 002–004, train-search indexes, and weekday migration
006 were then applied. No database was dropped, recreated, or seeded with
bookings or users.

Once the development connection is corrected, run these commands from
`backend/`, in order:

```cmd
npm.cmd run migrate:train-days
npm.cmd run import:stations -- --apply
npm.cmd run import:trains -- --apply
npm.cmd run verify:train-data
```

These commands completed successfully against `railway_reservation_dev`. The
station import inserted 8,965 eligible stations. The train import inserted
4,808 trains, 346,404 ordered route stops, and 30,232 running-day rows. The
read-only verifier then reported no missing eligible source rows, name
conflicts, route or weekday mismatches, duplicate station/train keys, or
foreign-key violations. The import scripts use transactions, batches, unique
database constraints, and `INSERT IGNORE`; they do not update or delete
existing station/train rows.

## Search and booking behavior

The original search query started from `schedules` and joined coaches/fares.
That excluded imported trains that had routes and running days but no
application-owned schedule. Search now starts from active trains and ordered
route stops. It returns a scheduled result when a matching scheduled record
exists, or a route-only result when the train's operating weekday matches the
requested source departure date. The source must precede the destination; no
search-result `LIMIT` was present or added. The 15-row limit in station search
is only for autocomplete suggestions.

Route-only results carry `scheduleId: null`, no class or fare, zero available
seats, and `bookable: false`. The frontend keeps separate results for separate
trains even when their schedule IDs are null and does not link these results to
seat selection. Optional route-scoped simulated booking inventory is described
in [`booking-inventory-demo.md`](booking-inventory-demo.md); it is seeded
separately from the imported source data.

## Verification status and limits

The local development database contains the imported station/route data and
the optional SBC–MYS demo inventory for 2026-11-19 through 2026-12-18. The
seed added 532 schedules across 20 route trains, 3,192 class fares, 3,192
coaches, and 31,920 seats. Re-running it inserted zero rows and skipped all
532 schedules with existing inventory. For SBC–MYS on 2026-11-19, database-
backed search returned 17 trains and six bookable demo classes per train.

The local isolated MySQL suite passed, including HTTP registration/login,
search, class/fare/seat retrieval, successful and failed simulated payment,
PNR/history/ticket retrieval, refund preview, cancellation/seat release,
passenger/admin authorization, and booking/concurrency integrity. It uses the
separate `railway_reservation_issue10_test` schema; its fixture rows were
cleaned after the run. Demo fares and seats are simulated project values, not
official railway data. See `TEST_EVIDENCE.md` for full verification evidence.
