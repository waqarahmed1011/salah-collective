import { useState, useEffect } from 'react'
import { getRuns } from '../api'
import Spinner from '../components/Spinner'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RunHistory() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRuns()
      .then((r) => setRuns(r.data))
      .catch(() => setError('Failed to load run history.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner className="h-8 w-8 text-amber-600" /></div>
  if (error) return <div className="p-8"><div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{error}</div></div>

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Run History</h1>
        <p className="text-stone-500 text-sm mt-1">{runs.length} matching run{runs.length !== 1 ? 's' : ''} total</p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        {runs.length === 0 ? (
          <div className="py-12 text-center text-stone-400 text-sm">No runs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <Th>Date / Time</Th>
                <Th>Type</Th>
                <Th>Triggered by</Th>
                <Th right>Processed</Th>
                <Th right>Matched</Th>
                <Th right>Waitlisted</Th>
                <Th right>Groups formed</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} className={`border-b border-stone-50 ${i % 2 === 0 ? '' : 'bg-stone-50/50'}`}>
                  <Td>{formatDate(run.run_at)}</Td>
                  <Td>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      run.run_type === 'batch' ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-600'
                    }`}>
                      {run.run_type}
                    </span>
                  </Td>
                  <Td className="capitalize">{run.triggered_by}</Td>
                  <Td right>{run.members_processed}</Td>
                  <Td right className="text-green-700 font-medium">{run.members_matched}</Td>
                  <Td right className="text-amber-700 font-medium">{run.members_waitlisted}</Td>
                  <Td right>{run.groups_formed}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Th({ children, right }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, className = '' }) {
  return (
    <td className={`px-4 py-3 text-stone-700 ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  )
}
