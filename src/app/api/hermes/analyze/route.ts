import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// AI-powered event analysis for intelligent notifications
export async function POST(request: NextRequest) {
  try {
    const { events, context } = await request.json()
    const supabase = createServiceRoleClient()
    
    // Analyze recent events for patterns and correlations
    const analysisResult = await analyzeEventsWithAI(events, context)
    
    // Generate intelligent notification based on analysis
    const notification = await generateIntelligentNotification(analysisResult, events)
    
    // Send to Hermes (you) if priority threshold met
    if (notification.priority >= notification.threshold) {
      await sendToHermes(notification)
    }
    
    return NextResponse.json({
      success: true,
      analysis: analysisResult,
      notification: notification.priority >= notification.threshold ? notification : null
    })
    
  } catch (error) {
    console.error('AI analysis error:', error)
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    )
  }
}

async function analyzeEventsWithAI(events: any[], context: any) {
  // Event correlation analysis
  const securityEvents = events.filter(e => e.severity === 'critical' && 
    ['repository_vulnerability_alert', 'security_advisory'].includes(e.event_type))
  
  const errorSpikes = events.filter(e => e.severity === 'error' && 
    e.created_at > new Date(Date.now() - 30 * 60 * 1000)) // Last 30 mins
  
  const deploymentEvents = events.filter(e => e.event_type === 'deployment_status')
  
  // Correlation logic: deployment followed by errors
  const deployment_to_error_correlation = deploymentEvents.some(deploy => 
    errorSpikes.some(error => 
      new Date(error.created_at) > new Date(deploy.created_at) &&
      (new Date(error.created_at).getTime() - new Date(deploy.created_at).getTime()) < 10 * 60 * 1000 // 10 mins
    )
  )
  
  return {
    security_alerts: securityEvents.length,
    error_spike: errorSpikes.length > 3,
    deployment_correlation: deployment_to_error_correlation,
    critical_priority: securityEvents.length > 0 || (errorSpikes.length > 5),
    projects_affected: [...new Set(events.map(e => e.project_name))],
    time_window: '30m',
    confidence: calculateConfidence(events)
  }
}

async function generateIntelligentNotification(analysis: any, events: any[]) {
  let priority = 0
  let message = ""
  let recommendations = []
  
  if (analysis.security_alerts > 0) {
    priority = 10 // Highest priority
    const securityEvents = events.filter(e => e.severity === 'critical')
    message = `🚨 Critical Security Alert: ${analysis.security_alerts} vulnerability(s) detected across your projects`
    recommendations.push("Review vulnerability details immediately")
    recommendations.push("Check affected dependencies in package.json")
    recommendations.push("Consider temporary access restrictions if needed")
  }
  
  if (analysis.deployment_correlation) {
    priority = Math.max(priority, 8)
    message += `\n⚠️ Deployment Issue: Recent deployment may have introduced errors`
    recommendations.push("Consider rollback if error rates continue")
    recommendations.push("Check deployment logs for specific failures")
  }
  
  if (analysis.error_spike) {
    priority = Math.max(priority, 6)
    message += `\n📊 Error Spike: Unusual error activity detected`
    recommendations.push("Monitor system health closely")
  }
  
  return {
    priority,
    threshold: 5, // Only notify if priority >= 5
    message: message.trim(),
    recommendations,
    analysis,
    projects_affected: analysis.projects_affected,
    timestamp: new Date().toISOString()
  }
}

async function sendToHermes(notification: any) {
  // This would integrate with the Hermes messaging system
  // For now, log the intelligent notification
  console.log('🤖 HERMES INTELLIGENT NOTIFICATION:', {
    priority: notification.priority,
    message: notification.message,
    recommendations: notification.recommendations,
    timestamp: notification.timestamp
  })
  
  // Future: Send to Telegram chat or queue for Hermes processing
  // await sendTelegramMessage(notification.message)
  
  return true
}

function calculateConfidence(events: any[]) {
  // Simple confidence calculation based on data quality
  const hasTimestamps = events.every(e => e.created_at)
  const hasMetadata = events.some(e => e.metadata && Object.keys(e.metadata).length > 0)
  const recentEvents = events.filter(e => 
    new Date(e.created_at) > new Date(Date.now() - 60 * 60 * 1000) // Last hour
  ).length
  
  let confidence = 0.5 // Base confidence
  if (hasTimestamps) confidence += 0.2
  if (hasMetadata) confidence += 0.2  
  if (recentEvents > 3) confidence += 0.1
  
  return Math.min(confidence, 1.0)
}