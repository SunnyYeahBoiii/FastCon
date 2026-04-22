# FastCons

Contest evaluation platform with real-time judging.

## Quick Start

### First time

```bash
npm install
npm run setup
npm run dev
```

Cài workspace dependencies, sinh `apps/web/.env.local` và `apps/api/.env.local`, setup DB dùng SQLite chung ở root, rồi chạy cả web + api qua Turborepo.

### Subsequent runs

```bash
npm run dev
```

Chạy đồng thời `@repo/web` trên `http://localhost:3000` và `@repo/api` trên `http://127.0.0.1:8010`.

### Individual scripts

```bash
npm run setup          # generate app envs + install Python deps + db push + seed admin
npm run dev:web        # Next public process
npm run dev:api        # FastAPI internal process
./scripts/run-web.sh   # compatibility wrapper to npm run dev:web
./scripts/run-api.sh   # compatibility wrapper to npm run dev:api
```

### Workspace commands

```bash
npm run build      # build workspace
npm run lint       # lint workspace
npm run check-types
npm run db:push    # Prisma db push in apps/web
npm run seed       # full seed in apps/web
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
- **Workspace:** npm workspaces + Turborepo
