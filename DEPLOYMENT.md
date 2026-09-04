# CampusFlow — Deployment Guide

**Test status: 145 backend · 53 frontend · Build ✅ · docker compose config ✅**

---

## 🌐 Public HTTPS Deployment (Easiest — Render.com Free Tier)

Get a public HTTPS URL for CampusFlow in ~10 minutes, free, no credit card.

### Why Render?
- Free tier includes MongoDB, Redis, and web service
- Automatic HTTPS (free TLS certificate)
- Deploys from your GitHub repository
- No server management needed

### Step 1 — Push to GitHub

```powershell
cd C:\Users\tejav\Downloads\campusflow-phase2
git init
git add .
git commit -m "CampusFlow production deployment"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/campusflow.git
git push -u origin main
```

### Step 2 — Create MongoDB Atlas (free, permanent)

1. Go to https://cloud.mongodb.com → Sign up free
2. Create a free M0 cluster (any region)
3. Database Access → Add User → username `campusflow`, strong password → copy it
4. Network Access → Add IP Address → Allow from anywhere (`0.0.0.0/0`)
5. Connect → Connect your application → Copy the connection string:
   ```
   mongodb+srv://campusflow:<password>@cluster0.xxxxx.mongodb.net/CampusFlow?retryWrites=true&w=majority
   ```

### Step 3 — Deploy on Render

#### 3a — Create a Redis instance
1. render.com → New → Redis
2. Name: `campusflow-redis`, Region: your nearest, Plan: Free
3. After creation, copy the **Internal Redis URL**

#### 3b — Create the Backend Web Service
1. render.com → New → Web Service → Connect your GitHub repo
2. Settings:
   - **Name:** `campusflow-backend`
   - **Root Directory:** `backend`
   - **Build Command:** `npm ci --omit=dev`
   - **Start Command:** `node server.js`
   - **Plan:** Free
3. Environment Variables (add each):
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `MONGO_URI` | (your Atlas connection string from Step 2) |
   | `REDIS_ENABLED` | `true` |
   | `REDIS_URL` | (Internal Redis URL from Step 3a) |
   | `FRONTEND_URL` | `https://campusflow-frontend.onrender.com` (set after frontend is created) |
   | `EMAIL_ENABLED` | `true` |
   | `EMAIL_USER` | your Gmail address |
   | `EMAIL_PASS` | your Gmail App Password |
   | `EMAIL_FROM` | `CampusFlow <your@gmail.com>` |
   | `LOG_LEVEL` | `info` |

4. Click **Create Web Service** — wait for deploy
5. Copy the backend URL: `https://campusflow-backend.onrender.com`

#### 3c — Create the Frontend Static Site
1. render.com → New → Static Site → Connect your GitHub repo
2. Settings:
   - **Name:** `campusflow-frontend`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm ci && npm run build`
   - **Publish Directory:** `build`
3. Environment Variables:
   | Key | Value |
   |-----|-------|
   | `REACT_APP_API_URL` | (leave empty — Render handles routing, or use the backend URL) |
4. **Rewrite Rules** — Add one rule:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: Rewrite

   > This makes React Router work on page refresh.

5. Click **Create Static Site**
6. Copy the frontend URL: `https://campusflow-frontend.onrender.com`

#### 3d — Update FRONTEND_URL in backend
1. Go to your backend service on Render
2. Environment → Edit `FRONTEND_URL` → set to `https://campusflow-frontend.onrender.com`
3. Manual Deploy → Deploy latest

### Step 4 — Verify it works

```
https://campusflow-frontend.onrender.com         ← React app
https://campusflow-backend.onrender.com/health   ← {"status":"ok"}
https://campusflow-backend.onrender.com/ready    ← {"status":"ready","db":"connected"}
https://campusflow-backend.onrender.com/api/docs ← Swagger UI
```

### Step 5 — Create first admin

```bash
# On Render: go to backend service → Shell tab
node -e "
const mongoose=require('mongoose'),User=require('./models/User');
mongoose.connect(process.env.MONGO_URI).then(async()=>{
  const u=await User.findOneAndUpdate(
    {email:'your@email.com'},{role:'admin'},{new:true});
  console.log('Admin:',u?.email,u?.role); process.exit(0);
});"
```

---

## 🐳 Self-Hosted VPS Deployment (with public domain)

