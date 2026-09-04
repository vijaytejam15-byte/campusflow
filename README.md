# CampusFlow — Phase 2 + 3 (Production-Ready)

A production-grade University Request & Leave Management System.
**Test Status: 102 backend · 53 frontend · Build ✅**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7, Socket.io-client |
| Backend | Node.js 20, Express 5, Mongoose 9 |
| Database | MongoDB 7 (in-memory for dev, Atlas for prod) |
| Auth | JWT access token (15 min) + refresh token (30 days), HTTP-only cookies |
| Email | Nodemailer (async, graceful degradation in dev) |
| File storage | Multer — local disk (S3-ready swap) |
| Logging | Winston structured JSON logging |
| Security | Helmet, rate-limiting, bcrypt (cost 12) |
| API docs | Swagger UI at `/api/docs` |
| Container | Docker + docker-compose |
| CI/CD | GitHub Actions |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Actions CI                     │
│  backend-test → frontend-test → build → docker-build    │
└─────────────────────────────────────────────────────────┘

┌────────────┐   HTTPS    ┌──────────────────────────────┐
│  Browser   │ ────────► │  nginx (frontend container)  │
└────────────┘           │  port 80                     │
                         │  serves React SPA            │
                         │  proxies /api → backend      │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │  Node.js backend (port 5000) │
                         │  Express + Socket.io         │
                         │  JWT auth (cookie)           │
                         │  Rate limiting + Helmet      │
                         └──────┬───────────┬───────────┘
                                │           │
                    ┌───────────▼──┐   ┌────▼────────┐
                    │  MongoDB 7   │   │  uploads/   │
                    │  (container) │   │  (volume)   │
                    └──────────────┘   └─────────────┘
```

---

## Features

### Authentication (Upgraded)
- Register/login with JWT access token (15 min) + refresh token (30 days)
- **Transparent token refresh** — middleware auto-issues new access token from valid refresh cookie; frontend never has to handle rotation
- **Refresh token rotation** — each refresh invalidates old token, issues new pair
- **Logout all sessions** — `POST /api/logout-all` revokes every active session for the user
- Refresh tokens stored hashed (SHA-256) in MongoDB with TTL auto-expiry
- HTTP-only cookies for all tokens (XSS-safe)

### Core Request Workflow
- 4 roles: student · faculty · HOD · admin
- 7 request types with SLA, priority, comments, file attachments
- Auto-escalation job every 15 min for SLA breaches
- Real-time Socket.io notifications

### Leave Management
- Apply for leave with type, dates, reason, document upload
- Working-days auto-calculation (weekends excluded)
- Staff review queue with approve/reject modal
- Admin leave type management and leave reports

### Email Notifications
- Request submitted → student confirmation + reviewer alert
- Request approved/rejected/escalated → student email
- SLA breached → student + reviewer email
- Leave submitted/approved/rejected → student email
- All emails sent asynchronously (never blocks request handling)
- Graceful degradation — `EMAIL_ENABLED=false` logs instead of sending (safe for dev)

### File Uploads
- Multer middleware with MIME validation (PDF, Word, images, text)
- Max 5 MB per file, max 5 files per request
- UUID filenames to prevent collisions and path traversal
- S3-ready — swap `storageEngine` in `middleware/upload.js` without route changes

### Structured Logging (Winston)
- JSON logs in production, coloured readable logs in development
- HTTP access log on every request (method, path, status, duration, IP)
- Errors logged with stack trace, method, and path
- Sensitive data (passwords, tokens) never logged

### Health & Readiness Endpoints
- `GET /health` — liveness probe (always 200 if process alive, returns uptime)
- `GET /ready` — readiness probe (checks MongoDB connection state)

### Analytics & Admin
- Admin analytics dashboard with SVG charts
- Leave reports with KPI cards and bar charts
- Audit logs, manage users/departments/leave-types

---

## Getting Started

### Prerequisites
- Node.js 20+, npm 9+
- Docker + Docker Compose (for containerised setup)

### Local development (without Docker)

```bash
# Backend
cd backend
cp .env.example .env      # fill in JWT_SECRET
npm install
npm run dev               # port 5000, nodemon

# Frontend
cd frontend
npm install
npm start                 # port 3000
```

API docs: http://localhost:5000/api/docs

### Docker (recommended for production testing)

```bash
# 1. Set secrets
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET at minimum

# 2. Start all services
docker-compose up --build

# App available at http://localhost
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | — | 32+ char random string for signing tokens |
| `JWT_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_IN` | No | `30d` | Refresh token lifetime |
| `MONGO_URI` | Prod only | in-memory | MongoDB connection string |
| `PORT` | No | `5000` | Backend port |
| `FRONTEND_URL` | No | `http://localhost:3000` | CORS + cookie origin |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `EMAIL_ENABLED` | No | `false` | Set to `true` to send real emails |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP host |
| `EMAIL_PORT` | No | `587` | SMTP port |
| `EMAIL_USER` | Email only | — | SMTP username |
| `EMAIL_PASS` | Email only | — | SMTP password / app password |
| `EMAIL_FROM` | No | `noreply@campusflow.edu` | Sender address |
| `UPLOAD_DIR` | No | `./uploads` | File upload directory |
| `MAX_FILE_SIZE_MB` | No | `5` | Max file size in MB |
| `MAX_FILES` | No | `5` | Max files per request |
| `LOG_LEVEL` | No | `debug` | `debug\|info\|warn\|error` |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend URL for production. Empty = dev proxy. |

