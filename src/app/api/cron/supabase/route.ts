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

// Check Supabase project health
async function checkSupabaseHealth(): Promise<{
  status: 'healthy' | 'warning' | 'error'
  metrics: any
  issues: string[]
}> {
  const supabase = createServiceRoleClient()
  const issues: string[] = []
  let status: 'healthy' | 'warning' | 'error' = 'healthy'

  try {
    const startTime = Date.now()
    
    // Test database connectivity
    const { error: dbError, count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .limit(1)
    
    const dbResponseTime = Date.now() - startTime

    if (dbError) {
      issues.push(`Database error: ${dbError.message}`)
      status = 'error'
    }

    // Check response time
    if (dbResponseTime > 1000) {
      issues.push(`Slow database response: ${dbResponseTime}ms`)
      status = status === 'error' ? 'error' : 'warning'
    }

    // Check recent error patterns
    const { data: recentErrors } = await supabase
      .from('events')
      .select('*')
      .in('severity', ['error', 'critical'])
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    const errorCount = recentErrors?.length || 0
    if (errorCount > 5) {
      issues.push(`High error rate: ${errorCount} errors in last 5 minutes`)
      status = 'error'
    } else if (errorCount > 2) {
      issues.push(`Elevated error rate: ${errorCount} errors in last 5 minutes`)
      status = status === 'error' ? 'error' : 'warning'
    }

    return {
      status,
      metrics: {
        dbResponseTime,
        totalEvents: count,
        recentErrors: errorCount,
        timestamp: new Date().toISOString()
      },
      issues
    }

  } catch (error: any) {
    return {
      status: 'error',
      metrics: {
        timestamp: new Date().toISOString()
      },
      issues: [`Health check failed: ${error.message}`]
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