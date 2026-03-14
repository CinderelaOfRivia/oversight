# Oversight Deployment Guide

This guide walks you through deploying the Oversight monitoring dashboard to production.

## Prerequisites

- Node.js 18+ and npm
- Vercel CLI (`npm i -g vercel`)
- Supabase account
- GitHub personal access token
- Vercel account

## Step 1: Supabase Setup

1. **Create new Supabase project**
   ```bash
   # Go to https://supabase.com/dashboard
   # Create new project
   # Note down: Project URL, anon key, service_role key
   ```

2. **Run database migration**
   - Copy the contents of `supabase/migrations/001_initial.sql`
   - Paste into Supabase SQL Editor
   - Execute the migration

3. **Enable Realtime**
   - Go to Database → Replication
   - Enable for `events` and `alerts` tables

## Step 2: GitHub Configuration

1. **Create GitHub Personal Access Token**
   ```bash
   # Go to GitHub → Settings → Developer settings → Personal access tokens
   # Generate new token (classic) with scopes:
   # - repo (full access)
   # - security_events
   # - admin:repo_hook
   ```

2. **Add repositories to monitor**
   - Update the sample data in the migration script
   - Or manually insert into `projects` table after deployment

## Step 3: Local Development Setup

1. **Clone and setup**
   ```bash
   cd oversight/
   ./scripts/setup.sh
   ```

2. **Configure environment**
   ```bash
   # Update .env.local with your values:
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   GITHUB_TOKEN=ghp_your_github_token
   GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
   
   VERCEL_TOKEN=your_vercel_token
   VERCEL_WEBHOOK_SECRET=your_vercel_webhook_secret
   
   CRON_SECRET=your_secure_random_string
   
   # Optional: Telegram notifications
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   ```

3. **Test locally**
   ```bash
   npm run dev
   # Visit http://localhost:3000
   ```

## Step 4: Vercel Deployment

1. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

2. **Configure environment variables in Vercel**
   ```bash
   # Set all environment variables from .env.local in Vercel dashboard
   # Or use CLI:
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   vercel env add GITHUB_TOKEN
   vercel env add GITHUB_WEBHOOK_SECRET
   vercel env add VERCEL_TOKEN
   vercel env add VERCEL_WEBHOOK_SECRET
   vercel env add CRON_SECRET
   # Optional:
   vercel env add TELEGRAM_BOT_TOKEN
   vercel env add TELEGRAM_CHAT_ID
   ```

3. **Redeploy with environment variables**
   ```bash
   vercel --prod
   ```

## Step 5: Webhook Configuration

### GitHub Webhooks

For each repository you want to monitor:

1. Go to repository → Settings → Webhooks
2. Add webhook:
   - **Payload URL**: `https://your-domain.vercel.app/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Use the same value as `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Send me everything" or specific events:
     - Push events
     - Workflow runs
     - Deployment statuses
     - Security advisories
     - Check runs
     - Issues (optional)

### Vercel Webhooks

For each Vercel project you want to monitor:

1. Go to Vercel project → Settings → Git → Deploy Hooks
2. Add webhook:
   - **URL**: `https://your-domain.vercel.app/api/webhooks/vercel`
   - Include secret in headers if supported, or validate via Vercel signature

## Step 6: Telegram Notifications (Optional)

1. **Create Telegram bot**
   ```bash
   # Message @BotFather on Telegram
   # Send: /newbot
   # Follow instructions to get bot token
   ```

2. **Get chat ID**
   ```bash
   # Add bot to your chat/channel
   # Send a message, then visit:
   # https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   # Find your chat ID in the response
   ```

3. **Test notifications**
   ```bash
   curl -X POST "https://your-domain.vercel.app/api/hermes/notify" \
        -H "Authorization: Bearer your_cron_secret" \
        -H "Content-Type: application/json"
   ```

## Step 7: Monitoring Verification

1. **Test webhook endpoints**
   ```bash
   # GitHub webhook health
   curl https://your-domain.vercel.app/api/webhooks/github
   
   # Vercel webhook health  
   curl https://your-domain.vercel.app/api/webhooks/vercel
   
   # Hermes service health
   curl https://your-domain.vercel.app/api/hermes/notify
   ```

2. **Verify cron jobs**
   - Cron jobs run automatically on Vercel
   - Check Vercel Functions logs for execution
   - Monitor dashboard for health check events

3. **Test security scanning**
   ```bash
   curl -X GET "https://your-domain.vercel.app/api/cron/security" \
        -H "Authorization: Bearer your_cron_secret"
   ```

## Step 8: Authentication Setup

1. **Configure Supabase Auth**
   - Go to Supabase → Authentication → Settings
   - Configure your preferred auth provider
   - Update site URL to your Vercel domain

2. **Create admin user**
   - Sign up through the dashboard
   - Or create user in Supabase auth panel

## Scheduled Tasks

The following automated tasks run on your deployment:

| Task | Frequency | Purpose |
|------|-----------|---------|
| Supabase Health Check | Every 5 minutes | Monitor database performance and errors |
| Security Scan | Every 6 hours | Scan repositories for vulnerabilities |
| Hermes Notifications | Every 2 minutes | Process and send intelligent alerts |

## Troubleshooting

### Common Issues

1. **Webhooks not working**
   - Check webhook secrets match environment variables
   - Verify URLs are correct (include `/api` prefix)
   - Check Vercel function logs

2. **Database connection issues**
   - Verify Supabase URL and keys
   - Check RLS policies are configured
   - Ensure service_role key has proper permissions

3. **Telegram notifications not working**
   - Verify bot token and chat ID
   - Check bot is added to target chat
   - Test with curl command

4. **Cron jobs not running**
   - Ensure vercel.json is configured correctly
   - Check Vercel dashboard for cron execution logs
   - Verify CRON_SECRET is set

### Health Checks

Monitor these endpoints for system health:

- `GET /api/webhooks/github` - GitHub webhook status
- `GET /api/webhooks/vercel` - Vercel webhook status  
- `GET /api/hermes/notify` - Hermes service status

## Security Notes

- All webhook payloads are verified using HMAC signatures
- Database uses Row Level Security (RLS)
- Cron endpoints require secret authorization
- Sensitive tokens are stored as environment variables
- All communications use HTTPS

## Next Steps

After deployment:

1. 📊 Monitor the dashboard for incoming events
2. 🔔 Configure notification preferences in Hermes
3. 🔧 Customize alert triaging rules as needed
4. 📈 Add more repositories and Vercel projects
5. 🤖 Extend Hermes with additional notification channels

For issues or questions, check the logs in Vercel Functions dashboard.