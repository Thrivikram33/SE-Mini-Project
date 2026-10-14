# API Contract and Status

Base path: `/api`. All payloads are UTF-8 JSON. Errors use `{ "error": { "code", "message", "details?", "requestId" } }`. The API never returns SQL errors or stack traces to clients. Endpoints marked implemented are local code paths; database-backed behavior still requires a migrated, seeded MySQL database.

## Implemented

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /health/live` | none | `200 {"status":"ok"}` | — |
| `GET /health` | none | `200 {"status":"ok","database":"connected"}` | `500 INTERNAL_ERROR` if the DB is unavailable |
| `GET /stations` | none | `200 {data:[{code,name,city}]}` for active database stations | `500 INTERNAL_ERROR` if the DB is unavailable |
| `GET /trains/:scheduleId/availability` | schedule ID in path | `200 {data:{scheduleId,journeyDate,trainNumber,trainName,classes:[{classType,fare,availableSeats,seats:[{seatId,seatNumber,status}]}]}}` | `400 INVALID_SCHEDULE`, `404 SCHEDULE_NOT_FOUND`, `409 SCHEDULE_UNAVAILABLE` |
| `POST /auth/register` | `{name,email,mobile,password}` | `201 {data:{userId,name,email,mobile,role}}` | `400 VALIDATION_ERROR`, `409 EMAIL_EXISTS` |
| `POST /auth/login` | `{email,password}` | `200 {data:{userId,name,email,mobile,role}}`, sets an HttpOnly JWT cookie | `401 INVALID_CREDENTIALS`, `429` rate limit |
| `POST /auth/logout` | none | `204`, clears the auth cookie | — |
| `GET /auth/me` | HttpOnly auth cookie or bearer token | `200 {data:{userId,name,email,mobile,role}}` | `401 AUTH_REQUIRED` / `AUTH_INVALID` |
| `GET /trains/search?source=DMB&destination=DMC&date=2030-05-12&class=CC` | Station codes, ISO journey date, optional class | `200 {data:[{scheduleId,trainNumber,trainName,sourceCode,sourceName,destinationCode,destinationName,departureTime,arrivalTime,classType,fare,availableSeats,durationMinutes}]}` | `400 INVALID_STATION`, `SAME_STATION`, `INVALID_DATE`, or `INVALID_CLASS` |
| `POST /bookings` | Authenticated `{scheduleId,source,destination,classType,passengers:[{name,age,gender}],seatIds:[...],paymentOutcome?}` | `201` with backend PNR, route, assigned seats, fare, status | `400`, `402 PAYMENT_FAILED`, `404`, `409`, `401` |
| `GET /bookings/:pnr` | PNR; passenger owner or Admin | `200` with ticket details | `403`, `404` |
| `GET /bookings` | Authenticated Passenger | `200 {data:[...]}` containing own history | `401`, `403` |
| `GET /bookings/:pnr/cancellation-quote` | PNR; owning Passenger | `200` eligible status, configured refund percentage and amount | `403`, `404`, `409` |
| `POST /bookings/:pnr/cancel` | `{confirm:true}`; passenger owner or Admin | `200` cancellation and refund status | `400`, `403`, `404`, `409` |
| `GET /admin/trains`, `POST /admin/trains`, `PUT /admin/trains/:trainId` | Admin-only train list/create/update/deactivate | `200`/`201` persisted train | `401`, `403`, `400`, `404`, `409` |
| `GET /admin/trains/:trainId/route`, `PUT /admin/trains/:trainId/route` | Admin-only ordered route stops | `200` current/saved stops | `400`, `404`, `409` |
| `GET /admin/schedules`, `POST /admin/schedules`, `PUT /admin/schedules/:scheduleId` | Admin-only schedule, fare, and inventory operations | `200`/`201` persisted schedule | `400`, `404`, `409` |
| `GET /admin/bookings`, `GET /admin/bookings/:pnr`, `GET /admin/bookings/:pnr/cancellation-quote`, `POST /admin/bookings/:pnr/cancel` | Admin-only reservation lookup, quote, and cancellation | `200` booking/cancellation details | `400`, `404`, `409` |
| `GET /admin/audit?limit=100` | Admin-only audit history | `200 {data:[...]}` | `401`, `403` |

The search query returns schedules, fares, and available seat counts from MySQL. The only included train dataset is explicitly fictional local demo data and is not live or operational railway information.

Request IDs are created before JSON parsing and returned in the `X-Request-Id` header and error body. Malformed JSON returns `400 INVALID_JSON`; JSON bodies over the 32 KB parser limit return `413 REQUEST_TOO_LARGE`. Unknown internal errors return a generic `500 INTERNAL_ERROR`; logs record only the request ID and safe error code.

## Still required

The endpoints above are present in source code; this is not a claim that the SRS/STP traceability is complete. Local MySQL integration, frontend end-to-end flows, and real-database behavior are not verified. Review the SRS and STP for additional acceptance scenarios before claiming completion.

Booking and cancellation handlers use MySQL transactions and row locks. The `paymentOutcome` field is a deterministic local test switch (`success`/`failure`) and is ignored by the simulator outside development mode; it never represents a real payment. The client does not supply a payment card. A booking is confirmed only after the simulator returns success and the database transaction commits. Cancellation currently applies the configurable project policy `CANCELLATION_REFUND_PERCENT` (local default 80%) before the journey date; this is a project policy setting, not a real railway rule.
