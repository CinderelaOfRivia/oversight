import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// GitHub webhook signature verification
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = `sha256=${createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')}`
  
  return signature === expectedSignature
}

// Map GitHub events to our severity levels
function mapEventSeverity(eventType: string, eventData: any): 'info' | 'warning' | 'error' | 'critical' {
  switch (eventType) {
    case 'workflow_run':
      if (eventData.workflow_run?.conclusion === 'failure') return 'error'
      if (eventData.workflow_run?.conclusion === 'cancelled') return 'warning'
      return 'info'
    
    case 'deployment_status':
      if (eventData.deployment_status?.state === 'failure' || eventData.deployment_status?.state === 'error') return 'error'
      return 'info'
    
    case 'repository_vulnerability_alert':
    case 'security_advisory':
      return 'critical'
    
    case 'check_run':
      if (eventData.check_run?.conclusion === 'failure') return 'error'
      return 'info'
    
    case 'issues':
      if (eventData.action === 'opened' && eventData.issue?.labels?.some((l: any) => l.name === 'bug')) {
        return 'warning'
      }
      return 'info'
    
    default:
      return 'info'
  }
}

// Generate human-readable titles
function generateTitle(eventType: string, eventData: any): string {
  const repoName = eventData.repository?.name || 'Unknown'
  
  switch (eventType) {
    case 'push':
      const commitCount = eventData.commits?.length || 0
      const branch = eventData.ref?.replace('refs/heads/', '') || 'unknown'
      return `${commitCount} commit(s) pushed to ${repoName}/${branch}`
    
    case 'workflow_run':
      const workflow = eventData.workflow_run?.name || 'Workflow'
      const conclusion = eventData.workflow_run?.conclusion || 'unknown'
      return `${workflow} ${conclusion} in ${repoName}`
    
    case 'deployment_status':
      const state = eventData.deployment_status?.state || 'unknown'
      const environment = eventData.deployment?.environment || 'production'
      return `Deployment ${state} for ${repoName} (${environment})`
    
    case 'repository_vulnerability_alert':
      return `Security vulnerability detected in ${repoName}`
    
    case 'security_advisory':
      return `Security advisory published: ${eventData.security_advisory?.summary || 'Unknown'}`
    
    case 'check_run':
      const checkName = eventData.check_run?.name || 'Check'
      const checkConclusion = eventData.check_run?.conclusion || 'unknown'
      return `${checkName} check ${checkConclusion} in ${repoName}`
    
    case 'issues':
      const action = eventData.action || 'unknown'
      const issueTitle = eventData.issue?.title || 'Unknown issue'
      return `Issue ${action}: ${issueTitle} in ${repoName}`
    
    default:
      return `${eventType} event in ${repoName}`
  }
}

// Generate description with relevant details
function generateDescription(eventType: string, eventData: any): string {
  switch (eventType) {
    case 'push':
      const pusher = eventData.pusher?.name || eventData.sender?.login || 'Unknown'
      const headCommit = eventData.head_commit
      if (headCommit) {
        return `Latest commit: ${headCommit.message} by ${headCommit.author?.name || pusher}`
      }
      return `Pushed by ${pusher}`
    
    case 'workflow_run':
      const actor = eventData.workflow_run?.actor?.login || eventData.sender?.login || 'Unknown'
      const runUrl = eventData.workflow_run?.html_url
      return `Triggered by ${actor}. View run: ${runUrl}`
    
    case 'deployment_status':
      const targetUrl = eventData.deployment_status?.target_url
      const description = eventData.deployment_status?.description
      return `${description || 'Deployment status update'}${targetUrl ? ` - ${targetUrl}` : ''}`
    
    case 'repository_vulnerability_alert':
      const alert = eventData.alert
      if (alert) {
        return `${alert.affected_package_name} has a ${alert.severity} vulnerability${alert.external_reference ? ` (${alert.external_reference})` : ''}`
      }
      return 'Security vulnerability detected'
    
    case 'security_advisory':
      const advisory = eventData.security_advisory
      if (advisory) {
        return `${advisory.description || advisory.summary || 'Security advisory published'}`
      }
      return 'Security advisory published'
    
    case 'check_run':
      const checkOutput = eventData.check_run?.output
      if (checkOutput?.summary) {
        return checkOutput.summary.substring(0, 500) // Truncate long outputs
      }
      return `${eventData.check_run?.name || 'Check'} completed`
    
    case 'issues':
      const issue = eventData.issue
      if (issue && eventData.action === 'opened') {
        return issue.body?.substring(0, 300) || 'New issue opened'
      }
      return `Issue ${eventData.action || 'updated'}`
    
    default:
      return `${eventType} event received`
  }
}

