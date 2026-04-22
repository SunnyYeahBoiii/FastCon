# FastCons

FastCons is a contest evaluation platform built as an npm workspace. It combines a public Next.js application, an internal FastAPI service, a shared SQLite database, and a Python-based judge worker to support contest management, file submissions, grading, and real-time result updates.

For day-to-day onboarding, this repository is intended to be used through two root scripts:

- `./first-run.sh`: bootstrap the machine and initialize the project
- `./start-application.sh`: build and run the full local application stack

## What This Repository Contains

FastCons is split into two runtime applications:

- `apps/web`: the public-facing Next.js 16 application
- `apps/api`: the internal FastAPI service used for submission processing and streaming updates

Both applications share the same SQLite database at the repository root and the same filesystem storage directory under `storage/`.

## Architecture

### Runtime split

The codebase is intentionally divided by responsibility instead of putting everything behind a single server process.

- The Next.js app handles UI, page rendering, session cookie handling, admin CRUD flows, and Prisma-based access to SQLite.
- The FastAPI app handles submission ingestion, queue processing, worker orchestration, submission status updates, and SSE streams for live updates.
- The Python judge runs as a subprocess launched by the FastAPI worker when queued submissions are claimed.

### Why the split exists

The public application and the judge pipeline have different runtime concerns:

- Next.js is a good fit for pages, forms, admin tooling, and authenticated route handlers.
- FastAPI is a better fit for long-lived streaming responses, background worker coordination, and running the judge loop independently from page rendering.
- Keeping the judge-facing logic in the internal API keeps the public app smaller and makes the submission pipeline easier to reason about.

### Request flow

There are two main request paths in the system.

#### 1. Direct Next.js path

These routes are handled inside `apps/web` and usually talk to SQLite through Prisma:

- login/logout
- admin contest management
- admin user management
- public contest listing

In this path, the browser calls a Next.js route handler or loads a Next.js page, and the handler uses Prisma with the Better SQLite adapter to access the shared database.

#### 2. Rewritten FastAPI path

These routes are matched by `apps/web/proxy.ts` and rewritten from Next.js to the internal FastAPI service:

- `/api/submissions/*`
- `/api/leaderboard/*`

In this path, the browser still talks to the same web origin, but Next.js rewrites the request to the FastAPI service using `FASTAPI_INTERNAL_URL`. This keeps the client API surface simple while moving submission and streaming logic into the internal service.

### Submission lifecycle

The end-to-end submission pipeline works like this:

1. A logged-in user uploads a `.pkl` file through the web app.
2. The request is rewritten to FastAPI.
3. FastAPI validates the request, stores the file under `storage/submissions`, and inserts a new `Submission` row into SQLite with status `queued`.
4. The FastAPI worker loop claims queued submissions up to `WORKER_MAX_CONCURRENT`.
5. The worker launches `apps/api/scripts/judge_runner.py` as a subprocess using the configured Python interpreter.
6. The judge writes results back to SQLite.
7. FastAPI publishes updates to in-memory subscriber queues.
8. Browsers receive live updates through SSE streams for submissions and leaderboard changes.

### Shared state

The repository uses a shared local state model:

- `dev.db`: the single SQLite database used by both apps
- `storage/submissions`: uploaded submission files
- `storage/testdata`: test data used by evaluation logic
- `apps/web/.env.local` and `apps/api/.env.local`: generated environment files with aligned paths and runtime configuration

## Repository Layout

```text
fast-con/
├── apps/
│   ├── web/                     # Next.js 16 public app
│   │   ├── app/                 # App Router pages and route handlers
│   │   ├── components/          # Reusable UI components
│   │   ├── lib/                 # Auth, guards, db, runtime config
│   │   ├── prisma/              # Prisma schema and seed script
│   │   └── proxy.ts             # Rewrite rules to FastAPI
│   └── api/                     # Internal FastAPI service
│       ├── backend/             # FastAPI app, auth, repositories, worker, SSE
│       ├── scripts/             # Judge runner and Python helpers
│       └── requirements.txt     # Python dependencies
├── packages/
│   ├── eslint-config/           # Shared lint config
│   └── typescript-config/       # Shared TS config
├── scripts/
│   ├── setup.sh                 # Bootstrap source of truth
│   ├── run.sh                   # Compatibility wrapper
│   ├── run-web.sh               # Compatibility wrapper for web dev
│   └── run-api.sh               # Compatibility wrapper for api dev
├── storage/                     # Shared runtime filesystem state
├── dev.db                       # Shared SQLite database
├── start-application.sh         # Main local start flow
├── first-run.sh                 # Main bootstrap entrypoint
└── turbo.json                   # Turborepo task orchestration
```

## Key Code Paths

If you are new to the repository, these are the most useful places to start:

