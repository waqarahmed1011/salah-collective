import { useState, useEffect } from 'react'
import { getWaitlist, getGroups, moveMember, unmatchMember } from '../api'
import PrayerDots from '../components/PrayerDots'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import { useToast } from '../components/ToastContext'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Waitlist() {
  const [waitlist, setWaitlist] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedGroups, setSelectedGroups] = useState({})
  const [assigning, setAssigning] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    Promise.all([getWaitlist(), getGroups()])
      .then(([w, g]) => {
        setWaitlist(w.data)
        setGroups(g.data)
      })
      .catch(() => setError('Failed to load waitlist.'))
      .finally(() => setLoading(false))
  }, [])

  function setGroupForMember(memberId, groupId) {
    setSelectedGroups((prev) => ({ ...prev, [memberId]: groupId }))
  }

  async function handleAssign(member) {
    const groupId = selectedGroups[member.id]
    if (!groupId) return
    setAssigning(member.id)
    try {
      await moveMember(member.id, groupId)
      setWaitlist((prev) => prev.filter((w) => w.member.id !== member.id))
      const groupName = groups.find((g) => g.id === groupId)?.name ?? 'group'
      toast({ message: `${member.full_name} assigned to ${groupName}.` })
    } catch (err) {
      const msg = err.response?.data?.detail ?? 'Failed to assign member.'
      toast({ message: msg, type: 'error' })
    } finally {
      setAssigning(null)
    }
  }

  async function handleReset(member) {
    try {
      await unmatchMember(member.id)
      setWaitlist((prev) => prev.filter((w) => w.member.id !== member.id))
      toast({ message: `${member.full_name} reset to unmatched.` })
    } catch {
      toast({ message: 'Failed to reset member.', type: 'error' })
    } finally {
      setConfirm(null)
    }
  }

  const availableGroups = groups.filter((g) => g.size < 4)

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner className="h-8 w-8 text-[#8C0000]" /></div>
  if (error) return <div className="p-8"><div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{error}</div></div>

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Waitlist</h1>
        <p className="text-stone-500 text-sm mt-1">
          {waitlist.length === 0
            ? 'No one on the waitlist.'
            : `${waitlist.length} member${waitlist.length !== 1 ? 's' : ''} waiting for a group`}
        </p>
      </div>

      {waitlist.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <p className="text-amber-700 font-medium">Waitlist is empty</p>
          <p className="text-amber-500 text-sm mt-1">All members have been matched or are unmatched.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Salah</th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Waitlisted</th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Nearest group</th>
                  <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">Assign to group</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {waitlist.map(({ member, nearest_group_name, nearest_group_distance_miles }) => (
                  <tr key={member.id} className="border-b border-stone-50 hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium text-stone-800 whitespace-nowrap">{member.full_name}</td>
                    <td className="px-4 py-3 text-stone-500 max-w-40 truncate" title={member.address_raw}>
                      {member.address_raw}
                    </td>
                    <td className="px-4 py-3">
                      <PrayerDots member={member} />
                    </td>
                    <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                      {formatDate(member.signed_up_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {nearest_group_name ? (
                        <span className="text-stone-700">
                          {nearest_group_name}
                          {nearest_group_distance_miles != null && (
                            <span className="text-stone-400 text-xs ml-1">
                              ({nearest_group_distance_miles.toFixed(1)} mi)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedGroups[member.id] ?? ''}
                          onChange={(e) => setGroupForMember(member.id, e.target.value)}
                          className="px-2 py-1.5 border border-stone-300 rounded-lg text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#8C0000] max-w-36"
                        >
                          <option value="">Select group…</option>
                          {availableGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.size}/4)
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(member)}
                          disabled={!selectedGroups[member.id] || assigning === member.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#8C0000] text-white text-xs font-medium rounded-lg hover:bg-[#6B0000] disabled:opacity-40 transition-colors"
                        >
                          {assigning === member.id ? <Spinner className="h-3 w-3" /> : null}
                          Assign
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirm({ member })}
                        className="px-3 py-1.5 text-xs font-medium text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors"
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        title="Reset to unmatched?"
        message={`${confirm?.member?.full_name} will be moved back to unmatched and may be picked up in the next matching run.`}
        onConfirm={() => handleReset(confirm.member)}
        onCancel={() => setConfirm(null)}
        danger={false}
      />
    </div>
  )
}
