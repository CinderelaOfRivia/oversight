import { redirect } from 'next/navigation'

export default function DashboardPage() {
  // Redirect to the monitoring dashboard
  redirect('/dashboard/monitoring')
}