import { useState, useEffect, useCallback } from 'react'
import { getMembers, getGroups, updateMember, moveMember, unmatchMember } from '../api'
import StatusBadge from '../components/StatusBadge'
import PrayerDots from '../components/PrayerDots'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import { useToast } from '../components/ToastContext'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'matched', label: 'Matched' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'geocode_failed', label: 'Geocode Failed' },
]

const PRAYERS = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha']

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Members() {
  const [members, setMembers] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveGroupId, setMoveGroupId] = useState('')
  const [confirm, setConfirm] = useState(null)
  const { toast } = useToast()

  const fetchMembers = useCallback(async (q, s) => {
    try {
      const params = {}
      if (q) params.search = q
      if (s) params.status = s
      const res = await getMembers(params)
      setMembers(res.data)
      setError(null)
    } catch {
      setError('Failed to load members.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getGroups().then((r) => setGroups(r.data))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      fetchMembers(search, statusFilter)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, statusFilter, fetchMembers])

  function openPanel(member) {
    setSelectedMember(member)
    setEditForm({ ...member })
    setMoveGroupId('')
  }

  function closePanel() {
    setSelectedMember(null)
    setEditForm({})
  }

  function updateField(key, value) {
    setEditForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await updateMember(selectedMember.id, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        address_raw: editForm.address_raw,
        fajr: editForm.fajr,
        zuhr: editForm.zuhr,
        asr: editForm.asr,
        maghrib: editForm.maghrib,
        isha: editForm.isha,
        has_car: editForm.has_car,
        notes: editForm.notes,
      })
      setMembers((prev) => prev.map((m) => (m.id === selectedMember.id ? res.data : m)))
      setSelectedMember(res.data)
      setEditForm({ ...res.data })
      toast({ message: 'Member updated.' })
    } catch {
      toast({ message: 'Failed to save changes.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleMove() {
    if (!moveGroupId) return
    setMoving(true)
    try {
      const res = await moveMember(selectedMember.id, moveGroupId)
      setMembers((prev) => prev.map((m) => (m.id === selectedMember.id ? res.data : m)))
      setSelectedMember(res.data)
      setEditForm({ ...res.data })
      const groupName = groups.find((g) => g.id === moveGroupId)?.name ?? 'group'
      toast({ message: `Moved to ${groupName}.` })
      setMoveGroupId('')
    } catch (err) {
      const msg = err.response?.data?.detail ?? 'Failed to move member.'
      toast({ message: msg, type: 'error' })
    } finally {
      setMoving(false)
    }
  }

  async function handleUnmatch() {
    try {
      const res = await unmatchMember(selectedMember.id)
      setMembers((prev) => prev.map((m) => (m.id === selectedMember.id ? res.data : m)))
      setSelectedMember(res.data)
      setEditForm({ ...res.data })
      toast({ message: 'Member moved to unmatched.' })
    } catch {
      toast({ message: 'Failed to unmatch member.', type: 'error' })
    } finally {
      setConfirm(null)
    }
  }

  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.name]))

  if (error && !members.length) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{error}</div>
    </div>
  )

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">All Members</h1>
        <p className="text-stone-500 text-sm mt-1">{members.length} member{members.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8C0000] focus:border-transparent w-64"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#8C0000]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {loading && <div className="flex items-center"><Spinner className="h-4 w-4 text-[#F4A943]" /></div>}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        {members.length === 0 && !loading ? (
          <div className="py-12 text-center text-stone-400 text-sm">
            No members found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th>Address</Th>
                  <Th>Status</Th>
                  <Th>Group</Th>
                  <Th>Signed up</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => openPanel(member)}
                    className={`border-b border-stone-50 cursor-pointer hover:bg-[#8C0000]/5 transition-colors ${
                      selectedMember?.id === member.id ? 'bg-[#8C0000]/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-stone-800 whitespace-nowrap">{member.full_name}</td>
                    <td className="px-4 py-3 text-stone-500">{member.email}</td>
                    <td className="px-4 py-3 text-stone-500">{member.phone || '—'}</td>
                    <td className="px-4 py-3 text-stone-500 max-w-44 truncate" title={member.address_raw}>
                      {member.address_raw}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                      {member.group_id ? groupMap[member.group_id] ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-stone-400 whitespace-nowrap">{formatDate(member.signed_up_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedMember && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={closePanel} />
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-40 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50">
              <div>
                <h2 className="font-semibold text-stone-900">{selectedMember.full_name}</h2>
                <StatusBadge status={selectedMember.status} />
              </div>
              <button
                onClick={closePanel}
                className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              <Section title="Contact Info">
                <Field label="Full name">
                  <input value={editForm.full_name ?? ''} onChange={(e) => updateField('full_name', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Email">
                  <input type="email" value={editForm.email ?? ''} onChange={(e) => updateField('email', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Phone">
                  <input value={editForm.phone ?? ''} onChange={(e) => updateField('phone', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Address">
                  <input value={editForm.address_raw ?? ''} onChange={(e) => updateField('address_raw', e.target.value)} className={inputClass} />
                </Field>
              </Section>

              <Section title="Prayer Attendance">
                <div className="flex flex-wrap gap-3">
                  {PRAYERS.map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editForm[p] ?? false}
                        onChange={(e) => updateField(p, e.target.checked)}
                        className="w-4 h-4 text-[#8C0000] rounded focus:ring-[#8C0000] border-stone-300"
                      />
                      <span className="text-sm text-stone-700 capitalize">{p}</span>
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="Other">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editForm.has_car ?? false}
                    onChange={(e) => updateField('has_car', e.target.checked)}
                    className="w-4 h-4 text-[#8C0000] rounded focus:ring-[#8C0000] border-stone-300"
                  />
                  <span className="text-sm text-stone-700">Has a car</span>
                </label>
                <Field label="Notes" className="mt-3">
                  <textarea
                    value={editForm.notes ?? ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </Section>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#8C0000] text-white text-sm font-medium rounded-lg hover:bg-[#6B0000] disabled:opacity-60 transition-colors"
              >
                {saving && <Spinner className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>

              <Section title="Move to Group">
                <div className="flex gap-2">
                  <select
                    value={moveGroupId}
                    onChange={(e) => setMoveGroupId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8C0000]"
                  >
                    <option value="">Select group…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} ({g.size}/4)</option>
                    ))}
                  </select>
                  <button
                    onClick={handleMove}
                    disabled={!moveGroupId || moving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-stone-800 text-white text-sm font-medium rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
                  >
                    {moving && <Spinner className="h-4 w-4" />}
                    Move
                  </button>
                </div>
              </Section>

              {selectedMember.status === 'matched' && (
                <Section title="Danger Zone">
                  <button
                    onClick={() => setConfirm({ type: 'unmatch' })}
                    className="px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Unmatch member
                  </button>
                </Section>
              )}

              <div className="text-xs text-stone-400 pt-2 pb-4 space-y-1">
                <p>Signed up: {formatDate(selectedMember.signed_up_at)}</p>
                {selectedMember.group_id && (
                  <p>Group: {groupMap[selectedMember.group_id] ?? selectedMember.group_id}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        title="Unmatch this member?"
        message="They will be moved back to unmatched and can be re-matched in the next run."
        onConfirm={handleUnmatch}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

const inputClass = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8C0000] focus:border-transparent'

function Th({ children }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-left">{children}</th>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children, className = '' }) {
  return (
    <div className={`mb-3 ${className}`}>
      <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
