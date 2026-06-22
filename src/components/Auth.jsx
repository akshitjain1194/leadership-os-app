import { supabase } from '../lib/supabase'

export default function Auth() {
  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#faf7f2' }}
    >
      <div className="flex flex-col items-center gap-6 px-8 py-12 max-w-sm w-full">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-2">
          <h1
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: '2.25rem',
              color: '#1a1a2e',
              letterSpacing: '-0.5px',
              lineHeight: 1.1,
            }}
          >
            Leadership <span style={{ color: '#52b788' }}>OS</span>
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.875rem',
              color: '#6b6b8a',
              textAlign: 'center',
              lineHeight: 1.5,
              maxWidth: '260px',
            }}
          >
            Your personal operating system for work, growth, and life
          </p>
        </div>

        {/* Divider */}
        <div style={{ width: '40px', height: '2px', background: '#dedad2', borderRadius: '2px' }} />

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          className="flex items-center justify-center gap-3 w-full py-3 px-6 rounded-xl font-medium transition-all duration-150"
          style={{
            background: '#2d6a4f',
            color: 'white',
            fontSize: '0.9375rem',
            fontFamily: "'DM Sans', sans-serif",
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(45,106,79,0.25)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#245c43')}
          onMouseLeave={e => (e.currentTarget.style.background = '#2d6a4f')}
        >
          {/* Google Icon */}
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <path d="M44.5 20H24v8.5h11.8C34.7 33.9 29.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.2-2.7-.5-4z" fill="white" fillOpacity="0.9"/>
          </svg>
          Continue with Google
        </button>

        <p
          style={{
            fontSize: '0.75rem',
            color: '#9898b8',
            fontFamily: "'DM Mono', monospace",
            textAlign: 'center',
          }}
        >
          Single sign-on · No password needed
        </p>
      </div>
    </div>
  )
}
