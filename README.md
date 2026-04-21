# FastCons

Contest evaluation platform with real-time judging.

## Quick Start

```bash
# All-in-one: choose setup, build+start, or full
./start-application.sh
```

Or step by step:

```bash
# Setup (auto-installs Node.js, Python, pip, npm if missing)
./scripts/setup.sh

# Build + Start (with custom port)
./scripts/run.sh
```

npm commands:

```bash
npm run setup   # install deps + setup DB + seed
npm run build   # build for production
npm run start   # start production server
npm run deploy  # setup + build + start
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
