import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, isAfter, isBefore, subDays, subHours } from 'date-fns'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import EmptyState from '../components/EmptyState'

// ── constants ─────────────────────────────────────────────────────────────────

const QUADRANT_KEYS = ['Do Now', 'Do Soon', 'Schedule', 'Delegated', 'Awaited']

// ── helpers ───────────────────────────────────────────────────────────────────

function classifyTask(owner, dueDate) {
  if (owner === 'Rajesh') return 'Awaited'
  if (owner && owner !== 'Akshit') return 'Delegated'
  if (!dueDate) return 'Schedule'
  const due   = new Date(dueDate + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff  = Math.round((due - today) / 86400000)
  if (diff <= 0) return 'Do Now'
  if (diff <= 3) return 'Do Soon'
  return 'Schedule'
}

// ── IdeaCard ──────────────────────────────────────────────────────────────────

function IdeaCard({ idea, people, peopleLoading, onConvert, onRelease }) {
  const [converting, setConverting] = useState(false)
  const [convOwner, setConvOwner]   = useState('')
  const [convDate, setConvDate]     = useState(format(new Date(), 'yyyy-MM-dd'))

  const ageDays = Math.floor((Date.now() - new Date(idea.created_at).getTime()) / 86400000)
  const isAging = ageDays >= 7

  async function doConvert() {
    await onConvert(idea, convOwner, convDate)
    setConverting(false)
  }

  return (
    <div
      className="idea-card flex flex-col gap-3"
      style={{
        background: 'var(--content-bg-card)',
        border: `1px solid var(--content-border)`,
        borderLeft: `3px solid ${isAging ? 'var(--accent-gold)' : 'var(--accent-coral)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}
    >
      <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.6 }}>{idea.text}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
          {ageDays === 0 ? 'Today' : ageDays === 1 ? 'Yesterday' : `${ageDays}d ago`}
        </span>
        {isAging && (
          <span style={{ fontSize: '10.5px', background: 'var(--accent-gold-light)', color: 'var(--accent-gold)', padding: '2px 8px', borderRadius: '10px', fontWeight: 500 }}>
            Aging
          </span>
        )}
      </div>

      {converting ? (
        <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid var(--content-border)' }}>
          <select
            value={convOwner}
            onChange={e => setConvOwner(e.target.value)}
            disabled={peopleLoading || people.length === 0}
            className="w-full"
            style={{ border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', background: 'var(--content-bg)', color: convOwner ? 'var(--ink)' : 'var(--ink-faint)', fontFamily: 'var(--font-sans)', fontSize: '13px' }}
          >
            {peopleLoading ? (
              <option value="">Loading…</option>
            ) : people.length === 0 ? (
              <option value="" disabled>Add people first</option>
            ) : (
              <>
                <option value="">Owner (optional)</option>
                {people.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </>
            )}
          </select>
          <input
            type="date"
            value={convDate}
            onChange={e => setConvDate(e.target.value)}
            style={{ border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', background: 'var(--content-bg)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '13px', width: '100%' }}
          />
          <div className="flex gap-2">
            <button
              onClick={doConvert}
              style={{ flex: 1, padding: '7px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-green)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}
            >
              Convert to task
            </button>
            <button
              onClick={() => setConverting(false)}
              style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="idea-actions flex gap-2">
          <button
            onClick={() => setConverting(true)}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-coral)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}
          >
            Convert →
          </button>
          <button
            onClick={() => onRelease(idea)}
            style={{ fontSize: '12px', padding: '4px 12px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-faint)', border: '1px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
          >
            Release
          </button>
        </div>
      )}
    </div>
  )
}

// ── ReviewCard ─────────────────────────────────────────────────────────────────

function ReviewCard({ label, count, countColor, children }) {
  return (
    <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
      <div className="flex items-start justify-between mb-3">
        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.9px', color: 'var(--ink-faint)' }}>
          {label}
        </span>
        <span style={{ fontSize: '22px', fontFamily: 'var(--font-serif)', fontWeight: 700, color: countColor, lineHeight: 1 }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function CapturePage() {
  const { user } = useOutletContext()

  const [text,    setText]    = useState('')
  const [owner,   setOwner]   = useState('')
  const [date,    setDate]    = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving,  setSaving]  = useState(false)
  const [captureConfirm, setCaptureConfirm] = useState(null)

  const [ideas,       setIdeas]       = useState([])
  const [ideasLoading, setIdeasLoading] = useState(true)
  const [ideasError,   setIdeasError]   = useState(null)
  const [taskCounts,  setTaskCounts]  = useState({})

  const [people,        setPeople]        = useState([])
  const [peopleLoading, setPeopleLoading] = useState(true)

  const [ideaFilter, setIdeaFilter] = useState('all')
  const [search,     setSearch]     = useState('')

  const textareaRef = useRef()

  useEffect(() => { loadIdeas(); loadTaskCounts(); loadPeople() }, [user.id])

  async function loadPeople() {
    setPeopleLoading(true)
    const { data } = await supabase
      .from('people')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name')
    setPeople(data || [])
    setPeopleLoading(false)
  }

  async function loadIdeas() {
    setIdeasLoading(true); setIdeasError(null)
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .order('created_at', { ascending: false })
    if (error) setIdeasError(error.message)
    else setIdeas(data)
    setIdeasLoading(false)
  }

  async function loadTaskCounts() {
    const { data } = await supabase
      .from('tasks')
      .select('quadrant')
      .eq('user_id', user.id)
      .eq('done', false)
    if (!data) return
    const counts = {}
    data.forEach(t => { counts[t.quadrant] = (counts[t.quadrant] || 0) + 1 })
    setTaskCounts(counts)
  }

  async function handleCapture() {
    if (!text.trim()) return
    setSaving(true)
    try {
      if (!owner) {
        const { error } = await supabase.from('ideas').insert({ user_id: user.id, text: text.trim(), status: 'Active' })
        if (error) throw error
        setCaptureConfirm('Parked as idea')
        await loadIdeas()
      } else {
        const quadrant = classifyTask(owner, date)
        const { error } = await supabase.from('tasks').insert({ user_id: user.id, task: text.trim(), owner, due_date: date || null, quadrant, done: false, starred: false })
        if (error) throw error
        setCaptureConfirm(`Routed to ${quadrant}`)
        await loadTaskCounts()
      }
      setTimeout(() => setCaptureConfirm(null), 2200)
      setText(''); setOwner(''); setDate(format(new Date(), 'yyyy-MM-dd'))
      textareaRef.current?.focus()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setSaving(false)
  }

  async function handleConvert(idea, convOwner, convDate) {
    try {
      const quadrant = classifyTask(convOwner, convDate)
      const { error: taskErr } = await supabase.from('tasks').insert({ user_id: user.id, task: idea.text, owner: convOwner, due_date: convDate || null, quadrant, done: false, starred: false })
      if (taskErr) throw taskErr
      const { error: ideaErr } = await supabase.from('ideas').update({ status: 'Converted' }).eq('id', idea.id).eq('user_id', user.id)
      if (ideaErr) throw ideaErr
      showToast(`Converted → ${quadrant}`, 'success')
      await Promise.all([loadIdeas(), loadTaskCounts()])
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function handleRelease(idea) {
    try {
      const { error } = await supabase.from('ideas').update({ status: 'Released' }).eq('id', idea.id).eq('user_id', user.id)
      if (error) throw error
      showToast('Idea released', 'success')
      await loadIdeas()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const now         = new Date()
  const unprocessed = ideas.filter(i => isAfter(new Date(i.created_at), subHours(now, 24)))
  const aging       = ideas.filter(i => isBefore(new Date(i.created_at), subDays(now, 7)))

  const filteredIdeas = ideas.filter(i => {
    if (search && !i.text.toLowerCase().includes(search.toLowerCase())) return false
    if (ideaFilter === 'recent') return isAfter(new Date(i.created_at), subDays(now, 7))
    if (ideaFilter === 'aging')  return isBefore(new Date(i.created_at), subDays(now, 7))
    return true
  })

  return (
    <div className="page-pad flex flex-col gap-7">

      {/* ── Header + capture card ── */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>
          Capture
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>
          One place for everything.&nbsp;
          <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>Capture first, decide later.</span>
        </p>
      </div>

      <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Textarea */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--content-border)' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCapture() }}
            rows={2}
            placeholder="What's on your mind?"
            className="w-full resize-none outline-none"
            style={{ background: 'transparent', border: 'none', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: 1.65 }}
          />
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-center" style={{ padding: '12px 20px', background: 'var(--content-bg)' }}>
          <select
            value={owner}
            onChange={e => setOwner(e.target.value)}
            className="flex-1"
            style={{ minWidth: '130px', border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'var(--content-bg-card)', color: owner ? 'var(--ink)' : 'var(--ink-faint)', fontFamily: 'var(--font-sans)', fontSize: '13px' }}
          >
            {peopleLoading ? (
              <option value="">Loading…</option>
            ) : people.length === 0 ? (
              <option value="" disabled>Add people first</option>
            ) : (
              <>
                <option value="">Owner (optional)</option>
                {people.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </>
            )}
          </select>

          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'var(--content-bg-card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
          />

          <button
            onClick={handleCapture}
            disabled={saving || !text.trim()}
            style={{
              padding: '7px 20px',
              borderRadius: 'var(--radius-sm)',
              background: text.trim() ? 'var(--accent-coral)' : 'var(--content-border)',
              color: text.trim() ? 'white' : 'var(--ink-faint)',
              border: 'none',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {saving ? 'Saving…' : 'Capture →'}
          </button>
        </div>

        {/* Confirmation strip */}
        {captureConfirm && (
          <div
            className="capture-confirm"
            style={{ padding: '10px 20px', background: 'var(--accent-green-light)', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', borderTop: '1px solid var(--content-border)' }}
          >
            → {captureConfirm}
          </div>
        )}
      </div>

      {/* ── Daily review cards ── */}
      <div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--ink-faint)', marginBottom: '12px' }}>
          Daily Review
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <ReviewCard label="Inbox" count={unprocessed.length} countColor="var(--accent-coral)">
            <p style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginBottom: '8px' }}>Captured last 24h</p>
            {unprocessed.slice(0, 3).map(i => (
              <p key={i.id} style={{ fontSize: '11.5px', color: 'var(--ink)', paddingLeft: '8px', borderLeft: '2px solid var(--accent-coral)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
                {i.text}
              </p>
            ))}
            {unprocessed.length === 0 && <p style={{ fontSize: '11px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>All clear</p>}
          </ReviewCard>

          <ReviewCard label="Aging ideas" count={aging.length} countColor="var(--accent-gold)">
            <p style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginBottom: '8px' }}>Sitting 7+ days</p>
            {aging.slice(0, 3).map(i => (
              <p key={i.id} style={{ fontSize: '11.5px', color: 'var(--ink)', paddingLeft: '8px', borderLeft: '2px solid var(--accent-gold)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
                {i.text}
              </p>
            ))}
            {aging.length === 0 && <p style={{ fontSize: '11px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Nothing aging</p>}
          </ReviewCard>

          <ReviewCard label="Task load" count={Object.values(taskCounts).reduce((a, b) => a + b, 0)} countColor="var(--accent-purple)">
            <p style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginBottom: '8px' }}>Active tasks</p>
            {QUADRANT_KEYS.map(q => (
              <div key={q} className="flex items-center justify-between" style={{ marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>{q}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{taskCounts[q] ?? 0}</span>
              </div>
            ))}
          </ReviewCard>
        </div>
      </div>

      {/* ── Ideas grid ── */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--ink-faint)' }}>
            Ideas ({filteredIdeas.length})
          </span>
          <div className="flex gap-2 flex-wrap items-center">
            {['all', 'recent', 'aging'].map(f => (
              <button
                key={f}
                onClick={() => setIdeaFilter(f)}
                style={{
                  padding: '4px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: ideaFilter === f ? 500 : 400,
                  background: ideaFilter === f ? 'var(--accent-coral)' : 'transparent',
                  color: ideaFilter === f ? 'white' : 'var(--ink-faint)',
                  border: `1.5px solid ${ideaFilter === f ? 'var(--accent-coral)' : 'var(--content-border)'}`,
                  cursor: 'pointer',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="outline-none"
              style={{ border: '1.5px solid var(--content-border)', borderRadius: '20px', padding: '4px 12px', background: 'var(--content-bg-card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '12px', width: '120px' }}
            />
          </div>
        </div>

        {ideasLoading && <p style={{ fontSize: '13px', color: 'var(--ink-faint)', textAlign: 'center', padding: '32px 0' }}>Loading ideas…</p>}
        {ideasError   && <p style={{ fontSize: '13px', color: 'var(--accent-coral)' }}>Error: {ideasError}</p>}
        {!ideasLoading && !ideasError && filteredIdeas.length === 0 && (
          <EmptyState icon="💡" title="No ideas yet" description="Capture without an owner to park something as an idea." />
        )}
        {!ideasLoading && !ideasError && filteredIdeas.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {filteredIdeas.map(i => (
              <IdeaCard key={i.id} idea={i} people={people} peopleLoading={peopleLoading} onConvert={handleConvert} onRelease={handleRelease} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
