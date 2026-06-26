import { useToast } from './ToastContext'

export default function Toast() {
  const { toasts } = useToast()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm text-white max-w-xs ${
            t.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          <span className="mt-0.5 shrink-0">{t.type === 'error' ? '✕' : '✓'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
