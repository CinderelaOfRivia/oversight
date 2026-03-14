'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

interface Event {
  id: string
  source: string
  event_type: string
  severity: string
  title: string
  description: string
  project_name: string
  created_at: string
  metadata: any
}

interface Alert {
  id: string
  source: string
  severity: string
  title: string
  description: string
  status: string
  affected_repo: string
  created_at: string
}

export default function MonitoringDashboard() {
  const [events, setEvents] = useState<Event[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [systemHealth, setSystemHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Real-time data fetching
  useEffect(() => {
    fetchDashboardData()
    
    // Set up real-time subscriptions
    const eventsSubscription = supabase
      .channel('events')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'events' }, 
        (payload) => {
          setEvents(prev => [payload.new as Event, ...prev.slice(0, 49)])
        }
      )
      .subscribe()

    const alertsSubscription = supabase
      .channel('alerts')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAlerts(prev => [payload.new as Alert, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new as Alert : a))
          }
        }
      )
      .subscribe()

    return () => {
      eventsSubscription.unsubscribe()
      alertsSubscription.unsubscribe()
    }
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Recent events
      const { data: recentEvents } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      // Open alerts
      const { data: openAlerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      setEvents(recentEvents || [])
      setAlerts(openAlerts || [])
      setLoading(false)
    } catch (error) {
      console.error('Dashboard data fetch error:', error)
      setLoading(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white'
      case 'error': return 'bg-red-400 text-white'  
      case 'warning': return 'bg-yellow-400 text-black'
      default: return 'bg-blue-400 text-white'
    }
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'github': return '🐙'
      case 'vercel': return '▲'
      case 'supabase': return '🗄️'
      default: return '🔗'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-64 bg-gray-300 rounded"></div>
              <div className="h-64 bg-gray-300 rounded"></div>
              <div className="h-64 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🛡️ DevOps Monitoring Dashboard
          </h1>
          <p className="text-gray-600">
            AI-powered monitoring with intelligent analysis by Hermes Agent
          </p>
        </div>

        {/* Critical Alerts */}
        {alerts.length > 0 && (
          <div className="mb-8">
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-red-800 mb-4">
                🚨 Open Alerts ({alerts.length})
              </h2>
              <div className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="bg-white p-3 rounded border-l-4 border-red-400">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{alert.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {alert.affected_repo} • {new Date(alert.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Events Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* Security Events */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              🔒 Security Events
            </h3>
            <div className="space-y-3">
              {events
                .filter(e => ['repository_vulnerability_alert', 'security_advisory'].includes(e.event_type))
                .slice(0, 5)
                .map((event) => (
                  <div key={event.id} className="border-l-4 border-red-400 pl-3">
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-gray-600">{event.project_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          {/* Deployment Events */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              🚀 Deployments
            </h3>
            <div className="space-y-3">
              {events
                .filter(e => e.event_type === 'deployment_status')
                .slice(0, 5)
                .map((event) => (
                  <div key={event.id} className="border-l-4 border-green-400 pl-3">
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-gray-600">{event.project_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          {/* Error Events */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              ⚠️ Error Events
            </h3>
            <div className="space-y-3">
              {events
                .filter(e => e.severity === 'error')
                .slice(0, 5)
                .map((event) => (
                  <div key={event.id} className="border-l-4 border-yellow-400 pl-3">
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-gray-600">{event.project_name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* All Events Stream */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">📊 Real-Time Event Stream</h3>
          </div>
          <div className="p-6">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map((event) => (
                <div key={event.id} className="flex items-start space-x-4 p-3 bg-gray-50 rounded">
                  <span className="text-lg">{getSourceIcon(event.source)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-gray-600 mt-1">{event.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {event.project_name} • {new Date(event.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(event.severity)}`}>
                        {event.severity}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}