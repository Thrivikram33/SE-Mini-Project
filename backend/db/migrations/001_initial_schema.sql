-- RRS schema aligned with SAD 3.7. Apply to a newly created local database.
-- This migration contains no DROP statements and does not reset existing data.
CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  mobile VARCHAR(24) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('PASSENGER', 'ADMIN') NOT NULL DEFAULT 'PASSENGER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_role_active (role, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS stations (
  station_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_stations_code (code),
  KEY ix_stations_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS trains (
  train_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  train_number VARCHAR(12) NOT NULL,
  train_name VARCHAR(160) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trains_number (train_number),
  KEY ix_trains_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS route_stops (
  route_stop_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  train_id BIGINT UNSIGNED NOT NULL,
  station_id BIGINT UNSIGNED NOT NULL,
  sequence_no SMALLINT UNSIGNED NOT NULL,
  arrival_time TIME NULL,
  departure_time TIME NULL,
  UNIQUE KEY uq_route_sequence (train_id, sequence_no),
  KEY ix_route_station (station_id, train_id),
  CONSTRAINT fk_route_train FOREIGN KEY (train_id) REFERENCES trains(train_id),
  CONSTRAINT fk_route_station FOREIGN KEY (station_id) REFERENCES stations(station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  train_id BIGINT UNSIGNED NOT NULL,
  journey_date DATE NOT NULL,
  status ENUM('SCHEDULED', 'CANCELLED', 'INACTIVE') NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule_train_date (train_id, journey_date),
  KEY ix_schedules_date_status (journey_date, status),
  CONSTRAINT fk_schedule_train FOREIGN KEY (train_id) REFERENCES trains(train_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS coaches (
  coach_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schedule_id BIGINT UNSIGNED NOT NULL,
  class_type VARCHAR(12) NOT NULL,
  coach_number VARCHAR(12) NOT NULL,
  UNIQUE KEY uq_coach_schedule_number (schedule_id, coach_number),
  KEY ix_coach_schedule_class (schedule_id, class_type),
  CONSTRAINT fk_coach_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS seats (
  seat_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  coach_id BIGINT UNSIGNED NOT NULL,
  seat_number VARCHAR(12) NOT NULL,
  berth_type VARCHAR(24) NULL,
  status ENUM('AVAILABLE', 'HELD', 'BOOKED', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
  UNIQUE KEY uq_seat_coach_number (coach_id, seat_number),
  KEY ix_seats_coach_status (coach_id, status),
  CONSTRAINT fk_seat_coach FOREIGN KEY (coach_id) REFERENCES coaches(coach_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fares (
  fare_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schedule_id BIGINT UNSIGNED NOT NULL,
  class_type VARCHAR(12) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fare_schedule_class (schedule_id, class_type),
  CONSTRAINT chk_fare_nonnegative CHECK (amount >= 0),
  CONSTRAINT fk_fare_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bookings (
  booking_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pnr CHAR(10) NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  schedule_id BIGINT UNSIGNED NOT NULL,
  origin_station_id BIGINT UNSIGNED NOT NULL,
  destination_station_id BIGINT UNSIGNED NOT NULL,
  class_type VARCHAR(12) NOT NULL,
  status ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED') NOT NULL,
  total_fare DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bookings_pnr (pnr),
  KEY ix_bookings_user_created (user_id, created_at),
  KEY ix_bookings_schedule_status (schedule_id, status),
  CONSTRAINT chk_booking_fare_nonnegative CHECK (total_fare >= 0),
  CONSTRAINT fk_booking_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_booking_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id),
  CONSTRAINT fk_booking_origin FOREIGN KEY (origin_station_id) REFERENCES stations(station_id),
  CONSTRAINT fk_booking_destination FOREIGN KEY (destination_station_id) REFERENCES stations(station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS passengers (
  passenger_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  age TINYINT UNSIGNED NOT NULL,
  gender ENUM('F', 'M', 'X', 'UNSPECIFIED') NOT NULL DEFAULT 'UNSPECIFIED',
  CONSTRAINT chk_passenger_age CHECK (age <= 120),
  KEY ix_passengers_booking (booking_id),
  CONSTRAINT fk_passenger_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS booking_seats (
  booking_seat_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  seat_id BIGINT UNSIGNED NOT NULL,
  passenger_id BIGINT UNSIGNED NOT NULL,
  allocation_status ENUM('CONFIRMED', 'RELEASED') NOT NULL DEFAULT 'CONFIRMED',
  active_seat_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(allocation_status = 'CONFIRMED', seat_id, NULL)) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_seat_active (active_seat_id),
  KEY ix_booking_seats_booking (booking_id),
  CONSTRAINT fk_booking_seat_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  CONSTRAINT fk_booking_seat_seat FOREIGN KEY (seat_id) REFERENCES seats(seat_id),
  CONSTRAINT fk_booking_seat_passenger FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payments (
  payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('SUCCESS', 'FAILED', 'REFUNDED', 'REFUND_FAILED') NOT NULL,
  reference VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_reference (reference),
  KEY ix_payments_booking (booking_id),
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cancellations (
  cancellation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  cancelled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refund_amount DECIMAL(10,2) NOT NULL,
  refund_status ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL,
  UNIQUE KEY uq_cancellation_booking (booking_id),
  CONSTRAINT chk_refund_nonnegative CHECK (refund_amount >= 0),
  CONSTRAINT fk_cancellation_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_audit_actor_created (actor_user_id, created_at),
  KEY ix_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
