-- Fictional, local-only demonstration data. Never use as production schedule data.
INSERT INTO stations (code, name, city) VALUES
  ('DMB', 'Demo Station Bengaluru', 'Demo City A'),
  ('DMC', 'Demo Station Chennai', 'Demo City B')
ON DUPLICATE KEY UPDATE name = VALUES(name), city = VALUES(city), active = TRUE;

INSERT INTO trains (train_number, train_name) VALUES ('D-100', 'Demo Coastal Express')
ON DUPLICATE KEY UPDATE train_name = VALUES(train_name), active = TRUE;

INSERT INTO route_stops (train_id, station_id, sequence_no, arrival_time, departure_time)
SELECT t.train_id, s.station_id, 1, NULL, '08:00:00'
FROM trains t JOIN stations s ON s.code = 'DMB'
WHERE t.train_number = 'D-100'
ON DUPLICATE KEY UPDATE station_id = VALUES(station_id), departure_time = VALUES(departure_time);

INSERT INTO route_stops (train_id, station_id, sequence_no, arrival_time, departure_time)
SELECT t.train_id, s.station_id, 2, '13:30:00', NULL
FROM trains t JOIN stations s ON s.code = 'DMC'
WHERE t.train_number = 'D-100'
ON DUPLICATE KEY UPDATE station_id = VALUES(station_id), arrival_time = VALUES(arrival_time);

INSERT INTO schedules (train_id, journey_date, status)
SELECT train_id, '2030-05-12', 'SCHEDULED' FROM trains WHERE train_number = 'D-100'
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO coaches (schedule_id, class_type, coach_number)
SELECT schedule_id, 'CC', 'D1' FROM schedules
WHERE train_id = (SELECT train_id FROM trains WHERE train_number = 'D-100')
  AND journey_date = '2030-05-12'
ON DUPLICATE KEY UPDATE class_type = VALUES(class_type);

INSERT INTO seats (coach_id, seat_number, berth_type)
SELECT coach_id, seat_number, 'WINDOW'
FROM coaches
JOIN (
  SELECT '1A' AS seat_number UNION ALL SELECT '1B' UNION ALL SELECT '2A' UNION ALL
  SELECT '2B' UNION ALL SELECT '3A' UNION ALL SELECT '3B'
) demo_seats
WHERE coach_number = 'D1'
  AND schedule_id = (SELECT schedule_id FROM schedules WHERE journey_date = '2030-05-12'
    AND train_id = (SELECT train_id FROM trains WHERE train_number = 'D-100'))
ON DUPLICATE KEY UPDATE berth_type = VALUES(berth_type);

INSERT INTO fares (schedule_id, class_type, amount, currency)
SELECT schedule_id, 'CC', 450.00, 'INR' FROM schedules
WHERE train_id = (SELECT train_id FROM trains WHERE train_number = 'D-100')
  AND journey_date = '2030-05-12'
ON DUPLICATE KEY UPDATE amount = VALUES(amount), currency = VALUES(currency);
