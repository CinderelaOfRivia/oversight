'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Github,
  Zap,
  Database,
  TrendingUp,
  Bell,
  Settings,
  LogOut
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Event {
  id: string
  source: 'github' | 'vercel' | 'supabase'
  event_type: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  description: string | null
  project_name: string | null
  created_at: string
  metadata: any
}

interface Alert {
  id: string
  source: 'github' | 'vercel' | 'supabase'
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  description: string | null
  status: 'open' | 'dismissed' | 'resolved'
  created_at: string
}

const sourceIcons = {
  github: Github,
  vercel: Zap,
  supabase: Database
}

const severityColors = {
  info: 'text-blue-400 bg-blue-950',
  warning: 'text-yellow-400 bg-yellow-950',
  error: 'text-red-400 bg-red-950',
  critical: 'text-red-300 bg-red-900'
}

export default function Dashboard() {
  const [events, setEvents] = useState<Event[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalEvents: 0,
    criticalAlerts: 0,
    healthyProjects: 0,
    lastUpdate: new Date()
  })

  const supabase = createClient()

  useEffect(() => {
    fetchData()
    
    // Set up real-time subscriptions
    const eventsChannel = supabase
      .channel('events')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'events' },
        (payload) => {
          setEvents(current => [payload.new as Event, ...current].slice(0, 50))
          updateStats()
        }
      )
      .subscribe()

    const alertsChannel = supabase
      .channel('alerts')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        () => {
          fetchAlerts()
          updateStats()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(alertsChannel)
    }
  }, [])

  const fetchData = async () => {
    setLoading(true)
    await Promise.all([fetchEvents(), fetchAlerts()])
    await updateStats()
    setLoading(false)
  }

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching events:', error)
    } else {
      setEvents(data || [])
    }
  }

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching alerts:', error)
    } else {
      setAlerts(data || [])
    }
  }

  const updateStats = async () => {
    // Get event counts
    const { count: eventCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    // Get critical alerts
    const { count: criticalCount } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .in('severity', ['error', 'critical'])

    // Get project count (simplified - you might want to add health checks)
    const { count: projectCount } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })

    setStats({
      totalEvents: eventCount || 0,
      criticalAlerts: criticalCount || 0,
      healthyProjects: projectCount || 0,
      lastUpdate: new Date()
    })
  }

  const resolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('alerts')
      .update({ 
        status: 'resolved',
        resolved_at: new Date().toISOString()
      })
      .eq('id', alertId)

    if (error) {
      console.error('Error resolving alert:', error)
    } else {
      setAlerts(current => current.filter(alert => alert.id !== alertId))
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mb-4"></div>
          <p className="text-gray-400">Loading Oversight dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-100">Oversight</h1>
              <span className="text-sm text-gray-400">
                Last updated {formatDistanceToNow(stats.lastUpdate)} ago
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-300">
                <Bell className="h-5 w-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-300">
                <Settings className="h-5 w-5" />
              </button>
              <button 
                onClick={signOut}
                className="p-2 text-gray-400 hover:text-gray-300"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-blue-400" />
              <div className="ml-4">
                <p className="text-2xl font-semibold text-gray-100">{stats.totalEvents}</p>
                <p className="text-gray-400">Events (24h)</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <div className="ml-4">
                <p className="text-2xl font-semibold text-gray-100">{stats.criticalAlerts}</p>
                <p className="text-gray-400">Critical Alerts</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <div className="ml-4">
                <p className="text-2xl font-semibold text-gray-100">{stats.healthyProjects}</p>
                <p className="text-gray-400">Projects Monitored</p>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
              Active Alerts
            </h2>
            <div className="space-y-4">
              {alerts.map((alert) => {
                const SourceIcon = sourceIcons[alert.source]
                return (
                  <div key={alert.id} className={`rounded-lg p-4 border ${severityColors[alert.severity]}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <SourceIcon className="h-5 w-5 mt-1" />
                        <div>
                          <h3 className="font-medium">{alert.title}</h3>
                          {alert.description && (
                            <p className="text-sm opacity-80 mt-1">{alert.description}</p>
                          )}
                          <p className="text-xs opacity-60 mt-2">
                            {formatDistanceToNow(new Date(alert.created_at))} ago
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => resolveAlert(alert.id)}
                        className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-md"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Events Stream */}
        <div>
          <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
            <Clock className="h-5 w-5 text-blue-400 mr-2" />
            Recent Events
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {events.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No events found. Webhooks and monitoring will appear here.
                </div>
              ) : (
                events.map((event) => {
                  const SourceIcon = sourceIcons[event.source]
                  return (
                    <div key={event.id} className="border-b border-gray-800 last:border-b-0 p-4 hover:bg-gray-800">
                      <div className="flex items-start space-x-3">
                        <SourceIcon className="h-5 w-5 text-gray-400 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${severityColors[event.severity]}`}>
                              {event.severity}
                            </span>
                            <span className="text-xs text-gray-500">{event.project_name}</span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(event.created_at))} ago
                            </span>
                          </div>
                          <h3 className="text-sm font-medium text-gray-100 mt-1">{event.title}</h3>
                          {event.description && (
                            <p className="text-sm text-gray-400 mt-1 line-clamp-2">{event.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}