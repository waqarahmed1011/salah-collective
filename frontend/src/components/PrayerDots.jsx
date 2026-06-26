const PRAYERS = [
  { key: 'fajr', label: 'F' },
  { key: 'zuhr', label: 'Z' },
  { key: 'asr', label: 'A' },
  { key: 'maghrib', label: 'M' },
  { key: 'isha', label: 'I' },
]

export default function PrayerDots({ member }) {
  return (
    <div className="flex gap-1">
      {PRAYERS.map(({ key, label }) => (
        <span
          key={key}
          title={key.charAt(0).toUpperCase() + key.slice(1)}
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold ${
            member[key] ? 'bg-[#F4A943] text-[#8C0000]' : 'bg-stone-200 text-stone-400'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  )
}
