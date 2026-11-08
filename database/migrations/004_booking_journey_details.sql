ALTER TABLE bookings
    ADD COLUMN origin_station_id BIGINT UNSIGNED NULL AFTER schedule_id,
    ADD COLUMN destination_station_id BIGINT UNSIGNED NULL AFTER origin_station_id,
    ADD COLUMN class_type ENUM('1A', '2A', '3A', 'SL', 'CC', '2S') NULL AFTER destination_station_id,
    ADD CONSTRAINT fk_booking_origin_station
        FOREIGN KEY (origin_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_booking_destination_station
        FOREIGN KEY (destination_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT;
