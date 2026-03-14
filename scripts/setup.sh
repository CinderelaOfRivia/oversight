#!/bin/bash
# Oversight Dashboard Setup Script
# Sets up Supabase project, environment, and webhook configurations

set -e

echo "🎯 Oversight Dashboard Setup"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install Node.js and npm.${NC}"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ git is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Step 2: Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

# Step 3: Environment setup
echo -e "${BLUE}Setting up environment configuration...${NC}"

if [ ! -f .env.local ]; then
    echo -e "${YELLOW}Creating .env.local file...${NC}"
    cp .env.local.example .env.local
    
    echo -e "${YELLOW}⚠️  Please configure the following in .env.local:${NC}"
    echo "1. Supabase URL and keys"
    echo "2. GitHub token and webhook secret"  
    echo "3. Vercel token and webhook secret"
    echo "4. CRON secret for automated jobs"
    echo "5. Optional: Telegram bot configuration"
    echo ""
    echo "Open .env.local and update the configuration, then run this script again."
    exit 1
else
    echo -e "${GREEN}✅ .env.local exists${NC}"
fi

# Step 4: Validate environment
echo -e "${BLUE}Validating environment configuration...${NC}"

source .env.local

missing_vars=()

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then missing_vars+=("NEXT_PUBLIC_SUPABASE_URL"); fi
if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then missing_vars+=("NEXT_PUBLIC_SUPABASE_ANON_KEY"); fi
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then missing_vars+=("SUPABASE_SERVICE_ROLE_KEY"); fi
if [ -z "$GITHUB_TOKEN" ]; then missing_vars+=("GITHUB_TOKEN"); fi
if [ -z "$CRON_SECRET" ]; then missing_vars+=("CRON_SECRET"); fi

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing required environment variables:${NC}"
    printf '%s\n' "${missing_vars[@]}"
    echo ""
    echo "Please configure these in .env.local and run the script again."
    exit 1
fi

echo -e "${GREEN}✅ Environment configuration validated${NC}"

# Step 5: Test database connection
echo -e "${BLUE}Testing Supabase connection...${NC}"

# Create a simple test script to verify Supabase connection
cat > test-db.mjs << 'EOF'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

try {
  const { data, error } = await supabase
    .from('events')
    .select('count', { count: 'exact', head: true })
  
  if (error) {
    console.log('❌ Database connection failed:', error.message)
    process.exit(1)
  } else {
    console.log('✅ Database connection successful')
    console.log(`Found ${data?.length || 0} events in database`)
  }
} catch (err) {
  console.log('❌ Connection test failed:', err.message)
  process.exit(1)
}
EOF

if ! npm list dotenv &> /dev/null; then
    npm install dotenv
fi

node test-db.mjs
rm test-db.mjs

# Step 6: Test GitHub API
echo -e "${BLUE}Testing GitHub API connection...${NC}"

GITHUB_TEST=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
                   -H "Accept: application/vnd.github.v3+json" \
                   https://api.github.com/user | grep -o '"login"' || echo "failed")

if [ "$GITHUB_TEST" = '"login"' ]; then
    echo -e "${GREEN}✅ GitHub API connection successful${NC}"
else
    echo -e "${RED}❌ GitHub API connection failed. Check your GITHUB_TOKEN${NC}"
    exit 1
fi

# Step 7: Generate CRON secret if needed
if [ "$CRON_SECRET" = "your_secure_random_string" ]; then
    NEW_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated new CRON_SECRET: $NEW_SECRET${NC}"
    echo "Please update your .env.local with this value:"
    echo "CRON_SECRET=$NEW_SECRET"
fi

# Step 8: Build check
echo -e "${BLUE}Testing build...${NC}"
npm run build

echo -e "${GREEN}✅ Build successful${NC}"

# Step 9: Setup complete
echo ""
echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. 🚀 Deploy to Vercel: vercel --prod"
echo "2. 🔗 Configure webhooks in GitHub and Vercel"
echo "3. 📱 Set up Telegram notifications (optional)"
echo "4. 🔍 Monitor your dashboard at your-domain.vercel.app"
echo ""
echo "Webhook URLs (after deployment):"
echo "• GitHub: https://your-domain.vercel.app/api/webhooks/github"
echo "• Vercel: https://your-domain.vercel.app/api/webhooks/vercel"
echo ""
echo "Health check endpoints:"
echo "• GitHub webhook: GET /api/webhooks/github"
echo "• Vercel webhook: GET /api/webhooks/vercel"
echo "• Hermes service: GET /api/hermes/notify"