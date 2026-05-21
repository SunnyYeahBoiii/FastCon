# FastCons

FastCons là hệ thống quản lý và chấm điểm contest nội bộ cho các bài nộp dạng `.pkl`. Ứng dụng cho phép admin tạo contest, cấu hình ground truth và mã chấm điểm Python, contestant nộp file, theo dõi trạng thái chấm điểm bất đồng bộ và xem leaderboard.

## Tổng quan

FastCons được tách thành hai runtime chính:

- `apps/web`: ứng dụng Next.js App Router phục vụ giao diện, auth/session, admin CRUD, Prisma và các route handler public.
- `apps/api`: FastAPI service nội bộ phụ trách upload streaming/chunked upload, hàng đợi submission, worker chấm điểm, SSE/broadcast và leaderboard API.

Trang web mặc định chạy tại `http://localhost:3000`. FastAPI nội bộ chạy tại `http://127.0.0.1:8010` và thường được gọi thông qua Next.js proxy/rewrite.

## Tính năng chính

- Đăng nhập bằng username/password với hai vai trò: `admin` và `contestant`.
- Contestant xem danh sách contest, nộp file `.pkl`, xem lịch sử/trạng thái submission, leaderboard và đổi mật khẩu cá nhân.
- Admin quản lý contest, user, submission, deadline, status, giới hạn nộp bài mỗi ngày, ground truth và evaluate code.
- Upload hỗ trợ Flow.js/chunked upload, theo dõi tiến độ, reserve submission trước khi đầy đủ file.
- Submission được chấm bất đồng bộ bằng worker Python và script judge riêng.
- Leaderboard lấy điểm từ submission đã chấm mới nhất của contestant trong từng contest.
- Quota 24 giờ phân biệt rõ submission đang chờ chấm, đã tính quota và đã refund.

## Kiến trúc runtime

```text
Browser
  |
  | pages, auth, admin CRUD, public route handlers
  v
Next.js web app (:3000)
  | \
  |  \ Prisma -> dev.db
  |
  | /api/submissions/* streams request body
  | /api/leaderboard/* middleware rewrite
  v
FastAPI internal API (:8010)
  |
  | worker queue + judge subprocess
  v
storage/submissions + storage/testdata
```

Trang, form và route handler thường nằm trong Next.js. Các request submission đi qua `apps/web/app/api/submissions/*` để stream body sang FastAPI bằng `FASTAPI_INTERNAL_URL`. Leaderboard API được rewrite từ `apps/web/middleware.ts` sang service nội bộ.

State dùng chung:

- SQLite database: `dev.db`
- Thư mục runtime: `storage/`
- File submission: `storage/submissions/`
- Ground truth/test assets: `storage/testdata/`

## Luồng submission

1. Contestant chọn contest và nộp file `.pkl`.
2. Web app tạo/reserve submission và forward upload sang FastAPI.
3. FastAPI validate tên file, nhận stream/chunk, merge file nếu cần và cập nhật tiến độ upload.
4. Submission hoàn tất upload được đưa vào worker queue.
5. Worker chạy judge subprocess với evaluate code và ground truth của contest.
6. Kết quả chấm điểm cập nhật vào database, broadcast về client và hiển thị trên leaderboard.

Quy tắc domain quan trọng:

- Leaderboard score là điểm của submission `graded` mới nhất, không phải điểm cao nhất.
- `Số lần nộp` trên leaderboard là số submission đã chấm thành công, không phải quota đã dùng.
- Submission failed được refund quota.
- Submission đang upload/đang chấm vẫn tính vào quota cho đến khi graded hoặc failed.
- Admin rejudge không tạo submission mới và không đổi quota usage state.

## Công nghệ chính

- Monorepo npm workspace + Turborepo.
- Next.js `13.5.11`, React `18.2`, TypeScript, Tailwind CSS.
- Prisma `5.22` với SQLite.
- FastAPI, Uvicorn, aiosqlite, python-multipart.
- CodeMirror cho editor evaluate code.
- Flow.js cho chunked upload.

## Cấu trúc thư mục