- `apps/web/app`: user pages, admin pages, and route handlers
- `apps/web/lib/db.ts`: Prisma client configuration using Better SQLite
- `apps/web/lib/runtimeConfig.ts`: shared path and runtime env resolution for the web app
- `apps/web/proxy.ts`: rewrite layer from web routes to the internal API
- `apps/web/prisma/schema.prisma`: source of truth for the database schema
- `apps/web/prisma/seed.ts`: admin user and sample contest seed logic
- `apps/api/backend/main.py`: FastAPI entrypoint and submission/leaderboard endpoints
- `apps/api/backend/repositories.py`: SQLite access layer for the internal service
- `apps/api/backend/worker.py`: queue processing and judge subprocess orchestration
- `apps/api/backend/streams.py`: SSE subscriber/broadcast support

## Data Model

The current Prisma schema is intentionally small:

- `User`: accounts, roles, and password hashes
- `Contest`: contest metadata, deadlines, evaluation configuration, and status
- `Submission`: uploaded file metadata, grading status, score, and serialized metrics

Next.js uses Prisma for web-side data access. FastAPI uses `aiosqlite` against the same database file for async worker and stream-friendly access.

## Getting Started

### 1. First-time bootstrap

```bash
chmod +x first-run.sh start-application.sh
./first-run.sh
```

`first-run.sh` forwards into the repository bootstrap flow. It prepares `.venv`, installs Python dependencies, ensures a compatible Node.js/npm runtime, installs Node dependencies, writes both `.env.local` files, generates the Prisma client, pushes the database schema, and seeds the admin user.

### 2. Start the application

```bash
./start-application.sh
```

This script verifies dependencies, regenerates the Prisma client, builds the workspace, starts FastAPI on port `8010`, and starts Next.js on port `3000`.

### 3. Open the app

- web: `http://localhost:3000`
- api docs: `http://127.0.0.1:8010/docs`

## Development Workflow

### First-time setup

```bash
./first-run.sh
./start-application.sh
```

This is the simplest supported flow for a fresh machine or a fresh clone.

### Subsequent runs

```bash
./start-application.sh
```

This runs the production-like local start flow and starts both services:

- web: `http://localhost:3000`
- internal api: `http://127.0.0.1:8010`

### Advanced npm commands

```bash
npm run dev:web
npm run dev:api
npm run dev
```

Use these only when you want to debug an individual service or use the Turborepo development workflow directly.

## Common Commands

```bash
npm run setup
npm run dev
npm run dev:web
npm run dev:api
npm run build
npm run lint
npm run check-types
npm run prisma:generate
npm run db:push
npm run seed
npm start
```

## Environment and Configuration

The setup script writes matching runtime configuration into:

- `apps/web/.env.local`
- `apps/api/.env.local`

The most important variables are:

- `DATABASE_URL`: SQLite file used by both apps
- `STORAGE_ROOT`: shared storage directory
- `FASTAPI_INTERNAL_URL`: rewrite target for submission and leaderboard APIs
- `PYTHON_BIN`: Python interpreter used by the API and judge
- `WORKER_POLL_MS`: worker wake-up interval
- `WORKER_MAX_CONCURRENT`: max number of concurrent judge jobs
- `JUDGE_TIMEOUT_SECONDS`: per-job timeout
- `MAX_UPLOAD_BYTES`: upload size limit

The setup script also writes compatibility aliases that still exist in the runtime config:

- `UPLOAD_DIR`
- `MAX_CONCURRENT_JUDGES`

The setup and start scripts also validate the JavaScript runtime before running `npm install`. FastCons requires a modern Node.js/npm toolchain:

- Node.js `>= 20`
- npm `>= 10`

On Debian/Ubuntu-style systems with `apt-get`, the scripts will attempt to install a compatible Node.js runtime automatically.

## Script Entry Points

These are the root-level entry points users should care about first:

- `first-run.sh` -> bootstrap flow for setup and initialization
- `start-application.sh` -> build-and-run flow for the full local stack

These additional scripts still exist for compatibility or targeted debugging:

- `scripts/run.sh` -> compatibility wrapper that redirects to web dev flow
- `scripts/run-web.sh` -> wrapper for `npm run dev:web`
- `scripts/run-api.sh` -> wrapper for `npm run dev:api`

## Default Admin Account

The seed script creates or updates the admin account:

- username: `admin`
- password: the value entered during `npm run setup`
- default fallback password if left blank during setup: `admin123`

## Notes

- `npm` is the official package manager for this repository.
- The submission and leaderboard APIs are intentionally routed through FastAPI even though they are exposed under the same web origin.
- Both applications must agree on the same database path and storage root, which is why setup writes env files for both sides together.

See [SETUP.md](./SETUP.md) for the detailed setup and operations guide.
