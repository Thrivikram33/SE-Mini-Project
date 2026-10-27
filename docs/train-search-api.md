# Train search API

The public train-search endpoint is:

```http
GET /api/trains/search?source=MAS&destination=SBC&date=2026-12-01
```

`source` and `destination` accept a station name or station code, ignoring case and surrounding whitespace. `date` must be a real `YYYY-MM-DD` calendar date. Past dates are rejected by UTC calendar day; the project has no configured maximum booking horizon. The same stored station is rejected even if one parameter uses its name and the other its code.

Successful searches return HTTP 200 with one item per configured class and fare:

```json
{
  "trains": [
    {
      "trainId": 7,
      "trainNumber": "12001",
      "trainName": "Example Express",
      "scheduleId": 31,
      "source": { "code": "MAS", "name": "Chennai Central" },
      "destination": { "code": "SBC", "name": "KSR Bengaluru" },
      "departureTime": "23:30:00",
      "arrivalTime": "05:15:00",
      "journeyDate": "2026-12-01",
      "durationMinutes": 345,
      "arrivalDaysAfterDeparture": 1,
      "classType": "SL",
      "fare": { "amount": 250.00, "currency": "INR" },
      "availableSeats": 4
    }
  ]
}
```

The example is illustrative; the API returns only records from the configured database. Empty searches return `{ "trains": [] }`. Invalid input returns HTTP 400 with the existing API format, for example `{ "error": "INVALID_REQUEST", "message": "Date must use YYYY-MM-DD format." }`. Unexpected database errors return the existing generic HTTP 500 response.

The requested date is the calendar date of departure at the selected source, accounting for that stop's configured `day_offset` relative to the schedule's origin date. Duration uses the selected source departure and destination arrival and includes the offsets. `arrivalDaysAfterDeparture` indicates whether arrival is on a later day.

### Availability calculation

`availableSeats` is the number of distinct seats in coaches for the returned schedule and class that meet both conditions:

- The seat's inventory status is `AVAILABLE`.
- The seat has no `HELD` or `CONFIRMED` allocation.

`BLOCKED` seats, active allocations, and duplicate rows from joins do not increase the count. Only the allocation status determines whether an allocation consumes a seat: a `HELD` or `CONFIRMED` allocation remains unavailable even if its booking status is `PAYMENT_FAILED` or `CANCELLED`. This matches the database's unique active-seat constraint, which remains occupied until the allocation is changed to `RELEASED`. Payment-failure and cancellation flows must release allocations when the applicable booking rules require it. This repository currently contains no booking/payment/cancellation write service, so those lifecycle transitions are not implemented here. Inventory is stored for the whole schedule rather than individual route segments, so this API reports schedule-wide availability, not availability limited to the selected source/destination segment.

Results require a configured coach class and fare so every returned option can continue to the existing class/seat-selection flow. The response includes `scheduleId` for that flow.

No migration is needed: the initial schema already includes stations, ordered route stops, stop day offsets, schedules, fares, coaches, seats, and active seat allocations. Existing schedule, route, coach, and seat indexes support the search joins. In Vite development, `/api` requests are proxied to the backend on port 5000; production hosting must route `/api` to the backend on the same origin.