```text
fast-con/
├── apps/
│   ├── web/
│   │   ├── app/                 # Pages, layouts và route handlers
│   │   ├── components/          # UI components dùng chung
│   │   ├── lib/                 # Auth, session, db, config, quota helpers
│   │   ├── prisma/              # Schema, migrations, seed
│   │   └── middleware.ts        # Rewrite đến FastAPI
│   └── api/
│       ├── backend/             # FastAPI app, repositories, worker, streams
│       ├── scripts/             # judge_runner.py và helper scripts
│       ├── tests/               # Python tests
│       └── requirements.txt
├── packages/
│   ├── eslint-config/
│   └── typescript-config/
├── scripts/                     # Setup và compatibility wrappers
├── deploy/nginx/                # Cấu hình nginx tham khảo
├── storage/                     # Runtime files, tạo bởi setup
├── first-run.sh                 # Bootstrap lần đầu
├── start-application.sh         # Start cả web và API
├── package.json
└── turbo.json
```

## Yêu cầu môi trường

- Node.js `>=16.14.0`
- npm `>=8.0.0`
- Python 3 với `venv`

Trên Debian/Ubuntu có `apt-get`, script setup có thể tự cài Node.js 16 và `python3-venv` nếu thiếu.

## Khởi chạy nhanh

Lần đầu trên máy mới hoặc clone mới:

```bash
./first-run.sh
./start-application.sh
```

Sau khi start:

- Web app: `http://localhost:3000`
- FastAPI nội bộ: `http://127.0.0.1:8010`

Tài khoản admin mặc định nếu để trống prompt password lúc setup:

```text
username: admin
password: admin123
```

Nếu đã nhập password khác trong `./first-run.sh`, seed sẽ dùng password đó cho user `admin`.

## Lệnh phát triển

```bash
npm run setup             # Chạy scripts/setup.sh
npm run dev               # Chạy dev tasks qua Turborepo
npm run dev:web           # Chạy Next.js tại port 3000
npm run dev:api           # Chạy FastAPI tại port 8010
npm run build             # Build/compile tất cả workspace
npm run lint              # ESLint cho workspace có lint
npm run check-types       # TypeScript/compile checks
npm run prisma:generate   # Generate Prisma client
npm run db:push           # Push Prisma schema vào SQLite
npm run seed              # Seed admin/sample data
npm start                 # Wrapper cho start-application.sh
```

Một số lệnh workspace trực tiếp:

```bash
npm --workspace @repo/web run db:reset
npm --workspace @repo/web run start
npm --workspace @repo/api run start
```

## Cấu hình môi trường

`./first-run.sh` và `npm run setup` tạo hai file env đồng bộ:

- `apps/web/.env.local`
- `apps/api/.env.local`

Biến quan trọng:

| Biến | Mục đích |
| --- | --- |
| `DATABASE_URL` | SQLite database dùng chung |
| `STORAGE_ROOT` | Thư mục runtime dùng chung |
| `FASTAPI_INTERNAL_URL` | Địa chỉ FastAPI nội bộ để Next.js proxy/rewrite |
| `NEXT_PUBLIC_FASTAPI_PUBLIC_URL` | Base URL public tùy chọn cho browser |
| `PYTHON_BIN` | Python interpreter trong `.venv` |
| `WORKER_POLL_MS` | Chu kỳ worker poll queue |
| `WORKER_MAX_CONCURRENT` | Số job judge tối đa chạy đồng thời |
| `JUDGE_TIMEOUT_SECONDS` | Timeout mỗi lần chấm |
| `PENDING_UPLOAD_TIMEOUT_SECONDS` | Thời gian tối đa cho reserved upload trước khi failed/refund |
| `SEED_ADMIN_PASSWORD` | Password dùng khi seed admin |

`UPLOAD_DIR` và `MAX_CONCURRENT_JUDGES` vẫn được ghi để giữ tương thích với code cũ.

## Data model

Schema Prisma nằm tại `apps/web/prisma/schema.prisma`.

- `User`: tài khoản admin/contestant.
- `Contest`: bài contest, deadline, status, evaluate code, ground truth, daily submission limit.
- `Submission`: file nộp, trạng thái upload/chấm điểm, score, metrics, quota usage state.
- `SubmissionQuotaWindow`: cửa sổ quota 24 giờ theo user và contest.

## File nên đọc khi tiếp tục phát triển

- `CONTEXT.md`: ngôn ngữ domain và các quy tắc nghiệp vụ quan trọng.
- `SETUP.md`: giải thích chi tiết hơn về setup/start scripts.
- `apps/web/prisma/schema.prisma`: source of truth của database.
- `apps/api/backend/main.py`: FastAPI endpoints cho upload, submission và leaderboard.
- `apps/api/backend/worker.py`: worker chấm điểm.
- `apps/api/scripts/judge_runner.py`: logic chạy evaluate code.
