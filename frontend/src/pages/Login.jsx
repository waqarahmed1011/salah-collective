import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { verifyKey } from '../api'
import Spinner from '../components/Spinner'
import dsLogo from '../../brand_assets/masjid-darussalam-logo-15.png'

export default function Login() {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    setError('')
    try {
      await verifyKey(key.trim())
      sessionStorage.setItem('adminKey', key.trim())
      navigate('/admin', { replace: true })
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Invalid admin key. Please try again.')
      } else {
        setError('Could not connect to server. Check that the backend is running.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-block bg-white rounded-2xl shadow-sm border border-stone-200 p-4 mb-4">
            <img src={dsLogo} alt="Masjid DarusSalam" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Salah Collective</h1>
          <p className="mt-1 text-stone-500 text-sm">Admin Dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="adminKey" className="block text-sm font-medium text-stone-700 mb-1.5">
                Admin Key
              </label>
              <input
                id="adminKey"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter your admin key"
                className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8C0000] focus:border-transparent"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#8C0000] text-white text-sm font-medium rounded-lg hover:bg-[#6B0000] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Spinner className="h-4 w-4" />}
              {loading ? 'Verifying…' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
