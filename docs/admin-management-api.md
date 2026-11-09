# Administrator management API

All endpoints require an authenticated session whose role is `ADMIN`. The existing session cookie must be sent with the request. Unauthenticated requests return `401`; passenger sessions return `403`. Mutations use parameterized SQL, MySQL transactions, and an `audit_logs` entry containing the acting administrator.

## Trains and routes

- `GET /api/admin/stations` lists station codes administrators can use on a route.
- `GET /api/admin/trains` lists train details and ordered route stops.
- `POST /api/admin/trains` creates a train and its route in one transaction.
- `PUT /api/admin/trains/:trainId` updates train details, active state, and optionally route stops.

Example train creation:

```json
{
  "trainNumber": "D-100",
  "trainName": "Demo Coastal Express",
  "routeStops": [
    { "stationCode": "DMB", "arrivalTime": null, "departureTime": "09:00", "dayOffset": 0 },
    { "stationCode": "DMC", "arrivalTime": "12:00", "departureTime": null, "dayOffset": 0 }
  ]
}
```

Route stops must reference existing station codes, be unique, and appear in increasing journey-time order. Route changes are rejected after a schedule exists, protecting the source/destination interpretation of prior schedules. Train deactivation sets `active=false`; a train with pending or confirmed bookings cannot be deactivated.

## Schedules

- `GET /api/admin/schedules` returns schedules with train name, status, coach count, and seat count.
- `POST /api/admin/schedules` creates a schedule for an active train with at least two route stops. Body: `{"trainId": 17, "journeyDate": "2030-05-12"}`.
- `PUT /api/admin/schedules/:scheduleId` updates `journeyDate` and status (`SCHEDULED`, `CANCELLED`, or `COMPLETED`).

Changing a date is rejected when booking history references the schedule. Cancelling a schedule is rejected while pending or confirmed bookings exist. Schedule deletion is not exposed.

## Fares and inventory

- `GET /api/admin/schedules/:scheduleId/fares` lists configured class fares.
- `PUT /api/admin/schedules/:scheduleId/fares/:classType` inserts or updates a fare. Body: `{"amount":"450.00", "currency":"INR"}`. Amounts are non-negative with at most two fractional digits; currencies use three letters.
- `GET /api/admin/schedules/:scheduleId/inventory` lists coaches and seats, including whether a seat has an active allocation.
- `POST /api/admin/schedules/:scheduleId/coaches` adds one coach and its seats atomically. Body: `{"classType":"SL", "coachNumber":"S1", "seats":[{"seatNumber":"01", "berthType":"LOWER", "status":"AVAILABLE"}]}`. A coach must contain 1–100 unique seats.
- `PUT /api/admin/seats/:seatId` updates a seat number, berth type, and status (`AVAILABLE` or `BLOCKED`). A seat with a `HELD` or `CONFIRMED` allocation cannot be changed.

No migration is required: the existing schema includes train activation, route stops, schedule status, fare uniqueness, coaches, seats, and administrator audit logging. The administration page at `/admin` uses these endpoints; the server remains the authorization boundary.

## Errors and integration

Validation errors return `400`; missing resources return `404`; duplicate keys, booking conflicts, and protected master-data changes return `409`. Unexpected database details are not returned to the client. Train search reads the same schedule, fare, coach, and seat tables, so saved changes are reflected on the next search.
