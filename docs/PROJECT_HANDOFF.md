# Project handoff

## Issue #10: seat allocation and inventory updates

This branch completes the seat allocation workflow and inventory consistency work for the Railway Reservation System.

### Scope
- Validate seat selection before allocation.
- Keep inventory based on active `booking_seats` allocations.
- Hold seats while a booking is pending payment.
- Confirm or release allocations according to payment outcomes.
- Protect the database with transactional row locking and uniqueness checks.

### Database notes
- The initial schema already includes `booking_seats` with the `active_seat_id` generated column and a unique key enforcing one active allocation per seat.
- The application relies on that uniqueness constraint and transaction-level verification instead of client-side validation alone.
- A failed payment or cancelled flow should update allocation rows to `RELEASED` so the seat becomes available again.

### Verification
- Unit tests cover the allocation lifecycle and validation safeguards.
- MySQL integration tests run against the dedicated `railway_reservation_issue4_test` database when present.
