# AI Social Media Automation SaaS

Full-stack SaaS starter for AI-assisted content generation, scheduling, queue management, and publishing to Facebook Page, X.com, YouTube, with a TikTok-ready provider module.

## Stack

- Frontend: Vue 3, Vite, TailwindCSS, Pinia, Vue Router, Chart.js
- Backend: Node.js, Express, MySQL, mysql2, node-cron
- Architecture: controllers, services, repositories, modules, jobs

## Quick Start

```bash
cp .env.example .env
npm run install:all
# Update DATABASE_URL in .env to match your local MySQL credentials.
npm run seed
npm run dev
```

Local MySQL setup:

```sql
CREATE DATABASE IF NOT EXISTS ai_social_automation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'tool_post'@'localhost' IDENTIFIED WITH mysql_native_password BY 'tool_post_password';
GRANT ALL PRIVILEGES ON ai_social_automation.* TO 'tool_post'@'localhost';
FLUSH PRIVILEGES;
```

If you use MariaDB and the previous `CREATE USER` syntax fails, use:

```sql
CREATE USER IF NOT EXISTS 'tool_post'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('tool_post_password');
```

Frontend: `http://localhost:5173`  
Backend API: `http://localhost:5000/api`

Demo login:

```text
email: creator@example.com
password: password123
```

## X.com Posting Setup

Create an app in the X Developer Portal, enable OAuth 2.0, and add this callback URL:

```text
http://localhost:5000/api/social/connect-x/callback
```

Required OAuth scopes:

```text
tweet.read tweet.write users.read offline.access
```

Then set:

```env
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
X_REDIRECT_URI=http://localhost:5000/api/social/connect-x/callback
```

After restarting the app, open `Nền tảng` and connect `X.com`.

## Production Notes

Social publishing is isolated in provider services:

- Meta Graph API: `server/src/services/social/facebook.service.js`
- X API v2: `server/src/services/social/x.service.js`
- YouTube Data API: `server/src/services/social/youtube.service.js`
- TikTok placeholder: `server/src/services/social/tiktok.service.js`

Set real OAuth credentials in `.env`, connect accounts through the API, and store encrypted tokens in production. The current implementation includes refresh-token flows where each provider supports it and clean fallback errors when credentials are missing.

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/dashboard`
- `POST /api/generate-content`
- `POST /api/schedule-post`
- `POST /api/publish-post`
- `GET /api/posts`
- `PATCH /api/posts/:id`
- `DELETE /api/posts/:id`
- `GET /api/social/accounts`
- `GET /api/social/connect-facebook`
- `GET /api/social/connect-x`
- `GET /api/social/connect-youtube`
- `GET /api/analytics`

## Folder Structure

```text
client/   Vue SaaS dashboard
server/   Express API, MySQL models, scheduler, social providers
```

## Scheduler Flow

1. User creates or generates content.
2. User selects platform and publish date.
3. `schedule.service` creates queued posts and schedules.
4. `node-cron` runs every minute, finds due schedules, calls publish services.
5. Publish result updates post status and writes logs.

## LDPlayer Mobile Automation

The `Mobile ảo` module controls LDPlayer through `ldconsole` and Android Debug Bridge.

Set these paths when they are not available in `PATH`:

```env
LDCONSOLE_PATH=C:\LDPlayer\LDPlayer9\ldconsole.exe
ADB_PATH=C:\LDPlayer\LDPlayer9\adb.exe
MOBILE_AUTOMATION_SECRET=change-me-to-a-long-random-mobile-secret
MOBILE_LAUNCH_WAIT_MS=8000
MOBILE_STEP_DELAY_MS=900
```

Each mobile account stores its LDPlayer instance, ADB target, Android package name, login credentials, and optional tap coordinates. The main workflow is remote control: open LDPlayer, connect ADB, view the emulator screenshot, click the screenshot to tap, send text, and use Home/Back/Enter controls. Batch login is still available for repeatable scripted runs.
Passwords are encrypted before being stored in account metadata and are never returned to the frontend.
