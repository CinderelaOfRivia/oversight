import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Telegram notification service
class TelegramNotifier {
  private botToken: string
  private chatId: string

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || ''
    this.chatId = process.env.TELEGRAM_CHAT_ID || ''
  }

  async sendMessage(message: string, options: {
    parse_mode?: 'HTML' | 'Markdown'
    disable_notification?: boolean
  } = {}): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram configuration missing')
      return false
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: options.parse_mode || 'HTML',
          disable_notification: options.disable_notification || false
        })
      })

      if (!response.ok) {
        console.error('Telegram API error:', response.status, await response.text())
        return false
      }

      return true
    } catch (error) {
      console.error('Telegram notification failed:', error)
      return false
    }
  }
}

// Intelligent alert triaging
class AlertTriager {
  private supabase: any

  constructor(supabase: any) {
    this.supabase = supabase
  }

  async shouldNotify(alert: any): Promise<{
    notify: boolean
    reason: string
    urgency: 'low' | 'medium' | 'high' | 'critical'
  }> {
    // Critical security issues always notify
    if (alert.severity === 'critical' && alert.source === 'github') {
      return {
        notify: true,
        reason: 'Critical security vulnerability detected',
        urgency: 'critical'
      }
    }

    // Secret exposures always notify
    if (alert.title.toLowerCase().includes('secret exposed')) {
      return {
        notify: true,
        reason: 'Secret exposure requires immediate attention',
        urgency: 'critical'
      }
    }

    // Production deployment failures
    if (alert.source === 'vercel' && alert.severity === 'error' && 
        (alert.title.includes('failed') || alert.title.includes('error'))) {
      return {
        notify: true,
        reason: 'Production deployment failure',
        urgency: 'high'
      }
    }

    // Database issues
    if (alert.source === 'supabase' && alert.severity === 'error') {
      return {
        notify: true,
        reason: 'Database health issue detected',
        urgency: 'high'
      }
    }

    // Check for alert patterns (spam prevention)
    const recentSimilar = await this.supabase
      .from('alerts')
      .select('id')
      .eq('title', alert.title)
      .eq('source', alert.source)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
      .limit(5)

    if (recentSimilar.data && recentSimilar.data.length > 3) {
      return {
        notify: false,
        reason: 'Similar alerts detected recently (spam prevention)',
        urgency: 'low'
      }
    }

    // High error rates
    if (alert.description && alert.description.includes('High error rate')) {
      return {
        notify: true,
        reason: 'Elevated error rate detected',
        urgency: 'medium'
      }
    }

    // Default: notify for warnings and above during business hours
    if (alert.severity === 'warning' || alert.severity === 'error') {
      const hour = new Date().getHours()
      const isBusinessHours = hour >= 9 && hour <= 18

      return {
        notify: isBusinessHours,
        reason: isBusinessHours ? 'Warning during business hours' : 'Non-urgent, outside business hours',
        urgency: alert.severity === 'error' ? 'medium' : 'low'
      }
    }

    return {
      notify: false,
      reason: 'Low priority informational alert',
      urgency: 'low'
    }
  }

  formatAlert(alert: any, triage: any): string {
    const urgencyEmoji = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🚨',
      critical: '🔥'
    }

    const sourceEmoji = {
      github: '🐙',
      vercel: '▲',
      supabase: '🗃️'
    }

    const emoji = urgencyEmoji[triage.urgency as keyof typeof urgencyEmoji] + ' ' + sourceEmoji[alert.source as keyof typeof sourceEmoji]
    
    let message = `${emoji} <b>${alert.title}</b>\n\n`
    
    if (alert.description) {
      message += `${alert.description}\n\n`
    }

    message += `<b>Source:</b> ${alert.source}\n`
    message += `<b>Severity:</b> ${alert.severity}\n`
    message += `<b>Urgency:</b> ${triage.urgency}\n`
    
    if (alert.affected_repo) {
      message += `<b>Repository:</b> ${alert.affected_repo}\n`
    }
    
    if (alert.cve_id) {
      message += `<b>CVE:</b> ${alert.cve_id}\n`
    }

    message += `<b>Time:</b> ${new Date(alert.created_at).toLocaleString()}\n`
    
    // Add action suggestions
    if (triage.urgency === 'critical') {
      message += `\n🔧 <b>Immediate action required!</b>`
    }

    return message
  }
}

// Process pending notifications
async function processNotifications(): Promise<{
  processed: number
  sent: number
  errors: string[]
}> {
  const supabase = createServiceRoleClient()
  const telegram = new TelegramNotifier()
  const triager = new AlertTriager(supabase)
  
  const errors: string[] = []
  let processed = 0
  let sent = 0

  try {
    // Get new unprocessed alerts (last 10 minutes)
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'open')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      errors.push(`Database error: ${error.message}`)
      return { processed: 0, sent: 0, errors }
    }

    if (!alerts || alerts.length === 0) {
      return { processed: 0, sent: 0, errors: [] }
    }

    for (const alert of alerts) {
      processed++
      
      try {
        const triage = await triager.shouldNotify(alert)
        
        if (triage.notify) {
          const message = triager.formatAlert(alert, triage)
          const success = await telegram.sendMessage(message, {
            disable_notification: triage.urgency === 'low'
          })
          
          if (success) {
            sent++
            console.log(`✅ Notification sent for alert: ${alert.title}`)
          } else {
            errors.push(`Failed to send notification for alert: ${alert.title}`)
          }
        } else {
          console.log(`🔇 Skipped notification for alert: ${alert.title} (${triage.reason})`)
        }

        // Mark as processed (add metadata flag to prevent reprocessing)
        await supabase
          .from('alerts')
          .update({ 
            metadata: { 
              ...alert.metadata, 
              hermes_processed: true, 
              hermes_notified: triage.notify,
              hermes_reason: triage.reason,
              processed_at: new Date().toISOString() 
            } 
          })
          .eq('id', alert.id)

      } catch (alertError: any) {
        errors.push(`Error processing alert ${alert.id}: ${alertError.message}`)
      }
    }

  } catch (error: any) {
    errors.push(`General error: ${error.message}`)
  }

  return { processed, sent, errors }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization (same secret as cron jobs)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (!authHeader || !cronSecret || !authHeader.startsWith('Bearer ') || 
        authHeader.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const result = await processNotifications()
    const supabase = createServiceRoleClient()

    // Log notification processing as an event
    const severity = result.errors.length > result.sent ? 'warning' : 'info'
    const title = `Hermes notification processing: ${result.sent}/${result.processed} sent`
    const description = result.errors.length > 0 
      ? `Errors: ${result.errors.join('. ')}`
      : `Successfully processed ${result.processed} alerts, sent ${result.sent} notifications`

    await supabase
      .from('events')
      .insert({
        source: 'supabase', // Hermes is part of our system
        event_type: 'notification_processing',
        severity,
        title,
        description,
        project_name: 'oversight-hermes',
        metadata: result
      })

    console.log(`🤖 Hermes processed ${result.processed} alerts, sent ${result.sent} notifications`)

    return NextResponse.json({
      success: true,
      result
    })

  } catch (error: any) {
    console.error('Hermes notification error:', error)
    return NextResponse.json(
      { error: 'Notification processing failed' },
      { status: 500 }
    )
  }
}

// Health check for Hermes service
export async function GET() {
  try {
    const telegram = new TelegramNotifier()
    const hasConfig = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
    
    return NextResponse.json({
      status: 'ok',
      message: 'Hermes notification service is active',
      telegram_configured: hasConfig,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Hermes service check failed' },
      { status: 500 }
    )
  }
}