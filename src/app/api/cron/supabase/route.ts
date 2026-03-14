import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Verify CRON secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!authHeader || !cronSecret) {
    return false
  }
  
  const token = authHeader.replace('Bearer ', '')
  return token === cronSecret
}

// Enhanced Supabase health monitoring with performance analytics
async function checkSupabaseHealth(): Promise<{
  status: 'healthy' | 'warning' | 'error'
  metrics: any
  issues: string[]
  insights: string[]
}> {
  const supabase = createServiceRoleClient()
  const issues: string[] = []
  const insights: string[] = []
  let status: 'healthy' | 'warning' | 'error' = 'healthy'

  try {
    const startTime = Date.now()
    
    // 1. Database Connectivity & Performance
    const { error: dbError, count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .limit(1)
    
    const dbResponseTime = Date.now() - startTime

    if (dbError) {
      issues.push(`Database connection failed: ${dbError.message}`)
      status = 'error'
    } else {
      insights.push(`Database responding in ${dbResponseTime}ms`)
    }

    // 2. Response Time Analysis
    if (dbResponseTime > 2000) {
      issues.push(`Critical DB slowdown: ${dbResponseTime}ms response`)
      status = 'error'
    } else if (dbResponseTime > 1000) {
      issues.push(`Database performance degraded: ${dbResponseTime}ms`)
      status = status === 'error' ? 'error' : 'warning'
    }

    // 3. Recent Error Pattern Analysis
    const { data: recentErrors } = await supabase
      .from('events')
      .select('*')
      .in('severity', ['error', 'critical'])
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    const errorCount = recentErrors?.length || 0
    if (errorCount > 10) {
      issues.push(`Critical error surge: ${errorCount} errors in 15 minutes`)
      status = 'error'
    } else if (errorCount > 5) {
      issues.push(`High error rate: ${errorCount} errors in 15 minutes`)
      status = status === 'error' ? 'error' : 'warning'
    } else if (errorCount > 0) {
      insights.push(`${errorCount} managed errors in last 15 minutes`)
    }

    // 4. Database Growth Analysis
    const { data: totalEvents } = await supabase
      .from('events')
      .select('id')
    
    const eventCount = totalEvents?.length || 0
    if (eventCount > 10000) {
      insights.push(`High event volume: ${eventCount} total events (consider archiving)`)
    }

    // 5. Alert Management Analysis  
    const { data: openAlerts } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'open')
    
    const openAlertCount = openAlerts?.length || 0
    const staleAlerts = openAlerts?.filter(a => 
      new Date(Date.now() - new Date(a.created_at).getTime()) > 24 * 60 * 60 * 1000
    ).length || 0
    
    if (staleAlerts > 5) {
      issues.push(`Alert backlog: ${staleAlerts} alerts open >24h`)
      status = status === 'error' ? 'error' : 'warning'
    } else if (staleAlerts > 0) {
      insights.push(`${staleAlerts} alerts need attention (>24h old)`)
    }
    
    // 6. Repository Activity Analysis
    const { data: recentActivity } = await supabase
      .from('events')
      .select('project_name, event_type')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    
    const activeProjects = [...new Set(recentActivity?.map(e => e.project_name) || [])]
    const deploymentActivity = recentActivity?.filter(e => e.event_type === 'deployment_status').length || 0
    
    insights.push(`${activeProjects.length} active projects, ${deploymentActivity} deployments in last hour`)

    return {
      status,
      metrics: {
        dbResponseTime,
        totalEvents: eventCount,
        recentErrors: errorCount,
        openAlerts: openAlertCount,
        staleAlerts,
        activeProjects: activeProjects.length,
        deploymentActivity,
        timestamp: new Date().toISOString()
      },
      issues,
      insights
    }

  } catch (error: any) {
    return {
      status: 'error',
      metrics: {
        timestamp: new Date().toISOString()
      },
      issues: [`Health check failed: ${error.message}`],
      insights: []
    }
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const healthCheck = await checkSupabaseHealth()
    const supabase = createServiceRoleClient()

    // Log health check as an event
    const severity = healthCheck.status === 'healthy' ? 'info' : 
                    healthCheck.status === 'warning' ? 'warning' : 'error'

    const title = `Supabase health check: ${healthCheck.status}`
    const description = healthCheck.issues.length > 0 
      ? healthCheck.issues.join('. ')
      : 'All systems operational'

    await supabase
      .from('events')
      .insert({
        source: 'supabase',
        event_type: 'health_check',
        severity,
        title,
        description,
        project_name: 'oversight-db',
        metadata: healthCheck.metrics
      })

    // Create alert for critical issues
    if (healthCheck.status === 'error') {
      await supabase
        .from('alerts')
        .insert({
          source: 'supabase',
          severity: 'error',
          title: 'Supabase Health Alert',
          description: healthCheck.issues.join('. '),
          external_id: `supabase_health_${Date.now()}`,
          status: 'open',
          metadata: healthCheck.metrics
        })
    }

    console.log(`✅ Supabase health check completed: ${healthCheck.status}`)

    return NextResponse.json({
      success: true,
      health: healthCheck
    })

  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    )
  }
}