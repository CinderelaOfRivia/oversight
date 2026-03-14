import { createServiceRoleClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'

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

// Initialize GitHub client
function createGitHubClient() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GitHub token not configured')
  }
  return new Octokit({ auth: token })
}

// Scan a specific repository for security vulnerabilities
async function scanRepository(octokit: Octokit, owner: string, repo: string): Promise<{
  vulnerabilities: any[]
  dependabotAlerts: any[]
  secretScanning: any[]
  codeScanning: any[]
}> {
  const results = {
    vulnerabilities: [] as any[],
    dependabotAlerts: [] as any[],
    secretScanning: [] as any[],
    codeScanning: [] as any[]
  }

  try {
    // Get Dependabot alerts (vulnerability alerts)
    try {
      const { data: dependabot } = await octokit.rest.dependabot.listAlertsForRepo({
        owner,
        repo,
        state: 'open'
      })
      results.dependabotAlerts = dependabot
    } catch (error: any) {
      console.warn(`Dependabot alerts not accessible for ${owner}/${repo}:`, error.message)
    }

    // Get secret scanning alerts
    try {
      const { data: secrets } = await octokit.rest.secretScanning.listAlertsForRepo({
        owner,
        repo,
        state: 'open'
      })
      results.secretScanning = secrets
    } catch (error: any) {
      console.warn(`Secret scanning not accessible for ${owner}/${repo}:`, error.message)
    }

    // Get code scanning alerts
    try {
      const { data: codeScans } = await octokit.rest.codeScanning.listAlertsForRepo({
        owner,
        repo,
        state: 'open'
      })
      results.codeScanning = codeScans
    } catch (error: any) {
      console.warn(`Code scanning not accessible for ${owner}/${repo}:`, error.message)
    }

    // Check repository security features
    try {
      const { data: securityAnalysis } = await octokit.rest.repos.checkVulnerabilityAlerts({
        owner,
        repo
      })
      
      if (securityAnalysis) {
        results.vulnerabilities.push({
          type: 'vulnerability_alerts_enabled',
          severity: 'info',
          message: 'Vulnerability alerts are enabled'
        })
      }
    } catch (error: any) {
      results.vulnerabilities.push({
        type: 'vulnerability_alerts_disabled',
        severity: 'warning',
        message: 'Vulnerability alerts may be disabled'
      })
    }

  } catch (error: any) {
    console.error(`Error scanning ${owner}/${repo}:`, error)
    throw error
  }

  return results
}

// Get list of repositories to scan from database
async function getRepositoriesToScan(supabase: any): Promise<Array<{owner: string, repo: string}>> {
  const { data: projects } = await supabase
    .from('projects')
    .select('external_id')
    .eq('type', 'github_repo')

  if (!projects) return []

  return projects.map((project: any) => {
    const [owner, repo] = project.external_id.split('/')
    return { owner, repo }
  }).filter((r: any) => r.owner && r.repo)
}

