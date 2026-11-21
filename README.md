# 🚚 Trip Management API

A backend service for managing **trips**: create them, list them (with pagination and filtering), move them through their lifecycle (`CREATED → ASSIGNED → IN_TRANSIT → COMPLETED`), and delete them.

**Stack:** Node.js · Express 5 · PostgreSQL 16 · Prisma ORM · zod · node:test. A small React page is included to try the API in the browser.

> **Status: all 11 requirements from the assignment are implemented and covered by automated tests (19 tests, all passing).** No core requirement is left as a TODO. The [Requirements Checklist](#-requirements-checklist) below links every requirement to its code and its test.

---

## 📑 Table of Contents

1. [Requirements Checklist](#-requirements-checklist)
2. [Submission Checklist](#-submission-checklist)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Quick Start (Setup)](#-quick-start-setup)
6. [How a Request Flows Through the Code](#-how-a-request-flows-through-the-code)
7. [Database Schema & Migrations](#-database-schema--migrations)
8. [Trip Status Rules](#-trip-status-rules)
9. [API Documentation](#-api-documentation)
10. [Error Format & Status Codes](#-error-format--status-codes)
11. [Design Decisions (One Section per Requirement)](#-design-decisions-one-section-per-requirement)
12. [Running the Tests](#-running-the-tests)
13. [Assumptions](#-assumptions)
14. [Incomplete Items & Improvements With More Time](#-incomplete-items--improvements-with-more-time)

---

## ✅ Requirements Checklist

Each row quotes the assignment, says how it is met, where the code is, and which test proves it. All paths are relative to `backend/`.

| # | Requirement (from the assignment) | Status | How it is met | Code | Proven by test |
|:-:|---|:-:|---|---|---|
| 1 | *Validate all incoming request data appropriately.* | ✅ | zod schemas check body, query and URL params **before** any logic runs. Strings trimmed, lengths limited, unknown fields rejected, numbers range-checked, IDs must be UUIDs, bad JSON → 400. All problems are reported in one response. | `src/modules/trips/trip.validation.js`, `src/middleware/validate.js`, `src/modules/trips/trip.routes.js` | `POST /trips validates input`, `POST /trips rejects same source and destination on an otherwise valid body`, `POST /trips rejects invalid JSON`, `GET /trips/:id returns the trip, 404 if missing, 400 if bad id` |
| 2 | *Trip Number must be unique.* | ✅ | `UNIQUE` constraint `trips_trip_number_unique` in the database (race-safe, no check-then-insert). Violation → `409 DUPLICATE_TRIP_NUMBER`. | `prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql`, `src/middleware/errorHandler.js` | `duplicate tripNumber returns 409` |
| 3 | *Implement pagination for GET /trips.* | ✅ | `page` (≥1, default 1) and `limit` (1–100, default 20). Response includes `total` and `totalPages`. Stable order: `created_at DESC, id DESC`. | `trip.service.js` → `listTrips`, `trip.repository.js` → `list` | `GET /trips paginates and filters by status` |
| 4 | *Support filtering by status.* | ✅ | `GET /trips?status=CREATED` (validated against the 5 statuses), backed by index `idx_trips_status_created_at`. | `trip.validation.js` → `listTripsQuerySchema`, `trip.repository.js` → `list` | `GET /trips paginates and filters by status` |
| 5 | *Implement appropriate HTTP status codes and consistent error responses.* | ✅ | 200/201/204 for success; 400/404/409/422/500 for errors. **Every** error has the shape `{ "error": { code, message, details? } }`, produced by one central error handler. Internal errors are logged, never leaked. | `src/middleware/errorHandler.js`, `src/utils/AppError.js` | `unknown route returns 404 in the standard error format` and the status assertions in every API test |
| 6 | *Store the data in PostgreSQL/MySQL or another relational database.* | ✅ | PostgreSQL 16 (via Docker Compose), accessed through the Prisma ORM. | `docker-compose.yml`, `prisma/schema.prisma`, `src/db/prisma.js` | All API tests run against a real PostgreSQL |
| 7 | *Implement and enforce valid trip status transitions … not allowed to move backwards or transition from COMPLETED to another state.* | ✅ | One transition table: `CREATED → ASSIGNED → IN_TRANSIT → COMPLETED`, plus `CANCELLED` from `CREATED`/`ASSIGNED`. Backwards, skipping, and leaving `COMPLETED`/`CANCELLED` → `409 INVALID_STATUS_TRANSITION` (with the allowed next statuses in `details`). | `src/modules/trips/trip.status.js`, `trip.service.js` → `updateTripStatus` | `trip.status.test.js` (6 tests: happy path, cancel, no backwards, no skipping, final states, same status), `status moves forward and cannot go backwards or leave COMPLETED` |
| 8 | *Handle concurrent status update requests safely. The final state should remain consistent …* | ✅ | Pessimistic row lock: a transaction reads the trip with `SELECT … FOR UPDATE`, checks the rule against the **current** status, then updates. A competing request waits, then sees the new status and gets `409`. | `trip.service.js` → `updateTripStatus`, `trip.repository.js` → `findById({ forUpdate: true })` | `concurrent status updates: exactly one wins, final state is consistent` (10 parallel requests) |
| 9 | *Consider how duplicate POST /trips requests should be handled so that the same trip is not accidentally created twice.* | ✅ | Two layers: (a) unique `tripNumber` → a repeat gets `409`; (b) optional `Idempotency-Key` header → a retry returns the **original** trip with `200` and `Idempotent-Replayed: true`; same key with a different body → `422`. Race-safe through a `UNIQUE` index on `idempotency_key`. | `trip.service.js` → `createTrip`, `trip.repository.js` → `insert`, `trip.controller.js` → `create` | `same Idempotency-Key replays the original trip instead of creating a new one`, `concurrent POSTs with the same Idempotency-Key create exactly one trip` (5 parallel requests → 1 trip), `duplicate tripNumber returns 409` |
| 10 | *Add appropriate database constraints and indexes.* | ✅ | Constraints: primary key, 2 `UNIQUE`, `NOT NULL`s, a Postgres `ENUM` for status, 5 `CHECK`s (non-blank text, source ≠ destination, driver required once assigned). Indexes: `(status, created_at DESC)` and `(created_at DESC)` for listing. | `prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql` | Constraint errors are mapped to `422 CONSTRAINT_VIOLATION` in `errorHandler.js` |
| 11 | *Keep the code modular, maintainable, and production-oriented.* | ✅ | Layers: routes → controller → service → repository, one folder per module. Config from env vars, versioned migrations, parameterised queries, central error handling, body size limit, CORS allow-list, `/health`, graceful shutdown. | `src/` (see [Project Structure](#-project-structure)) | 19 automated tests (`npm test`) |

### Trip fields (from the assignment)

| Assignment field | API field (JSON) | Database column | Type |
|---|---|---|---|
| Trip ID | `id` | `id` | `UUID`, primary key, generated by the DB |
| Trip Number | `tripNumber` | `trip_number` | `VARCHAR(50)`, unique |
| Source | `source` | `source` | `VARCHAR(255)` |
| Destination | `destination` | `destination` | `VARCHAR(255)` |
| Driver Name | `driverName` | `driver_name` | `VARCHAR(100)`, nullable until assigned |
| Status | `status` | `status` | `ENUM trip_status` (5 values) |
| Created At | `createdAt` | `created_at` | `TIMESTAMPTZ`, set by the DB |
| Updated At | `updatedAt` | `updated_at` | `TIMESTAMPTZ`, updated on every change |

Supported statuses: `CREATED`, `ASSIGNED`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`, all enforced by a Postgres `ENUM`.

### APIs (from the assignment)

| Endpoint | Status | Docs |
|---|:-:|---|
| `POST /trips` (create a trip) | ✅ | [Create a trip](#1-create-a-trip-post-trips) |
| `GET /trips` (pagination and filtering) | ✅ | [List trips](#2-list-trips-get-trips) |
| `GET /trips/{id}` (get a trip by ID) | ✅ | [Get one trip](#3-get-one-trip-get-tripsid) |
| `PATCH /trips/{id}/status` (update trip status) | ✅ | [Update status](#4-update-status-patch-tripsidstatus) |
| `DELETE /trips/{id}` (delete a trip) | ✅ | [Delete a trip](#5-delete-a-trip-delete-tripsid) |

---

## 📦 Submission Checklist

| Asked for in the assignment | Where |
|---|---|
| Source code | `backend/` (API), `frontend/` (optional React UI) |
| Database schema / migrations | [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma), [`backend/prisma/migrations/0001_init/migration.sql`](backend/prisma/migrations/0001_init/migration.sql), explained in [Database Schema & Migrations](#-database-schema--migrations) |
| README with setup instructions | [Quick Start (Setup)](#-quick-start-setup) |
| API documentation / examples | [API Documentation](#-api-documentation) (every endpoint has a `curl` example and all response codes) |
| Assumptions and design decisions | [Assumptions](#-assumptions), [Design Decisions](#-design-decisions-one-section-per-requirement) |
| Incomplete items / improvements with more time | [Incomplete Items & Improvements](#-incomplete-items--improvements-with-more-time) |
| *Optional:* unit tests | ✅ 19 tests: status-rule unit tests + API tests against real PostgreSQL, including concurrency ([Running the Tests](#-running-the-tests)) |
| *Optional:* Docker support | ✅ partly: `docker-compose.yml` runs PostgreSQL. The API itself is not containerised yet (listed under improvements) |
| *Optional:* Swagger / OpenAPI | ❌ Not done. The API is documented in this README instead (listed under improvements) |

---

## 🧰 Tech Stack

| Layer      | Technology              | Why                                                        |
| ---------- | ----------------------- | ---------------------------------------------------------- |
| Runtime    | **Node.js** (18+)       | One of the technologies listed in the assignment           |
| API        | **Express 5**           | Simple, popular web framework; forwards async errors to the error handler |
| Database   | **PostgreSQL 16**       | Relational DB (requirement 6); gives `UNIQUE`/`CHECK` constraints, indexes, transactions, row locking |
| ORM        | **Prisma 6**            | Schema file + versioned migrations, parameterised queries  |
| Validation | **zod**                 | Clear, readable validation rules                           |
| Tests      | **node:test + supertest** | Built-in Node test runner, plus HTTP testing             |
| Dev DB     | **Docker Compose**      | One command to start PostgreSQL                            |
| Frontend   | **React 18 + Vite**     | Optional small UI to try the API                           |

---

## 📁 Project Structure

```
.
├── docker-compose.yml          # Starts PostgreSQL in Docker
├── README.md                   # You are here
│
├── backend/                    # ── The API ──
│   ├── .env.example            # Settings template (copy to .env)
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma       # Trip model, status enum, unique constraints, indexes
│   │   └── migrations/
│   │       └── 0001_init/migration.sql   # Creates the table, incl. CHECK constraints
│   ├── src/
│   │   ├── server.js           # Starts the HTTP server, graceful shutdown
│   │   ├── app.js              # Builds the Express app (middleware + routes + /health)
│   │   ├── config/index.js     # Reads settings from environment variables
│   │   ├── db/prisma.js        # The shared Prisma client
│   │   ├── middleware/
│   │   │   ├── validate.js     # Checks request data against zod schemas
│   │   │   └── errorHandler.js # Turns every error into the same JSON shape
│   │   ├── utils/AppError.js   # Error class with HTTP status + error code
│   │   └── modules/trips/      # Everything about "trips" lives together
│   │       ├── trip.routes.js      # URL → validation → controller
│   │       ├── trip.controller.js  # HTTP in / HTTP out
│   │       ├── trip.service.js     # Business rules (transitions, locking, idempotency)
│   │       ├── trip.repository.js  # Database queries (Prisma)
│   │       ├── trip.validation.js  # Request validation rules
│   │       └── trip.status.js      # Allowed status transitions
│   └── tests/
│       ├── trip.status.test.js # Unit tests for status rules (no DB needed)
│       └── trips.api.test.js   # API tests against a real database
│
└── frontend/                   # ── Optional React UI ──
    ├── vite.config.js          # Dev server + proxy to the API
    └── src/
        ├── App.jsx             # Page: list, filter, paginate
        ├── api.js              # All fetch() calls to the backend
        ├── constants.js        # Status list + allowed next statuses
        └── components/
            ├── CreateTripForm.jsx
            └── TripTable.jsx
```

**Why routes / controller / service / repository?** Each file has one job, which makes the code easy to read, test and change:

| Layer          | Its one job                                    | Knows about HTTP? | Knows about the DB? |
| -------------- | ---------------------------------------------- | :---------------: | :-----------------: |
| `routes`       | Which URL goes to which function, + validation | ✅                | ❌                  |
| `controller`   | Read the request, send the response            | ✅                | ❌                  |
| `service`      | Business rules (status changes, duplicates)    | ❌                | ❌                  |
| `repository`   | Talk to the database                           | ❌                | ✅                  |

---

## 🚀 Quick Start (Setup)

### 1. Prerequisites

- [Node.js](https://nodejs.org/) **18 or newer** (check with `node -v`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) to run PostgreSQL
  - *No Docker?* Any PostgreSQL 13+ works. Create a database and put its URL in `backend/.env`.

### 2. Start the database

From the project root:

```bash
docker compose up -d
```

This starts PostgreSQL on **port 5433** (user `trips`, password `trips`, database `trips`). Port 5433 avoids clashing with a PostgreSQL you may already have on 5432.

### 3. Start the API

```bash
cd backend
npm install                 # also generates the Prisma client
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run migrate             # prisma migrate deploy: creates the trips table
npm run dev                 # API on http://localhost:4000
```

Check: <http://localhost:4000/health> returns `{"status":"ok"}`.

### 4. Run the tests

```bash
npm test                    # in backend/, with the database running
```

### 5. Start the frontend (optional)

In a second terminal:

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

You can create trips, filter by status, page through results, change status and delete trips.

> If port 5173 is busy, Vite picks the next free one (5174, ...). Use the URL it prints. The Vite dev server forwards `/trips` and `/health` to the API (`VITE_PROXY_TARGET`, default `http://localhost:4000`), so it works on any port without CORS issues.

### Settings (`backend/.env`)

| Variable       | Default                                          | Meaning                               |
| -------------- | ------------------------------------------------ | ------------------------------------- |
| `PORT`         | `4000`                                           | Port the API listens on               |
| `DATABASE_URL` | `postgres://trips:trips@localhost:5433/trips`    | PostgreSQL connection string          |
| `CORS_ORIGIN`  | `http://localhost:5173,http://localhost:5174`    | Browser origins allowed to call the API directly |

### Useful database commands (in `backend/`)

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm run migrate`      | Apply pending migrations (`prisma migrate deploy`)     |
| `npm run migrate:dev`  | Create a new migration after editing `schema.prisma`   |
| `npm run db:studio`    | Open Prisma Studio to browse the data                  |

---

## 🔄 How a Request Flows Through the Code

Example: `PATCH /trips/123/status` with body `{ "status": "IN_TRANSIT" }`

```
 Client
   │
   ▼
 app.js ─────────────── express.json() parses the body (bad JSON → 400)
   │
   ▼
 trip.routes.js ─────── validate(params) → is "123" a valid UUID?
   │                     validate(body)   → is "IN_TRANSIT" a valid status?
   │                     ✗ invalid → 400 VALIDATION_ERROR
   ▼
 trip.controller.js ─── takes the clean data, calls the service
   │
   ▼
 trip.service.js ────── BEGIN transaction (prisma.$transaction)
   │                     lock the trip row (SELECT ... FOR UPDATE)
   │                     ✗ not found        → 404 NOT_FOUND
   │                     ✗ not allowed move → 409 INVALID_STATUS_TRANSITION
   ▼
 trip.repository.js ─── UPDATE the trip; COMMIT (lock released)
   │
   ▼
 Response 200 { "data": { ...updated trip... } }

 Any error at any step → errorHandler.js → { "error": { code, message, details } }
```

---

## 🗄️ Database Schema & Migrations

- **Model:** [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)
- **Migration (SQL):** [`backend/prisma/migrations/0001_init/migration.sql`](backend/prisma/migrations/0001_init/migration.sql), applied with `npm run migrate`

Prisma's schema language cannot express `CHECK` constraints, so those are written in the migration SQL. `prisma migrate diff` was used to confirm the migration and `schema.prisma` describe exactly the same database.

### `trips` table

| Column            | Type           | Rules                                     | Description                                |
| ----------------- | -------------- | ----------------------------------------- | ------------------------------------------ |
| `id`              | `UUID`         | Primary key, default `gen_random_uuid()`  | Trip ID                                    |
| `trip_number`     | `VARCHAR(50)`  | **NOT NULL, UNIQUE**                      | Human-friendly number, e.g. `TRP-1001`     |
| `source`          | `VARCHAR(255)` | NOT NULL, not blank                       | Start location                             |
| `destination`     | `VARCHAR(255)` | NOT NULL, not blank, ≠ source             | End location                               |
| `driver_name`     | `VARCHAR(100)` | Required once status is ASSIGNED or later | Driver                                     |
| `status`          | `trip_status`  | NOT NULL, default `CREATED`               | One of the 5 statuses (Postgres `ENUM`)    |
| `idempotency_key` | `VARCHAR(255)` | UNIQUE, optional                          | Stops duplicate creates (requirement 9)    |
| `created_at`      | `TIMESTAMPTZ`  | NOT NULL, default `now()`                 | When the trip was created                  |
| `updated_at`      | `TIMESTAMPTZ`  | NOT NULL, default `now()`, updated on change | Last time it changed                    |

### Constraints (enforced by the database itself)

| Constraint                       | What it guarantees                                                  |
| -------------------------------- | ------------------------------------------------------------------- |
| `trips_pkey`                     | Every trip has a unique ID                                          |
| `trips_trip_number_unique`       | No two trips share a trip number, even under a race                 |
| `trips_idempotency_key_unique`   | One idempotency key creates at most one trip                        |
| `trip_status` ENUM               | Status can only be one of the 5 valid values                        |
| `trips_trip_number_not_blank`, `trips_source_not_blank`, `trips_destination_not_blank` | Text fields cannot be empty or only spaces |
| `trips_source_ne_destination`    | Source and destination must be different                            |
| `trips_driver_required`          | ASSIGNED / IN_TRANSIT / COMPLETED trips must have a driver          |

> The API validates all of this **before** touching the database (friendly messages). The constraints are a **safety net**: even a bug or a manual insert cannot create bad data. If one is ever hit, the API answers `422 CONSTRAINT_VIOLATION`.

### Indexes

| Index                          | Speeds up                                          |
| ------------------------------ | -------------------------------------------------- |
| `trips_pkey` (id)              | `GET / PATCH / DELETE /trips/{id}`                 |
| `trips_trip_number_unique`     | Uniqueness check on create                         |
| `trips_idempotency_key_unique` | Finding the original trip on a retried create      |
| `idx_trips_status_created_at`  | `GET /trips?status=X` (filter + sort in one index) |
| `idx_trips_created_at`         | `GET /trips` (newest first, no filter)             |

---

## 🚦 Trip Status Rules

```
  CREATED ──────► ASSIGNED ──────► IN_TRANSIT ──────► COMPLETED
     │                │                                  (final)
     └──────┬─────────┘
            ▼
        CANCELLED
         (final)
```

| From         | Can move to               |
| ------------ | ------------------------- |
| `CREATED`    | `ASSIGNED`, `CANCELLED`   |
| `ASSIGNED`   | `IN_TRANSIT`, `CANCELLED` |
| `IN_TRANSIT` | `COMPLETED`               |
| `COMPLETED`  | none *(final)*            |
| `CANCELLED`  | none *(final)*            |

- ❌ No moving **backwards** (e.g. `ASSIGNED → CREATED`)
- ❌ No **skipping** steps (e.g. `CREATED → COMPLETED`)
- ❌ Nothing leaves `COMPLETED` or `CANCELLED`
- To move to `ASSIGNED` the trip needs a driver: send `driverName` in the request, or set it when creating the trip.

The whole rule set is one table in [`backend/src/modules/trips/trip.status.js`](backend/src/modules/trips/trip.status.js).

---

## 📘 API Documentation

**Base URL:** `http://localhost:4000` · All requests and responses are JSON.
Success responses wrap the result in `data`; errors are wrapped in `error`.

> 💡 **Windows:** in PowerShell use `curl.exe` instead of `curl`, or use Postman / the React UI. Examples use bash quoting.

### Trip object

```json
{
  "id": "5c1f0a8e-3b7a-4f3e-9a51-0d6d0f6b2a11",
  "tripNumber": "TRP-1001",
  "source": "Delhi",
  "destination": "Jaipur",
  "driverName": "Ravi Kumar",
  "status": "CREATED",
  "createdAt": "2026-11-21T10:15:00.000Z",
  "updatedAt": "2026-11-21T10:15:00.000Z"
}
```

---

### 1. Create a trip: `POST /trips`

**Body**

| Field         | Type   | Required | Rules                                               |
| ------------- | ------ | :------: | --------------------------------------------------- |
| `tripNumber`  | string | ✅       | 1–50 chars; letters, numbers, `-`, `_`; **unique**  |
| `source`      | string | ✅       | 1–255 chars                                         |
| `destination` | string | ✅       | 1–255 chars; different from `source` (ignoring case) |
| `driverName`  | string | ❌       | 1–100 chars                                         |

Unknown fields (like `status` or `id`) are **rejected**. Every new trip starts as `CREATED`.

**Optional header:** `Idempotency-Key: <unique string, e.g. a UUID>` (see [requirement 9](#requirement-9-duplicate-post-requests)).

```bash
curl -X POST http://localhost:4000/trips \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7b0e6c1a-1111-4c1e-9d55-aaaaaaaaaaaa" \
  -d '{"tripNumber":"TRP-1001","source":"Delhi","destination":"Jaipur","driverName":"Ravi Kumar"}'
```

| Status | When                                                                        |
| ------ | --------------------------------------------------------------------------- |
| `201`  | Created. Body `{ "data": <trip> }`, header `Location: /trips/{id}`          |
| `200`  | Same `Idempotency-Key` + same body sent again → original trip, header `Idempotent-Replayed: true` |
| `400`  | `VALIDATION_ERROR`: invalid body or invalid JSON                            |
| `409`  | `DUPLICATE_TRIP_NUMBER`: trip number already exists                         |
| `422`  | `IDEMPOTENCY_KEY_REUSED`: same key used with a *different* body             |

---

### 2. List trips: `GET /trips`

| Query param | Default | Rules                 |
| ----------- | ------- | --------------------- |
| `page`      | `1`     | whole number ≥ 1      |
| `limit`     | `20`    | whole number, 1–100   |
| `status`    | *(all)* | one of the 5 statuses |

Sorted **newest first**.

```bash
curl "http://localhost:4000/trips?page=1&limit=10&status=CREATED"
```

**Response `200`**

```json
{
  "data": [ { "id": "...", "tripNumber": "TRP-1001", "status": "CREATED", "...": "..." } ],
  "pagination": { "page": 1, "limit": 10, "total": 23, "totalPages": 3 }
}
```

`400 VALIDATION_ERROR` if `page`, `limit` or `status` is invalid.

---

### 3. Get one trip: `GET /trips/{id}`

```bash
curl http://localhost:4000/trips/5c1f0a8e-3b7a-4f3e-9a51-0d6d0f6b2a11
```

| Status | When                     |
| ------ | ------------------------ |
| `200`  | `{ "data": <trip> }`     |
| `400`  | `id` is not a valid UUID |
| `404`  | Trip does not exist      |

---

### 4. Update status: `PATCH /trips/{id}/status`

| Body field   | Required | Rules                                                 |
| ------------ | :------: | ----------------------------------------------------- |
| `status`     | ✅       | One of the 5 statuses; must be an allowed next status |
| `driverName` | ❌       | Only allowed when `status` is `ASSIGNED`              |

```bash
# Assign a driver
curl -X PATCH http://localhost:4000/trips/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"ASSIGNED","driverName":"Ravi Kumar"}'

# Start the trip
curl -X PATCH http://localhost:4000/trips/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"IN_TRANSIT"}'
```

| Status | When                                                                       |
| ------ | -------------------------------------------------------------------------- |
| `200`  | Updated. `{ "data": <trip> }`                                              |
| `400`  | Bad id or body                                                             |
| `404`  | Trip does not exist                                                        |
| `409`  | `INVALID_STATUS_TRANSITION`: move not allowed (details list allowed moves) |
| `422`  | `DRIVER_REQUIRED`: assigning a trip that has no driver                     |

Example `409`:

```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot change status from ASSIGNED to CREATED",
    "details": {
      "currentStatus": "ASSIGNED",
      "requestedStatus": "CREATED",
      "allowedNextStatuses": ["IN_TRANSIT", "CANCELLED"]
    }
  }
}
```

---

### 5. Delete a trip: `DELETE /trips/{id}`

```bash
curl -X DELETE http://localhost:4000/trips/<id>
```

| Status | When                          |
| ------ | ----------------------------- |
| `204`  | Deleted (empty response body) |
| `400`  | Bad id                        |
| `404`  | Trip does not exist           |

---

### Health check: `GET /health`

Returns `200 {"status":"ok"}` when the API is running and can reach the database.

---

## ⚠️ Error Format & Status Codes

**Every** error from every endpoint has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "tripNumber", "message": "tripNumber is required" },
      { "field": "destination", "message": "source and destination must be different" }
    ]
  }
}
```

- `code`: fixed, machine-readable string; clients can `switch` on it.
- `message`: human-readable explanation.
- `details`: extra info, only when useful.

| HTTP  | `code`                      | Meaning                                                  |
| ----- | --------------------------- | -------------------------------------------------------- |
| `400` | `VALIDATION_ERROR`          | Bad input (missing field, wrong type, bad JSON, bad id)  |
| `404` | `NOT_FOUND`                 | Trip or route does not exist                             |
| `409` | `DUPLICATE_TRIP_NUMBER`     | Trip number already used                                 |
| `409` | `INVALID_STATUS_TRANSITION` | Status change not allowed                                |
| `422` | `DRIVER_REQUIRED`           | Can't assign without a driver                            |
| `422` | `IDEMPOTENCY_KEY_REUSED`    | Key reused with a different body                         |
| `422` | `CONSTRAINT_VIOLATION`      | A database rule was broken (safety net)                  |
| `500` | `INTERNAL_ERROR`            | Unexpected error (logged on the server, never leaked)    |

---

## 🧠 Design Decisions (One Section per Requirement)

The numbers match the assignment's requirement list.

### Requirement 1: Validation

Every request is checked by **zod** schemas in [`trip.validation.js`](backend/src/modules/trips/trip.validation.js), wired in by the `validate` middleware in [`trip.routes.js`](backend/src/modules/trips/trip.routes.js), **before** any business logic runs. Strings are trimmed and length-limited, query numbers are converted and range-checked, IDs must be UUIDs, statuses must be one of the 5 values, unknown fields are rejected (`.strict()`), and invalid JSON gives a clean `400`. All problems in a request are returned together, including the cross-field rule "source ≠ destination".

### Requirement 2: Unique trip number

A `UNIQUE` constraint in the database. There is deliberately **no** "check if it exists, then insert": two requests at the same moment could both pass such a check. The database constraint is race-proof, and the error handler turns its error (Prisma `P2002`) into `409 DUPLICATE_TRIP_NUMBER`.

### Requirement 3: Pagination

`page` and `limit` query params (limit capped at 100, so nobody can ask for a million rows). The response includes `total` and `totalPages` so a client can draw page buttons. The order is `created_at DESC, id DESC`, which is stable even when two trips share a timestamp, so rows never jump between pages.

### Requirement 4: Filtering by status

Optional `status` query param, validated against the 5 statuses. The composite index `(status, created_at DESC)` serves both the filter and the sort.

### Requirement 5: HTTP status codes and consistent errors

One central [`errorHandler.js`](backend/src/middleware/errorHandler.js). Code throws an `AppError(statusCode, code, message, details)`; the handler also translates JSON parse errors, unique violations and `CHECK` violations. Unknown routes return `404` in the same format. Unexpected errors become `500 INTERNAL_ERROR` and are logged without leaking internals. Success codes follow REST conventions: `201` + `Location` on create, `200` on read/update/replay, `204` on delete. Full list: [Error Format & Status Codes](#-error-format--status-codes).

### Requirement 6: Relational database

PostgreSQL 16, started with Docker Compose, accessed through Prisma. Postgres provides what the other requirements need: `UNIQUE` and `CHECK` constraints, enums, indexes, transactions and row-level locks.

### Requirement 7: Valid status transitions

The allowed transitions are a single lookup table in [`trip.status.js`](backend/src/modules/trips/trip.status.js), used by `updateTripStatus` in [`trip.service.js`](backend/src/modules/trips/trip.service.js). Anything not in the table is rejected with `409 INVALID_STATUS_TRANSITION`, and the response lists the allowed next statuses. This blocks moving backwards, skipping steps, and leaving `COMPLETED` or `CANCELLED`. Changing the rules means editing one table.

### Requirement 8: Concurrent status updates

The problem: two requests arrive at the same time for a `CREATED` trip, one says `ASSIGNED` and one says `CANCELLED`. Without care, both read `CREATED`, both think "allowed", both write; the final state is random and one client got a wrong success message.

The fix is **pessimistic locking** inside a Prisma interactive transaction (`prisma.$transaction(async (tx) => ...)`). Prisma's query API has no `FOR UPDATE`, so the lock is taken with a parameterised `tx.$queryRaw`:

```
BEGIN;
SELECT 1 FROM trips WHERE id = $1 FOR UPDATE;   -- 🔒 lock this one row
-- read the trip and check the transition against its CURRENT status
UPDATE trips SET status = ... WHERE id = $1;
COMMIT;                                          -- 🔓 unlock
```

The second request **waits** until the first commits, then reads the **new** status and is checked against it. Exactly one request wins with `200`; the others get `409`. Only that one row is locked, so other trips are not slowed down. The test fires 10 parallel updates and checks that exactly one succeeds and the stored state matches the winner.

### Requirement 9: Duplicate POST requests

Two layers:

1. **Unique trip number**: the same trip sent twice gets `409` the second time, so it can never be created twice.
2. **`Idempotency-Key` header** (optional; the pattern used by Stripe and others): the client sends a random key per "create" action. If the request is **retried** (network timeout, double-click), the server finds the key and **returns the original trip with `200`** (`Idempotent-Replayed: true`) instead of an error, so clients can retry safely.
   - The `UNIQUE` index on `idempotency_key` decides races: when copies arrive at the exact same moment, one insert wins; the others hit the unique index, find the trip that owns the key, and replay it. The test fires 5 identical requests at once → exactly 1 trip, one `201`.
   - Same key + different body → `422 IDEMPOTENCY_KEY_REUSED` (a client bug).

The optional React UI adds a third layer for user experience: buttons are disabled while a request is in flight and the form sends one idempotency key per new trip. Layers 1 and 2 are what **guarantee** correctness, even for clients calling the API directly.

### Requirement 10: Constraints and indexes

See [Database Schema & Migrations](#-database-schema--migrations). Every rule is enforced **twice**: in the API (friendly messages) and in the database (a safety net that can't be bypassed): primary key, 2 unique constraints, `NOT NULL`, the status enum, and 5 `CHECK` constraints. Indexes match the actual queries: primary key lookups, uniqueness checks, and listing with or without the status filter.

### Requirement 11: Modular, maintainable, production-oriented code

- Layered structure: routes → controller → service → repository, grouped by module (`modules/trips/`)
- One central error handler; consistent error format; internal errors never leaked
- All queries go through Prisma, which parameterises every value (including the one raw `FOR UPDATE` query): no SQL injection
- Configuration from environment variables (`.env`), nothing hard-coded
- Versioned migrations with Prisma Migrate (tracked in `_prisma_migrations`)
- Request body size limit (100 KB), CORS allow-list, `/health` endpoint that checks the DB, graceful shutdown on `SIGINT`/`SIGTERM`
- 19 automated tests, including concurrency tests against a real database

---

## 🧪 Running the Tests

With the database running (`docker compose up -d`):

```bash
cd backend
npm test
```

Result: **19 tests, 19 passing.**

| Test (file → name) | Requirement(s) |
|---|:-:|
| `trip.status.test.js` → `happy path CREATED -> ASSIGNED -> IN_TRANSIT -> COMPLETED is allowed` | 7 |
| `trip.status.test.js` → `cancelling is allowed before the trip starts moving` | 7 |
| `trip.status.test.js` → `moving backwards is not allowed` | 7 |
| `trip.status.test.js` → `skipping steps is not allowed` | 7 |
| `trip.status.test.js` → `COMPLETED and CANCELLED are final` | 7 |
| `trip.status.test.js` → `same status is not a transition` | 7 |
| `trips.api.test.js` → `POST /trips creates a trip with status CREATED` | API, 5 |
| `trips.api.test.js` → `POST /trips validates input` | 1, 5 |
| `trips.api.test.js` → `POST /trips rejects same source and destination on an otherwise valid body` | 1 |
| `trips.api.test.js` → `POST /trips rejects invalid JSON` | 1, 5 |
| `trips.api.test.js` → `duplicate tripNumber returns 409` | 2, 9 |
| `trips.api.test.js` → `same Idempotency-Key replays the original trip instead of creating a new one` | 9 |
| `trips.api.test.js` → `concurrent POSTs with the same Idempotency-Key create exactly one trip` | 9 |
| `trips.api.test.js` → `GET /trips/:id returns the trip, 404 if missing, 400 if bad id` | API, 1, 5 |
| `trips.api.test.js` → `GET /trips paginates and filters by status` | 3, 4 |
| `trips.api.test.js` → `status moves forward and cannot go backwards or leave COMPLETED` | 7 |
| `trips.api.test.js` → `concurrent status updates: exactly one wins, final state is consistent` | 8 |
| `trips.api.test.js` → `DELETE /trips/:id removes the trip` | API |
| `trips.api.test.js` → `unknown route returns 404 in the standard error format` | 5 |

> ⚠️ The API tests apply pending migrations and **delete all rows** in `trips` before running. Use a dev database only. If the database is not reachable, the API tests are skipped.

---

## 📝 Assumptions

1. **Driver is optional when creating** a trip (a trip can exist before a driver is known), but **required to become `ASSIGNED`**. It can be given at creation or in the `ASSIGNED` status update.
2. **Cancelling** is allowed from `CREATED` or `ASSIGNED`, **not** from `IN_TRANSIT` (the truck is already on the road). `CANCELLED` is final, like `COMPLETED`.
3. **Same-status updates** (e.g. `ASSIGNED → ASSIGNED`) are an invalid transition (`409`), so a request that lost a race is always told clearly.
4. **Delete is a hard delete** and is allowed in any status (the assignment does not define limits).
5. **The client supplies `tripNumber`** (the assignment lists it separately from the ID). Trip numbers are case-sensitive and may contain letters, numbers, `-` and `_`.
6. **Source and destination are compared ignoring case and surrounding spaces** (`"Delhi"` = `" delhi "`).
7. **No authentication**: not part of the assignment.

---

## 🔮 Incomplete Items & Improvements With More Time

**Incomplete items:** none of the core requirements. From the optional list, **Swagger/OpenAPI** is not done (the API is documented in this README), and **Docker** covers the database only, not the API.

Improvements with more time:

- [ ] **OpenAPI / Swagger** docs generated from the zod schemas
- [ ] **Dockerfile for the API** + CI pipeline (lint + tests on every push)
- [ ] **Separate test database**, so tests never touch dev data
- [ ] **Authentication & authorization** (e.g. JWT; only dispatchers can assign drivers)
- [ ] **Status history / audit table** (`trip_status_events`: who changed what, when)
- [ ] **Soft delete** (`deleted_at`) instead of hard delete, to keep history
- [ ] **Cursor (keyset) pagination** for very large tables (`OFFSET` slows down on deep pages)
- [ ] **Idempotency key expiry** (e.g. keys reusable after 24h), stored in a separate table
- [ ] **Drivers as their own table** (`driver_id` foreign key) instead of a free-text name
- [ ] Rate limiting, security headers (`helmet`), structured logging (`pino`) with request IDs
- [ ] More filters (driver, date range) and sorting options
- [ ] Frontend: driver input in a modal instead of `prompt`, toasts, frontend tests