If you have a VPS (DigitalOcean, AWS, etc.) and a domain name:

### Quick start

```bash
# On your VPS:
git clone https://github.com/YOUR_USERNAME/campusflow.git
cd campusflow

# Create production env file
cp .env.production.example .env
nano .env  # fill in: MONGO_PASS, JWT_SECRET, FRONTEND_URL=https://your-domain.com, email

# Deploy with production settings
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Add Caddy for automatic HTTPS
sudo apt install caddy
cat > /etc/caddy/Caddyfile << 'EOF'
your-domain.com {
    reverse_proxy localhost:80
}
EOF
sudo systemctl reload caddy
```

Your app is live at `https://your-domain.com`

### What `docker-compose.prod.yml` changes vs local

| Setting | Local Docker | Production |
|---------|-------------|------------|
| `LOCAL_DOCKER` | `true` | `false` |
| Cookies | `secure:false, sameSite:lax` | `secure:true, sameSite:none` |
| Port binding | `80:80` exposed | Handled by reverse proxy |

---

## 📧 Gmail Email Notifications Setup

CampusFlow sends transactional emails via Gmail SMTP for all key events:
- Student submits request → faculty/HOD notified by email
- Faculty approves/rejects/escalates request → student notified
- Leave submitted → faculty/HOD notified
- Leave approved/rejected → student notified
- SLA breach → student + reviewer notified

Email runs **asynchronously via BullMQ** — if email fails, the request/leave operation and Socket.io in-app notification always succeed.

### Step 1 — Generate a Gmail App Password

> You MUST use an App Password, not your normal Gmail password.

1. Sign in to your Google Account: https://myaccount.google.com/security
2. Enable **2-Step Verification** (required)
3. Go to **Security → 2-Step Verification → App passwords** (at the bottom)
4. Select: App = **Mail**, Device = **Other** → type `CampusFlow`
5. Click **Generate** — copy the **16-character password** (no spaces)

### Step 2 — Add to root `.env`

Open `C:\Users\tejav\Downloads\campusflow-phase2\.env` and add:

```dotenv
# Gmail email notifications
EMAIL_ENABLED=true
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop
EMAIL_FROM=CampusFlow <your@gmail.com>
```

Replace `your@gmail.com` with your actual Gmail address and the 16-char App Password.

### Step 3 — Rebuild and restart the backend

```powershell
cd C:\Users\tejav\Downloads\campusflow-phase2
docker compose up --build -d backend
docker compose logs -f backend
```

Look for this line in the logs (confirms Gmail SMTP is working):
```
[Email] SMTP connection verified {"host":"smtp.gmail.com","port":587,"user":"your@gmail.com"}
```

If you see an error instead:
```
[Email] SMTP connection failed — emails will not send
```
Check that: 2-Step Verification is enabled, the App Password is correct, and `EMAIL_ENABLED=true`.

### Step 4 — Manually test a real email

```powershell
# Send a test email directly from the running container
docker compose exec backend node -e "
const e = require('./services/email.service');
e.sendEmail({
  to: 'your@gmail.com',
  subject: '[CampusFlow] Email test',
  html: '<p>Email notifications are working.</p>'
}).then(() => { console.log('Test email sent'); process.exit(0); });
"
```

Check your inbox. The email arrives from whatever you set in `EMAIL_FROM`.

### Security notes

- Credentials are only in `backend/.env` (gitignored) and `docker-compose.yml` env block (reads from `.env`)
- Credentials are never logged — only the username is logged for debugging, never the password
- Email failures are non-fatal — all other features work regardless
- Never commit `.env` to git (already in `.gitignore`)

---

## 🖥️ Local Docker Desktop (Windows) — Quick Start

Run CampusFlow locally using Docker Desktop. No VPS, no domain, no paid services needed.

### Prerequisites

- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) installed and running
- PowerShell or Windows Terminal

### Step 1 — Open PowerShell and go to project root

```powershell
cd C:\Users\tejav\Downloads\campusflow-phase2
```

### Step 2 — Check the root `.env` (already configured for local use)

```powershell
Get-Content .env
```

The defaults work out of the box for local Docker Desktop. To change any value:
```powershell
notepad .env
# or: code .env
```

To use a different port (if port 80 is busy):
```powershell
# In .env, set:  APP_PORT=8080
```

