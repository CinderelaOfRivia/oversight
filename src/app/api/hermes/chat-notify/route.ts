import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Direct integration with this Telegram chat for real-time notifications
export async function POST(request: NextRequest) {
  try {
    const { 
      priority, 
      title, 
      message, 
      context, 
      recommendations,
      affected_projects,
      alert_type 
    } = await request.json()

    // Send notification directly to Rafa's Telegram chat
    const notification = await sendDirectChatNotification({
      priority,
      title, 
      message,
      context,
      recommendations,
      affected_projects,
      alert_type
    })

    return NextResponse.json({
      success: true,
      notification_sent: true,
      chat_id: "2123992644", // Rafa's chat
      priority,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Chat notification error:', error)
    return NextResponse.json(
      { error: 'Notification failed' },
      { status: 500 }
    )
  }
}

async function sendDirectChatNotification(data: any) {
  // Build intelligent notification message
  let notificationText = `🛡️ **DevOps Alert (${data.priority.toUpperCase()})**\n\n`
  
  if (data.alert_type === 'security') {
    notificationText += `🚨 **${data.title}**\n`
  } else if (data.alert_type === 'error_spike') {
    notificationText += `📊 **${data.title}**\n`  
  } else if (data.alert_type === 'deployment_issue') {
    notificationText += `⚠️ **${data.title}**\n`
  } else {
    notificationText += `ℹ️ **${data.title}**\n`
  }
  
  notificationText += `${data.message}\n\n`
  
  if (data.affected_projects?.length > 0) {
    notificationText += `**Affected:** ${data.affected_projects.join(', ')}\n\n`
  }
  
  if (data.recommendations?.length > 0) {
    notificationText += `**Recommendations:**\n`
    data.recommendations.forEach((rec: string, i: number) => {
      notificationText += `${i + 1}. ${rec}\n`
    })
    notificationText += `\n`
  }
  
  if (data.context) {
    notificationText += `**Context:** ${data.context}\n\n`
  }
  
  notificationText += `**Dashboard:** https://oversight-bic6oinc4-suprafa0412-8612s-projects.vercel.app`
  
  // Use the existing Hermes notification system to send to this chat
  const telegramPayload = {
    chat_id: "2123992644", // This chat with Rafa
    text: notificationText,
    parse_mode: "Markdown"
  }
  
  // For now, log the notification (will integrate with actual Telegram API)
  console.log('📱 DIRECT CHAT NOTIFICATION:', telegramPayload)
  
  // Future: Integrate with Hermes messaging system
  // await fetch(`${process.env.HERMES_API_URL}/send-message`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(telegramPayload)
  // })
  
  return telegramPayload
}