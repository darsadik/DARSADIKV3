import { useState, useCallback } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  function ToastContainer() {
    if (toasts.length === 0) return null
    return (
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold animate-fade-in ${
            t.type === 'error'   ? 'bg-red-50 border-red-200 text-red-700'     :
            t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                   'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <span className="flex-shrink-0">
              {t.type === 'error' ? '❌' : t.type === 'success' ? '✅' : 'ℹ️'}
            </span>
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    )
  }

  return { toast, ToastContainer }
}
