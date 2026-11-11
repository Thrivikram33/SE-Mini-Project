# Booking and simulated payment API

## Create a booking

`POST /api/bookings` requires an authenticated `PASSENGER` session. The backend takes the owner from the session; clients cannot choose a different `userId`.

```json
{
  "scheduleId": 17,
  "source": "BLR",
  "destination": "MAS",
  "classType": "SL",
  "seatIds": [101],
  "passengers": [
    { "name": "Asha Rao", "age": 25, "gender": "FEMALE" }
  ]
}
```

Exactly one distinct seat is required per passenger. Station values are station codes on the selected train, in route order. Passenger data is checked with the shared passenger-details validator before the database connection is opened. Validation errors use `details` keys such as `passengers.0.age`.

On successful simulated payment, the endpoint returns `201` with `booking.status: "CONFIRMED"`, a unique PNR, passenger seats, journey details, and total fare. On simulated failure it returns `402 PAYMENT_FAILED`; the database retains a `PAYMENT_FAILED` booking and failed payment record with no PNR, and releases the temporary seat allocations. No real payment is made.

For repeatable local failure testing only, set `NODE_ENV=development` and include `"paymentOutcome": "failure"` in the request. Omit it or use `"success"` for simulated success. This field cannot force a failure in production mode.

## Retrieve bookings

`GET /api/bookings` returns the authenticated passenger's booking history, newest first. `GET /api/bookings/:pnr` returns the full ticket, including passenger and seat details, for a confirmed booking owned by the authenticated passenger. Both endpoints require a `PASSENGER` session; administrators and unauthenticated users are rejected by the existing role middleware.

PNRs are matched case-insensitively after trimming. A malformed, unknown, or another passenger's PNR returns the same `404 BOOKING_NOT_FOUND` response (`Booking not found.`), so the endpoint does not disclose whether a booking exists. History is filtered by the current session user ID. Requests use cookie credentials from the frontend.

Example ticket response:

```json
{
  "booking": {
    "bookingId": 17,
    "pnr": "AB23456789CD",
    "status": "CONFIRMED",
    "paymentStatus": "SUCCESS",
    "trainNumber": "D-100",
    "trainName": "Demo Coastal Express",
    "origin": { "code": "DMB", "name": "Demo Bengaluru" },
    "destination": { "code": "DMC", "name": "Demo Chennai" },
    "journeyDate": "2030-05-12",
    "classType": "CC",
    "totalFare": "450.00",
    "currency": "INR",
    "passengers": [
      { "passengerId": 21, "name": "Asha Rao", "age": 25, "gender": "FEMALE", "seatNumber": "1A" }
    ]
  }
}
```

The frontend `/bookings` page displays account history and accepts a PNR lookup. `/ticket?pnr=...` retrieves an existing ticket; the in-session booking result continues to display immediately after confirmation.

## Database setup

Apply migration `database/migrations/002_allow_pnr_for_failed_bookings.sql` after migration `001_initial_schema.sql`. It allows failed bookings to have a `NULL` PNR while the existing unique index continues enforcing PNR uniqueness for confirmed bookings.

## Inventory behavior

Booking holds the schedule and seat rows in an InnoDB transaction, checks active allocations, and inserts temporary `HELD` rows. Success atomically writes the PNR, confirmed booking, confirmed seat allocations, and successful payment. Failure changes the payment and booking states and marks allocations `RELEASED` before commit. A database error rolls the transaction back. The unique active-seat allocation index remains the final cross-request guard.

## Cancel a booking

`POST /api/bookings/:bookingId/cancel` requires a `PASSENGER` session and only
cancels a `CONFIRMED` booking owned by that session. Unknown and non-owned
booking IDs use the same `404 BOOKING_NOT_FOUND` response. Invalid IDs return
`400 VALIDATION_ERROR`; bookings that are not confirmed return `409
BOOKING_NOT_CANCELLABLE`. A successful response is `200` with the booking ID,
`CANCELLED` status, cancellation record ID, and number of released seats.

The operation locks the booking and schedule and atomically updates the booking,
releases its active seat allocations, records the cancellation, and writes an
audit event. Historical booking, passenger, payment, and allocation rows remain
available. Released allocations no longer occupy the schema's unique active
seat key, so inventory queries and subsequent bookings can use those seats.

This endpoint does not calculate a refund or reverse a simulated payment. The
cancellation table's existing default refund fields are retained until the
project's configured refund policy is defined; the endpoint does not present
them as a refund result.

## Booking response-time benchmark (RRS-NFR-002)

The acceptance criterion is P95 at most 3,000 ms for booking confirmation,
excluding simulated payment latency. The booking endpoint adds a `Server-Timing`
header with `booking-processing` (service execution, including validation,
connection checkout/release, SQL, transaction and response-object creation,
minus only simulator work) and `simulated-payment` (time spent inside
`paymentSimulator.charge`). The JSON response is unchanged. The simulator
currently performs no artificial wait and no real financial settlement; its
measured latency is expected to be near zero. Payment-result persistence,
confirmation and commit are outside the simulator and remain included.

Run `npm run benchmark:booking` from `backend/` against a running API backed by
an isolated MySQL test database. Set `BASE_URL`, an authenticated passenger
`COOKIE` header value, `SCHEDULE_ID`, `SOURCE`, `DESTINATION`, and
`SEAT_IDS` (comma-separated). Optional settings are `REQUESTS` (default 100,
minimum 20), `WARMUP` (default 5), `CONCURRENCY` (default 1), `CLASS_TYPE`
(default `SL`) and `DATABASE_ENVIRONMENT`. Reserve at least `REQUESTS + WARMUP`
available seats in that schedule: every successful booking consumes one seat,
and the script does not clean up or mutate earlier bookings. Use a disposable
inventory fixture and a dedicated passenger session.

Warm-up requests run sequentially and are excluded from the sample. The
benchmark reports successful and failed requests separately, total observed
client response time, backend service time, measured simulator time and
request-to-response time minus only that measured simulator interval. P50,
P90, P95 and P99 use nearest-rank (`ceil(n * percentile)`) over successful
measured requests; maximum is reported separately. Failed requests are never
mixed into the success percentile. Hardware, runtime and database environment
must be recorded alongside results. No representative local MySQL benchmark
has been run for this change, so the 3-second criterion remains
**IMPLEMENTED — NOT VERIFIED** until the script is run with representative
inventory and concurrency.
