import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Verify CRON secret
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!authHeader || !cronSecret) {
    return false
  }
  
  const token = authHeader.replace('Bearer ', '')
  return token === cronSecret
}

// Intelligent analysis and notification system
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const supabase = createServiceRoleClient()
    
    // Get recent events for analysis (last 2 hours)
    const { data: recentEvents } = await supabase
      .from('events')
      .select('*')
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    
    // Get open alerts
    const { data: openAlerts } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    
    const analysis = await performIntelligentAnalysis(recentEvents || [], openAlerts || [])
    
    // Generate notification if needed
    if (analysis.requires_notification) {
      await createIntelligentNotification(analysis, supabase)
    }
    
    console.log(`🤖 Intelligent analysis completed: ${analysis.priority_level} priority`)

    return NextResponse.json({
      success: true,
      analysis_summary: {
        events_analyzed: recentEvents?.length || 0,
        open_alerts: openAlerts?.length || 0,
        priority_level: analysis.priority_level,
        notification_sent: analysis.requires_notification,
        insights: analysis.insights
      }
    })

  } catch (error) {
    console.error('Intelligent analysis error:', error)
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    )
  }
}

async function performIntelligentAnalysis(events: any[], alerts: any[]) {
  const insights = []
  let priority_level = 'normal'
  let requires_notification = false
  
  // Security vulnerability analysis
  const securityEvents = events.filter(e => 
    e.severity === 'critical' && 
    ['repository_vulnerability_alert', 'security_advisory'].includes(e.event_type)
  )
  
  if (securityEvents.length > 0) {
    priority_level = 'critical'
    requires_notification = true
    insights.push(`🚨 ${securityEvents.length} critical security vulnerability(ies) detected`)
  }
  
  // Error pattern detection
  const errorEvents = events.filter(e => e.severity === 'error')
  const errorsByRepo = {}
  
  errorEvents.forEach(e => {
    errorsByRepo[e.project_name] = (errorsByRepo[e.project_name] || 0) + 1
  })
  
  // Deployment correlation analysis
  const deployments = events.filter(e => e.event_type === 'deployment_status')
  const recentDeployments = deployments.filter(d => 
    new Date(d.created_at) > new Date(Date.now() - 30 * 60 * 1000)
  )
  
  if (recentDeployments.length > 0 && errorEvents.length > 3) {
    priority_level = priority_level === 'critical' ? 'critical' : 'high'
    requires_notification = true
    insights.push(`⚠️ Possible deployment issue: ${errorEvents.length} errors after recent deployment`)
  }
  
  // Repository health assessment
  const activeRepos = [...new Set(events.map(e => e.project_name))]
  const healthyRepos = activeRepos.filter(repo => 
    !errorsByRepo[repo] || errorsByRepo[repo] <= 1
  )
  
  if (healthyRepos.length < activeRepos.length * 0.8) {
    priority_level = priority_level === 'normal' ? 'medium' : priority_level
    insights.push(`📊 Health concern: ${activeRepos.length - healthyRepos.length}/${activeRepos.length} repos showing issues`)
  }
  
  // Long-standing alerts
  const staleAlerts = alerts.filter(a => 
    new Date(Date.now() - new Date(a.created_at).getTime()) > 24 * 60 * 60 * 1000
  )
  
  if (staleAlerts.length > 0) {
    insights.push(`🕐 ${staleAlerts.length} alert(s) open for >24 hours`)
  }
  
  return {
    priority_level,
    requires_notification,
    insights,
    metrics: {
      total_events: events.length,
      security_events: securityEvents.length,
      error_events: errorEvents.length,
      open_alerts: alerts.length,
      stale_alerts: staleAlerts.length
    }
  }
}

async function createIntelligentNotification(analysis: any, supabase: any) {
  // Create a summary notification event
  await supabase
    .from('events')
    .insert({
      source: 'supabase',
      event_type: 'intelligent_notification',
      severity: analysis.priority_level === 'critical' ? 'critical' : 
               analysis.priority_level === 'high' ? 'error' : 'warning',
      title: `DevOps Intelligence Summary - ${analysis.priority_level} priority`,
      description: analysis.insights.join('\n'),
      project_name: 'oversight-system',
      metadata: {
        analysis_type: 'intelligent_summary',
        priority_level: analysis.priority_level,
        metrics: analysis.metrics,
        notification_triggered: true
      }
    })
    
  // Future: Send to Telegram/Discord via Hermes API
  console.log(`🤖 Intelligent notification created: ${analysis.priority_level}`)
}