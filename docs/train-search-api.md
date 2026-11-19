# Train search API

The public endpoint is:

```http
GET /api/trains/search?source=MAS&destination=SBC&date=2026-12-01
```

`source` and `destination` accept a station name or code, ignoring case and
surrounding whitespace. `date` must be a real `YYYY-MM-DD` calendar date; past
dates are rejected. The same station cannot be supplied twice using different
aliases.

Search checks ordered route stops. A result requires the source and destination
on the same active train, with the source sequence before the destination. The
selected source must have a departure time and the selected destination must
have an arrival time. Rows with an impossible elapsed time are omitted. There
is no result-count limit in the search query; the station autocomplete's
15-item limit applies only to suggestions.

## Scheduled and route-only results

For a configured scheduled journey, the API returns a row for each configured
class, fare, and its seat count. The response includes that schedule's ID and a
`bookable` boolean. A class is bookable only when the schedule, class, fare, and
at least one available seat exist.

Imported train data can include an ordered route and operating weekdays without
an application-owned schedule. If that weekday matches the requested source
departure date (adjusted for the source stop's `day_offset`), the route is
returned with `scheduleId: null`, `classType: null`, `fare: null`, zero seats,
and `bookable: false`. The frontend shows the route while preventing navigation
to seat selection. An administrator must configure a real schedule, class fare,
coach, and seat inventory before passengers can book it.

Example scheduled result:

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
      "availableSeats": 4,
      "bookable": true
    }
  ]
}
```

The example is illustrative; the API returns only database records. Empty
searches return `{ "trains": [] }`. Invalid input returns HTTP 400 using the
existing API error format. Unexpected database errors return the existing
generic HTTP 500 response.

`journeyDate` is the requested source-departure date. For scheduled trains it is
calculated from the schedule origin date plus the selected source stop's day
offset. Duration uses the selected source departure and destination arrival,
including their day offsets. `arrivalDaysAfterDeparture` reports how many days
later the destination arrival occurs.

## Seat availability

`availableSeats` counts distinct seats for the schedule and class where the
inventory status is `AVAILABLE` and there is no `HELD` or `CONFIRMED`
allocation. Released allocations do not consume a seat. This is schedule-wide
availability; the current schema does not track seat inventory by route segment.
Booking, simulated payment failure, cancellation, and release continue through
the existing transaction-based booking services.

## Database requirements

Migrations `001` through `005` provide stations, trains, ordered route stops,
schedules, fares, coaches, seats, and search indexes. Migration
`006_train_running_days.sql` adds the weekday table used to find imported route
data that has no application schedule. Apply it to the development database
before importing trains or using route-only search. The migration is
non-destructive and creates only `train_running_days`.

Vite development proxies `/api` requests to the backend on port 5000. Production
hosting must route `/api` to the backend on the same origin.
