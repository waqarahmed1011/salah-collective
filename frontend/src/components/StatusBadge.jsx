const CONFIG = {
  matched: { label: 'Matched', classes: 'bg-green-100 text-green-800' },
  unmatched: { label: 'Unmatched', classes: 'bg-stone-100 text-stone-600' },
  waitlisted: { label: 'Waitlisted', classes: 'bg-amber-100 text-amber-800' },
  geocode_failed: { label: 'Geocode Failed', classes: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }) {
  const { label, classes } = CONFIG[status] ?? { label: status, classes: 'bg-stone-100 text-stone-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}
