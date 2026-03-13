import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let idCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++idCounter
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border bg-white min-w-[260px] max-w-[380px]"
            style={{
              borderColor:
                t.type === 'success'
                  ? 'rgba(13,122,78,0.2)'
                  : t.type === 'error'
                  ? 'rgba(192,21,46,0.2)'
                  : 'rgba(108,78,232,0.2)',
              boxShadow:
                t.type === 'success'
                  ? '0 4px 20px rgba(13,122,78,0.1)'
                  : t.type === 'error'
                  ? '0 4px 20px rgba(192,21,46,0.1)'
                  : '0 4px 20px rgba(108,78,232,0.1)',
            }}
          >
            {t.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
            ) : t.type === 'error' ? (
              <XCircle className="w-4 h-4 text-danger flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-violet flex-shrink-0" />
            )}
            <span className="text-[13px] font-[600] text-ink-1 flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-ink-3 hover:text-ink-2 transition-colors flex-shrink-0 ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
