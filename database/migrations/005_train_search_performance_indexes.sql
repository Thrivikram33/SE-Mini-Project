-- Issue #19: support index-backed train-search station and route lookups.
-- Apply once after 004_booking_journey_details.sql.
-- Existing station input is trimmed/collapsed in the service; equality predicates
-- use the column collation and avoid applying functions to indexed columns.

ALTER TABLE stations
    ADD KEY idx_stations_name (name);

ALTER TABLE route_stops
    ADD KEY idx_route_station_train_sequence_departure
        (station_id, train_id, sequence_no, departure_time, day_offset);
