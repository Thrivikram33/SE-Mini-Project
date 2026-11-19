# Demo data setup

This project includes station and train datasets at the repository root:

- `stations.json` — station records used by the station importer.
- `trains.txt` — train, route-stop, timing, and running-day records used by the train importer.

Imported route/timing information comes from those supplied datasets. The reservation inventory created for demonstration is simulated: coaches, seats, and fares are not official Indian Railways inventory or fares.

## Prerequisites

1. Configure `backend/.env` with the local MySQL connection values used by the backend.
2. Initialize the database with migrations `001` through `006`. Migration `006_train_running_days.sql` is required before importing train running days.
3. Run the following commands from the `backend/` directory.

## Populate the supplied datasets

```bash
npm run import:stations
npm run import:trains:dry-run
npm run import:trains
npm run seed:imported-trains
```

The station importer reads `../stations.json`. The train import command first validates the records against the imported stations; the `dry-run` command reports accepted/skipped records without inserting train rows. Run `npm run import:trains` only after reviewing that report.

The imported-schedule generator creates a rolling 30-day window for eligible active trains and adds simulated inventory for six classes (`1A`, `2A`, `3A`, `SL`, `CC`, and `2S`), with ten seats per configured coach. It uses source route timings and running days rather than inventing schedules. Fares are illustrative project values, not official railway fares.

The importers skip existing train numbers and the schedule generator uses `INSERT IGNORE` for existing schedules, coaches, fares, and seats. They are designed to be rerun without duplicating those rows; do not treat them as a replacement for database backups.

## Guaranteed single-route fallback

For a small, predictable walkthrough, run:

```bash
npm run seed:demo
```

This sets up the demo route Bengaluru City Junction (`SBC`) to Chennai Central (`MAS`) with train `DEMO001`, Sleeper class, an illustrative INR 450 fare, and ten simulated seats. The journey date defaults to tomorrow. To choose a different date, set `DEMO_JOURNEY_DATE` to a future date in `YYYY-MM-DD` format before running the command.

The seed does not create passenger or administrator accounts. Create a passenger using the registration page. Do not use a hardcoded shared administrator password; provision admin access using the project's trusted database/admin setup process.

## Quick demo checklist

1. Import the station and train datasets and generate rolling schedules, or seed the single-route fallback.
2. Start the backend and frontend using the normal project development commands.
3. Register a passenger account and sign in.
4. Search `SBC` to `MAS` for tomorrow when using the fallback route.
5. Choose the `SL` class, select available seats, enter passenger details, and complete the simulated payment.
6. Verify the confirmed ticket and PNR in the ticket page and `My bookings`.

All payments in this project are simulated. No live railway reservation or real payment transfer is performed.
