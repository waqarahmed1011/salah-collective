import { useState, useEffect, useRef } from 'react'
import { getGroups, getGroup, renameGroup, disbandGroup, unmatchMember } from '../api'
import PrayerDots from '../components/PrayerDots'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import { useToast } from '../components/ToastContext'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [expandedData, setExpandedData] = useState({})
  const [loadingExpand, setLoadingExpand] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirm, setConfirm] = useState(null)
  const renameInputRef = useRef(null)
  const { toast } = useToast()

  async function fetchGroups() {
    try {
      const r = await getGroups()
      setGroups(r.data)
      setError(null)
    } catch {
      setError('Failed to load groups.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchGroups() }, [])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  async function handleToggleExpand(group) {
    if (expandedId === group.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(group.id)
    if (!expandedData[group.id]) {
      setLoadingExpand(group.id)
      try {
        const r = await getGroup(group.id)
        setExpandedData((prev) => ({ ...prev, [group.id]: r.data }))
      } catch {
        toast({ message: 'Failed to load group details.', type: 'error' })
        setExpandedId(null)
      } finally {
        setLoadingExpand(null)
      }
    }
  }

  function startRename(group, e) {
    e.stopPropagation()
    setRenamingId(group.id)
    setRenameValue(group.name)
  }

  async function submitRename(groupId) {
    if (!renameValue.trim()) {
      setRenamingId(null)
      return
    }
    try {
      await renameGroup(groupId, renameValue.trim())
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, name: renameValue.trim() } : g))
      toast({ message: 'Group renamed.' })
    } catch {
      toast({ message: 'Failed to rename group.', type: 'error' })
    } finally {
      setRenamingId(null)
    }
  }

  async function handleConfirm() {
    if (!confirm) return
    if (confirm.type === 'disband') {
      try {
        await disbandGroup(confirm.groupId)
        setGroups((prev) => prev.filter((g) => g.id !== confirm.groupId))
        if (expandedId === confirm.groupId) setExpandedId(null)
        setExpandedData((prev) => { const n = { ...prev }; delete n[confirm.groupId]; return n })
        toast({ message: 'Group disbanded.' })
      } catch {
        toast({ message: 'Failed to disband group.', type: 'error' })
      }
    } else if (confirm.type === 'remove') {
      try {
        await unmatchMember(confirm.memberId)
        const gid = confirm.groupId
        setGroups((prev) => prev.map((g) =>
          g.id === gid
            ? { ...g, size: g.size - 1, members: g.members.filter((m) => m.id !== confirm.memberId) }
            : g
        ))
        setExpandedData((prev) =>
          prev[gid]
            ? { ...prev, [gid]: { ...prev[gid], members: prev[gid].members.filter((m) => m.id !== confirm.memberId) } }
            : prev
        )
        toast({ message: `${confirm.memberName} moved to unmatched.` })
      } catch {
        toast({ message: 'Failed to remove member.', type: 'error' })
      }
    }
    setConfirm(null)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner className="h-8 w-8 text-[#8C0000]" /></div>
  if (error) return <div className="p-8"><div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">{error}</div></div>

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Groups</h1>
        <p className="text-stone-500 text-sm mt-1">{groups.length} active group{groups.length !== 1 ? 's' : ''}</p>
      </div>

      {groups.length === 0 ? (
        <div className="bg-stone-100 rounded-xl p-8 text-center text-stone-400 text-sm">
          No groups yet. Run matching to create groups.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isExpanded={expandedId === group.id}
              isLoadingExpand={loadingExpand === group.id}
              fullData={expandedData[group.id]}
              renamingId={renamingId}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              onToggleExpand={() => handleToggleExpand(group)}
              onStartRename={(e) => startRename(group, e)}
              onRenameChange={setRenameValue}
              onRenameSubmit={() => submitRename(group.id)}
              onRenameCancel={() => setRenamingId(null)}
              onDisband={(e) => { e.stopPropagation(); setConfirm({ type: 'disband', groupId: group.id, groupName: group.name }) }}
              onRemoveMember={(member) => setConfirm({ type: 'remove', groupId: group.id, memberId: member.id, memberName: member.full_name })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        title={confirm?.type === 'disband' ? `Disband "${confirm?.groupName}"?` : 'Remove member?'}
        message={
          confirm?.type === 'disband'
            ? 'All members will be moved back to unmatched. This cannot be undone.'
            : `${confirm?.memberName} will be moved back to unmatched and can be re-matched in the next run.`
        }
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function GroupCard({
  group, isExpanded, isLoadingExpand, fullData,
  renamingId, renameValue, renameInputRef,
  onToggleExpand, onStartRename, onRenameChange, onRenameSubmit, onRenameCancel,
  onDisband, onRemoveMember,
}) {
  const isRenaming = renamingId === group.id
  const displayMembers = isExpanded && fullData ? fullData.members : group.members

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggleExpand}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-stone-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <form
              onSubmit={(e) => { e.preventDefault(); onRenameSubmit() }}
              onClick={(e) => e.stopPropagation()}
              className="flex gap-2"
            >
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={onRenameSubmit}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() } }}
                className="flex-1 px-2 py-1 border border-[#8C0000] rounded text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#8C0000]"
              />
            </form>
          ) : (
            <p className="font-semibold text-stone-900 truncate pr-2">{group.name}</p>
          )}
          <p className="text-xs text-stone-400 mt-0.5">{group.size} member{group.size !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onStartRename}
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition-colors"
            title="Rename group"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDisband}
            className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Disband group"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <svg
            className={`w-4 h-4 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isLoadingExpand && (
        <div className="px-4 py-3 border-t border-stone-100 flex justify-center">
          <Spinner className="h-5 w-5 text-[#F4A943]" />
        </div>
      )}

      {!isLoadingExpand && displayMembers?.length > 0 && (
        <ul className="border-t border-stone-100 divide-y divide-stone-50">
          {displayMembers.map((member) => (
            <li key={member.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{member.full_name}</p>
                  {isExpanded && fullData && member.address_raw && (
                    <p className="text-xs text-stone-400 mt-0.5 truncate" title={member.address_raw}>
                      {member.address_raw}
                    </p>
                  )}
                  {isExpanded && fullData && member.notes && (
                    <p className="text-xs text-stone-400 mt-0.5 italic truncate">{member.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PrayerDots member={member} />
                  {isExpanded && fullData && (
                    <button
                      onClick={() => onRemoveMember(member)}
                      className="p-1 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remove from group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
