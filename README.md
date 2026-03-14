# Oversight - DevOps Monitoring Dashboard

Production-ready monitoring dashboard with intelligent Hermes notification layer, built on Next.js 16 with real-time updates.

## Features

- **Real-time Dashboard**: Live monitoring of GitHub repos, Vercel deployments, and Supabase health
- **Security Scanning**: Automated vulnerability detection, secret scanning, and code analysis  
- **Intelligent Notifications**: Hermes AI agent triages alerts and sends smart Telegram notifications
- **Webhook Integration**: HMAC-verified GitHub/Vercel webhooks with automatic event processing
- **Health Monitoring**: Comprehensive service health checks with automatic alerting

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FImightbeRafa%2Foversight)

### 1. Setup Supabase

```bash
# Run the migration to create tables
psql "postgresql://user:pass@host:port/db" -f supabase/migrations/001_initial.sql
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN` (with repo access)
- `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` (for notifications)

### 3. Deploy to Vercel

```bash
npm install
npm run build
vercel --prod
```

### 4. Configure Webhooks

**GitHub:**
- Go to repo Settings > Webhooks
- URL: `https://your-app.vercel.app/api/webhooks/github`
- Secret: Set `GITHUB_WEBHOOK_SECRET` in environment
- Events: Push, Pull Request, Issues

**Vercel:**
- Go to Project Settings > Webhooks  
- URL: `https://your-app.vercel.app/api/webhooks/vercel`
- Secret: Set `VERCEL_WEBHOOK_SECRET` in environment

## Architecture

```
Next.js 16 App Router
├── /api/webhooks/         # GitHub/Vercel webhook handlers
├── /api/cron/             # Vercel cron jobs
│   ├── health             # Service health checks (5m)
│   ├── security           # Security scans (6h)
│   └── notifications      # Smart notifications (2m)
├── /api/health/           # Health check endpoints
└── /dashboard             # Real-time monitoring UI
```

## Hermes AI Integration

The dashboard includes an intelligent notification layer powered by Hermes Agent:

- **Alert Triaging**: AI analyzes security findings and prioritizes alerts
- **Smart Notifications**: Context-aware Telegram messages with actionable insights
- **Automated Response**: Basic issue handling and escalation workflows

## Security

- HMAC signature verification for all webhooks
- Supabase Row Level Security (RLS) policies
- Secure token management with service role keys
- Input validation and sanitization

## Monitoring Scope

- **GitHub**: Repos, commits, PRs, issues, security alerts
- **Vercel**: Deployments, functions, domains, analytics
- **Supabase**: Database health, API response times, storage usage
- **Security**: CVE scanning, secret detection, dependency analysis

---

Built for autonomous DevOps monitoring with AI-powered insights.