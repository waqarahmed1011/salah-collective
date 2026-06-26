import { useState, useEffect } from 'react'
import { getGeocodeFailures, retryGeocode } from '../api'
import Spinner from '../components/Spinner'
import { useToast } from '../components/ToastContext'

export default function GeocodeFailures() {
  const [failures, setFailures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [correctedAddresses, setCorrectedAddresses] = useState({})
  const [retrying, setRetrying] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    getGeocodeFailures()
      .then((r) => setFailures(r.data))
      .catch(() => setError('Failed to load geocode failures.'))
      .finally(() => setLoading(false))
  }, [])

  function setAddress(id, value) {
    setCorrectedAddresses((prev) => ({ ...prev, [id]: value }))
  }

  async function handleRetry(member) {
    const address = (correctedAddresses[member.id] ?? member.address_raw).trim()
    if (!address) return
    setRetrying(member.id)
    try {
      await retryGeocode(member.id, address)
      setFailures((prev) => prev.filter((m) => m.id !== member.id))
      toast({ message: `Geocoded ${member.full_name} successfully.` })
    } catch (err) {
      const msg = err.response?.data?.detail ?? 'Geocoding failed. Try a more specific address.'
      toast({ message: msg, type: 'error' })
    } finally {
      setRetrying(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner className="h-8 w-8 text-[#8C0000]" /></div>
  if (error) return <div className="p-8"><div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{error}</div></div>

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Geocode Failures</h1>
        <p className="text-stone-500 text-sm mt-1">
          {failures.length === 0
            ? 'No geocode failures — all addresses resolved.'
            : `${failures.length} member${failures.length !== 1 ? 's' : ''} with unresolvable addresses`}
        </p>
      </div>

      {failures.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <svg className="w-10 h-10 text-green-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-700 font-medium">All addresses resolved</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Original Address</th>
                <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Corrected Address</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {failures.map((member) => (
                <tr key={member.id} className="border-b border-stone-50 hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-800">{member.full_name}</td>
                  <td className="px-4 py-3 text-stone-500">{member.email}</td>
                  <td className="px-4 py-3 text-stone-400 max-w-48 truncate" title={member.address_raw}>
                    {member.address_raw}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={correctedAddresses[member.id] ?? member.address_raw}
                      onChange={(e) => setAddress(member.id, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRetry(member)}
                      className="w-full px-3 py-1.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8C0000] focus:border-transparent"
                      placeholder="Enter a corrected address"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRetry(member)}
                      disabled={retrying === member.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C0000] text-white text-xs font-medium rounded-lg hover:bg-[#6B0000] disabled:opacity-50 transition-colors"
                    >
                      {retrying === member.id ? <Spinner className="h-3 w-3" /> : null}
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
