# FastCons

Contest evaluation platform with real-time judging.

## Quick Start

### First time

```bash
./first-run.sh
```

Cài dependencies, setup DB, tạo admin account, build và start server.

### Subsequent runs

```bash
./start-application.sh
```

Build và start server (custom port).

### Individual scripts

```bash
./scripts/setup.sh   # install deps + setup DB + create admin
./scripts/run.sh     # build + start with custom port
```

### npm commands

```bash
npm run build   # build for production
npm run start   # start production server
npm run dev     # development server with hot reload
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
- **Backend:** Next.js API routes, SQLite (Prisma)
- **Judge:** Python subprocess with sandboxed execution
- **Real-time:** Server-Sent Events (SSE)
