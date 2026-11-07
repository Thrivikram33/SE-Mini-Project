# Secure password storage

This implementation addresses RRS-NFR-005 (GitHub Issue #12) and the
password-storage check in the Software Test Plan (TC-SEC-01).

## Storage and verification

Passenger registration hashes passwords in the backend with `bcryptjs` before
the parameterized `INSERT` into `users.password_hash`. The bcrypt encoded value
contains both its work factor and a randomly generated per-password salt. The
plain password is not included in the insert or registration response.

Login reads the stored hash and uses bcrypt verification. Invalid credentials,
including missing accounts and malformed stored hashes, receive the same
authentication response. Login responses contain the session user fields and
do not include the stored hash.

The bcrypt work factor defaults to 12. An unset or empty setting uses that
default. Operators may set
`PASSWORD_BCRYPT_ROUNDS` to an integer from 12 through 15 to increase the work
factor for their deployment. Values below 12, above 15, or not expressed as an
integer are rejected; configuration cannot silently weaken hashing.

## Database compatibility

The existing `users.password_hash VARCHAR(255) NOT NULL` column accommodates
the bcrypt encoded value. No schema migration is required, and the initial
historical migration remains unchanged. The application does not store the salt
separately because bcrypt embeds it in the encoded hash.

This change guarantees hashes for passwords submitted through the current
registration service. Existing database rows are not rewritten or inspected by
the application. Before using a pre-existing database, verify its account data
through an authorized operational process; if plaintext passwords are found,
replace them through a controlled password-reset process rather than attempting
to reverse them or logging their values.

## Verification

Run the backend suite from `backend/` with `npm test`. Password-specific tests
cover salted hash generation, verification, invalid hash handling, registration
database parameters, response redaction, and the registration-to-login flow.
They use a mocked database and do not require or modify a live MySQL database.
