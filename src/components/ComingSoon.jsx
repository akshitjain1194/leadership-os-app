import { useLocation } from 'react-router-dom'

export default function ComingSoon() {
  const { pathname } = useLocation()
  const pageName = pathname
    .replace(/^\//, '')
    .replace(/\//g, ' · ')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'This page'

  return (
    <div className="page-pad flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 52px)' }}>
      <div
        className="flex flex-col items-center gap-5 text-center"
        style={{ maxWidth: '340px' }}
      >
        {/* CSS geometric shape */}
        <div style={{ position: 'relative', width: '56px', height: '56px', marginBottom: '8px' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '38px', height: '38px', border: '2px solid var(--content-border-strong)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '26px', height: '26px', background: 'var(--content-border)', borderRadius: 'var(--radius-sm)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '8px', height: '8px', background: 'var(--accent-coral)', borderRadius: '50%' }} />
        </div>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--ink)', lineHeight: 1.2 }}>
          {pageName}
        </h2>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--ink-faint)' }}>
          Coming in the next phase
        </p>

        <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          The Leadership OS is being built piece by piece. This section is on the roadmap.
        </p>

        <div
          style={{ fontSize: '10.5px', color: 'var(--accent-coral)', background: 'var(--accent-coral-light)', border: '1px solid var(--accent-coral)33', padding: '4px 14px', borderRadius: '20px', fontFamily: 'var(--font-mono)' }}
        >
          Phase 2
        </div>
      </div>
    </div>
  )
}
