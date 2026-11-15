-- Migration 006: store the weekly operating days for imported trains.
CREATE TABLE train_running_days (
    train_id BIGINT UNSIGNED NOT NULL,
    weekday TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (train_id, weekday),
    CONSTRAINT chk_train_running_days_weekday CHECK (weekday BETWEEN 0 AND 6),
    CONSTRAINT fk_train_running_days_train
        FOREIGN KEY (train_id) REFERENCES trains(train_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;
