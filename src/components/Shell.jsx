import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Menu, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── section membership ────────────────────────────────────────────────────────

const WORK_PATHS = [
  '/capture', '/this-week', '/aspirations',
  '/team-tracker', '/planning-room', '/strategic',
]
const SELF_PATHS = [
  '/reflection-log', '/overview', '/habits', '/fitness',
  '/nutrition', '/meal-prep', '/health', '/quit-smoking',
  '/relationship', '/finances',
]

function getActiveSection(pathname) {
  if (WORK_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return 'Work'
  if (SELF_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return 'Self'
  return 'Dashboard'
}

// ── nav components ────────────────────────────────────────────────────────────

function NavItem({ to, label, sub = false, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${sub ? ' nav-sub' : ''}${isActive ? ' active' : ''}`}
    >
      {label}
    </NavLink>
  )
}

function StrategicGroup() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="nav-item w-full"
        style={{ border: 'none', cursor: 'pointer' }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>Strategic Planning</span>
        <span style={{ opacity: 0.45, fontSize: '11px', flexShrink: 0 }}>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>
      {open && (
        <div>
          <NavItem to="/strategic/people"          label="People"          sub />
          <NavItem to="/strategic/aspirations"     label="Aspirations"     sub />
          <NavItem to="/strategic/milestone-trees" label="Milestone Trees" sub />
          <NavItem to="/strategic/weekly-focus"    label="Weekly Focus"    sub />
        </div>
      )}
    </div>
  )
}

// ── toggle pill ───────────────────────────────────────────────────────────────

function TogglePill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(224,122,95,0.2)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent-coral)' : 'rgba(255,255,255,0.15)'}`,
        color: active ? 'white' : 'rgba(255,255,255,0.5)',
        borderRadius: '20px',
        padding: '5px 16px',
        fontSize: '13px',
        fontFamily: 'var(--font-sans)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
        }
      }}
    >
      {label}
    </button>
  )
}

// ── shell ─────────────────────────────────────────────────────────────────────

export default function Shell({ user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate      = useNavigate()
  const location      = useLocation()
  const activeSection = getActiveSection(location.pathname)

  const email    = user?.email ?? ''
  const initials = email ? email[0].toUpperCase() : '?'

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  function handleToggle(section) {
    if (section === 'Dashboard') { navigate('/dashboard'); return }
    if (section === 'Work'  && activeSection !== 'Work')  { navigate('/capture');        return }
    if (section === 'Self'  && activeSection !== 'Self')  { navigate('/reflection-log'); return }
  }

  return (
    <div>
      {/* ── Topbar ── */}
      <header className="shell-topbar">

        {/* Left: hamburger + logo */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: '10px', flexShrink: 0, minWidth: '180px' }}>
          <button
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '2px', display: 'flex', lineHeight: 1 }}
          >
            <Menu size={20} />
          </button>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '17px', color: 'white', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
            Leadership&nbsp;<span style={{ color: 'var(--accent-coral)', fontStyle: 'normal' }}>OS</span>
          </span>
        </div>

        {/* Center: toggle pills */}
        <div className="flex-1 flex justify-center">
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Dashboard', 'Work', 'Self'].map(section => (
              <TogglePill
                key={section}
                label={section}
                active={activeSection === section}
                onClick={() => handleToggle(section)}
              />
            ))}
          </div>
        </div>

        {/* Right: avatar + sign out */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 16px', gap: '10px', flexShrink: 0, minWidth: '180px' }}>
          <div
            style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}
          >
            {initials}
          </div>
          <span
            className="hidden lg:block"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {email}
          </span>
          <button
            onClick={handleSignOut}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <LogOut size={12} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className={`shell-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <nav className="flex flex-col" style={{ paddingTop: '8px' }}>

          {activeSection === 'Dashboard' && (
            <NavItem to="/dashboard" label="Dashboard" end />
          )}

          {activeSection === 'Work' && (
            <>
              <NavItem to="/capture"       label="Capture" />
              <NavItem to="/this-week"     label="This Week" />
              <NavItem to="/aspirations"   label="Aspirations" />
              <StrategicGroup />
              <NavItem to="/team-tracker"  label="Team Tracker" />
              <NavItem to="/planning-room" label="Planning Room" />
            </>
          )}

          {activeSection === 'Self' && (
            <>
              <NavItem to="/reflection-log" label="Reflection Log" />
              <NavItem to="/overview"       label="Overview" />
              <NavItem to="/habits"         label="Habits" />
              <NavItem to="/fitness"        label="Fitness & Weight" />
              <NavItem to="/nutrition"      label="Nutrition" />
              <NavItem to="/meal-prep"      label="Meal Prep" />
              <NavItem to="/health"         label="Health Indicators" />
              <NavItem to="/quit-smoking"   label="Quit Smoking" />
              <NavItem to="/relationship"   label="Relationship" />
              <NavItem to="/finances"       label="Finances" />
            </>
          )}

        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 md:hidden"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ── */}
      <main className="shell-main">
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}
