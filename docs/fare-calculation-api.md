# Fare Calculation API

Implements GitHub Issue [#7](https://github.com/Thrivikram33/SE-Mini-Project/issues/7), RRS-F-007.

## Calculate a configured journey fare

`POST /api/fare/calculate`

The service reads the configured fare for a scheduled journey and travel class from `fares`, then multiplies that per-passenger amount by the requested passenger count. This follows Issue #7 (selected train, class, passenger count and configured fare rules), the existing `fares` schema, and the SRS test plan's TC-FARE-01 (“Calculate configured fare”; expected total displayed). No distance charge, surcharge, discount or other pricing rule is specified in the approved requirements.

### Request

```json
{
  "scheduleId": 17,
  "classType": "SL",
  "passengerCount": 2
}
```

`scheduleId` may be a positive integer or its decimal string representation. `classType` must be one of `1A`, `2A`, `3A`, `SL`, `CC`, or `2S`. `passengerCount` must be a positive integer. The fare is always loaded from MySQL; a fare supplied by the caller is not used.

### Success response

```json
{
  "fare": {
    "scheduleId": 17,
    "classType": "SL",
    "passengerCount": 2,
    "unitFare": "125.50",
    "totalFare": "251.00",
    "currency": "INR"
  }
}
```

Amounts are returned as two-decimal strings to avoid floating-point currency rounding. The calculation uses integer paise: configured fare × passenger count.

### Errors

- `400 INVALID_REQUEST`: malformed/missing ID, unsupported class, or non-positive/non-integer passenger count.
- `404 NOT_FOUND`: schedule is not scheduled, or no fare is configured for the schedule and class.
- `500 INTERNAL_SERVER_ERROR`: database failure or invalid persisted fare configuration. Internal database details are not returned.

The fare summary is available on the class and seat selection screen. Changing the selected schedule, class, or passenger count clears the previous result; calculate again to fetch the new server result.

## Verification

- Backend unit/API tests cover TC-FARE-01, configured fare variations, zero fare, missing schedule/configuration, malformed input, SQL-injection-like IDs, corrupt persisted values, amount limits, and safe database-failure responses.
- Backend suite: 61 tests passed at the time of implementation.
- Frontend production build: passed.
- The frontend package currently defines no automated test script.
- A MySQL server is not configured in this local environment, so live-database integration was not executed.
