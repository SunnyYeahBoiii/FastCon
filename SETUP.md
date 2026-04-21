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

## Automated Setup

### Option 1: Interactive menu (recommended)

```bash
./start-application.sh
```

Choose from:
1. **Setup** — install deps + database
2. **Build + Start** — compile and launch (custom port)
3. **Full** — setup + build + start

### Option 2: Individual scripts

```bash
# Setup (auto-installs missing prerequisites)
./scripts/setup.sh

# Build + Start (prompts for port, default 3000)
./scripts/run.sh
```

### Option 3: npm commands

```bash
# All-in-one: setup + build + start
npm run deploy
```

Or step by step:

```bash
# 1. Install dependencies
npm install

# 2. Setup environment + database + seed data
npm run setup

# 3. Build for production
npm run build

# 4. Start production server
npm run start
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

# Run seed (creates admin + sample contests)
npx tsx prisma/seed.ts
```

### Step 4: Build

```bash
npm run build
```

### Step 5: Start production server

```bash
npm run start
```

Or development mode:

```bash
npm run dev
```

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
├── start-application.sh   # Interactive entry point
├── lib/
│   ├── db.ts             # Prisma client
│   ├── queue.ts          # Judge queue (in-memory + SQLite)
│   ├── judge.ts          # Python process spawner
│   ├── events.ts         # Event emitter for SSE
│   ├── session.ts        # Cookie-based session
│   ├── auth.ts           # Password hashing
│   ├── guard.ts          # Auth middleware guard
│   └── evaluateTemplates.ts  # Default evaluate template
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Seed script
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
npx tsx prisma/seed.ts
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
