-- Prevent an allocation from linking a booking to a passenger on another booking.
-- Additive constraint; existing booking and passenger history is preserved.
ALTER TABLE passengers
    ADD UNIQUE KEY uq_passenger_booking_pair (booking_id, passenger_id);

ALTER TABLE booking_seats
    ADD CONSTRAINT fk_booking_seat_booking_passenger
    FOREIGN KEY (booking_id, passenger_id)
    REFERENCES passengers (booking_id, passenger_id)
    ON DELETE RESTRICT;
