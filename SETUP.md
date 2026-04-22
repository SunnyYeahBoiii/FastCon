# FastCons — Setup & Run Guide

Contest evaluation platform. Next.js 16 + Prisma + SQLite + Python judge.

## Requirements

| Tool | Version | Auto-installed |
|------|---------|----------------|
| Node.js | >= 20 | Yes (via brew/apt/yum/dnf/pacman) |
| Python | >= 3.9 | Yes (via brew/apt/yum/dnf/pacman) |
| npm | >= 10 | Yes (via package manager) |
| numpy | latest | Yes (via pip3) |
| pandas | latest | Yes (via pip3) |

## First-Time Setup

### Option 1: All-in-one (recommended)

```bash
./first-run.sh
```

Auto-installs missing prerequisites, creates admin account, builds, and starts server.

### Option 2: Step by step

```bash
# 1. Setup (auto-installs missing prerequisites, creates admin + DB)
./scripts/setup.sh

# 2. Build + Start (prompts for port, default 3000)
./scripts/run.sh
```

## Subsequent Runs

```bash
./start-application.sh
```

Builds and starts the server. Prompts for custom port.

## npm Commands

```bash
npm run build   # build for production
npm run start   # start production server
npm run dev     # development server with hot reload
```

Open http://localhost:3000 (or your custom port)

## Manual Setup Steps

If the automated script fails, follow these steps:

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` if needed. Defaults work for local development.

### Step 3: Database

```bash
# Push schema to SQLite
npx prisma db push

# Create admin account
npx tsx prisma/seed.ts --admin-only
```

### Step 4: Build

```bash
npm run build
```

### Step 5: Start server

```bash
npm run start
```

Open http://localhost:3000 (or your custom port)

## Default Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |

## Project Structure

```
fast-con/
├── app/                    # Next.js App Router
│   ├── (root)/            # Public pages (user)
│   │   ├── submit/        # Submit page
│   │   ├── leaderboard/   # Leaderboard
│   │   ├── profile/       # User profile page
│   │   └── login/         # Login
│   ├── admin/             # Admin panel
│   │   ├── contests/      # Contest management
│   │   ├── submissions/   # Submission review
│   │   └── users/         # User management
│   └── api/               # API routes
│       ├── submissions/   # Submission + SSE stream
│       ├── leaderboard/   # Leaderboard + SSE stream
│       └── contests/      # Contest CRUD
├── components/            # React components
├── scripts/
│   ├── setup.sh           # Auto-setup script
│   ├── run.sh             # Build + start with custom port
│   └── judge_runner.py    # Python evaluation runner
├── first-run.sh           # First-time: setup + build + start
├── start-application.sh   # Build + start (subsequent runs)
├── lib/
│   ├── db.ts             # Prisma client
│   ├── queue.ts          # Judge queue (in-memory + SQLite)
│   ├── judge.ts          # Python process spawner with concurrency limit
│   ├── events.ts         # Event emitter for SSE
│   ├── session.ts        # Cookie-based session
│   ├── auth.ts           # Password hashing
│   ├── guard.ts          # Auth middleware guard
│   └── evaluateTemplates.ts  # Default evaluate template
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Seed script (admin only)
└── proxy.ts              # CORS proxy middleware
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | file:./dev.db | SQLite database path |
| MAX_CONCURRENT_JUDGES | 3 | Max parallel judge processes |
| PYTHON_BIN | python3 | Python executable path |
| ADMIN_EMAIL | admin@example.com | Default admin email |
| ADMIN_PASSWORD | admin123 | Default admin password |
| UPLOAD_DIR | ./storage/submissions | Uploaded files directory |
| CORS_ORIGIN | - | Allowed CORS origin (for ngrok) |

### Ngrok (External Access)

```bash
# Start ngrok
ngrok http 3000

# Set CORS origin in .env.local
CORS_ORIGIN="https://xxxx.ngrok-free.app"
```

## Troubleshooting

### Python not found
```bash
# Check Python path
which python3

# Set in .env.local if different
PYTHON_BIN="/path/to/python3"
```

### Database locked
```bash
# Reset database
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts --admin-only
```

### Port already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill
```

### Judge process fails
```bash
# Test Python judge directly
python3 scripts/judge_runner.py <submission_id>
```
