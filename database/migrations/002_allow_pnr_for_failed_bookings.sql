-- A failed simulated payment is retained as PAYMENT_FAILED for auditability,
-- but it must not have a PNR. MySQL permits multiple NULLs in the existing
-- unique PNR index, so successful booking uniqueness remains enforced.
ALTER TABLE bookings
    MODIFY COLUMN pnr CHAR(12) NULL;
