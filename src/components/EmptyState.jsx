export default function EmptyState({ icon = '📭', title, description }) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-12 px-6 text-center"
      style={{ borderRadius: 'var(--radius-lg)', background: 'var(--content-bg)', border: '1.5px dashed var(--content-border-strong)', color: 'var(--ink-faint)' }}
    >
      <span style={{ fontSize: '2rem', opacity: 0.6 }}>{icon}</span>
      {title && (
        <p style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: '14px' }}>{title}</p>
      )}
      {description && (
        <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--ink-faint)' }}>{description}</p>
      )}
    </div>
  )
}
