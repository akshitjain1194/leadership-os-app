import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getQuadrant } from '../lib/taskUtils'
import { useUserProfile } from '../contexts/UserProfileContext'
import { showToast } from '../components/Toast'

// ── main page ─────────────────────────────────────────────────────────────────

export default function CapturePage() {
  const { user } = useOutletContext()

  const [text,          setText]          = useState('')
  const [ownerId,       setOwnerId]       = useState('')
  const [date,          setDate]          = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving,        setSaving]        = useState(false)
  const [captureConfirm, setCaptureConfirm] = useState(null)

  // Ideas fetch state — kept per spec even though UI is removed
  const [ideas,        setIdeas]        = useState([])
  const [ideasLoading, setIdeasLoading] = useState(true)
  const [ideasError,   setIdeasError]   = useState(null)

  const [people,        setPeople]        = useState([])
  const [peopleLoading, setPeopleLoading] = useState(true)

  const [weeklyMilestones,      setWeeklyMilestones]      = useState([])
  const [selectedMilestoneId,   setSelectedMilestoneId]   = useState(null)
  const [milestoneSearch,       setMilestoneSearch]       = useState('')
  const [milestoneDropdownOpen, setMilestoneDropdownOpen] = useState(false)
  const [dateManuallySet,       setDateManuallySet]       = useState(false)
  const [unlinkedCount,         setUnlinkedCount]         = useState(0)
  const [linkedCount,           setLinkedCount]           = useState(0)

  const textareaRef         = useRef()
  const milestoneDropdownRef = useRef()

  useEffect(() => {
    loadIdeas(); loadPeople(); loadMilestones(); loadTaskLinkCounts()
  }, [user.id])

  useEffect(() => {
    if (!milestoneDropdownOpen) return
    function onMouse(e) { if (milestoneDropdownRef.current && !milestoneDropdownRef.current.contains(e.target)) setMilestoneDropdownOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setMilestoneDropdownOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [milestoneDropdownOpen])

  async function loadMilestones() {
    const { data: all } = await supabase
      .from('milestones')
      .select('id, text, aspiration_id, horizon, due_date, anchor_person_id, parent_milestone_id, aspirations(text, areas(name))')
      .eq('user_id', user.id)
      .in('horizon', ['Weekly', 'Monthly'])
      .not('status', 'eq', 'Done')
      .order('due_date', { ascending: true, nullsFirst: false })
    const allMs = all || []
    const weeklyParentIds = new Set(allMs.filter(m => m.horizon === 'Weekly').map(m => m.parent_milestone_id).filter(Boolean))
    const linkable = allMs.filter(m => m.horizon === 'Weekly' || (m.horizon === 'Monthly' && !weeklyParentIds.has(m.id)))
    setWeeklyMilestones(linkable)
  }

  async function loadTaskLinkCounts() {
    const [{ count: unlinked }, { count: linked }] = await Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('done', false).is('milestone_id', null),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('done', false).not('milestone_id', 'is', null),
    ])
    setUnlinkedCount(unlinked || 0)
    setLinkedCount(linked || 0)
  }

  async function loadPeople() {
    setPeopleLoading(true)
    const { data } = await supabase.from('people').select('id, name').order('name')
    setPeople(data || [])
    setPeopleLoading(false)
  }

  async function loadIdeas() {
    setIdeasLoading(true); setIdeasError(null)
    const { data, error } = await supabase
      .from('ideas').select('*').eq('user_id', user.id).eq('status', 'Active').order('created_at', { ascending: false })
    if (error) setIdeasError(error.message)
    else setIdeas(data)
    setIdeasLoading(false)
  }

  const { selfPersonId, supervisorPersonId } = useUserProfile()

  async function handleCapture() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const selectedMs = selectedMilestoneId ? weeklyMilestones.find(m => m.id === selectedMilestoneId) : null
      const effectiveOwnerId = ownerId || selectedMs?.anchor_person_id || ''
      const effectiveDate = date

      if (!effectiveOwnerId) {
        const { error } = await supabase.from('ideas').insert({ user_id: user.id, text: text.trim(), status: 'Active' })
        if (error) throw error
        setCaptureConfirm('Parked as idea')
        await loadIdeas()
      } else {
        const person = people.find(p => p.id === effectiveOwnerId)
        const ownerName = person?.name || ''
        const quadrant = getQuadrant(effectiveOwnerId, effectiveDate || null, selfPersonId, supervisorPersonId)
        const { error } = await supabase.from('tasks').insert({
          user_id: user.id, task: text.trim(), owner_id: effectiveOwnerId, owner: ownerName,
          due_date: effectiveDate || null, quadrant, done: false, starred: false,
          milestone_id: selectedMilestoneId || null,
        })
        if (error) throw error
        setCaptureConfirm(`Routed to ${quadrant}`)
        await loadTaskLinkCounts()
      }
      setTimeout(() => setCaptureConfirm(null), 2200)
      setText(''); setOwnerId(''); setDate(format(new Date(), 'yyyy-MM-dd')); setDateManuallySet(false)
      setSelectedMilestoneId(null); setMilestoneSearch(''); setMilestoneDropdownOpen(false)
      textareaRef.current?.focus()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setSaving(false)
  }

  // Kept per spec — used by idea-to-task conversion flow (not rendered here)
  async function handleConvert(idea, convOwnerId, convOwnerName, convDate, selfId, supId) {
    try {
      const quadrant = getQuadrant(convOwnerId || null, convDate || null, selfId, supId)
      const { error: taskErr } = await supabase.from('tasks').insert({ user_id: user.id, task: idea.text, owner_id: convOwnerId || null, owner: convOwnerName || null, due_date: convDate || null, quadrant, done: false, starred: false })
      if (taskErr) throw taskErr
      const { error: ideaErr } = await supabase.from('ideas').update({ status: 'Converted' }).eq('id', idea.id).eq('user_id', user.id)
      if (ideaErr) throw ideaErr
      showToast(`Converted → ${quadrant}`, 'success')
      await Promise.all([loadIdeas(), loadTaskLinkCounts()])
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

  // ── Milestone dropdown helpers ────────────────────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const filteredMs = milestoneSearch
    ? weeklyMilestones.filter(m => m.text.toLowerCase().includes(milestoneSearch.toLowerCase()))
    : weeklyMilestones

  const msAreaGroups = (() => {
    const areaMap = {}
    filteredMs.forEach(m => {
      const areaKey = m.aspirations?.areas?.name || '_none'
      const areaName = m.aspirations?.areas?.name || null
      const aspKey = m.aspiration_id || '_none'
      const aspText = m.aspirations?.text || 'No aspiration'
      if (!areaMap[areaKey]) areaMap[areaKey] = { areaName, asps: {} }
      if (!areaMap[areaKey].asps[aspKey]) areaMap[areaKey].asps[aspKey] = { aspText, items: [] }
      areaMap[areaKey].asps[aspKey].items.push(m)
    })
    return Object.values(areaMap).map(a => ({ ...a, asps: Object.values(a.asps) }))
  })()

  function fmtDue(d) {
    if (!d) return null
    return format(new Date(d + 'T00:00:00'), 'MMM d')
  }

  const unlinkedColor = unlinkedCount > 10 ? 'var(--danger)' : unlinkedCount >= 5 ? 'var(--accent-gold)' : 'var(--ink-faint)'

  return (
    <div className="page-pad flex flex-col gap-7">

      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>Capture</h1>
        <p style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>
          One place for everything.&nbsp;
          <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>Capture first, decide later.</span>
        </p>
      </div>

      <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)' }}>

        {/* Task textarea */}
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

        {/* Milestone search field */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--content-border)' }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', display: 'block', marginBottom: 8 }}>
            Milestone
          </label>
          <div ref={milestoneDropdownRef} style={{ position: 'relative' }}>
            <input
              value={milestoneSearch}
              onChange={e => { setMilestoneSearch(e.target.value); setSelectedMilestoneId(null); setMilestoneDropdownOpen(true) }}
              onFocus={() => setMilestoneDropdownOpen(true)}
              placeholder="Search milestones…"
              className="w-full outline-none"
              style={{
                border: `1px solid ${(milestoneDropdownOpen || selectedMilestoneId) ? 'var(--accent-green)' : 'var(--content-border)'}`,
                borderRadius: 'var(--radius-md)', padding: '12px 16px',
                paddingRight: selectedMilestoneId ? 44 : 16,
                background: 'var(--content-bg-card)', color: 'var(--ink)',
                fontFamily: 'var(--font-sans)', fontSize: '15px',
                width: '100%', boxSizing: 'border-box', transition: 'border-color 150ms',
              }}
            />
            {selectedMilestoneId && (
              <button
                onClick={() => { setSelectedMilestoneId(null); setMilestoneSearch(''); setMilestoneDropdownOpen(false) }}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-coral)', fontSize: '20px', lineHeight: 1, padding: 2, fontWeight: 300 }}
              >×</button>
            )}
            {milestoneDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', marginTop: 4, maxHeight: 480, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                {msAreaGroups.length === 0 && (
                  <div style={{ padding: '14px 14px', fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>No milestones found</div>
                )}
                {msAreaGroups.map((area, ai) => (
                  <div key={ai}>
                    {area.areaName && (
                      <div style={{ padding: '6px 14px 2px', background: 'var(--content-bg)', position: 'sticky', top: 0, zIndex: 2, fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--accent-coral)' }}>
                        {area.areaName}
                      </div>
                    )}
                    {area.asps.map((asp, asi) => (
                      <div key={asi}>
                        <div style={{ padding: '2px 14px 4px', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--ink-soft)', borderBottom: '0.5px solid var(--content-border)', background: 'var(--content-bg)', position: 'sticky', top: area.areaName ? 24 : 0, zIndex: 1 }}>
                          {asp.aspText}
                        </div>
                        {asp.items.map(m => {
                          const isOvd = m.due_date && m.due_date < todayStr
                          return (
                            <div key={m.id}
                              onClick={() => {
                                setSelectedMilestoneId(m.id); setMilestoneSearch(m.text); setMilestoneDropdownOpen(false)
                                if (!dateManuallySet && m.due_date) setDate(m.due_date)
                              }}
                              style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10, transition: 'background 100ms' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--content-bg)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-coral)', flexShrink: 0, marginTop: 4 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.text}</div>
                                <div style={{ fontSize: '11px', fontFamily: 'var(--font-sans)', color: 'var(--ink-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asp.aspText.length > 40 ? asp.aspText.slice(0, 40) + '…' : asp.aspText}</div>
                              </div>
                              {m.due_date && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: isOvd ? 'var(--danger)' : 'var(--ink-faint)', flexShrink: 0, minWidth: 44, textAlign: 'right' }}>{fmtDue(m.due_date)}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Task link summary pills */}
        <div className="flex gap-3 flex-wrap" style={{ padding: '12px 20px', borderBottom: '1px solid var(--content-border)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 14px', borderRadius: 20, background: 'var(--content-bg)', border: '1px solid var(--content-border)', color: unlinkedColor }}>
            {unlinkedCount} tasks not linked to any milestone
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 14px', borderRadius: 20, background: 'var(--content-bg)', border: '1px solid var(--content-border)', color: 'var(--accent-green)' }}>
            {linkedCount} tasks linked to milestones
          </span>
        </div>

        {/* Owner + Date + Capture */}
        <div className="flex gap-3 flex-wrap items-center" style={{ padding: '12px 20px', background: 'var(--content-bg)' }}>
          <select
            value={ownerId}
            onChange={e => setOwnerId(e.target.value)}
            className="flex-1"
            style={{ minWidth: '130px', border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'var(--content-bg-card)', color: ownerId ? 'var(--ink)' : 'var(--ink-faint)', fontFamily: 'var(--font-sans)', fontSize: '13px' }}
          >
            {peopleLoading ? (
              <option value="">Loading…</option>
            ) : people.length === 0 ? (
              <option value="" disabled>Add people first</option>
            ) : (
              <>
                <option value="">Owner (optional)</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </>
            )}
          </select>

          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setDateManuallySet(true) }}
            style={{ border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'var(--content-bg-card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
          />

          <button
            onClick={handleCapture}
            disabled={saving || !text.trim()}
            style={{
              padding: '7px 20px', borderRadius: 'var(--radius-sm)',
              background: text.trim() ? 'var(--accent-coral)' : 'var(--content-border)',
              color: text.trim() ? 'white' : 'var(--ink-faint)',
              border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
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

    </div>
  )
}
