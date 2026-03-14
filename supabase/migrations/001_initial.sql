-- Oversight Database Schema
-- DevOps monitoring dashboard for GitHub/Vercel/Supabase integrations

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE event_source AS ENUM ('github', 'vercel', 'supabase');
CREATE TYPE event_severity AS ENUM ('info', 'warning', 'error', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'dismissed', 'resolved');
CREATE TYPE project_type AS ENUM ('github_repo', 'vercel_project', 'supabase_project');

-- ============================================================================
-- EVENTS TABLE - Unified Event Stream
-- ============================================================================
-- Every incoming webhook or cron poll writes here. The heartbeat of the system.
CREATE TABLE events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source event_source NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- e.g. 'push', 'workflow_run', 'deployment'
  severity event_severity NOT NULL DEFAULT 'info',
  title VARCHAR(500) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}', -- Store event-specific data
  project_name VARCHAR(200),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_source_severity ON events(source, severity);
CREATE INDEX idx_events_project_severity ON events(project_name, severity);

-- ============================================================================
-- ALERTS TABLE - Security & Vulnerability Alerts
-- ============================================================================
-- Persistent, actionable alerts that require human (or agent) triage
CREATE TABLE alerts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source event_source NOT NULL,
  severity event_severity NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  cve_id VARCHAR(50), -- For security vulnerabilities
  affected_package VARCHAR(200), -- Package/dependency name
  affected_repo VARCHAR(200), -- Repository name
  status alert_status NOT NULL DEFAULT 'open',
  external_id VARCHAR(200), -- For deduplication (GitHub alert ID, etc.)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for alerts
CREATE INDEX idx_alerts_status_severity ON alerts(status, severity);
CREATE INDEX idx_alerts_external_id ON alerts(external_id);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- ============================================================================
-- PROJECTS TABLE - Registered Resources
-- ============================================================================
-- Tracks which repos/projects/Supabase instances are monitored
CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type project_type NOT NULL,
  name VARCHAR(200) NOT NULL, -- Human readable name
  external_id VARCHAR(200) NOT NULL, -- GitHub repo ID, Vercel project ID, etc.
  config JSONB DEFAULT '{}', -- Service-specific configuration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint on type + external_id to prevent duplicates
CREATE UNIQUE INDEX idx_projects_type_external_id ON projects(type, external_id);

-- ============================================================================
-- INTEGRATION_SETTINGS TABLE - API Credentials
-- ============================================================================
-- One row per service. Stores tokens and webhook secrets. Single-user model.
CREATE TABLE integration_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  service VARCHAR(50) NOT NULL UNIQUE, -- 'github', 'vercel', 'supabase_mgmt'
  api_token TEXT, -- GitHub token, Vercel token, Supabase service key
  webhook_secret TEXT, -- For validating incoming webhooks
  config JSONB DEFAULT '{}', -- Additional service-specific settings
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

-- Single-user model: Authenticated users can read everything
CREATE POLICY "Allow authenticated read access" ON events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access" ON integration_settings
  FOR SELECT TO authenticated USING (true);

-- Only service_role can write (for webhooks and cron jobs)
CREATE POLICY "Allow service_role write access" ON events
  FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service_role write access" ON alerts
  FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service_role write access" ON projects
  FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service_role write access" ON integration_settings
  FOR ALL TO service_role USING (true);

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================

-- Enable realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to projects and integration_settings
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SAMPLE DATA (for development)
-- ============================================================================

-- Insert sample integration settings (you'll need to update these with real values)
INSERT INTO integration_settings (service, api_token, webhook_secret, config) VALUES
  ('github', 'ghp_PLACEHOLDER_TOKEN', 'github_webhook_secret_here', '{}'),
  ('vercel', 'vercel_token_here', 'vercel_webhook_secret_here', '{}'),
  ('supabase_mgmt', 'supabase_service_key_here', '', '{"org_id": "your_org_id"}');

-- Insert sample projects to monitor
INSERT INTO projects (type, name, external_id, config) VALUES
  ('github_repo', 'CRM-v2', 'ImightbeRafa/CRM-v2', '{"branch": "main"}'),
  ('github_repo', 'IANAI', 'ImightbeRafa/IANAI', '{"branch": "main"}'),
  ('github_repo', 'DeepSleep', 'ImightbeRafa/DeepSleep', '{"branch": "main"}'),
  ('vercel_project', 'crm-v2-prod', 'prj_vercel_id_here', '{}'),
  ('supabase_project', 'betsy-production', 'supabase_project_ref_here', '{}');

COMMIT;