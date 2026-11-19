# Demo data setup

The repository includes supplied station and train source datasets (`stations.json` and `trains.txt`) for the imported-data workflow. For a predictable presentation, it also includes a small **fictional placeholder dataset** in `backend/demo-data.json`.

## Quick demo seed

From the `backend/` directory, configure `.env` and ensure migrations `database/migrations/001` through `006` have been applied. Then run:

```bash
npm run seed:demo
```

The seed creates future schedules (tomorrow by default) for four fictional demonstration trains:

| Train | Route | Classes | Illustrative fares |
|---|---|---|---|
| DEMO101 Demo Express | SBC Bengaluru → MAS Chennai | SL, 3A, 2A | ₹450, ₹950, ₹1,450 |
| DEMO102 Mysuru City Demo | SBC Bengaluru → MYS Mysuru | 2S, CC | ₹120, ₹250 |
| DEMO103 Chennai Return Demo | MAS Chennai → SBC Bengaluru | SL, 3A | ₹470, ₹980 |
| DEMO104 Deccan Demo Link | SBC Bengaluru → HYB Hyderabad | SL, 3A | ₹520, ₹1,100 |

Each class receives ten simulated seats. The seed is repeatable: it upserts station, train, schedule, route, coach, and fare records and inserts seats only when missing. It runs in a transaction and rolls back if a write fails.

To use a specific journey date, set `DEMO_JOURNEY_DATE=YYYY-MM-DD` before running the command. The date must be valid and today or later.

The demo dataset contains no passenger or administrator accounts. Create accounts through the normal application flow. Do not add shared passwords or seed privileged accounts.

## Imported source datasets

```bash
npm run import:stations
npm run import:trains:dry-run
npm run import:trains
npm run seed:imported-trains
```

Review the dry-run report before importing. The imported route/timing information comes from the supplied files. The quick demo data above is fictional, and all fares, seats, schedules, and payments are illustrative project data—not official Indian Railways inventory, timetables, or prices.