---

## API Overview

Full interactive docs at `http://localhost:5000/api/docs`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | /api/register | — | Register |
| POST | /api/login | — | Login (sets access + refresh cookies) |
| POST | /api/refresh | any | Rotate refresh token, issue new access token |
| GET | /api/me | any | Current session user |
| POST | /api/logout | any | Logout current session |
| POST | /api/logout-all | any | Revoke ALL sessions |
| GET/PUT | /api/profile | any | Profile |
| GET/POST/PUT/DELETE | /api/courses | any | Courses |
| GET/POST/PUT/DELETE | /api/requests | student | Requests |
| GET | /api/requests/pending | faculty/hod/admin | Review queue |
| PATCH | /api/requests/:id/status | faculty/hod/admin | Update status |
| POST | /api/requests/:id/comment | any | Add comment |
| GET | /api/leave-types | any auth | Active leave types |
| POST/PATCH/DELETE | /api/leave-types | admin | Manage leave types |
| POST | /api/leave | student | Apply for leave |
| GET | /api/leave | student | My leaves |
| GET | /api/leave/:id | any auth | Single leave |
| PATCH | /api/leave/:id/cancel | student | Cancel pending |
| POST | /api/leave/:id/comment | any | Add comment |
| GET | /api/leave/staff/queue | faculty/hod/admin | Leave queue |
| PATCH | /api/leave/:id/review | faculty/hod/admin | Approve/reject |
| GET | /api/leave/admin/all | admin | All leaves |
| GET | /api/leave/admin/stats | admin | Leave statistics |
| GET | /api/admin/metrics | admin | System metrics |
| GET | /api/admin/analytics | admin | Full analytics |
| GET/POST | /api/admin/users | admin | Users |
| PATCH | /api/admin/users/:id/role | admin | Change role |
| DELETE | /api/admin/users/:id | admin | Delete user |
| GET | /api/admin/audit-logs | admin | Audit log |
| GET | /api/admin/requests | admin | All requests |
| GET | /health | — | Liveness probe |
| GET | /ready | — | Readiness probe |
| GET | /api/docs | — | Swagger UI |

---

## Running Tests

```bash
# Backend — 102 integration tests
cd backend && npm test

# Frontend — 53 component tests
cd frontend && npm test -- --watchAll=false

# Production build
cd frontend && npm run build
```

---

## CI/CD (GitHub Actions)

Pipeline at `.github/workflows/ci.yml`:

1. **backend-test** — Runs 102 Jest tests (mongodb-memory-server, no real DB needed)
2. **frontend-test** — Runs 53 React Testing Library tests
3. **frontend-build** — Production build, uploads artifact
4. **docker-build** — Builds both Docker images (runs on `main` branch only)

Required GitHub secret: `JWT_SECRET`

---

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set a strong, unique `JWT_SECRET` (32+ chars)
- [ ] Set `MONGO_URI` (MongoDB Atlas or self-hosted)
- [ ] Set `FRONTEND_URL` to your deployed domain
- [ ] Set `EMAIL_ENABLED=true` and configure SMTP
- [ ] Set `REACT_APP_API_URL` in frontend env (if separate domains)
- [ ] HTTPS required — cookies use `secure: true` + `sameSite: none` in production
- [ ] Persistent Docker volume for `uploads/`
- [ ] MongoDB backups configured
- [ ] Run `docker-compose up --build` or deploy to Railway/Render/AWS ECS

---

## Project Structure

```
campusflow-phase2/
├── .github/workflows/ci.yml    ← GitHub Actions CI
├── docker-compose.yml          ← Production Docker stack
├── backend/
│   ├── config/         db.js, swagger.js, logger.js
│   ├── jobs/           escalation.job.js
│   ├── middleware/      auth.js, errorHandler.js, upload.js
│   ├── models/          User, Course, Request, Leave, LeaveType, RefreshToken
│   ├── routes/          auth, profile, courses, requests, admin, leave, leaveType
│   ├── services/        email.service.js
│   ├── socket/          socketHandler.js
│   ├── tests/           app.test.js (102 tests)
│   ├── utils/           publicUser, token, validators
│   ├── Dockerfile
│   └── server.js
└── frontend/
    ├── src/
    │   ├── components/  shared UI (StatusBadge, SLABadge, Timeline, etc.)
    │   ├── pages/       admin, faculty, student
    │   ├── services/    requestService, adminService, leaveService, notificationService
    │   └── App.test.js  (53 tests)
    ├── Dockerfile
    ├── nginx.conf
    └── package.json
```

---

## License

MIT
