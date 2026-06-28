import { useState, useEffect, useRef } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOwnerName } from '../lib/taskUtils'
import { getAreaColor } from '../lib/areaUtils'
import { showToast } from '../components/Toast'
import { Check, ChevronDown, ChevronRight, CalendarCheck, User, X, Plus } from 'lucide-react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const STATUS_BORDER = { Active: 'var(--accent-green)', 'At Risk': 'var(--warning)', Done: 'var(--ink-faint)', Paused: 'var(--content-border)' }
const STATUS_BADGE = {
  Active:    { bg: 'var(--accent-green-light)', color: 'var(--accent-green)' },
  'At Risk': { bg: 'var(--accent-gold-light)',  color: 'var(--accent-gold)' },
  Done:      { bg: 'rgba(152,152,184,0.15)',    color: 'var(--ink-faint)' },
  Paused:    { bg: 'rgba(152,152,184,0.1)',     color: 'var(--ink-faint)' },
}
const QUAD_BADGE = {
  'Do Now':  { bg: 'var(--accent-coral-light)', color: '#dc2626' },
  'Do Soon': { bg: 'var(--accent-gold-light)',  color: 'var(--accent-gold)' },
  Schedule:  { bg: 'var(--accent-green-light)', color: 'var(--accent-green)' },
  Delegated: { bg: 'var(--accent-purple-light)', color: 'var(--accent-purple)' },
  Awaited:   { bg: 'rgba(152,152,184,0.15)',    color: 'var(--ink-faint)' },
}

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextSunday(fromDateStr) {
  const d = new Date(fromDateStr + 'T00:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? 7 : 7 - dow))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function getInitials(name) {
  const p = name.trim().split(/\s+/)
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function formatMsDue(dateStr) {
  if (!dateStr) return null
  const today = todayDateStr()
  if (dateStr === today) return { text: 'Today', color: 'var(--accent-gold)', bold: true }
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  if (d < t) {
    const days = Math.round((t - d) / 86400000)
    return { text: `${days} day${days !== 1 ? 's' : ''} overdue`, color: 'var(--danger)', bold: true }
  }
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  const in10 = new Date(t); in10.setDate(in10.getDate() + 10)
  return { text: label, color: d <= in10 ? 'var(--accent-gold)' : 'var(--ink-faint)', bold: false }
}

function formatTaskDue(dateStr) {
  if (!dateStr) return null
  const today = todayDateStr()
  if (dateStr === today) return { text: 'Today', color: 'var(--accent-gold)', bold: true }
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (d < t) return { text: label, color: 'var(--danger)', bold: true }
  return { text: label, color: 'var(--ink-faint)', bold: false }
}

function sortMilestones(list) {
  const today = todayDateStr()
  const in10 = addDays(today, 10)
  function score(m) {
    if (!m.due_date) return 4
    if (m.due_date < today && m.status !== 'Done') return 1
    if (m.due_date === today) return 2
    if (m.due_date <= in10) return 3
    return 5
  }
  return [...list].sort((a, b) => {
    const sa = score(a), sb = score(b)
    if (sa !== sb) return sa - sb
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', borderLeft: '3px solid #e8e3da' }}>
      <div style={{ width: '40%', height: 10, borderRadius: 3, background: '#e8e3da', marginBottom: 8 }} />
      <div style={{ width: '65%', height: 14, borderRadius: 3, background: '#e8e3da', marginBottom: 12 }} />
      <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e8e3da' }} />
    </div>
  )
}

export default function WeeklyFocusPage() {
  const { user } = useOutletContext()
  const navigate = useNavigate()

  const [weeklyMs, setWeeklyMs] = useState([])
  const [allMs, setAllMs] = useState([])
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)

  const [dateFilter, setDateFilter] = useState('all')
  const [anchorFilter, setAnchorFilter] = useState(null)
  const [areaFilter, setAreaFilter] = useState(null)
  const [collapsedCards, setCollapsedCards] = useState(new Set())
  const [linkPickerMsId, setLinkPickerMsId] = useState(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [statusDropdownMsId, setStatusDropdownMsId] = useState(null)
  const [rollPanelOpen, setRollPanelOpen] = useState(false)
  const [rollSelections, setRollSelections] = useState({})

  const linkPickerRef = useRef(null)
  const statusDropdownRef = useRef(null)

  async function fetchAll() {
    setLoading(true)
    const [msR, tR, pR, allMsR, arR] = await Promise.all([
      supabase.from('milestones').select('id, user_id, text, due_date, status, rollover_count, anchor_person_id, aspiration_id, parent_milestone_id, aspirations(id, text, area_id)').eq('horizon', 'Weekly'),
      supabase.from('tasks').select('id, user_id, task, done, due_date, owner, owner_id, quadrant, starred, milestone_id'),
      supabase.from('people').select('id, name').order('name'),
      supabase.from('milestones').select('id, user_id, text, horizon, parent_milestone_id, aspiration_id'),
      supabase.from('areas').select('id, name').order('name'),
    ])
    setWeeklyMs(msR.data || [])
    setTasks(tR.data || [])
    setPeople(pR.data || [])
    setAllMs(allMsR.data || [])
    setAreas(arR.data || [])
    setLoading(false)
  }

  async function updateStatus(msId, status) {
    const updateData = { status }
    if (status === 'Done') updateData.rollover_count = 0
    const { error } = await supabase.from('milestones').update(updateData).eq('id', msId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Status updated ✓', 'success'); setStatusDropdownMsId(null); await fetchAll() }
  }

  async function rollWeek() {
    const toRoll = Object.entries(rollSelections).filter(([, v]) => v.checked)
    if (!toRoll.length) { showToast('No milestones selected', 'error'); return }
    const errors = []
    await Promise.all(toRoll.map(async ([id, { date }]) => {
      const ms = weeklyMs.find(m => m.id === id)
      const { error } = await supabase.from('milestones').update({
        due_date: date, rollover_count: (ms?.rollover_count || 0) + 1, status: 'Active',
      }).eq('id', id).eq('user_id', user.id)
      if (error) errors.push(error.message)
    }))
    if (errors.length) showToast(errors[0], 'error')
    else {
      showToast(`${toRoll.length} milestone${toRoll.length !== 1 ? 's' : ''} rolled ✓`, 'success')
      setRollPanelOpen(false); setRollSelections({}); await fetchAll()
    }
  }

  async function refetchTasks() {
    const { data } = await supabase.from('tasks').select('id, user_id, task, done, due_date, owner, owner_id, quadrant, starred, milestone_id')
    if (data) setTasks(data)
  }

  useEffect(() => { fetchAll() }, [user.id])

  useEffect(() => {
    if (!linkPickerMsId) return
    function onKey(e) { if (e.key === 'Escape') { setLinkPickerMsId(null); setLinkSearch('') } }
    function onMouse(e) { if (linkPickerRef.current && !linkPickerRef.current.contains(e.target)) { setLinkPickerMsId(null); setLinkSearch('') } }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse) }
  }, [linkPickerMsId])

  useEffect(() => {
    if (!statusDropdownMsId) return
    function onKey(e) { if (e.key === 'Escape') setStatusDropdownMsId(null) }
    function onMouse(e) { if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) setStatusDropdownMsId(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse) }
  }, [statusDropdownMsId])

  async function toggleTaskDone(task) {
    const next = !task.done
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: next } : t))
    const { error } = await supabase.from('tasks').update({ done: next }).eq('id', task.id).eq('user_id', user.id)
    if (error) { showToast(error.message, 'error'); setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !next } : t)) }
  }

  async function linkTask(taskId, milestoneId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: milestoneId }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Task linked', 'success'); setLinkPickerMsId(null); setLinkSearch(''); await refetchTasks() }
  }

  function toggleCard(id) { setCollapsedCards(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }

  function getBreadcrumb(ms) {
    const aspText = ms.aspirations?.text
    const parent = allMs.find(m => m.id === ms.parent_milestone_id)
    const parts = [aspText, parent?.text].filter(Boolean)
    return parts.map(t => t.length > 30 ? t.slice(0, 30) + '…' : t).join(' → ')
  }

  function getProgress(msId) {
    const linked = tasks.filter(t => t.milestone_id === msId)
    if (!linked.length) return { total: 0, done: 0, pct: 0, hasTasks: false }
    const done = linked.filter(t => t.done).length
    return { total: linked.length, done, pct: Math.round((done / linked.length) * 100), hasTasks: true }
  }

  function getAreaForMilestone(ms) {
    const areaId = ms.aspirations?.area_id
    if (!areaId) return null
    return areas.find(a => a.id === areaId) || null
  }

  // ── Filtering & sorting ──
  const today = todayDateStr()
  const in10 = addDays(today, 10)

  // 1. Date filter
  let dateFiltered = weeklyMs
  if (dateFilter === 'due10') dateFiltered = weeklyMs.filter(m => m.due_date && m.due_date >= today && m.due_date <= in10 && m.status !== 'Done' && m.status !== 'Paused')
  if (dateFilter === 'overdue') dateFiltered = weeklyMs.filter(m => m.due_date && m.due_date < today && m.status !== 'Done' && m.status !== 'Paused')

  // 2. Anchor filter
  const afterAnchor = anchorFilter ? dateFiltered.filter(m => m.anchor_person_id === anchorFilter) : dateFiltered

  // 3. Area filter
  const filtered = areaFilter ? afterAnchor.filter(m => getAreaForMilestone(m)?.id === areaFilter) : afterAnchor
  const sorted = sortMilestones(filtered)
  const overdueMs = weeklyMs.filter(m => m.due_date && m.due_date < today && m.status !== 'Done' && m.status !== 'Paused')

  // Anchor people — computed from date+area filtered milestones
  const anchorPeople = (() => {
    const base = areaFilter ? dateFiltered.filter(m => getAreaForMilestone(m)?.id === areaFilter) : dateFiltered
    const counts = {}
    base.forEach(m => { if (m.anchor_person_id) counts[m.anchor_person_id] = (counts[m.anchor_person_id] || 0) + 1 })
    return Object.entries(counts).map(([id, count]) => { const p = people.find(x => x.id === id); return p ? { ...p, count } : null }).filter(Boolean)
  })()

  // Area pills — computed from date+anchor filtered milestones
  const visibleAreas = (() => {
    const base = anchorFilter ? dateFiltered.filter(m => m.anchor_person_id === anchorFilter) : dateFiltered
    const seen = new Set()
    base.forEach(m => { const a = getAreaForMilestone(m); if (a) seen.add(a.id) })
    return areas.filter(a => seen.has(a.id))
  })()

  // Summary counts from filtered results
  const overdueCount = filtered.filter(m => m.due_date && m.due_date < today && m.status !== 'Done').length
  const dueWeekCount = filtered.filter(m => m.due_date && m.due_date >= today && m.due_date <= addDays(today, 7) && m.status !== 'Done').length
  const doneCount = filtered.filter(m => m.status === 'Done').length

  const pillStyle = (active) => ({
    padding: '5px 14px', borderRadius: 20, fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: active ? 500 : 400,
    background: active ? 'var(--accent-coral)' : 'transparent', color: active ? 'white' : 'var(--ink-faint)',
    border: `1.5px solid ${active ? 'var(--accent-coral)' : 'var(--content-border)'}`, cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div className="page-pad flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: 4 }}>Weekly Focus</h1>
          <p style={{ fontSize: '14px', color: 'var(--ink-faint)' }}>Your weekly milestones and their tasks</p>
        </div>
        <button
          onClick={() => {
            if (!rollPanelOpen) {
              const sunday = nextSunday(today)
              const init = {}
              overdueMs.forEach(m => { init[m.id] = { checked: true, date: sunday } })
              setRollSelections(init)
            }
            setRollPanelOpen(v => !v)
          }}
          className="flex items-center gap-2"
          style={{ marginTop: 6, padding: '7px 16px', borderRadius: 'var(--radius-sm)', background: rollPanelOpen ? 'var(--ink)' : 'var(--content-bg-card)', color: rollPanelOpen ? 'white' : 'var(--ink)', border: '1.5px solid var(--content-border-strong)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          ↻ Roll week
          {overdueMs.length > 0 && (
            <span style={{ padding: '1px 8px', borderRadius: 10, background: rollPanelOpen ? 'rgba(255,255,255,0.2)' : 'var(--accent-coral-light)', color: rollPanelOpen ? 'white' : 'var(--accent-coral)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{overdueMs.length}</span>
          )}
        </button>
      </div>

      {/* Roll week panel */}
      {rollPanelOpen && (
        <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', maxHeight: 400, overflowY: 'auto' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>Roll overdue milestones</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 10px', borderRadius: 12, background: 'var(--accent-coral-light)', color: 'var(--accent-coral)', fontWeight: 500 }}>{overdueMs.length}</span>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)', marginBottom: overdueMs.length > 0 ? 16 : 20 }}>Select which milestones to push forward. Each roll is counted.</p>
          {overdueMs.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--accent-green)', textAlign: 'center', padding: '12px 0' }}>No overdue milestones — you're on track ✓</p>
          ) : (
            <>
              <div>
                {overdueMs.map(m => {
                  const sel = rollSelections[m.id] || { checked: true, date: nextSunday(today) }
                  const rc = m.rollover_count || 0
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--content-border)' }}>
                      <input type="checkbox" checked={sel.checked}
                        onChange={e => setRollSelections(prev => ({ ...prev, [m.id]: { ...sel, checked: e.target.checked } }))}
                        style={{ width: 16, height: 16, marginTop: 3, flexShrink: 0, accentColor: 'var(--accent-coral)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.4 }}>{m.text}</div>
                        {m.aspirations?.text && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)', marginTop: 2 }}>{m.aspirations.text}</div>}
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--danger)', marginTop: 2 }}>was {fmtShort(m.due_date)}</div>
                      </div>
                      <div className="flex items-center gap-2" style={{ flexShrink: 0, marginTop: 2 }}>
                        {rc > 0 && (
                          <span
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: rc >= 3 ? 'var(--danger)' : '#c8982a' }}
                            title={rc >= 3 ? `Rolled ${rc} times — consider simplifying or demoting to monthly milestone` : undefined}
                          >↻ {rc}</span>
                        )}
                        <input type="date" value={sel.date}
                          onChange={e => setRollSelections(prev => ({ ...prev, [m.id]: { ...sel, date: e.target.value } }))}
                          style={{ border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '12px', fontFamily: 'var(--font-mono)', background: 'var(--content-bg-card)', color: 'var(--ink)' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const checkedCount = Object.values(rollSelections).filter(v => v.checked).length
                const checkedDates = Object.entries(rollSelections).filter(([, v]) => v.checked).map(([, v]) => v.date)
                const uniqueDates = [...new Set(checkedDates)]
                const summaryDate = uniqueDates.length === 1 ? fmtShort(uniqueDates[0]) : 'various dates'
                return (
                  <div className="flex items-center justify-between" style={{ paddingTop: 12, marginTop: 4, borderTop: '1px solid var(--content-border)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>
                      {checkedCount} milestone{checkedCount !== 1 ? 's' : ''} selected · rolling to {summaryDate}
                    </span>
                    <button onClick={rollWeek} disabled={checkedCount === 0}
                      style={{ padding: '7px 18px', borderRadius: 'var(--radius-sm)', background: checkedCount > 0 ? 'var(--accent-coral)' : 'var(--content-border)', color: checkedCount > 0 ? 'white' : 'var(--ink-faint)', border: 'none', cursor: checkedCount > 0 ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
                      Roll selected →
                    </button>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* Summary row */}
      {!loading && weeklyMs.length > 0 && (
        <div className="flex gap-6 flex-wrap" style={{ marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-faint)' }}>{filtered.length} milestone{filtered.length !== 1 ? 's' : ''}</span>
          {dueWeekCount > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-gold)' }}>{dueWeekCount} due this week</span>}
          {overdueCount > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--danger)' }}>{overdueCount} overdue</span>}
          {doneCount > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-green)' }}>{doneCount} done</span>}
        </div>
      )}

      {/* Filter bar */}
      {!loading && weeklyMs.length > 0 && (
        <div className="flex flex-col gap-3" style={{ marginBottom: 8 }}>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex gap-2">
              {[['all', 'All'], ['due10', 'Due in 10 days'], ['overdue', 'Overdue']].map(([k, l]) => (
                <button key={k} onClick={() => { setDateFilter(k); setAnchorFilter(null); setAreaFilter(null) }} style={pillStyle(dateFilter === k)}>{l}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <User size={14} style={{ color: 'var(--ink-faint)' }} />
              <select value={anchorFilter || ''} onChange={e => setAnchorFilter(e.target.value || null)}
                style={{ background: 'white', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', minWidth: 180, fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink)', outline: 'none', cursor: 'pointer' }}>
                <option value="">All anchors</option>
                {anchorPeople.map(p => <option key={p.id} value={p.id}>{p.name} ({p.count})</option>)}
              </select>
            </div>
          </div>
          {visibleAreas.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setAreaFilter(null)} style={pillStyle(!areaFilter)}>All areas</button>
              {visibleAreas.map(a => (
                <button key={a.id} onClick={() => setAreaFilter(a.id)} className="flex items-center gap-1.5" style={pillStyle(areaFilter === a.id)}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: areaFilter === a.id ? 'white' : getAreaColor(a.name), flexShrink: 0, opacity: areaFilter === a.id ? 0.7 : 1 }} />
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && <div className="flex flex-col gap-3">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>}

      {/* Empty: no milestones at all */}
      {!loading && weeklyMs.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 px-6 text-center" style={{ borderRadius: 'var(--radius-lg)', background: 'var(--content-bg-card)', border: '1.5px dashed var(--content-border-strong)' }}>
          <CalendarCheck size={48} style={{ color: 'var(--ink-faint)', opacity: 0.5 }} />
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: 'var(--ink)' }}>No weekly milestones yet</p>
          <p style={{ fontSize: '14px', color: 'var(--ink-faint)', lineHeight: 1.6, maxWidth: 400 }}>Break down your aspirations into weekly milestones on the Aspirations page</p>
          <button onClick={() => navigate('/aspirations')} style={{ marginTop: 4, padding: '9px 24px', borderRadius: 'var(--radius-sm)', background: 'var(--ink)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>→ Go to Aspirations</button>
        </div>
      )}

      {/* Empty: no results for filter */}
      {!loading && weeklyMs.length > 0 && sorted.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12" style={{ color: 'var(--ink-faint)' }}>
          <p style={{ fontSize: '14px' }}>No milestones match this filter</p>
          <button onClick={() => { setDateFilter('all'); setAnchorFilter(null); setAreaFilter(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-coral)', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, textDecoration: 'underline' }}>Clear all filters</button>
        </div>
      )}

      {/* Milestone cards */}
      {!loading && sorted.length > 0 && (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {sorted.map(ms => {
            const prog = getProgress(ms.id)
            const due = formatMsDue(ms.due_date)
            const isOverdue = ms.due_date && ms.due_date < today && ms.status !== 'Done'
            const anchor = ms.anchor_person_id ? people.find(p => p.id === ms.anchor_person_id) : null
            const sb = STATUS_BADGE[ms.status] || STATUS_BADGE.Active
            const isSharedMs = ms.user_id && ms.user_id !== user.id
            const borderCol = isSharedMs ? '#7b5ea7' : (STATUS_BORDER[ms.status] || STATUS_BORDER.Active)
            const breadcrumb = getBreadcrumb(ms)
            const isExpanded = !collapsedCards.has(ms.id)
            const linkedTasks = tasks.filter(t => t.milestone_id === ms.id)
            const isDone = ms.status === 'Done'
            const isAtRisk = ms.status === 'At Risk'

            let cardBg = 'var(--content-bg-card)'
            if (isAtRisk) cardBg = 'rgba(217,119,6,0.03)'
            if (isOverdue) cardBg = 'rgba(220,38,38,0.03)'

            const progFill = prog.pct > 50 ? 'var(--accent-green)' : prog.pct > 0 ? 'var(--accent-gold)' : 'var(--ink-faint)'

            return (
              <div key={ms.id} style={{ background: cardBg, border: '1px solid var(--content-border)', borderLeft: `3px solid ${borderCol}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden', opacity: isDone ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
                {/* Header */}
                <div style={{ padding: '12px 16px' }}>
                  {/* Row 1: breadcrumb · due · status */}
                  <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 3 }}>
                    {breadcrumb && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>{breadcrumb}</span>}
                    {breadcrumb && due && <span style={{ fontSize: '10px', color: 'var(--content-border-strong)' }}>·</span>}
                    {due && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: due.color, fontWeight: due.bold ? 600 : 400 }}>{due.text}</span>}
                    {(ms.rollover_count || 0) > 0 && (
                      <span
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: ms.rollover_count >= 3 ? 'var(--danger)' : '#c8982a' }}
                        title={ms.rollover_count >= 3 ? `Rolled ${ms.rollover_count} times — consider simplifying or demoting to monthly milestone` : undefined}
                      >↻ {ms.rollover_count}</span>
                    )}
                    <div style={{ position: 'relative', display: 'inline-flex' }} ref={statusDropdownMsId === ms.id ? statusDropdownRef : null}>
                      <button
                        onClick={() => !isSharedMs && setStatusDropdownMsId(statusDropdownMsId === ms.id ? null : ms.id)}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '1px 6px', borderRadius: 10, background: sb.bg, color: sb.color, border: 'none', cursor: isSharedMs ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                      >
                        {ms.status}{!isSharedMs && <span style={{ fontSize: '8px' }}>▾</span>}
                      </button>
                      {statusDropdownMsId === ms.id && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', marginTop: 3, padding: '3px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minWidth: 90 }}>
                          {['Active', 'At Risk', 'Done', 'Paused'].map(s => {
                            const sb2 = STATUS_BADGE[s] || STATUS_BADGE.Active
                            return (
                              <div key={s} onClick={() => updateStatus(ms.id, s)}
                                style={{ padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--font-mono)', color: sb2.color, transition: 'background 100ms' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                {s}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {isSharedMs && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: 'var(--accent-purple-light)', color: '#7b5ea7' }}>shared</span>}
                  </div>
                  {/* Row 2: milestone text + right group */}
                  <div className="flex items-center gap-3">
                    <div style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, minWidth: 0 }}>{ms.text}</div>
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      {anchor && (
                        <div title={anchor.name} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{getInitials(anchor.name)}</div>
                      )}
                      {prog.hasTasks && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: prog.pct > 50 ? 'var(--accent-green)' : 'var(--ink-faint)', fontWeight: 500 }}>{prog.pct}%</span>}
                      <button onClick={() => toggleCard(ms.id)} className="flex items-center gap-1" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {linkedTasks.length > 0 ? `${linkedTasks.length} task${linkedTasks.length !== 1 ? 's' : ''}` : 'No tasks'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress bar — slim, no label */}
                {prog.hasTasks && (
                  <div style={{ margin: '0 16px 4px', height: 3, borderRadius: 2, background: 'var(--content-border)', overflow: 'hidden' }}>
                    <div style={{ width: `${prog.pct}%`, height: '100%', background: progFill, borderRadius: 2, transition: 'width 400ms ease' }} />
                  </div>
                )}
                {!prog.hasTasks && !isExpanded && (
                  <div style={{ padding: '0 16px 8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>No tasks linked</span>
                  </div>
                )}

                {/* Tasks (expanded by default) */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--content-border)', padding: '6px 0' }}>
                    {linkedTasks.length === 0 && (
                      <div style={{ padding: '8px 16px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>No tasks linked</span>
                      </div>
                    )}
                    {linkedTasks.map((t, idx) => {
                      const td = formatTaskDue(t.due_date)
                      const qb = QUAD_BADGE[t.quadrant]
                      const ownerName = getOwnerName(t, people)
                      return (
                        <div key={t.id}
                          style={{ display: 'flex', alignItems: 'center', padding: '7px 16px', gap: 10, transition: 'background 150ms', borderBottom: idx < linkedTasks.length - 1 ? '1px solid rgba(232,227,218,0.3)' : 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <button onClick={() => toggleTaskDone(t)}
                            style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${t.done ? 'var(--accent-green)' : 'var(--content-border-strong)'}`, background: t.done ? 'var(--accent-green)' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                            {t.done && <Check size={10} color="white" strokeWidth={3} />}
                          </button>
                          <span style={{ flex: 1, fontSize: '13px', fontFamily: 'var(--font-sans)', fontWeight: 500, lineHeight: 1.4, color: t.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.task}</span>
                          {td && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: td.color, fontWeight: td.bold ? 500 : 400, flexShrink: 0 }}>{td.text}</span>}
                          {ownerName && (
                            <div title={ownerName} style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{getInitials(ownerName)}</div>
                          )}
                          {t.quadrant && qb && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '1px 5px', borderRadius: 8, background: qb.bg, color: qb.color, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.quadrant}</span>
                          )}
                        </div>
                      )
                    })}

                    {/* Link task */}
                    {linkPickerMsId === ms.id ? (
                      <div ref={linkPickerRef} style={{ padding: '6px 16px' }}>
                        <input autoFocus value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search tasks to link…" className="w-full outline-none"
                          style={{ border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: '12px', fontFamily: 'var(--font-sans)', background: 'var(--content-bg-card)', color: 'var(--ink)', marginBottom: 4 }} />
                        <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                          {(() => {
                            const avail = tasks.filter(t => !t.milestone_id && !t.done)
                            const show = linkSearch ? avail.filter(t => t.task?.toLowerCase().includes(linkSearch.toLowerCase())) : avail
                            if (!show.length) return <p style={{ fontSize: '11px', color: 'var(--ink-faint)', padding: '4px 0' }}>{linkSearch ? 'No matching tasks' : 'No unlinked tasks available'}</p>
                            return show.slice(0, 15).map(t => {
                              const qb2 = QUAD_BADGE[t.quadrant]
                              return (
                                <div key={t.id} onClick={() => linkTask(t.id, ms.id)} className="flex items-center gap-2"
                                  style={{ padding: '4px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px', transition: 'background 100ms' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <span style={{ flex: 1, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task}</span>
                                  {t.quadrant && qb2 && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: qb2.bg, color: qb2.color, flexShrink: 0 }}>{t.quadrant}</span>}
                                </div>
                              )
                            })
                          })()}
                        </div>
                        <button onClick={() => { setLinkPickerMsId(null); setLinkSearch('') }} style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)', padding: 0 }}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex justify-end" style={{ padding: '2px 16px 4px' }}>
                        {isSharedMs ? (
                          <span title="Tasks are linked by the milestone owner" style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontStyle: 'italic' }}>Read-only</span>
                        ) : (
                        <button onClick={() => { setLinkPickerMsId(ms.id); setLinkSearch('') }} className="flex items-center gap-1"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)', padding: '2px 0' }}>
                          <Plus size={12} /> Link task
                        </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