// Trigger AI analysis for intelligent notifications
async function triggerIntelligentAnalysis(eventType: string, severity: string, repoName: string, eventData: any) {
  try {
    // Future: This will call the Hermes AI analysis endpoint
    // For now, create an alert if it's critical
    if (severity === 'critical') {
      const supabase = createServiceRoleClient()
      
      await supabase
        .from('alerts')
        .insert({
          source: 'github',
          severity: severity as any,
          title: `Critical ${eventType} in ${repoName}`,
          description: `Requires immediate attention: ${eventType} event detected`,
          affected_repo: repoName,
          external_id: `${eventType}_${repoName}_${Date.now()}`,
          status: 'open',
          metadata: {
            event_type: eventType,
            repository: repoName,
            analysis_triggered: true,
            auto_created: true
          }
        })
        
      console.log(`🚨 Critical alert created for ${eventType} in ${repoName}`)
    }
  } catch (error) {
    console.error('Intelligence analysis error:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-hub-signature-256')
    const eventType = request.headers.get('x-github-event')
    
    if (!signature || !eventType) {
      return NextResponse.json(
        { error: 'Missing signature or event type' },
        { status: 400 }
      )
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('GitHub webhook secret not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Verify signature
    if (!verifySignature(body, signature, webhookSecret)) {
      console.error('Invalid webhook signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    const eventData = JSON.parse(body)
    const supabase = createServiceRoleClient()

    // Extract common fields
    const repoName = eventData.repository?.name || null
    const severity = mapEventSeverity(eventType, eventData)
    const title = generateTitle(eventType, eventData)
    const description = generateDescription(eventType, eventData)

    // Insert the event
    const { error: insertError } = await supabase
      .from('events')
      .insert({
        source: 'github',
        event_type: eventType,
        severity,
        title,
        description,
        project_name: repoName,
        metadata: eventData
      })

    if (insertError) {
      console.error('Database insert error:', insertError)
    }

    // Enhanced: Trigger AI analysis for intelligent notifications
    if (severity === 'critical' || severity === 'error') {
      await triggerIntelligentAnalysis(eventType, severity, repoName, eventData)
    }

    // Handle special alert cases
    if (eventType === 'repository_vulnerability_alert') {
      const alert = eventData.alert
      if (alert) {
        // Upsert alert (prevent duplicates)
        const { error: alertError } = await supabase
          .from('alerts')
          .upsert({
            source: 'github',
            severity: 'critical',
            title: `Security vulnerability: ${alert.affected_package_name}`,
            description: alert.affected_range || 'Vulnerability detected',
            cve_id: alert.external_reference || null,
            affected_package: alert.affected_package_name,
            affected_repo: repoName,
            external_id: `github_alert_${alert.id || Date.now()}`,
            status: 'open',
            metadata: alert
          }, {
            onConflict: 'external_id'
          })

        if (alertError) {
          console.error('Error inserting alert:', alertError)
        }
      }
    }

    console.log(`✅ GitHub ${eventType} event processed for ${repoName}`)
    
    return NextResponse.json({ 
      success: true, 
      event_type: eventType,
      severity,
      repository: repoName 
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'GitHub webhook endpoint is active',
    timestamp: new Date().toISOString()
  })
}