### Step 3 — Build and start all services

```powershell
# First time (or after code changes):
docker compose up --build -d

# After that (just start, no rebuild):
docker compose up -d
```

### Step 4 — Check all containers are healthy

```powershell
docker compose ps
```

Wait until all 4 show `running (healthy)`:
```
campusflow_backend   running (healthy)
campusflow_frontend  running (healthy)
campusflow_mongo     running (healthy)
campusflow_redis     running (healthy)
```

### Step 5 — Verify it works

```powershell
# Health check
Invoke-RestMethod http://localhost/health

# Readiness (checks MongoDB is connected)
Invoke-RestMethod http://localhost/ready
```

### Step 6 — Open the app

**http://localhost** — register, log in, and use all features.

### Step 7 — Create first admin (optional)

```powershell
# After registering at http://localhost/register:
docker compose exec backend node -e "
const mongoose=require('mongoose'), User=require('./models/User');
mongoose.connect(process.env.MONGO_URI).then(async()=>{
  const u=await User.findOneAndUpdate(
    {email:'your@email.com'},{role:'admin'},{new:true});
  console.log('Admin set:', u?.email, u?.role);
  process.exit(0);
});"
```

### Common commands

```powershell
# Live logs — all services
docker compose logs -f

# Backend logs only
docker compose logs -f backend

# Stop (data preserved)
docker compose down

# Stop and wipe all data (fresh start)
docker compose down -v

# Restart one service
docker compose restart backend

# Run backend tests inside container
docker compose exec backend npm test
```

### Local URLs

| What | URL |
|------|-----|
| App | http://localhost |
| API | http://localhost/api |
| Swagger docs | http://localhost/api/docs |
| Health | http://localhost/health |
| Readiness | http://localhost/ready |

### Troubleshooting

**Port 80 in use** — add `APP_PORT=8080` to root `.env`, then `docker compose up -d`. Access at `http://localhost:8080`.

**Auth not working** — the app uses `LOCAL_DOCKER=true` inside the container so cookies work over plain `http://localhost`. Do not change `NODE_ENV` in docker-compose without also setting `LOCAL_DOCKER=true`.

**Container won't start** — run `docker compose logs backend` to see the error.

**Fresh reset** — `docker compose down -v` then `docker compose up --build -d`.

---

## ☁️ Production Go-Live Guide

---

## Architecture

```
Internet
   │  HTTPS (port 443)
   ▼
[Caddy / nginx / Cloud LB]  ← terminates TLS
   │  HTTP (port 80)
   ▼
[nginx container]  ← serves React SPA, proxies /api + /socket.io
   │
   ▼
[Node.js backend]  ← Express + Socket.io + BullMQ workers
   ├── [MongoDB]    ← application data
   └── [Redis]      ← BullMQ job queue
```

---

## Step 1 — Server requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| RAM | 1 GB | 2 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 20 GB | 40 GB |
| Docker | 24+ | latest |
| Docker Compose | v2+ | latest |
| Open ports | 80, 443 | 80, 443 |

Install Docker on Ubuntu:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in
docker --version && docker compose version
```

---

## Step 2 — Clone the repository

```bash
git clone <your-repo-url> /opt/campusflow
cd /opt/campusflow
```

---

## Step 3 — Generate secrets

**Do this on your server — never share or commit these values.**

```bash
# JWT secret (required)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output: a3f8b2c1d4e5f6789abcdef0123456789abcdef0123456789abcdef012345

# MongoDB password (required)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# Example output: d4e5f6789abcdef0
```

---

## Step 4 — Create the production `.env` file

```bash
cp backend/.env.example backend/.env
nano backend/.env   # or use your preferred editor
```

Set these values — **every REQUIRED field must be filled**:

```dotenv
# ── REQUIRED ──────────────────────────────────────────────────────────────────
NODE_ENV=production
JWT_SECRET=<paste the 64-char hex from Step 3>
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/CampusFlow?retryWrites=true&w=majority
FRONTEND_URL=https://your-domain.com

# ── RECOMMENDED ───────────────────────────────────────────────────────────────
# Email notifications
EMAIL_ENABLED=true
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password        # Gmail: Settings → Security → App passwords
EMAIL_FROM=CampusFlow <noreply@your-domain.com>

