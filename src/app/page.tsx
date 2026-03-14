import { createServerComponentClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'
import AuthWrapper from '@/components/AuthWrapper'

export default async function Home() {
  const supabase = await createServerComponentClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <AuthWrapper />
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <Dashboard />
    </main>
  )
}