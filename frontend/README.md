# Railway Reservation System frontend

React 19 and Vite 8 browser client for the Railway Reservation System. The home-page train cards are illustrative samples. Search and booking use the project API when it is available; this application is not connected to live railway inventory or real payment settlement.

## Prerequisites

- Node.js 22.12+ (or 20.19+) and npm, matching the Vite engine requirement.
- The backend API for database-backed search, accounts, booking, cancellation, and administration.

## Local development

From this directory in PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

`VITE_API_BASE_URL` is optional and defaults to `http://localhost:4000/api`. Only public client configuration belongs in frontend environment files. Never put database credentials, JWT signing secrets, or other private values in a `VITE_*` variable because Vite embeds those values in the browser bundle.

## Checks

```powershell
npm.cmd run lint
npm.cmd run build
```

The production build writes to ignored `dist/`. The hero train scene is lazy-loaded; unsupported WebGL, scene-load errors, and reduced-motion preference use the static illustration fallback.