# Redis (enabled in Docker Compose automatically via redis container)
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379

# ── OPTIONAL ──────────────────────────────────────────────────────────────────
# S3 storage (leave STORAGE_DRIVER=local for disk-based uploads)
STORAGE_DRIVER=local                 # or: s3
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# S3_BUCKET=campusflow-uploads
# AWS_REGION=us-east-1

# Logging
LOG_LEVEL=info

# Token lifetimes (defaults are fine for most deployments)
JWT_EXPIRES_IN=15m
JWT_REFRESH_IN=30d
```

---

## Step 5 — Create the `.compose.env` file (Docker Compose secrets)

These are used only by `docker-compose.yml` for MongoDB authentication.
Create this file next to `docker-compose.yml`:

```bash
cat > /opt/campusflow/.compose.env << 'EOF'
MONGO_USER=campusflow
MONGO_PASS=<paste the 32-char hex from Step 3>
JWT_SECRET=<same JWT_SECRET as in backend/.env>
FRONTEND_URL=https://your-domain.com
LOG_LEVEL=info
APP_PORT=80
EOF

chmod 600 /opt/campusflow/.compose.env
```

Then reference it in docker compose:
```bash
# Use --env-file when running compose commands:
docker compose --env-file .compose.env up --build -d
```

Or add to your shell environment (less secure):
```bash
export $(cat .compose.env | xargs)
docker compose up --build -d
```

---

## Step 6 — Build and start

```bash
cd /opt/campusflow

# Build images and start all services (detached)
docker compose --env-file .compose.env up --build -d

# Watch startup logs (wait for "MongoDB connected" and "running on port 5000")
docker compose logs -f backend

# All containers should show "healthy" or "running"
docker compose ps
```

Expected output:
```
NAME                     STATUS
campusflow_backend       running (healthy)
campusflow_frontend      running (healthy)
campusflow_mongo         running (healthy)
campusflow_redis         running (healthy)
```

---

## Step 7 — Verify health endpoints

```bash
# Liveness — should return {"status":"ok"}
curl -sf http://localhost/health && echo "HEALTH OK"

# Readiness — should return {"status":"ready","db":"connected"}
curl -sf http://localhost/ready && echo "READY OK"

# API root
curl http://localhost/api/
```

---

## Step 8 — HTTPS setup (choose one)

### Option A — Caddy (recommended, automatic TLS)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Create Caddyfile
cat > /etc/caddy/Caddyfile << 'EOF'
your-domain.com {
    reverse_proxy localhost:80
}
EOF

sudo systemctl reload caddy
```

### Option B — nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Configure nginx to proxy to port 80
sudo certbot --nginx -d your-domain.com

# Certbot auto-renews — verify:
sudo certbot renew --dry-run
```

### Option C — Cloudflare (zero-config TLS)

Set your domain's nameservers to Cloudflare, enable "Full (strict)" SSL mode.
Set `APP_PORT=80` in `.compose.env` — Cloudflare terminates TLS externally.

---

## Step 9 — DNS configuration

In your domain registrar's DNS settings:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `<your-server-IP>` | 300 |
| A | `www` | `<your-server-IP>` | 300 |

Wait for DNS propagation (usually 5–30 minutes):
```bash
dig +short your-domain.com
# Should return your server IP
```

---

## Step 10 — Create the first admin account

```bash
# 1. Register a normal account at https://your-domain.com/register
# 2. Then promote it to admin:
docker compose --env-file .compose.env exec backend \
  node -e "
const mongoose = require('mongoose');
const User = require('./models/User');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const result = await User.findOneAndUpdate(
    { email: 'your@email.com' },
    { role: 'admin' },
    { new: true }
  );
  console.log(result ? 'Admin set: ' + result.email : 'User not found');
  process.exit(0);
});
"
# 3. Log out and log back in — you now have admin access
```

---

## Step 11 — MongoDB backup (schedule this)

```bash
# Manual backup
docker compose --env-file .compose.env exec mongo mongodump \
  --username campusflow \
  --password "$MONGO_PASS" \
  --authenticationDatabase admin \
  --db CampusFlow \
  --out /tmp/backup-$(date +%Y%m%d-%H%M)

# Copy to host
docker cp campusflow_mongo:/tmp/backup-$(date +%Y%m%d-%H%M) /opt/campusflow/backups/

