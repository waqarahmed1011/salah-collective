import { useState, useEffect } from 'react'
import { getDashboard, runMatching, runBatch } from '../api'
import Spinner from '../components/Spinner'
import { useToast } from '../components/ToastContext'

function timeAgo(dateStr) {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const STAT_CARDS = [
  { key: 'total_members', label: 'Total Signups', valueClass: 'text-stone-900' },
  { key: 'matched', label: 'Matched', valueClass: 'text-green-700' },
  { key: 'waitlisted', label: 'Waitlisted', valueClass: 'text-amber-700' },
  { key: 'geocode_failed', label: 'Geocode Failures', valueClass: 'text-red-700' },
  { key: 'total_groups', label: 'Total Groups', valueClass: 'text-blue-700' },
]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(null)
  const { toast } = useToast()

  async function fetchStats() {
    try {
      const res = await getDashboard()
      setStats(res.data)
      setError(null)
    } catch {
      setError('Failed to load dashboard. Make sure the backend is running.')
    } finally {
      setPageLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  async function handleRun(type) {
    setRunning(type)
    try {
      const res = await (type === 'matching' ? runMatching() : runBatch())
      const { members_matched, members_waitlisted, groups_formed } = res.data
      toast({
        message: `Done — ${members_matched} matched, ${members_waitlisted} waitlisted, ${groups_formed} new groups.`,
      })
      await fetchStats()
    } catch {
      toast({ message: 'Run failed. Check backend logs.', type: 'error' })
    } finally {
      setRunning(null)
    }
  }

  if (pageLoading) return <PageLoader />
  if (error) return <ErrorState message={error} />

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Dashboard</h1>
        <p className="text-stone-500 text-sm mt-1">Salah Collective carpool overview</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map(({ key, label, valueClass }) => (
          <div key={key} className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-bold mt-2 ${valueClass}`}>{stats[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-4">Last Run</h2>
        {stats.last_run ? (
          <div className="flex flex-wrap gap-8 text-sm">
            <RunStat label="When" value={timeAgo(stats.last_run.run_at)} />
            <RunStat label="Type" value={stats.last_run.run_type} capitalize />
            <RunStat label="Triggered by" value={stats.last_run.triggered_by} capitalize />
            <RunStat label="Matched" value={stats.last_run.members_matched} />
            <RunStat label="Waitlisted" value={stats.last_run.members_waitlisted} />
            <RunStat label="Groups formed" value={stats.last_run.groups_formed} />
          </div>
        ) : (
          <p className="text-stone-400 text-sm">No runs yet.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-4">Trigger Matching</h2>
        <div className="flex flex-wrap gap-3">
          <RunButton
            label="Run Matching"
            description="Match new unmatched members into groups"
            isRunning={running === 'matching'}
            disabled={!!running}
            onClick={() => handleRun('matching')}
          />
          <RunButton
            label="Run Batch"
            description="Full re-run across all unmatched members"
            isRunning={running === 'batch'}
            disabled={!!running}
            onClick={() => handleRun('batch')}
          />
        </div>
      </div>
    </div>
  )
}

function RunStat({ label, value, capitalize }) {
  return (
    <div>
      <p className="text-xs text-stone-400">{label}</p>
      <p className={`font-semibold text-stone-800 mt-0.5 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  )
}

function RunButton({ label, description, isRunning, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 px-5 py-4 bg-[#8C0000] text-white rounded-xl hover:bg-[#6B0000] disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-left min-w-52"
    >
      <span className="mt-0.5 shrink-0">
        {isRunning ? (
          <Spinner className="h-5 w-5" />
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </span>
      <div>
        <p className="font-semibold text-sm">{isRunning ? 'Running…' : label}</p>
        <p className="text-[#F4A943]/80 text-xs mt-0.5">{description}</p>
      </div>
    </button>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner className="h-8 w-8 text-[#8C0000]" />
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{message}</div>
    </div>
  )
}
