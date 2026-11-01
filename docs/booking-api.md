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

## Database setup

Apply migration `database/migrations/002_allow_pnr_for_failed_bookings.sql` after migration `001_initial_schema.sql`. It allows failed bookings to have a `NULL` PNR while the existing unique index continues enforcing PNR uniqueness for confirmed bookings.

## Inventory behavior

Booking holds the schedule and seat rows in an InnoDB transaction, checks active allocations, and inserts temporary `HELD` rows. Success atomically writes the PNR, confirmed booking, confirmed seat allocations, and successful payment. Failure changes the payment and booking states and marks allocations `RELEASED` before commit. A database error rolls the transaction back. The unique active-seat allocation index remains the final cross-request guard.
