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
  let notificationText = `🛡️ <b>DevOps Alert (${data.priority.toUpperCase()})</b>\n\n`
  
  if (data.alert_type === 'security') {
    notificationText += `🚨 <b>${data.title}</b>\n`
  } else if (data.alert_type === 'error_spike') {
    notificationText += `📊 <b>${data.title}</b>\n`  
  } else if (data.alert_type === 'deployment_issue') {
    notificationText += `⚠️ <b>${data.title}</b>\n`
  } else {
    notificationText += `ℹ️ <b>${data.title}</b>\n`
  }
  
  notificationText += `${data.message}\n\n`
  
  if (data.affected_projects?.length > 0) {
    notificationText += `<b>Affected:</b> ${data.affected_projects.join(', ')}\n\n`
  }
  
  if (data.recommendations?.length > 0) {
    notificationText += `<b>Recommendations:</b>\n`
    data.recommendations.forEach((rec: string, i: number) => {
      notificationText += `${i + 1}. ${rec}\n`
    })
    notificationText += `\n`
  }
  
  if (data.context) {
    notificationText += `<b>Context:</b> ${data.context}\n\n`
  }
  
  notificationText += `<b>Dashboard:</b> https://oversight-sable.vercel.app`
  
  const telegramPayload = {
    chat_id: "2123992644", // This chat with Rafa
    text: notificationText,
    parse_mode: "HTML" // Changed to HTML
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN is not set for chat-notify. Notification not sent.')
    return telegramPayload // Still return payload, but log the error.
  }

  const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`

  try {
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(telegramPayload)
    })

    if (!response.ok) {
      console.error('Telegram API error:', response.status, await response.text())
    } else {
      console.log('📱 DIRECT CHAT NOTIFICATION SENT:', telegramPayload.text)
    }
  } catch (error) {
    console.error('Telegram notification failed:', error)
  }
  
  return telegramPayload
}