import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUserProfile } from '../contexts/UserProfileContext'

export default function OnboardingPage() {
  const { createProfile } = useUserProfile()
  const [people, setPeople] = useState([])
  const [selfId, setSelfId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('people').select('id, name').order('name').then(({ data }) => setPeople(data || []))
  }, [])

  async function handleSubmit() {
    if (!selfId || !supervisorId) return
    if (selfId === supervisorId) { setError('You cannot be your own supervisor'); return }
    setSaving(true)
    await createProfile(selfId, supervisorId)
    setSaving(false)
  }

  const selectStyle = {
    width: '100%', border: '1.5px solid #e8e3da', borderRadius: '10px', padding: '12px 14px',
    background: 'white', color: '#1a1a2e', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '15px', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ef', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '32px', color: '#1a1a2e', marginBottom: 0 }}>
            Leadership <span style={{ color: '#e07a5f' }}>OS</span>
          </h1>
          <div style={{ width: 40, height: 3, background: '#e07a5f', borderRadius: 2, margin: '16px auto' }} />
          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '20px', color: '#4a4a6a', marginBottom: 8 }}>Welcome. Let&apos;s set up your space.</p>
          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '14px', color: '#9898b8', lineHeight: 1.6 }}>
            You&apos;re joining an existing team. Select who you are and who you report to.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.8px', color: '#9898b8', marginBottom: 6 }}>I am</label>
            <select value={selfId} onChange={e => { setSelfId(e.target.value); setError('') }} style={{ ...selectStyle, color: selfId ? '#1a1a2e' : '#9898b8' }}>
              <option value="">Select your name</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.8px', color: '#9898b8', marginBottom: 6 }}>My supervisor is</label>
            <select value={supervisorId} onChange={e => { setSupervisorId(e.target.value); setError('') }} style={{ ...selectStyle, color: supervisorId ? '#1a1a2e' : '#9898b8' }}>
              <option value="">Select your supervisor</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p style={{ fontSize: '12px', color: '#9898b8', marginTop: 6, lineHeight: 1.5 }}>Tasks you assign to your supervisor will appear in your Awaited quadrant</p>
          </div>
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: 12, textAlign: 'center' }}>{error}</p>}

        <button onClick={handleSubmit} disabled={!selfId || !supervisorId || saving}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px', border: 'none', cursor: selfId && supervisorId && !saving ? 'pointer' : 'not-allowed',
            background: selfId && supervisorId ? '#1a1a2e' : '#d4cfc5', color: selfId && supervisorId ? 'white' : '#9898b8',
            fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '15px', fontWeight: 500,
          }}>
          {saving ? 'Setting up…' : 'Set up my Leadership OS →'}
        </button>
      </div>
    </div>
  )
}
