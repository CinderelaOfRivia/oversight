import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// Vercel webhook signature verification
function verifyVercelSignature(
  payload: string, 
  signature: string, 
  secret: string
): boolean {
  const expectedSignature = createHmac('sha1', secret)
    .update(payload, 'utf8')
    .digest('hex')
  
  return signature === expectedSignature
}

// Map Vercel events to severity levels
function mapVercelSeverity(eventType: string, eventData: any): 'info' | 'warning' | 'error' | 'critical' {
  switch (eventType) {
    case 'deployment.failed':
    case 'deployment.error':
      return 'error'
    
    case 'deployment.ready':
    case 'deployment.succeeded': 
      return 'info'
    
    case 'deployment.canceled':
      return 'warning'
    
    case 'domain.moved':
    case 'domain.purchased':
      return 'info'
    
    case 'domain.expired':
      return 'error'
    
    case 'project.created':
    case 'project.removed':
      return 'info'
    
    case 'integration-configuration.scope-change-confirmed':
      return 'warning'
    
    default:
      // Check for budget/usage events in payload
      if (eventData.type === 'budget.reached' || eventData.type === 'budget.exceeded') {
        return eventData.type === 'budget.exceeded' ? 'error' : 'warning'
      }
      return 'info'
  }
}

// Generate human-readable titles
function generateVercelTitle(eventType: string, eventData: any): string {
  const projectName = eventData.payload?.project?.name || 
                     eventData.payload?.deployment?.project || 
                     eventData.projectId || 
                     'Unknown Project'

  switch (eventType) {
    case 'deployment.created':
      return `Deployment started for ${projectName}`
    
    case 'deployment.ready':
    case 'deployment.succeeded':
      return `Deployment successful for ${projectName}`
    
    case 'deployment.failed':
    case 'deployment.error':
      return `Deployment failed for ${projectName}`
    
    case 'deployment.canceled':
      return `Deployment canceled for ${projectName}`
    
    case 'domain.moved':
      const domain = eventData.payload?.domain?.name || 'unknown domain'
      return `Domain moved: ${domain}`
    
    case 'domain.purchased':
      const purchasedDomain = eventData.payload?.domain?.name || 'unknown domain'
      return `Domain purchased: ${purchasedDomain}`
    
    case 'domain.expired':
      const expiredDomain = eventData.payload?.domain?.name || 'unknown domain'
      return `Domain expired: ${expiredDomain}`
    
    case 'project.created':
      return `Project created: ${projectName}`
    
    case 'project.removed':
      return `Project removed: ${projectName}`
    
    default:
      // Handle budget events
      if (eventData.type === 'budget.reached') {
        return `Budget threshold reached for ${projectName}`
      }
      if (eventData.type === 'budget.exceeded') {
        return `Budget exceeded for ${projectName}`
      }
      
      return `${eventType} event for ${projectName}`
  }
}

// Generate detailed descriptions
function generateVercelDescription(eventType: string, eventData: any): string {
  const payload = eventData.payload || {}

  switch (eventType) {
    case 'deployment.created':
      const creator = payload.deployment?.creator?.username || 'Unknown'
      const url = payload.deployment?.url
      return `Deployment initiated by ${creator}${url ? ` to ${url}` : ''}`
    
    case 'deployment.ready':
    case 'deployment.succeeded':
      const readyUrl = payload.deployment?.url || payload.url
      const inspectorUrl = payload.deployment?.inspectorUrl
      return `Deployment is live${readyUrl ? ` at ${readyUrl}` : ''}${inspectorUrl ? ` (Inspector: ${inspectorUrl})` : ''}`
    
    case 'deployment.failed':
    case 'deployment.error':
      const errorMessage = payload.deployment?.errorMessage || 'Deployment failed'
      const buildLog = payload.deployment?.buildingAt ? `Build started at ${new Date(payload.deployment.buildingAt).toISOString()}` : ''
      return `${errorMessage}${buildLog ? ` | ${buildLog}` : ''}`
    
    case 'deployment.canceled':
      const cancelReason = payload.deployment?.canceledAt ? `Canceled at ${new Date(payload.deployment.canceledAt).toISOString()}` : 'Deployment was canceled'
      return cancelReason
    
    case 'domain.moved':
      const fromProject = payload.from?.name || 'unknown project'
      const toProject = payload.to?.name || 'unknown project'
      return `Domain moved from ${fromProject} to ${toProject}`
    
    case 'domain.purchased':
      const price = payload.domain?.price ? `for $${payload.domain.price}` : ''
      const renewsAt = payload.domain?.renewsAt ? `Renews at ${new Date(payload.domain.renewsAt).toISOString()}` : ''
      return `Domain purchased ${price}${renewsAt ? ` | ${renewsAt}` : ''}`
    
    case 'domain.expired':
      const expiredAt = payload.domain?.expiresAt ? new Date(payload.domain.expiresAt).toISOString() : 'unknown time'
      return `Domain expired at ${expiredAt}`
    
    case 'project.created':
      const framework = payload.project?.framework || 'unknown framework'
      return `New project created using ${framework}`
    
    case 'project.removed':
      const removedAt = payload.removedAt ? new Date(payload.removedAt).toISOString() : 'recently'
      return `Project removed ${removedAt}`
    
    default:
      // Handle budget events
      if (eventData.type === 'budget.reached') {
        const threshold = payload.budget?.limit || 'unknown'
        return `Budget threshold of $${threshold} has been reached`
      }
      if (eventData.type === 'budget.exceeded') {
        const limit = payload.budget?.limit || 'unknown'
        const current = payload.budget?.current || 'unknown'
        return `Budget exceeded! Current: $${current}, Limit: $${limit}`
      }
      
      return `${eventType} event received`
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-vercel-signature')
    
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Vercel signature' },
        { status: 400 }
      )
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('Vercel webhook secret not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Verify signature
    if (!verifyVercelSignature(body, signature, webhookSecret)) {
      console.error('Invalid Vercel webhook signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    const eventData = JSON.parse(body)
    const supabase = createServiceRoleClient()

    // Extract event details
    const eventType = eventData.type || 'unknown'
    const projectName = eventData.payload?.project?.name || 
                       eventData.payload?.deployment?.project || 
                       eventData.projectId || 
                       null

    const severity = mapVercelSeverity(eventType, eventData)
    const title = generateVercelTitle(eventType, eventData)
    const description = generateVercelDescription(eventType, eventData)

    // Insert event to database
    const { error: eventError } = await supabase
      .from('events')
      .insert({
        source: 'vercel',
        event_type: eventType,
        severity,
        title,
        description,
        project_name: projectName,
        metadata: eventData
      })

    if (eventError) {
      console.error('Error inserting Vercel event:', eventError)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    // Create alerts for critical issues
    if (severity === 'error' || severity === 'critical') {
      const alertTitle = `Vercel Alert: ${title}`
      const alertId = `vercel_${eventType}_${Date.now()}`

      const { error: alertError } = await supabase
        .from('alerts')
        .insert({
          source: 'vercel',
          severity,
          title: alertTitle,
          description,
          external_id: alertId,
          status: 'open',
          metadata: eventData
        })

      if (alertError) {
        console.error('Error creating Vercel alert:', alertError)
      }
    }

    console.log(`✅ Vercel ${eventType} event processed for ${projectName || 'unknown project'}`)
    
    return NextResponse.json({ 
      success: true, 
      event_type: eventType,
      severity,
      project: projectName 
    })

  } catch (error) {
    console.error('Vercel webhook processing error:', error)
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
    message: 'Vercel webhook endpoint is active',
    timestamp: new Date().toISOString()
  })
}