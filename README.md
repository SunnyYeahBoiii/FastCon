# FastCons

Contest evaluation platform with real-time judging.

## Quick Start

### First time

```bash
pnpm install
pnpm setup
pnpm dev
```

Cài workspace dependencies, sinh `apps/web/.env.local` và `apps/api/.env.local`, setup DB dùng SQLite chung ở root, rồi chạy cả web + api qua Turborepo.

### Subsequent runs

```bash
pnpm dev
```

Chạy đồng thời `@repo/web` trên `http://localhost:3000` và `@repo/api` trên `http://127.0.0.1:8010`.

### Individual scripts

```bash
pnpm setup             # generate app envs + install Python deps + db push + seed admin
pnpm dev:web           # Next public process
pnpm dev:api           # FastAPI internal process
./scripts/run-web.sh   # compatibility wrapper to pnpm dev:web
./scripts/run-api.sh   # compatibility wrapper to pnpm dev:api
```

### Workspace commands

```bash
pnpm build      # build workspace
pnpm lint       # lint workspace
pnpm check-types
pnpm db:push    # Prisma db push in apps/web
pnpm seed       # full seed in apps/web
```

See [SETUP.md](./SETUP.md) for full documentation.

## Features

- Contest management (admin)
- File submission with queue-based judging
- Real-time status updates via SSE
- Custom Python evaluation functions
- Leaderboard with scoring system
- Dark/light theme

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS
- **Backend:** Next.js public app + FastAPI internal APIs behind proxy rewrite, SQLite (Prisma schema source)
- **Judge:** Python subprocess with sandboxed execution
- **Real-time:** Server-Sent Events (SSE)
- **Workspace:** pnpm workspaces + Turborepo
