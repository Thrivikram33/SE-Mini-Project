# RailReserve — Railway Reservation System

A full-stack railway reservation system developed as a Software Engineering mini-project. RailReserve allows passengers to search train routes, check configured seat availability, make reservations through a simulated payment flow, and manage their tickets. Administrators can manage trains, routes, schedules, fares, coaches, and seat inventory.

> **Important:** This is an academic demonstration project. Train schedules, fares, seat availability, and payments are project data. The application is not connected to official Indian Railways systems or a real payment gateway.

---
## Project Team

| Name | SRN |
|---|---|
|B Thrivikram  | PES1UG24AM423 |
|Baby L N  | PES1UG24AM424 |
|Mutturaj Angadi  | PES1UG24AM439 |
|Haneesh E  | PES1UG24AM471 |

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Application Workflow](#application-workflow)
4. [Technology Stack](#technology-stack)
5. [System Architecture](#system-architecture)
6. [Database Design](#database-design)
7. [Project Structure](#project-structure)
8. [Prerequisites](#prerequisites)
9. [Installation and Setup](#installation-and-setup)
10. [Database Configuration](#database-configuration)
11. [Importing Train and Station Data](#importing-train-and-station-data)
12. [Preparing Demo Booking Inventory](#preparing-demo-booking-inventory)
13. [Running the Application](#running-the-application)
14. [API Overview](#api-overview)
15. [Testing](#testing)
16. [Security and Data Integrity](#security-and-data-integrity)
17. [Documentation](#documentation)
18. [Troubleshooting](#troubleshooting)
19. [Limitations](#limitations)
20. [Contributing](#contributing)

---

## Project Overview

RailReserve is a web-based Railway Reservation System built using React, Node.js, Express, and MySQL.

The system provides two main user roles:

- **Passenger:** Can register, log in, search for trains, select seats, book tickets, view booking history, retrieve tickets using a PNR, and cancel eligible bookings.
- **Administrator:** Can manage railway stations, trains, routes, schedules, fares, coaches, and seat inventory.

The application follows a client-server architecture. The React frontend communicates with a REST API developed using Express. The backend handles authentication, validation, business logic, booking operations, and database access.

MySQL is used to maintain relational data and enforce consistency across reservations, passengers, schedules, and seat allocations.

### Main Objectives

- Develop a complete railway reservation workflow.
- Implement passenger registration and authentication.
- Provide train and route search functionality.
- Manage schedules, fares, coaches, and seat inventory.
- Implement booking and cancellation operations.
- Maintain relational database integrity.
- Provide separate passenger and administrator functionality.
- Apply software engineering practices such as modular architecture, testing, validation, and version control.

---

## Features

### 1. Passenger Features

- Passenger registration using name, email, mobile number, and password.
- Secure password hashing.
- Login and logout functionality.
- Session-based authentication.
- Search trains using source station, destination station, and journey date.
- Search stations using station name, city, or station code.
- View train routes and journey timings.
- View configured travel classes and fares.
- Check available seats.
- Select seats for a journey.
- Enter passenger details.
- Complete bookings through a simulated payment process.
- Generate a unique PNR for confirmed bookings.
- View booking history.
- Retrieve ticket details using a PNR.
- Preview cancellation refunds.
- Cancel eligible bookings.
- Release allocated seats after cancellation.

### 2. Administrator Features

- Administrator authentication and role-based access.
- Administrator management dashboard.
- View and manage railway stations.
- Add and update train information.
- Manage train routes and route stops.
- Manage train schedules.
- Configure fares for different travel classes.
- Manage coaches and seat inventory.
- Update seat availability and blocked status.
- Maintain booking and inventory consistency.
- Record administrative actions through audit logs.

### 3. Train Search Features

- Search trains between two stations.
- Search using journey dates.
- Ordered route-stop matching.
- Display arrival and departure timings.
- Handle journeys that cross calendar days.
- Apply train operating-day information.
- Display route information even when booking inventory is not configured.
- Distinguish searchable routes from bookable schedules.

### 4. Booking Features

- Passenger and schedule validation.
- Class and fare selection.
- Seat availability validation.
- Passenger detail collection.
- Simulated payment processing.
- Booking confirmation.
- PNR generation.
- Booking history and ticket retrieval.
- Cancellation and refund calculation.
- Seat release after cancellation.
- Transaction-based database operations.

### 5. Engineering Features

- Modular backend architecture.
- REST API endpoints.
- MySQL relational database.
- Parameterized database queries.
- Session-based authentication.
- Role-based authorization.
- Request validation.
- Database transactions.
- Foreign key constraints.
- Unique constraints.
- Automated backend and frontend tests.
- MySQL inventory and concurrency integration tests.
- GitHub Actions continuous integration.

---

## Application Workflow

### Passenger Booking Workflow

```text
             Passenger
                 |
                 v
        Register / Login
                 |
                 v
           Search Trains
                 |
                 v
       Select Source, Destination
           and Journey Date
                 |
                 v
          View Train Results
                 |
                 v
       Select Bookable Schedule
                 |
                 v
         Select Travel Class
                 |
                 v
           Select Seats
                 |
                 v
        Enter Passenger Details
                 |
                 v
         Simulated Payment
                 |
          +------+------+
          |             |
          v             v
      Successful      Failed
       Payment        Payment
          |             |
          v             v
    Confirm Booking  Booking Failure
          |
          v
       Generate PNR
          |
          v
     Booking History
          |
          v
      View Ticket
          |
          v
    Cancellation Request
          |
          v
     Refund Calculation
          |
          v
      Release Seats
```

### Important: Route Data vs Bookable Inventory

Imported train data and booking inventory are separate parts of the application.

Imported data provides information such as:

- Stations
- Train details
- Ordered route stops
- Arrival and departure timings
- Train operating weekdays

However, this information alone does not make a train bookable.

A train requires an application schedule, configured fares, coaches, and seats before passengers can make reservations.

Therefore:

- A train route may appear in search results without being bookable.
- Route-only results do not have a valid application schedule or seat inventory.
- Booking is enabled only when the required schedule and inventory have been configured.
- Demonstration inventory and fares are simulated project values.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19 | User interface |
| Frontend tooling | Vite 8 | Development server and build tooling |
| Styling | Tailwind CSS 4 | Responsive UI styling |
| Routing | React Router 7 | Frontend navigation |
| Backend | Node.js 24 | JavaScript runtime |
| API framework | Express 5 | REST API development |
| Database | MySQL 8 | Relational database |
| Database driver | mysql2 | MySQL connectivity |
| Authentication | express-session | Session management |
| Password hashing | bcryptjs | Password security |
| Validation | express-validator and custom validators | Input validation |
| Security | Helmet | HTTP security headers |
| Backend testing | Node.js test runner and Supertest | Backend testing |
| Frontend testing | Node.js test runner | Frontend testing |
| CI/CD | GitHub Actions | Automated checks |

Dependency versions are maintained in the following files:

- `backend/package.json`
- `backend/package-lock.json`
- `frontend/package.json`
- `frontend/package-lock.json`

---

## System Architecture

RailReserve follows a layered client-server architecture.

### High-Level Architecture

```text
+------------------------------------------+
|               FRONTEND                   |
|                                          |
|              React                       |
|                                          |
|  Home Page                               |
|  Registration Page                       |
|  Login Page                              |
|  Train Search Page                       |
|  Seat Selection Page                     |
|  Booking History Page                    |
|  Ticket Page                             |
|  Admin Management Page                    |
+----------------------+-------------------+
                       |
                       | HTTP / JSON
                       | Session Cookies
                       |
                       v
+------------------------------------------+
|                BACKEND                   |
|                                          |
|              Node.js                     |
|              Express                     |
|                                          |
|  REST API Routes                         |
|                                          |
|  Authentication                          |
|  Registration                            |
|  Train Search                            |
|  Station Search                          |
|  Seat Management                         |
|  Fare Management                         |
|  Booking Management                      |
|  Cancellation                            |
|  Admin Management                        |
|                                          |
|  Middleware                              |
|  Validation                              |
|  Authorization                           |
|  Session Management                      |
|                                          |
|  Services and Repositories               |
+----------------------+-------------------+
                       |
                       | MySQL Queries
                       |
                       v
+------------------------------------------+
|                 DATABASE                 |
|                                          |
|                 MySQL                    |
|                                          |
|  Users                                   |
|  Stations                                |
|  Trains                                  |
|  Route Stops                             |
|  Running Days                            |
|  Schedules                               |
|  Coaches                                 |
|  Seats                                   |
|  Fares                                   |
|  Bookings                                |
|  Passengers                              |
|  Booking Seats                           |
|  Payments                                |
|  Cancellations                           |
|  Audit Logs                              |
+------------------------------------------+
```

### Frontend Architecture

The frontend is developed using React and follows a component-based structure.

React Router is used to navigate between application pages.

The frontend is responsible for:

- Displaying application pages.
- Collecting user input.
- Validating user interactions.
- Communicating with backend APIs.
- Displaying train search results.
- Handling seat selection.
- Displaying booking and ticket information.
- Providing passenger and administrator interfaces.

Vite is used as the development server and production build tool.

### Backend Architecture

The backend is developed using Node.js and Express.

It is responsible for:

- Handling HTTP requests.
- Managing user authentication.
- Maintaining user sessions.
- Enforcing role-based access.
- Validating incoming requests.
- Executing business logic.
- Managing train and schedule information.
- Processing bookings and cancellations.
- Interacting with the MySQL database.
- Returning API responses.

The backend separates routes, middleware, services, repositories, configuration, and validation logic to keep the application modular.

### Database Architecture

MySQL is used as the primary relational database.

The database maintains relationships between users, trains, stations, schedules, coaches, seats, bookings, passengers, and payments.

Foreign keys and database constraints help preserve data integrity. Transactions are used for critical booking and inventory operations.

---

## Database Design

The database schema is maintained in the `database/migrations/` directory.

### Main Database Tables

| Table | Description |
|---|---|
| `users` | Stores passenger and administrator account information |
| `stations` | Stores station codes, names, and cities |
| `trains` | Stores train numbers, names, and active status |
| `route_stops` | Stores the ordered stops and timings of trains |
| `train_running_days` | Stores the weekdays on which trains operate |
| `schedules` | Stores dated train schedules |
| `coaches` | Stores coaches associated with schedules and classes |
| `seats` | Stores seat numbers, berth types, and seat status |
| `fares` | Stores fares for schedules and travel classes |
| `bookings` | Stores booking information and PNRs |
| `passengers` | Stores passenger details for each booking |
| `booking_seats` | Stores seat allocation information |
| `payments` | Stores payment records and statuses |
| `cancellations` | Stores cancellation and refund information |
| `audit_logs` | Stores administrative and important application activity |

### Main Database Relationships

- One train can have multiple route stops.
- Each route stop belongs to one train and one station.
- One train can have multiple schedules.
- One schedule can have multiple coaches.
- One schedule can have multiple fare records.
- One coach can contain multiple seats.
- One user can create multiple bookings.
- Each booking belongs to one user and one schedule.
- One booking can contain multiple passengers.
- Booking-seat records connect passengers and seats to a booking.
- A booking can have associated payment and cancellation records.
- Audit logs can reference the user responsible for an action.

### Database Migrations

The database migrations are organized as follows:

| Migration | Purpose |
|---|---|
| `001_initial_schema.sql` | Creates the initial relational database schema |
| `002_allow_pnr_for_failed_bookings.sql` | Updates PNR handling for failed-payment bookings |
| `003_enforce_booking_passenger_pair.sql` | Enforces booking and passenger allocation consistency |
| `004_booking_journey_details.sql` | Adds booking journey and class details |
| `005_train_search_performance_indexes.sql` | Adds indexes for train search performance |
| `006_train_running_days.sql` | Adds train operating-day information |

Use the migration scripts described in the setup instructions rather than manually executing migrations against an arbitrary database.

---

## Project Structure

```text
SE-Mini-Project/
|
|-- backend/
|   |
|   |-- integration/
|   |   |-- mysql-inventory.integration.js
|   |
|   |-- scripts/
|   |   |-- import-stations.js
|   |   |-- import-trains.js
|   |   |-- verify-train-dataset.js
|   |   |-- migrate-initial-schema.js
|   |   |-- migrate-booking-schema.js
|   |   |-- migrate-train-search-indexes.js
|   |   |-- migrate-train-days.js
|   |   |-- generate-imported-schedules.js
|   |   |-- bookingInventorySeed.js
|   |   |-- monitor-availability.js
|   |
|   |-- src/
|   |   |-- config/
|   |   |-- middleware/
|   |   |-- repositories/
|   |   |-- routes/
|   |   |-- services/
|   |   |-- utils/
|   |   |-- validators/
|   |   |-- server.js
|   |
|   |-- test/
|   |-- .env.example
|   |-- package.json
|   |-- package-lock.json
|
|-- database/
|   |-- migrations/
|
|-- docs/
|   |-- PROJECT_HANDOFF.md
|   |-- PROGRESS_TRACKER.md
|   |-- TEST_EVIDENCE.md
|   |-- booking-inventory-demo.md
|   |-- train-search-api.md
|   |-- booking-api.md
|   |-- admin-management-api.md
|   |-- ...
|
|-- frontend/
|   |-- public/
|   |-- src/
|   |-- test/
|   |-- package.json
|   |-- package-lock.json
|   |-- vite.config.js
|
|-- stations.json
|-- trains.txt
|-- Admin Video.mp4
|-- Passenger Video.mp4
|
|-- .github/
|   |-- workflows/
|       |-- main.yml
|
|-- README.md
```

---

## Prerequisites

Before running the application, install the following:

- Git
- Node.js 24.x
- npm
- MySQL 8.x
- Visual Studio Code or another code editor

Verify the installations:

```powershell
node --version
npm --version
git --version
mysql --version
```

**Windows users:** The commands below use `npm.cmd` to avoid PowerShell execution-policy errors that can occur when running `npm.ps1`.

---

## Installation and Setup

### Step 1: Clone the Repository

```powershell
git clone https://github.com/Thrivikram33/SE-Mini-Project.git
cd SE-Mini-Project
```

### Step 2: Install Backend Dependencies

```powershell
npm.cmd --prefix backend ci
```

### Step 3: Install Frontend Dependencies

```powershell
npm.cmd --prefix frontend ci
```

### Step 4: Configure Environment Variables

Create a local backend environment file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Open `backend/.env` and configure your local MySQL credentials and session secret.

Example configuration:

```dotenv
NODE_ENV=development
PORT=5000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=rrs_local_app
DB_PASSWORD=your_local_mysql_password
DB_NAME=railway_reservation_dev

SESSION_SECRET=replace_with_a_long_random_secret
```

Use your own local database credentials and a strong random session secret.

**Never commit your `.env` file or expose database passwords and session secrets.**

### Step 5: Create the Development Database

Open MySQL and create the local development database:

```sql
CREATE DATABASE railway_reservation_dev;
```

The project's database migration and demo-data utilities are guarded. They expect:

- `NODE_ENV=development`
- A loopback database host such as `localhost` or `127.0.0.1`
- Database name `railway_reservation_dev`

Do not bypass these checks or point development scripts at a production database.

---

## Database Configuration

After creating the database and configuring `backend/.env`, run the migrations.

Open a terminal in the backend directory:

```powershell
cd backend
```

Apply the migrations:

```powershell
npm.cmd run migrate:initial
npm.cmd run migrate:booking
npm.cmd run migrate:train-search-indexes
npm.cmd run migrate:train-days
```

These scripts create or update the required application schema.

The initial migration is intended for an empty development database. If a migration refuses to run, inspect the database and migration state rather than dropping tables or forcing it to continue.

---

## Importing Train and Station Data

The repository includes the following datasets:

- `stations.json`
- `trains.txt`

The backend provides scripts to import and verify these datasets.

### Step 1: Run a Dry Run

From the `backend/` directory:

```powershell
npm.cmd run import:stations
npm.cmd run import:trains
```

The commands perform a dry run by default. Review the validation output before applying the imports.

### Step 2: Apply the Imports

Once the dry-run results are acceptable:

```powershell
npm.cmd run import:stations -- --apply
npm.cmd run import:trains -- --apply
```

### Step 3: Verify Imported Data

```powershell
npm.cmd run verify:train-data
```

The verification process checks the imported station, train, route-stop, and operating-day information.

It is recommended to verify the imported dataset before testing train search.

---

## Preparing Demo Booking Inventory

Imported train routes do not automatically contain application schedules, fares, coaches, or seats.

For demonstration purposes, the project provides a route-scoped simulated inventory seed.

### Step 1: Run a Dry Run

From the `backend/` directory:

```powershell
npm.cmd run seed:booking-demo -- --source SBC --destination MYS --days 30
```

Replace `SBC` and `MYS` with valid station codes for an imported route.

This command only displays the schedules and inventory that would be created. It does not apply changes.

### Step 2: Apply Simulated Inventory

After reviewing the dry-run output:

```powershell
npm.cmd run seed:booking-demo -- --source SBC --destination MYS --days 30 --apply --confirm-simulated
```

Both `--apply` and `--confirm-simulated` are required to write demo inventory.

### Available Options

| Option | Description |
|---|---|
| `--source` | Source station code |
| `--destination` | Destination station code |
| `--days` | Number of journey dates, from 1 to 90 |
| `--start-date` | Optional start date in `YYYY-MM-DD` format |
| `--apply` | Enables database writes |
| `--confirm-simulated` | Confirms that the inserted inventory is simulated |

The demo seed configures six travel classes:

- 1A
- 2A
- 3A
- SL
- CC
- 2S

It creates one coach per class and ten seats per coach, with illustrative INR fares.

The script uses a database transaction and skips schedules that already contain bookings or existing inventory. It does not claim to provide official railway availability or fares.

Refer to `docs/booking-inventory-demo.md` for further details.

---

## Running the Application

The backend and frontend must run in separate terminals.

### Terminal 1: Start the Backend

From the repository root:

```powershell
npm.cmd --prefix backend run dev
```

The backend runs on port `5000` by default.

### Terminal 2: Start the Frontend

From the repository root:

```powershell
npm.cmd --prefix frontend run dev
```

Vite displays the frontend URL in the terminal. The default development URL is normally:

```text
http://localhost:5173
```

Open the URL in your browser to access RailReserve.

### Backend Health Check

With the backend and database running, open:

```text
http://localhost:5000/api/health
```

A successful response indicates that the API can communicate with its configured database.

---

## API Overview

The backend exposes REST API endpoints under `/api`.

### Authentication and Registration

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a passenger |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/auth/me` | Retrieve the current session user |
| POST | `/api/auth/logout` | End the current session |

### Train and Station Search

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trains/stations/search?q=` | Search station suggestions |
| GET | `/api/trains/search?source=&destination=&date=` | Search trains between stations |

### Schedule, Fare, and Seat Operations

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/schedules/:scheduleId/classes` | Retrieve configured travel classes |
| GET | `/api/schedules/:scheduleId/fares` | Retrieve schedule fares |
| GET | `/api/schedules/:scheduleId/seats` | Retrieve seat inventory |
| POST | `/api/fares/calculate` | Calculate booking fare |

### Booking Operations

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/bookings` | Create a booking |
| GET | `/api/bookings` | Retrieve passenger booking history |
| GET | `/api/bookings/:pnr` | Retrieve a ticket using its PNR |
| GET | `/api/bookings/:bookingId/refund-preview` | Preview cancellation refund |
| POST | `/api/bookings/:bookingId/cancel` | Cancel an eligible booking |

### Administrator Operations

Administrator endpoints are available under:

```text
/api/admin
```

These endpoints require an authenticated user with the `ADMIN` role.

They cover management of:

- Stations
- Trains
- Routes
- Schedules
- Fares
- Coaches
- Seats

For detailed request and response formats, refer to the API documentation in the `docs/` directory.

---

## Testing

The project includes automated backend tests, frontend tests, and isolated MySQL integration tests.

### Backend Tests

From the repository root:

```powershell
npm.cmd --prefix backend test
```

Or from the backend directory:

```powershell
npm.cmd test
```

### MySQL Integration Tests

The database-backed integration suite tests inventory and concurrency behavior.

It requires dedicated test-only environment variables:

- `RRS_MYSQL_TEST_HOST`
- `RRS_MYSQL_TEST_PORT`
- `RRS_MYSQL_TEST_USER`
- `RRS_MYSQL_TEST_PASSWORD`
- `RRS_MYSQL_TEST_DATABASE`

The integration suite expects an isolated test database named:

```text
railway_reservation_issue10_test
```

Run it only after configuring the dedicated test database:

```powershell
npm.cmd --prefix backend run test:mysql
```

Do not point the integration suite at a personal, shared, staging, or production database.

### Frontend Tests

```powershell
npm.cmd --prefix frontend test
```

### Frontend Lint

```powershell
npm.cmd --prefix frontend run lint
```

### Frontend Production Build

```powershell
npm.cmd --prefix frontend run build
```

### Continuous Integration

GitHub Actions is configured in:

```text
.github/workflows/main.yml
```

The workflow runs on pushes to `main` and pull requests targeting `main`.

It checks:

- Repository structure.
- Backend tests.
- Isolated MySQL inventory and concurrency tests.
- Frontend production build.

The GitHub Actions tab displays the result for each commit and pull request.

---

## Security and Data Integrity

The project incorporates several security and database integrity measures.

### Authentication

- Passwords are hashed using bcryptjs.
- Password hashes are stored instead of plain-text passwords.
- User sessions are managed on the server.
- Session cookies use security-related settings.
- Sessions are regenerated during login.

### Authorization

- Passenger and administrator roles are supported.
- Administrator APIs require appropriate authorization.
- Users cannot grant themselves administrator privileges through passenger registration.

### Database Security

- Parameterized queries are used to reduce SQL injection risk.
- Foreign keys maintain relationships between records.
- Unique constraints prevent duplicate values where required.
- Database transactions protect critical booking operations.
- Unique active-seat allocation constraints prevent the same seat from being actively allocated to multiple bookings.

### Application Security

- Input validation is applied to incoming requests.
- Safe error responses are returned to clients.
- Helmet is used for HTTP security headers.
- Production configuration supports HTTPS and secure-cookie settings.
- Administrative actions are recorded through audit logs.

---

## Documentation

Additional project documentation is available in the `docs/` directory.

| Document | Description |
|---|---|
| `PROJECT_HANDOFF.md` | Project implementation handoff and architecture context |
| `PROGRESS_TRACKER.md` | Project progress and feature tracking |
| `TEST_EVIDENCE.md` | Testing commands and verification evidence |
| `train-search-api.md` | Train search behavior and API details |
| `booking-api.md` | Booking, ticket, and cancellation API |
| `booking-inventory-demo.md` | Simulated booking inventory setup |
| `admin-management-api.md` | Administrator management endpoints |
| `mysql-inventory-testing.md` | MySQL integration testing |
| `input-validation-security.md` | Input validation and security |
| `password-storage.md` | Password hashing and verification |
| `secure-network-communication.md` | Secure network communication |
| `availability-monitoring.md` | Availability monitoring tools |

The `docs/` directory also contains the Software Architecture Description, Software Requirements Specification, and Test Plan documents.

---

## Troubleshooting

### 1. PowerShell Does Not Allow npm Commands

If PowerShell reports that script execution is disabled, use:

```powershell
npm.cmd --version
npm.cmd --prefix backend install
npm.cmd --prefix frontend install
```

### 2. Backend Does Not Start

Check the following:

- MySQL is running.
- `backend/.env` exists.
- Database credentials are correct.
- The database `railway_reservation_dev` exists.
- All required migrations have been applied.
- The session secret is configured.

### 3. Database Connection Errors

Verify:

- MySQL host and port.
- Database username and password.
- Database name.
- User privileges.
- MySQL service status.

Do not bypass the development database safety checks.

### 4. Train Search Returns No Results

Check that:

- Station data has been imported.
- Train data has been imported.
- Dataset verification has completed.
- The requested source and destination exist.
- The route exists in the imported ordered route stops.
- The selected date matches the train's operating days.

### 5. Train Appears but Cannot Be Booked

A train may have imported route data without application booking inventory.

Configure the required schedule, fares, coaches, and seats through the administrator functionality or use the documented local demo inventory seed.

### 6. Seat Selection Shows No Available Seats

Verify that:

- The selected result has a valid schedule ID.
- The schedule is scheduled for the selected journey date.
- The required class and fare are configured.
- Coaches and seats have been created.
- Seats are not blocked or already allocated.

### 7. MySQL Integration Tests Fail

Check that the dedicated `RRS_MYSQL_TEST_*` environment variables are configured and that the isolated test database is available.

The integration tests intentionally reject unsafe database targets. Do not substitute your development or production database.

---

## Limitations

- The project is developed for academic and demonstration purposes.
- It is not connected to official Indian Railways services.
- Train routes and operating days are based on the supplied datasets.
- Application schedules and booking inventory must be configured separately.
- Demo fares and seat availability are illustrative project values.
- Payment processing is simulated.
- No real payment gateway is integrated.
- The application does not issue official railway tickets.
- Live railway inventory synchronization and production railway integrations are outside the current project scope.

---

## Contributing

Contributions and improvements are welcome.

1. Fork the repository or create a separate feature branch.
2. Keep changes focused and avoid unnecessary modifications.
3. Add or update tests when changing application behavior.
4. Run backend tests and frontend tests.
5. Run frontend lint and the production build.
6. Run isolated MySQL integration tests when changing database-backed behavior.
7. Submit a pull request with a clear description of the changes and test results.

Do not commit:

- `.env` files
- Database passwords
- Session secrets
- Private keys
- Real user data
- Unnecessary generated files

---

## Disclaimer

RailReserve is an educational software engineering project. It is not affiliated with, endorsed by, or connected to Indian Railways or any railway operator.

All demonstration schedules, fares, seat availability, payments, and refunds are illustrative project data. The application does not perform real railway reservations, issue official tickets, process real payments, or initiate actual refunds.
