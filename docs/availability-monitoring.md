# Availability monitoring (Issue #21)

This implements monitoring and reporting for SRS requirement RRS-NFR-003 and STP test TC-REL-01.

## Run a dedicated monitoring window

Start the backend API, then from `backend/` run PowerShell commands:

```powershell
$env:AVAILABILITY_DURATION_MS = "3600000"
$env:AVAILABILITY_INTERVAL_MS = "10000"
$env:AVAILABILITY_LOG_FILE = "logs/availability-demo.jsonl"
npm run monitor:availability
```

The defaults are a one-hour window and a 10-second probe interval. Configure these to the demonstration/test window agreed by the team; these defaults are operational defaults, not an SRS-defined acceptance profile. Use a new log filename for each formal test window so a report cannot accidentally mix separate runs.

## Configuration

- `AVAILABILITY_HEALTH_URL`: health endpoint (default `http://127.0.0.1:5000/api/health`).
- `AVAILABILITY_DURATION_MS`: monitoring duration (default 3,600,000).
- `AVAILABILITY_INTERVAL_MS`: interval between probes (default 10,000; minimum 1,000).
- `AVAILABILITY_TIMEOUT_MS`: per-probe timeout (default 5,000).
- `AVAILABILITY_LOG_FILE`: append-only JSONL log path (default `backend/logs/availability.jsonl`).
- `AVAILABILITY_MAINTENANCE_WINDOWS`: JSON array of ISO-8601 `{"start":"...","end":"..."}` windows to exclude.

Each probe records a timestamp, success/failure, HTTP status when available, duration, and a safe error category. Logs contain no credentials or response bodies. Generated local JSONL logs are ignored by Git; preserve the reviewed formal test evidence separately when the agreed window has completed.

## Report the same dedicated window

Keep the same `AVAILABILITY_LOG_FILE` value in the PowerShell session, then run:

```powershell
npm run report:availability
```

The report prints total eligible probes, successes, failures, calculated percentage, and whether the 99% target was reached. It exits non-zero when there are no observations or the target is not met.

## Measurement limitation

The calculation is a sampled health-probe availability estimate: successful eligible probes divided by all eligible probes. It is not a continuous, request-weighted uptime measurement. A 99% result is evidence only for the recorded test window, endpoint, probe interval, timeout, and maintenance exclusions. Do not claim the requirement is verified until the agreed test window has run and its log/report has been reviewed.
