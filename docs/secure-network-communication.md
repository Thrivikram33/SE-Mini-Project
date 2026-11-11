# Secure network communication (RRS-SR-003)

The production API requires HTTPS at its public edge. The Express process is intended to run behind a TLS-terminating reverse proxy or load balancer; it does not issue certificates or terminate TLS itself. Keep the API listener on a private network so clients cannot bypass the trusted edge.

## Production API configuration

Set these values in the backend runtime environment:

- `NODE_ENV=production`
- `PUBLIC_API_URL=https://<public-api-host>` (the externally reachable API URL)
- `CLIENT_ORIGIN=https://<frontend-host>` (one HTTPS origin, without a path)
- `TRUST_PROXY=<1-to-10-hop-count>` (the exact number of trusted proxy hops between the client and Express)
- `SESSION_SECRET=<strong-secret>`

Production startup fails when either public URL is missing, malformed, or uses HTTP, or when `TRUST_PROXY` is missing or is not an integer from 1 through 10. The application trusts only the configured number of proxy hops; it must be paired with an edge proxy that removes client-supplied forwarding headers and sets `X-Forwarded-Proto` itself. Do not expose the Express listener directly to the public internet.

Production API requests that Express does not identify as secure receive HTTP `426 HTTPS_REQUIRED`. HTTPS requests use secure, HTTP-only session cookies, exact-origin credentialed CORS, Helmet's HSTS header, and the existing `SameSite=Lax` session policy. Configure the frontend and API on the same site so browser session cookies remain available; cross-site cookie support would need an explicit CSRF design. Local development remains usable over HTTP and does not trust forwarded headers by default; HSTS is disabled in development.

## Frontend deployment

Serve the production frontend over HTTPS. A production frontend opened over HTTP refuses to render the application. `VITE_API_BASE_URL` may be empty or a same-origin path when the frontend and API share an HTTPS origin, or it may be an HTTPS origin for a separately hosted API. Production builds reject absolute HTTP URLs, protocol-relative URLs, credentials, and malformed API base values. Vite's development proxy continues to use local HTTP.

These settings define and enforce the application-side deployment contract. Verify the actual TLS certificate, edge redirect/policy, forwarded-header handling, and public reachability in the chosen hosting environment before describing a deployment as HTTPS-enabled.
