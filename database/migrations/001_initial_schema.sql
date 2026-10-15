-- Railway Reservation System
-- Migration: 001_initial_schema.sql
-- Target: MySQL 8.x
-- Apply once to the railway_reservation database.

USE railway_reservation;

CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    mobile VARCHAR(20) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('PASSENGER', 'ADMIN') NOT NULL DEFAULT 'PASSENGER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_mobile (mobile)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stations (
    station_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(120) NOT NULL,
    city VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_stations_code (code),
    KEY idx_stations_city (city)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trains (
    train_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    train_number VARCHAR(10) NOT NULL,
    train_name VARCHAR(150) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_trains_number (train_number),
    KEY idx_trains_active (active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS route_stops (
    route_stop_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    train_id BIGINT UNSIGNED NOT NULL,
    station_id BIGINT UNSIGNED NOT NULL,
    sequence_no SMALLINT UNSIGNED NOT NULL,
    arrival_time TIME NULL,
    departure_time TIME NULL,
    day_offset TINYINT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uq_route_sequence (train_id, sequence_no),
    UNIQUE KEY uq_route_station (train_id, station_id),
    KEY idx_route_station_sequence (station_id, train_id, sequence_no),
    CONSTRAINT fk_route_train FOREIGN KEY (train_id)
        REFERENCES trains(train_id) ON DELETE CASCADE,
    CONSTRAINT fk_route_station FOREIGN KEY (station_id)
        REFERENCES stations(station_id) ON DELETE RESTRICT,
    CONSTRAINT chk_route_sequence CHECK (sequence_no > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
    schedule_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    train_id BIGINT UNSIGNED NOT NULL,
    journey_date DATE NOT NULL,
    status ENUM('SCHEDULED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_schedule_train_date (train_id, journey_date),
    KEY idx_schedule_date_status (journey_date, status),
    CONSTRAINT fk_schedule_train FOREIGN KEY (train_id)
        REFERENCES trains(train_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coaches (
    coach_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT UNSIGNED NOT NULL,
    class_type ENUM('1A', '2A', '3A', 'SL', 'CC', '2S') NOT NULL,
    coach_number VARCHAR(10) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_coach_number (schedule_id, coach_number),
    KEY idx_coach_class (schedule_id, class_type),
    CONSTRAINT fk_coach_schedule FOREIGN KEY (schedule_id)
        REFERENCES schedules(schedule_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seats (
    seat_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    coach_id BIGINT UNSIGNED NOT NULL,
    seat_number VARCHAR(10) NOT NULL,
    berth_type ENUM('LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'SEAT', 'NA')
        NOT NULL DEFAULT 'NA',
    status ENUM('AVAILABLE', 'BLOCKED') NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_seat_number (coach_id, seat_number),
    KEY idx_seats_coach_status (coach_id, status),
    CONSTRAINT fk_seat_coach FOREIGN KEY (coach_id)
        REFERENCES coaches(coach_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fares (
    fare_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    schedule_id BIGINT UNSIGNED NOT NULL,
    class_type ENUM('1A', '2A', '3A', 'SL', 'CC', '2S') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_fare_schedule_class (schedule_id, class_type),
    CONSTRAINT fk_fare_schedule FOREIGN KEY (schedule_id)
        REFERENCES schedules(schedule_id) ON DELETE CASCADE,
    CONSTRAINT chk_fare_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
    booking_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pnr CHAR(12) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    schedule_id BIGINT UNSIGNED NOT NULL,
    status ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED')
        NOT NULL DEFAULT 'PENDING_PAYMENT',
    total_fare DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bookings_pnr (pnr),
    KEY idx_bookings_user_created (user_id, created_at),
    KEY idx_bookings_schedule_status (schedule_id, status),
    CONSTRAINT fk_booking_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_schedule FOREIGN KEY (schedule_id)
        REFERENCES schedules(schedule_id) ON DELETE RESTRICT,
    CONSTRAINT chk_booking_fare CHECK (total_fare >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passengers (
    passenger_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    age TINYINT UNSIGNED NOT NULL,
    gender ENUM('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED') NOT NULL DEFAULT 'UNDISCLOSED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_passengers_booking (booking_id),
    CONSTRAINT fk_passenger_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT chk_passenger_age CHECK (age <= 120)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_seats (
    booking_seat_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    seat_id BIGINT UNSIGNED NOT NULL,
    passenger_id BIGINT UNSIGNED NOT NULL,
    allocation_status ENUM('HELD', 'CONFIRMED', 'RELEASED') NOT NULL DEFAULT 'HELD',
    allocated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP NULL,
    active_seat_id BIGINT UNSIGNED GENERATED ALWAYS AS (
        CASE
            WHEN allocation_status IN ('HELD', 'CONFIRMED') THEN seat_id
            ELSE NULL
        END
    ) STORED,
    UNIQUE KEY uq_active_seat_allocation (active_seat_id),
    UNIQUE KEY uq_booking_seat (booking_id, seat_id),
    KEY idx_booking_seats_booking (booking_id, allocation_status),
    CONSTRAINT fk_booking_seat_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_seat_seat FOREIGN KEY (seat_id)
        REFERENCES seats(seat_id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_seat_passenger FOREIGN KEY (passenger_id)
        REFERENCES passengers(passenger_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
    payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    reference VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_payment_reference (reference),
    KEY idx_payment_booking_status (booking_id, status),
    CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT,
    CONSTRAINT chk_payment_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cancellations (
    cancellation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    cancelled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    refund_status ENUM('NOT_APPLICABLE', 'PENDING', 'PROCESSED', 'FAILED')
        NOT NULL DEFAULT 'PENDING',
    reason VARCHAR(500) NULL,
    UNIQUE KEY uq_cancellation_booking (booking_id),
    CONSTRAINT fk_cancellation_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT,
    CONSTRAINT chk_refund_amount CHECK (refund_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NULL,
    details JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_actor_created (actor_user_id, created_at),
    KEY idx_audit_entity (entity_type, entity_id),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
        REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
