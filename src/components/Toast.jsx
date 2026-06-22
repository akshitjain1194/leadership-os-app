import { useState, useEffect, useCallback } from 'react'

const TYPE_STYLES = {
  success: { background: 'var(--accent-green)',  color: 'white' },
  warning: { background: 'var(--accent-gold)',   color: 'white' },
  error:   { background: 'var(--danger)',        color: 'white' },
}

const listeners = []

export function showToast(message, type = 'success') {
  listeners.forEach(fn => fn({ message, type, id: Date.now() + Math.random() }))
}

export default function Toast() {
  const [toasts, setToasts] = useState([])

  const add = useCallback((toast) => {
    setToasts(prev => [...prev, toast])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id))
    }, 2500)
  }, [])

  useEffect(() => {
    listeners.push(add)
    return () => {
      const idx = listeners.indexOf(add)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }, [add])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2" style={{ zIndex: 200 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="toast-item"
          style={{
            ...(TYPE_STYLES[t.type] ?? TYPE_STYLES.success),
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 500,
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
