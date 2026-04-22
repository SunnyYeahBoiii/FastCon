# FastCons Setup and Run Guide

This document describes the current setup and runtime behavior of the repository based on the actual shell scripts and workspace commands. The primary user-facing flow is centered on two root scripts:

- `./first-run.sh`
- `./start-application.sh`

Under the hood, these scripts call the npm workspace and Python tooling needed by the project.

## Official Tooling

FastCons is managed as an npm workspace with Turborepo.

Required at a high level:

- Node.js
- npm
- Python 3

The setup and start scripts can install some missing system packages automatically when `apt-get` is available:

- `nodejs`
- `npm`
- `python3-venv`

If your machine does not provide `apt-get`, install those dependencies manually before continuing.

## Quick Start

### First run

```bash
chmod +x first-run.sh start-application.sh
./first-run.sh
./start-application.sh
```

### Later runs

```bash
./start-application.sh
```

## What `./first-run.sh` Does

`first-run.sh` is the recommended bootstrap entrypoint for a new machine or fresh clone. It is a small wrapper around `scripts/setup.sh`, which contains the actual setup logic.

In order, it does the following:

1. Verifies that `python3` exists.
2. Ensures `node` and `npm` exist. If they are missing and `apt-get` is available, it installs them.
3. Ensures Python venv support exists. If `python3 -m venv` is unavailable and `apt-get` is available, it installs `python3-venv`.
4. Creates `.venv` at the repository root if it does not already exist.
5. Activates `.venv`.
6. Installs Python dependencies from `apps/api/requirements.txt`.
7. Runs `npm install` at the repository root.
8. Creates shared runtime directories:
   - `storage/submissions`
   - `storage/testdata`
9. Prompts for the admin password. If left blank, the default is `admin123`.
10. Writes matching environment files to:
    - `apps/web/.env.local`
    - `apps/api/.env.local`
11. Runs `npm run prisma:generate`.
12. Runs `npm run db:push`.
13. Runs `npm run seed`.

At the end of `./first-run.sh`, the repository is ready to be started with `./start-application.sh`.

## Generated Environment Files

The setup script writes both application env files with aligned absolute paths and shared runtime configuration.

Files:

- `apps/web/.env.local`
- `apps/api/.env.local`

Variables currently written by setup:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite database file used by both apps |
| `STORAGE_ROOT` | Shared storage root |
| `FASTAPI_INTERNAL_URL` | Internal rewrite target used by the web app |
| `PYTHON_BIN` | Python interpreter inside `.venv` |
| `WORKER_POLL_MS` | Poll interval for the FastAPI submission worker |
| `WORKER_MAX_CONCURRENT` | Maximum concurrent judge jobs |
| `JUDGE_TIMEOUT_SECONDS` | Per-submission judge timeout |
| `MAX_UPLOAD_BYTES` | Upload size limit |
| `UPLOAD_DIR` | Compatibility alias that still points to `storage/submissions` |
| `MAX_CONCURRENT_JUDGES` | Compatibility alias for worker concurrency |
| `SEED_ADMIN_PASSWORD` | Admin password used during seed |

## What `./start-application.sh` Does

`start-application.sh` is the recommended runtime entrypoint for local usage. It starts the whole application stack instead of requiring users to launch services manually.

In order, it does the following:

1. Ensures `node` and `npm` exist, installing them via `apt-get` when available.
2. Ensures Python venv support exists, installing `python3-venv` via `apt-get` when available.
3. Creates `.venv` if it does not already exist.
4. Activates `.venv`.
5. Ensures Node dependencies are installed. If `node_modules` is missing, it runs `npm install`.
6. Verifies that both `.env.local` files exist. If not, it exits and tells you to run setup first.
7. Ensures key Python packages are installed.
8. Runs `npm run prisma:generate`.
9. Runs `npm run build`.
10. Starts FastAPI on `127.0.0.1:8010`.
11. Waits for the API to become ready.
12. Starts the web app with `npm --workspace @repo/web run start`, which runs `next start --port 3000`.

When the script is running successfully:

- web: `http://localhost:3000`
- api docs: `http://127.0.0.1:8010/docs`

Stopping the shell will stop both processes.

## Recommended Daily Workflow

### Fresh machine or fresh clone

```bash
./first-run.sh
./start-application.sh
```

### Existing setup

```bash
./start-application.sh
```

## Advanced Workspace Commands

These commands are still available if you want to use the underlying workspace directly.

These are the main root-level commands:

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

Useful workspace-specific commands:

```bash
npm --workspace @repo/web run db:reset
npm --workspace @repo/web run start
npm --workspace @repo/api run start
```

## Runtime Architecture Notes

The setup process writes both apps against the same local state:

- SQLite database: `dev.db` at the repository root
- shared storage root: `storage/`
- submission uploads: `storage/submissions`
- judge/test assets: `storage/testdata`

The split is important operationally:

- Next.js handles public pages, auth/session cookies, admin CRUD flows, and Prisma-based database access.
- FastAPI handles submission uploads, leaderboard/submission streaming, queueing, worker orchestration, and judge execution.
- Requests to `/api/submissions/*` and `/api/leaderboard/*` are rewritten from the web app to the internal API using `FASTAPI_INTERNAL_URL`.

## Default Admin Account

The seed flow creates or updates the `admin` user.

Default credentials after a blank setup prompt:

- username: `admin`
- password: `admin123`

If you entered a different password during setup, that value becomes the seeded admin password instead.

## Script Roles

Primary entrypoints:

- `first-run.sh`
  - recommended setup/bootstrap command
- `start-application.sh`
  - recommended start command for the full local stack

Secondary scripts:

- `scripts/run.sh`
  - compatibility wrapper that points users back to the npm workflow and then launches the web dev wrapper
- `scripts/run-web.sh`
  - wrapper for `npm run dev:web`
- `scripts/run-api.sh`
  - wrapper for `npm run dev:api`

For normal local usage, prefer `./first-run.sh` and `./start-application.sh`.

## Troubleshooting

### Missing `.env.local` files

If either application reports missing env files, rerun:

```bash
./first-run.sh
```

### Prisma client or Better SQLite native binding errors

If the web app fails with missing Prisma client artifacts or `better_sqlite3.node` binding errors, regenerate the Prisma client and make sure dependencies are installed:

```bash
npm install
npm run prisma:generate
```

If the problem happens during the scripted start flow, `./start-application.sh` already runs `npm run prisma:generate`, so repeated failures usually mean the dependency install is incomplete or the native package was not built correctly for the current machine.

### Python venv support is missing

If the scripts report that `python3 -m venv` is unavailable:

- on systems with `apt-get`, rerun the script and let it install `python3-venv`
- on other systems, install the OS-equivalent package manually, then rerun `./first-run.sh`

### Node or npm is missing

If your system does not have `apt-get`, install Node.js and npm manually and rerun:

```bash
./first-run.sh
```

### `start-application.sh` fails before boot

The `./start-application.sh` flow assumes setup has already been completed successfully. If it exits early, verify:

- `.venv` exists or can be created
- `apps/web/.env.local` exists
- `apps/api/.env.local` exists
- `npm install` completed successfully

### Reset the local database

If local data is corrupted and you want to repush schema and reseed:

```bash
npm --workspace @repo/web run db:reset
```

Then rerun:

```bash
npm run seed
```