# Schedule daily backup with cron (add to crontab -e)
# 0 2 * * * cd /opt/campusflow && docker compose exec -T mongo mongodump \
#   --username campusflow --password YOUR_PASS --authenticationDatabase admin \
#   --db CampusFlow --archive > /opt/campusflow/backups/cf-$(date +\%Y\%m\%d).archive
```

---

## Step 12 — Verify cookies work over HTTPS

After HTTPS is set up, test authentication:
```bash
# Should set two HTTP-only cookies (token + refreshToken)
curl -c /tmp/cookies.txt -X POST https://your-domain.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"password123"}'

# Should return user data using the cookie
curl -b /tmp/cookies.txt https://your-domain.com/api/me
```

Cookies are `secure: true` + `sameSite: none` in production — they require HTTPS.

---

## Operations

### Common commands

```bash
# View live logs
docker compose logs -f

# Restart a service
docker compose restart backend

# Stop all services (data preserved)
docker compose down

# Update to new code
git pull
docker compose --env-file .compose.env up --build -d

# Run tests inside container
docker compose exec backend npm test
```

### Rollback

```bash
# Roll back to previous Git commit
git log --oneline -5
git checkout <previous-commit-sha>
docker compose --env-file .compose.env up --build -d
```

---

## Environment variable reference (complete)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | YES | development | Must be `production` |
| `JWT_SECRET` | YES | — | 64-char hex random string |
| `MONGO_URI` | YES | in-memory | MongoDB Atlas connection string |
| `FRONTEND_URL` | YES | localhost:3000 | Exact production domain with protocol |
| `PORT` | No | 5000 | Backend listen port |
| `JWT_EXPIRES_IN` | No | 15m | Access token lifetime |
| `JWT_REFRESH_IN` | No | 30d | Refresh token lifetime |
| `EMAIL_ENABLED` | No | false | true to send real emails |
| `EMAIL_HOST` | No | smtp.gmail.com | SMTP server |
| `EMAIL_PORT` | No | 587 | SMTP port (587=STARTTLS, 465=SSL) |
| `EMAIL_USER` | Email only | — | SMTP username |
| `EMAIL_PASS` | Email only | — | SMTP password/app-password |
| `EMAIL_FROM` | No | noreply@campusflow.edu | Sender address |
| `REDIS_ENABLED` | No | false | true when Redis available |
| `REDIS_URL` | No | redis://localhost:6379 | Redis connection string |
| `STORAGE_DRIVER` | No | local | local or s3 |
| `UPLOAD_DIR` | No | ./uploads | Upload directory path |
| `AWS_ACCESS_KEY_ID` | S3 only | — | S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | S3 only | — | S3 credentials |
| `S3_BUCKET` | S3 only | campusflow-uploads | S3 bucket name |
| `AWS_REGION` | S3 only | us-east-1 | AWS region |
| `AWS_ENDPOINT` | S3 only | — | Custom endpoint (MinIO/R2) |
| `STORAGE_SIGNED_URL_TTL` | No | 300 | Signed URL expiry (seconds) |
| `LOG_LEVEL` | No | info | debug/info/warn/error |
| `MONGO_USER` | Docker only | campusflow | MongoDB admin username |
| `MONGO_PASS` | Docker only | changeme | **Must be changed in production** |
| `APP_PORT` | Docker only | 80 | Host port exposed by nginx |

---

## CI/CD — GitHub Actions

Set these secrets in your repository → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `JWT_SECRET` | Any 32+ char string (CI uses it for integration tests) |

Pipeline runs on every push to `main` or `develop`:
1. Backend 131 tests
2. Frontend 53 tests
3. Production build + artifact upload
4. Docker image build (main branch only)

---

## Security notes

- `.env` is in `.gitignore` — never commit it
- Cookies: `httpOnly: true`, `secure: true` (prod), `sameSite: none` (prod with HTTPS)
- JWT access tokens expire in 15 minutes; refresh tokens in 30 days with rotation
- All role checks enforced on the backend — not just the frontend
- Rate limiting: 20 req/15min on auth endpoints, 200 req/min on all API endpoints
- `trust proxy 1` enables correct IP detection behind nginx
- Helmet security headers on all responses
- MongoDB passwords never logged; JWT secrets never logged
