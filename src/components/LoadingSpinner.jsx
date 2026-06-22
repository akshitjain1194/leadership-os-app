export default function LoadingSpinner({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: 'calc(100vh - 52px)' }}>
      <div
        className="animate-spin"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: '2.5px solid var(--content-border-strong)',
          borderTopColor: 'var(--accent-coral)',
        }}
      />
      <span style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>
        {message}
      </span>
    </div>
  )
}