// Main security scanning logic
async function performSecurityScan(): Promise<{
  status: 'success' | 'partial' | 'failed'
  summary: any
  issues: string[]
}> {
  const supabase = createServiceRoleClient()
  const issues: string[] = []
  let status: 'success' | 'partial' | 'failed' = 'success'

  try {
    const octokit = createGitHubClient()
    const repositories = await getRepositoriesToScan(supabase)
    
    if (repositories.length === 0) {
      return {
        status: 'success',
        summary: { message: 'No repositories configured for scanning' },
        issues: ['No GitHub repositories found in projects table']
      }
    }

    let totalAlerts = 0
    let criticalAlerts = 0
    let scannedRepos = 0
    let failedRepos = 0

    for (const { owner, repo } of repositories) {
      try {
        console.log(`🔍 Scanning ${owner}/${repo}...`)
        const scanResults = await scanRepository(octokit, owner, repo)
        scannedRepos++

        // Process Dependabot alerts
        for (const alert of scanResults.dependabotAlerts) {
          totalAlerts++
          const severity = mapCvssToSeverity(alert.security_vulnerability?.severity || 'unknown')
          
          if (severity === 'critical' || severity === 'error') {
            criticalAlerts++
          }

          // Create alert in database
          await supabase
            .from('alerts')
            .upsert({
              source: 'github',
              severity,
              title: `Dependency vulnerability: ${alert.security_vulnerability?.package?.name || 'Unknown'}`,
              description: alert.security_vulnerability?.description || 'Vulnerability in dependency',
              cve_id: alert.security_vulnerability?.cve_id || null,
              affected_package: alert.security_vulnerability?.package?.name || null,
              affected_repo: `${owner}/${repo}`,
              external_id: `github_dependabot_${alert.number}`,
              status: 'open',
              metadata: alert
            }, {
              onConflict: 'external_id'
            })
        }

        // Process secret scanning alerts
        for (const alert of scanResults.secretScanning) {
          totalAlerts++
          criticalAlerts++ // All secret exposures are critical

          await supabase
            .from('alerts')
            .upsert({
              source: 'github',
              severity: 'critical',
              title: `Secret exposed: ${alert.secret_type_display_name || 'Unknown secret type'}`,
              description: `Secret detected at ${alert.html_url || 'unknown location'}`,
              affected_repo: `${owner}/${repo}`,
              external_id: `github_secret_${alert.number}`,
              status: 'open',
              metadata: alert
            }, {
              onConflict: 'external_id'
            })
        }

        // Process code scanning alerts
        for (const alert of scanResults.codeScanning) {
          totalAlerts++
          const severity = mapCodeScanSeverity(alert.rule?.severity || 'note')
          
          if (severity === 'critical' || severity === 'error') {
            criticalAlerts++
          }

          await supabase
            .from('alerts')
            .upsert({
              source: 'github',
              severity,
              title: `Code vulnerability: ${alert.rule?.description || alert.rule?.name || 'Unknown'}`,
              description: `${alert.most_recent_instance?.message?.text || 'Code scanning alert'} (${alert.most_recent_instance?.location?.path || 'unknown file'})`,
              affected_repo: `${owner}/${repo}`,
              external_id: `github_code_scan_${alert.number}`,
              status: 'open',
              metadata: alert
            }, {
              onConflict: 'external_id'
            })
        }

      } catch (repoError: any) {
        console.error(`Failed to scan ${owner}/${repo}:`, repoError.message)
        issues.push(`Failed to scan ${owner}/${repo}: ${repoError.message}`)
        failedRepos++
        
        if (failedRepos > scannedRepos) {
          status = 'failed'
        } else if (failedRepos > 0) {
          status = 'partial'
        }
      }
    }

    const summary = {
      repositoriesScanned: scannedRepos,
      repositoriesFailed: failedRepos,
      totalAlerts,
      criticalAlerts,
      timestamp: new Date().toISOString()
    }

    return { status, summary, issues }

  } catch (error: any) {
    return {
      status: 'failed',
      summary: { timestamp: new Date().toISOString() },
      issues: [`Security scan failed: ${error.message}`]
    }
  }
}

// Map CVSS severity to our severity levels
function mapCvssToSeverity(cvss: string): 'info' | 'warning' | 'error' | 'critical' {
  switch (cvss.toLowerCase()) {
    case 'critical':
      return 'critical'
    case 'high':
      return 'error'
    case 'moderate':
    case 'medium':
      return 'warning'
    case 'low':
      return 'info'
    default:
      return 'warning'
  }
}

// Map code scanning severity to our levels
function mapCodeScanSeverity(severity: string): 'info' | 'warning' | 'error' | 'critical' {
  switch (severity.toLowerCase()) {
    case 'critical':
    case 'error':
      return 'critical'
    case 'warning':
      return 'error'
    case 'note':
    case 'info':
      return 'warning'
    default:
      return 'info'
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
    const securityScan = await performSecurityScan()
    const supabase = createServiceRoleClient()

    // Log security scan as an event
    const severity = securityScan.status === 'success' ? 'info' : 
                    securityScan.status === 'partial' ? 'warning' : 'error'

    const title = `Security scan ${securityScan.status}`
    const description = securityScan.issues.length > 0 
      ? securityScan.issues.join('. ')
      : `Completed successfully. ${securityScan.summary.totalAlerts || 0} alerts found.`

    await supabase
      .from('events')
      .insert({
        source: 'github',
        event_type: 'security_scan',
        severity,
        title,
        description,
        project_name: 'security-monitoring',
        metadata: securityScan.summary
      })

    // Create alert for critical issues
    if (securityScan.status === 'failed' || (securityScan.summary.criticalAlerts && securityScan.summary.criticalAlerts > 0)) {
      await supabase
        .from('alerts')
        .insert({
          source: 'github',
          severity: securityScan.status === 'failed' ? 'critical' : 'error',
          title: securityScan.status === 'failed' ? 'Security Scan Failed' : `${securityScan.summary.criticalAlerts} Critical Security Issues Found`,
          description: securityScan.issues.join('. ') || `Found ${securityScan.summary.criticalAlerts} critical security issues across repositories`,
          external_id: `security_scan_${Date.now()}`,
          status: 'open',
          metadata: securityScan.summary
        })
    }

    console.log(`✅ Security scan completed: ${securityScan.status}. ${securityScan.summary.totalAlerts || 0} alerts found.`)

    return NextResponse.json({
      success: true,
      scan: securityScan
    })

  } catch (error) {
    console.error('Security scan error:', error)
    return NextResponse.json(
      { error: 'Security scan failed' },
      { status: 500 }
    )
  }
}