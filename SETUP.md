# FastCons — Setup & Run Guide

Contest evaluation platform. Next.js 16 + FastAPI + Prisma + SQLite + Python judge, organized as a pnpm workspace managed by Turborepo.

## Requirements

| Tool | Version | Auto-installed |
|------|---------|----------------|
| Node.js | >= 20 | No |
| pnpm | 10.x | No |
| Python | >= 3.9 | No |

## First-Time Setup

### Recommended

```bash
pnpm install
pnpm setup
pnpm dev
```

This installs the workspace, generates `apps/web/.env.local` and `apps/api/.env.local`, installs Python deps, pushes Prisma schema to the shared SQLite DB at the repo root, seeds the admin user, and starts both apps together.

### Step by step

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Generate envs, install Python deps, setup DB, seed admin
pnpm setup

# 3. Start both apps
pnpm dev
```

## Subsequent Runs

```bash
pnpm dev
```

Or run either app directly:

```bash
pnpm dev:web
pnpm dev:api
```

## Workspace Commands

```bash
pnpm build
pnpm lint
pnpm check-types
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm db:push
pnpm seed
```

Open `http://localhost:3000`. The internal FastAPI service runs on `http://127.0.0.1:8010`.

## Manual Setup Steps

If the automated script fails, follow these steps:

### Step 1: Install dependencies

```bash
pnpm install
```

### Step 2: Environment variables

`scripts/setup.sh` is the source of truth. It writes:

```bash
apps/web/.env.local
apps/api/.env.local
```

Both files contain the same resolved absolute values for:

- `DATABASE_URL`
- `STORAGE_ROOT`
- `FASTAPI_INTERNAL_URL`
- `PYTHON_BIN`
- `WORKER_POLL_MS`
- `WORKER_MAX_CONCURRENT`
- `JUDGE_TIMEOUT_SECONDS`
- `MAX_UPLOAD_BYTES`
- `UPLOAD_DIR`
- `MAX_CONCURRENT_JUDGES`

### Step 3: Database

```bash
pnpm db:push
SEED_ADMIN_PASSWORD=admin123 pnpm --filter @repo/web seed -- --admin-only
```

### Step 4: Start FastAPI

```bash
pnpm dev:api
```

### Step 5: Start Next.js

```bash
pnpm dev:web
```

Open `http://localhost:3000`

## Default Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |

## Project Structure

```
fast-con/
├── apps/
│   ├── web/
│   │   ├── app/                  # Next.js App Router
│   │   ├── components/
│   │   ├── lib/
│   │   ├── prisma/
│   │   ├── package.json
│   │   └── proxy.ts              # Rewrite submissions/leaderboard APIs to FastAPI
│   └── api/
│       ├── backend/              # FastAPI internal service
│       ├── scripts/              # Judge runner + local Python helpers
│       ├── requirements.txt
│       └── package.json
├── packages/
│   ├── eslint-config/
│   └── typescript-config/
├── scripts/
│   ├── setup.sh                 # Workspace bootstrap source of truth
│   ├── run-api.sh               # Compatibility wrapper to pnpm dev:api
│   ├── run-web.sh               # Compatibility wrapper to pnpm dev:web
│   └── run.sh                   # Compatibility wrapper to web only
├── storage/                     # Shared filesystem storage
├── dev.db                       # Shared SQLite database
├── first-run.sh
├── start-application.sh
├── pnpm-workspace.yaml
└── turbo.json
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | `file:/abs/path/to/dev.db` | Shared SQLite database path |
| STORAGE_ROOT | `/abs/path/to/storage` | Shared storage root |
| FASTAPI_INTERNAL_URL | http://127.0.0.1:8010 | Next rewrite target for submissions/leaderboard |
| PYTHON_BIN | python3 | Python executable path |
| WORKER_POLL_MS | 1000 | Worker poll interval |
| WORKER_MAX_CONCURRENT | 3 | Max parallel judge processes |
| JUDGE_TIMEOUT_SECONDS | 120 | Per-submission judge timeout |
| MAX_UPLOAD_BYTES | 10485760 | Upload size limit in bytes |
| UPLOAD_DIR | ./storage/submissions | Legacy alias for one transition release |
| MAX_CONCURRENT_JUDGES | 3 | Legacy alias for one transition release |

## Troubleshooting

### Python not found
```bash
# Check Python path
which python3

# Rerun setup after fixing the interpreter path
pnpm setup
```

### Database locked
```bash
# Reset database
pnpm --filter @repo/web db:reset
```

### Port already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill
```

### Judge process fails
```bash
# Test Python judge directly
cd apps/api
python3 scripts/judge_runner.py <submission_id>
```
