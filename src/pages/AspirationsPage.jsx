import { useState, useEffect, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { getAreaColor } from '../lib/areaUtils'
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Target, X } from 'lucide-react'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHILD_H = { Annual: 'SixMonth', SixMonth: 'Monthly', Monthly: 'Weekly' }
const HORIZON_BADGE = {
  Annual:   { bg: 'var(--accent-green-light)', color: 'var(--accent-green)', label: 'Annual' },
  SixMonth: { bg: '#deeaff', color: '#185fa5', label: '6M' },
  Monthly:  { bg: 'var(--accent-gold-light)', color: 'var(--accent-gold)', label: 'Monthly' },
  Weekly:   { bg: 'var(--accent-coral-light)', color: 'var(--accent-coral)', label: 'Weekly' },
}
const STATUS_DOT = { Active: '#22c55e', 'At Risk': '#f59e0b', Done: '#9ca3af', Paused: '#d1d5db' }
const PLACEHOLDER = {
  Annual: 'What does success look like this year?',
  SixMonth: 'What does this six-month period deliver?',
  Monthly: 'What gets done this month?',
  Weekly: 'What happens this week?',
}

function getInitials(name) {
  const p = name.trim().split(/\s+/)
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeEndDate(start, years) {
  if (!start || !years) return ''
  const d = new Date(start + 'T00:00:00')
  d.setFullYear(d.getFullYear() + Number(years))
  return toDateStr(d)
}

function formatDueDate(s, horizon) {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  if (horizon === 'Weekly' || horizon === 'Monthly') return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function isOverdue(s) {
  if (!s) return false
  const d = new Date(s + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return d < t
}

function ProgressRing({ progress, size = 40 }) {
  const sw = 3, r = (size - sw) / 2, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--content-border)" strokeWidth={sw} />
      {progress > 0 && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-green)" strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={c - (progress / 100) * c}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 400ms ease' }} />
      )}
    </svg>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', borderLeft: '3px solid #e8e3da' }}>
      <div className="flex items-center gap-3">
        <div style={{ flex: 1 }}>
          <div style={{ width: '60%', height: 16, borderRadius: 4, background: '#e8e3da', marginBottom: 8 }} />
          <div style={{ width: '35%', height: 10, borderRadius: 4, background: '#f0ece4' }} />
        </div>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e8e3da' }} />
      </div>
      <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e8e3da', marginTop: 14 }} />
    </div>
  )
}

const inputStyle = {
  border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)',
  padding: '7px 10px', background: 'var(--content-bg-card)', color: 'var(--ink)',
  fontFamily: 'var(--font-sans)', fontSize: '13px', outline: 'none',
}

export default function AspirationsPage() {
  const { user } = useOutletContext()

  const [aspirations, setAspirations] = useState([])
  const [milestones, setMilestones] = useState([])
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)

  const [areaFilter, setAreaFilter] = useState(null)
  const [collapsedAsps, setCollapsedAsps] = useState(new Set())
  const [expandedMs, setExpandedMs] = useState(new Set())

  const [aspForm, setAspForm] = useState(null)
  const [msForm, setMsForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingAspId, setDeletingAspId] = useState(null)
  const [deletingMsId, setDeletingMsId] = useState(null)
  const [openTaskPanel, setOpenTaskPanel] = useState(null)
  const [taskSearch, setTaskSearch] = useState('')
  const [areasPanel, setAreasPanel] = useState(false)
  const [areaInput, setAreaInput] = useState('')
  const [renamingAreaId, setRenamingAreaId] = useState(null)
  const [renamingText, setRenamingText] = useState('')
  const [collapsedAreas, setCollapsedAreas] = useState(new Set())
  const [areaDropdownAspId, setAreaDropdownAspId] = useState(null)
  const aspFormRef = useRef(null)
  const msFormRef = useRef(null)

  async function fetchAll() {
    setLoading(true)
    const [aR, mR, tR, pR, arR] = await Promise.all([
      supabase.from('aspirations').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('milestones').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('tasks').select('id, task, done, due_date, owner, quadrant, milestone_id').eq('user_id', user.id),
      supabase.from('people').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('areas').select('*').eq('user_id', user.id).order('name'),
    ])
    setAspirations(aR.data || [])
    setMilestones(mR.data || [])
    setTasks(tR.data || [])
    setPeople(pR.data || [])
    setAreas(arR.data || [])
    setLoading(false)
  }

  async function refetchTasks() {
    const { data } = await supabase.from('tasks').select('id, task, done, due_date, owner, quadrant, milestone_id').eq('user_id', user.id)
    setTasks(data || [])
  }

  useEffect(() => { fetchAll() }, [user.id])

  // Click-outside + Escape
  useEffect(() => {
    if (!aspForm && !msForm && !openTaskPanel) return
    function onKey(e) {
      if (e.key === 'Escape') { setAspForm(null); setMsForm(null); setFormError(''); setOpenTaskPanel(null); setTaskSearch(''); setAreasPanel(false); setAreaDropdownAspId(null) }
    }
    function onMouse(e) {
      if (aspForm && aspFormRef.current && !aspFormRef.current.contains(e.target)) { setAspForm(null); setFormError('') }
      if (msForm && msFormRef.current && !msFormRef.current.contains(e.target)) setMsForm(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse) }
  }, [aspForm, msForm, openTaskPanel])

  // Close task panel when any form opens
  useEffect(() => {
    if (aspForm || msForm) { setOpenTaskPanel(null); setTaskSearch('') }
  }, [aspForm, msForm])

  // Progress calculation
  const progressMap = useMemo(() => {
    const cache = {}
    function calc(id, horizon, depth) {
      if (cache[id] !== undefined) return cache[id]
      if (depth > 5) return 0
      if (horizon === 'Weekly') {
        const linked = tasks.filter(t => t.milestone_id === id)
        if (!linked.length) return (cache[id] = 0)
        return (cache[id] = (linked.filter(t => t.done).length / linked.length) * 100)
      }
      const ch = CHILD_H[horizon]
      if (!ch) return (cache[id] = 0)
      const kids = milestones.filter(m => m.parent_milestone_id === id && m.horizon === ch)
      if (!kids.length) return (cache[id] = 0)
      return (cache[id] = kids.reduce((a, c) => a + calc(c.id, c.horizon, depth + 1), 0) / kids.length)
    }
    milestones.forEach(m => calc(m.id, m.horizon, 0))
    aspirations.forEach(a => {
      const ann = milestones.filter(m => m.aspiration_id === a.id && m.horizon === 'Annual')
      cache['a-' + a.id] = ann.length ? ann.reduce((s, m) => s + (cache[m.id] || 0), 0) / ann.length : 0
    })
    return cache
  }, [milestones, tasks, aspirations])

  // ── Aspiration CRUD ──
  function openAddAsp() {
    const today = toDateStr(new Date())
    setAspForm({ text: '', area_id: '', horizon_years: 3, start_date: today, end_date: computeEndDate(today, 3) })
    setMsForm(null); setFormError('')
  }
  function openEditAsp(a) {
    setAspForm({ id: a.id, text: a.text, area_id: a.area_id || '', horizon_years: a.horizon_years || 3, start_date: a.start_date || '', end_date: a.end_date || '' })
    setMsForm(null); setFormError('')
  }
  function updateAspForm(field, val) {
    setAspForm(prev => {
      const u = { ...prev, [field]: val }
      if (field === 'start_date' || field === 'horizon_years') u.end_date = computeEndDate(field === 'start_date' ? val : prev.start_date, field === 'horizon_years' ? val : prev.horizon_years)
      return u
    })
    if (formError) setFormError('')
  }
  async function saveAsp() {
    if (!aspForm.text.trim()) { setFormError('Please enter an aspiration'); return }
    setSaving(true)
    const payload = { text: aspForm.text.trim(), area_id: aspForm.area_id || null, horizon_years: Number(aspForm.horizon_years), start_date: aspForm.start_date || null, end_date: aspForm.end_date || null }
    const { error } = aspForm.id
      ? await supabase.from('aspirations').update(payload).eq('id', aspForm.id).eq('user_id', user.id)
      : await supabase.from('aspirations').insert({ ...payload, user_id: user.id })
    if (error) showToast(error.message, 'error')
    else { showToast(aspForm.id ? 'Aspiration updated' : 'Aspiration added', 'success'); setAspForm(null); setFormError('') }
    await fetchAll(); setSaving(false)
  }
  async function deleteAsp(id) {
    const { error } = await supabase.from('aspirations').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Aspiration deleted', 'success'); setDeletingAspId(null); await fetchAll() }
  }

  // ── Milestone CRUD ──
  function openAddMs(aspirationId, parentId, horizon) {
    setMsForm({ aspirationId, parentMilestoneId: parentId, horizon, text: '', due_date: '', anchor_person_id: '', status: 'Active' })
    if (parentId) setExpandedMs(prev => new Set(prev).add(parentId))
    setAspForm(null)
  }
  function openEditMs(m) {
    setMsForm({ id: m.id, aspirationId: m.aspiration_id, parentMilestoneId: m.parent_milestone_id, horizon: m.horizon, text: m.text, due_date: m.due_date || '', anchor_person_id: m.anchor_person_id || '', status: m.status || 'Active' })
    setAspForm(null)
  }
  async function saveMs() {
    if (!msForm.text.trim()) return
    setSaving(true)
    const fields = { text: msForm.text.trim(), due_date: msForm.due_date || null, anchor_person_id: msForm.anchor_person_id || null, status: msForm.status }
    const { error } = msForm.id
      ? await supabase.from('milestones').update(fields).eq('id', msForm.id).eq('user_id', user.id)
      : await supabase.from('milestones').insert({ ...fields, user_id: user.id, aspiration_id: msForm.aspirationId, parent_milestone_id: msForm.parentMilestoneId || null, horizon: msForm.horizon })
    if (error) showToast(error.message, 'error')
    else { showToast(msForm.id ? 'Milestone updated' : 'Milestone added', 'success'); setMsForm(null) }
    await fetchAll(); setSaving(false)
  }
  async function deleteMs(id) {
    const { error } = await supabase.from('milestones').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Milestone deleted', 'success'); setDeletingMsId(null); await fetchAll() }
  }

  // ── Task linking ──
  async function linkTask(taskId, milestoneId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: milestoneId }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Task linked', 'success'); await refetchTasks() }
  }
  async function unlinkTask(taskId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: null }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Task unlinked', 'success'); await refetchTasks() }
  }

  function toggleAspCollapse(id) { setCollapsedAsps(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function toggleMsExpand(id) { setExpandedMs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function toggleAreaCollapse(id) { setCollapsedAreas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }

  // ── Area CRUD ──
  async function addArea() {
    const name = areaInput.trim()
    if (!name) return
    if (areas.some(a => a.name.toLowerCase() === name.toLowerCase())) { showToast('Area already exists', 'error'); return }
    const { error } = await supabase.from('areas').insert({ user_id: user.id, name })
    if (error) showToast(error.message, 'error')
    else { showToast('Area added', 'success'); setAreaInput(''); await fetchAll() }
  }
  async function renameArea(id, newName) {
    if (!newName.trim()) return
    const { error } = await supabase.from('areas').update({ name: newName.trim() }).eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Area renamed', 'success'); setRenamingAreaId(null); await fetchAll() }
  }
  async function deleteArea(id) {
    const { error } = await supabase.from('areas').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Area deleted', 'success'); await fetchAll() }
  }
  async function reassignArea(aspirationId, areaId) {
    const { error } = await supabase.from('aspirations').update({ area_id: areaId }).eq('id', aspirationId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Area updated', 'success'); setAreaDropdownAspId(null); await fetchAll() }
  }

  // ── Grouped aspirations ──
  const areaGroups = useMemo(() => {
    const byArea = {}
    const ungrouped = []
    aspirations.forEach(a => { if (a.area_id) { (byArea[a.area_id] ||= []).push(a) } else ungrouped.push(a) })
    const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name))
    const groups = sorted.filter(a => byArea[a.id]?.length).map(a => ({ area: a, asps: byArea[a.id] }))
    return { groups, ungrouped }
  }, [aspirations, areas])


  // ── Milestone form UI ──
  function renderMsForm() {
    if (!msForm) return null
    const indent = { Annual: 0, SixMonth: 24, Monthly: 48, Weekly: 72 }[msForm.horizon] || 0
    return (
      <div ref={msFormRef} style={{ marginLeft: indent, background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '4px 0' }}>
        <input autoFocus value={msForm.text} onChange={e => setMsForm(p => ({ ...p, text: e.target.value }))}
          placeholder={PLACEHOLDER[msForm.horizon] || ''} className="w-full" style={{ ...inputStyle, width: '100%', marginBottom: 10 }} />
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Due by</label>
            <input type="date" value={msForm.due_date} onChange={e => setMsForm(p => ({ ...p, due_date: e.target.value }))} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Anchor</label>
            <select value={msForm.anchor_person_id} onChange={e => setMsForm(p => ({ ...p, anchor_person_id: e.target.value }))} style={inputStyle}>
              <option value="">No anchor</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Status</label>
            <select value={msForm.status} onChange={e => setMsForm(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
              {['Active', 'At Risk', 'Done', 'Paused'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={saveMs} disabled={saving || !msForm.text.trim()} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', background: msForm.text.trim() ? 'var(--accent-coral)' : 'var(--content-border)', color: msForm.text.trim() ? 'white' : 'var(--ink-faint)', border: 'none', cursor: msForm.text.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
            {saving ? 'Saving…' : msForm.id ? 'Save changes' : `Add ${HORIZON_BADGE[msForm.horizon]?.label || msForm.horizon}`}
          </button>
          <button onClick={() => setMsForm(null)} style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Task detail panel for Weekly milestones ──
  const QUAD_BADGE = {
    'Do Now':    { bg: 'var(--accent-coral-light)', color: 'var(--accent-coral)' },
    'Do Soon':   { bg: 'var(--accent-gold-light)',  color: 'var(--accent-gold)' },
    Schedule:    { bg: 'var(--accent-green-light)',  color: 'var(--accent-green)' },
    Delegated:   { bg: 'var(--accent-purple-light)', color: 'var(--accent-purple)' },
    Awaited:     { bg: '#deeaff', color: '#185fa5' },
  }

  function renderTaskPanel(m) {
    const linked = tasks.filter(t => t.milestone_id === m.id)
    const available = tasks.filter(t => !t.done && (!t.milestone_id || t.milestone_id === m.id))
    const unlinked = available.filter(t => t.milestone_id !== m.id)
    const filtered = taskSearch
      ? unlinked.filter(t => t.task?.toLowerCase().includes(taskSearch.toLowerCase()))
      : unlinked
    const prog = Math.round(progressMap[m.id] || 0)

    return (
      <div style={{ background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '4px 0' }}>
        {/* Linked tasks */}
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', marginBottom: 8 }}>Linked tasks</div>
        {linked.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic', marginBottom: 12 }}>No tasks linked yet</p>
        ) : (
          <div className="flex flex-col gap-1" style={{ marginBottom: 12 }}>
            {linked.map(t => (
              <div key={t.id} className="flex items-center gap-2" style={{ fontSize: '12px', padding: '4px 0' }}>
                <input type="checkbox" checked={t.done} readOnly style={{ accentColor: 'var(--accent-green)', flexShrink: 0, cursor: 'default' }} />
                <span style={{ flex: 1, color: t.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task}</span>
                {t.due_date && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)', flexShrink: 0 }}>{formatDueDate(t.due_date, 'Weekly')}</span>}
                {t.owner && <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', color: 'var(--ink-faint)', flexShrink: 0 }}>{t.owner}</span>}
                <button onClick={() => unlinkTask(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-faint)')}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Link a task */}
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', marginBottom: 8 }}>Link a task</div>
        <input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Search tasks…" className="w-full outline-none" style={{ ...inputStyle, width: '100%', fontSize: '12px', marginBottom: 4 }} />
        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '11px', color: 'var(--ink-faint)', padding: '6px 0' }}>{taskSearch ? 'No matching tasks' : 'No available tasks to link'}</p>
          ) : (
            filtered.slice(0, 20).map(t => {
              const qb = QUAD_BADGE[t.quadrant]
              return (
                <div key={t.id} onClick={() => { linkTask(t.id, m.id); setTaskSearch('') }} className="flex items-center gap-2"
                  style={{ padding: '5px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px', transition: 'background 100ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{t.task}</span>
                  {t.quadrant && qb && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: qb.bg, color: qb.color, flexShrink: 0, whiteSpace: 'nowrap' }}>{t.quadrant}</span>}
                  {t.due_date && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)', flexShrink: 0 }}>{formatDueDate(t.due_date, 'Weekly')}</span>}
                </div>
              )
            })
          )}
        </div>

        {/* Progress note */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--content-border)', fontSize: '11px', color: 'var(--ink-faint)' }}>
          <div>Progress updates automatically as linked tasks are completed</div>
          <div style={{ marginTop: 2 }}>Current progress: <span style={{ fontWeight: 600, color: prog > 0 ? 'var(--accent-green)' : 'var(--ink-faint)' }}>{prog}%</span></div>
        </div>
      </div>
    )
  }

  // ── Milestone tree ──
  function renderTree(aspirationId, parentId, horizon) {
    const items = milestones.filter(m =>
      m.aspiration_id === aspirationId &&
      (parentId ? m.parent_milestone_id === parentId : !m.parent_milestone_id) &&
      m.horizon === horizon
    )
    const nextH = CHILD_H[horizon]
    const isNested = parentId !== null
    const showAddHere = msForm && !msForm.id && msForm.aspirationId === aspirationId &&
      (parentId ? msForm.parentMilestoneId === parentId : !msForm.parentMilestoneId) &&
      msForm.horizon === horizon

    if (!items.length && !showAddHere) return null

    const content = (
      <>
        {items.map(m => {
          const hasKids = nextH && milestones.some(c => c.parent_milestone_id === m.id && c.horizon === nextH)
          const isExp = expandedMs.has(m.id)
          const isEditing = msForm?.id === m.id
          const hasAddChild = msForm && !msForm.id && msForm.parentMilestoneId === m.id
          const prog = Math.round(progressMap[m.id] || 0)
          const hasContent = horizon === 'Weekly' ? tasks.some(t => t.milestone_id === m.id) : (hasKids || false)
          const showProg = prog > 0 || hasContent
          const due = formatDueDate(m.due_date, m.horizon)
          const overdue = isOverdue(m.due_date) && m.status !== 'Done'
          const anchor = m.anchor_person_id ? people.find(p => p.id === m.anchor_person_id) : null
          const badge = HORIZON_BADGE[m.horizon]
          const dotColor = STATUS_DOT[m.status] || STATUS_DOT.Active

          const progColor = overdue && prog < 25 ? 'var(--danger)' : prog > 50 ? 'var(--accent-green)' : 'var(--ink-faint)'
          const linkedTasks = m.horizon === 'Weekly' ? tasks.filter(t => t.milestone_id === m.id) : []
          const linkedDone = linkedTasks.filter(t => t.done).length

          return (
            <div key={m.id}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {isNested && <div style={{ width: 14, borderTop: '1px solid var(--content-border)', flexShrink: 0 }} />}

                {deletingMsId === m.id ? (
                  <div className="flex items-center gap-2 flex-1" style={{ height: 36, padding: '0 6px', fontSize: '12px' }}>
                    <span style={{ color: 'var(--ink-soft)', flex: 1 }}>Delete &ldquo;{m.text.length > 30 ? m.text.slice(0, 30) + '…' : m.text}&rdquo; and all breakdowns?</span>
                    <button onClick={() => deleteMs(m.id)} style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Delete</button>
                    <button onClick={() => setDeletingMsId(null)} style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--content-border)', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>Cancel</button>
                  </div>
                ) : (
                  <div className="ms-row flex items-center gap-2 flex-1" style={{ height: 36, padding: '0 6px', borderRadius: 6, transition: 'background 150ms ease', cursor: 'default' }}>
                    {hasKids ? (
                      <button onClick={() => toggleMsExpand(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-faint)', display: 'flex', flexShrink: 0, transition: 'transform 150ms ease' }}>
                        {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : <span style={{ width: 14, flexShrink: 0 }} />}

                    {badge && (
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 10, background: badge.bg, color: badge.color, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>{badge.label}</span>
                    )}

                    <span title={m.text} onClick={m.horizon === 'Weekly' ? () => { setOpenTaskPanel(p => p === m.id ? null : m.id); setTaskSearch('') } : undefined} style={{ flex: 1, fontSize: '13px', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)', cursor: m.horizon === 'Weekly' ? 'pointer' : 'default' }}>{m.text}</span>

                    {due && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: overdue ? 'var(--danger)' : 'var(--ink-faint)', minWidth: 58, textAlign: 'right', flexShrink: 0 }}>{due}</span>}

                    {anchor && (
                      <div title={anchor.name} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {getInitials(anchor.name)}
                      </div>
                    )}

                    {showProg && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: progColor, minWidth: 32, textAlign: 'right', flexShrink: 0 }}>{prog}%</span>}

                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

                    {m.horizon === 'Weekly' && linkedTasks.length > 0 && (
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 8, background: linkedDone === linkedTasks.length ? 'var(--accent-green-light)' : 'var(--content-bg)', border: '1px solid var(--content-border)', color: linkedDone === linkedTasks.length ? 'var(--accent-green)' : 'var(--ink-faint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {linkedTasks.length} task{linkedTasks.length !== 1 ? 's' : ''} · {linkedDone} done
                      </span>
                    )}

                    <div className="ms-actions flex items-center gap-1" style={{ flexShrink: 0 }}>
                      <button onClick={() => openEditMs(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Pencil size={14} /></button>
                      {nextH && <button onClick={() => openAddMs(m.aspiration_id, m.id, nextH)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Plus size={14} /></button>}
                      <button onClick={() => setDeletingMsId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </div>

              {isEditing && renderMsForm()}
              {m.horizon === 'Weekly' && openTaskPanel === m.id && renderTaskPanel(m)}
              {(isExp || hasAddChild) && nextH && renderTree(aspirationId, m.id, nextH)}
            </div>
          )
        })}
        {showAddHere && renderMsForm()}
      </>
    )

    return isNested
      ? <div style={{ marginLeft: 12, paddingLeft: 14, borderLeft: '1px solid var(--content-border)' }}>{content}</div>
      : content
  }

  // ── Render aspiration card ──
  function renderCard(a) {
    const areaObj = areas.find(ar => ar.id === a.area_id)
    const aName = areaObj?.name || null
    const borderCol = getAreaColor(aName)
    const prog = Math.round(progressMap['a-' + a.id] || 0)
    const hasAnn = milestones.some(m => m.aspiration_id === a.id && m.horizon === 'Annual')
    const showProg = prog > 0 || hasAnn
    const isCollapsed = collapsedAsps.has(a.id)
    const dateRange = a.start_date && a.end_date ? (() => {
      const s = new Date(a.start_date + 'T00:00:00'), e = new Date(a.end_date + 'T00:00:00')
      return `${MONTHS[s.getMonth()]} ${s.getFullYear()} → ${MONTHS[e.getMonth()]} ${e.getFullYear()} · ${a.horizon_years} year${a.horizon_years !== 1 ? 's' : ''}`
    })() : null

    return (
      <div key={a.id} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', borderLeft: `3px solid ${borderCol}` }}>
        {deletingAspId === a.id ? (
          <div className="flex flex-col gap-3">
            <p style={{ fontSize: '14px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>Delete this aspiration and all milestones beneath it? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => deleteAsp(a.id)} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Delete</button>
              <button onClick={() => setDeletingAspId(null)} style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Clickable area tag */}
                <div style={{ position: 'relative', marginBottom: 4, display: 'inline-block' }}>
                  <div onClick={() => setAreaDropdownAspId(areaDropdownAspId === a.id ? null : a.id)} style={{ cursor: 'pointer' }} className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: borderCol, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)' }}>{aName || 'Assign area'} ▾</span>
                  </div>
                  {areaDropdownAspId === a.id && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', marginTop: 4, minWidth: 160, padding: '4px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                      <div onClick={() => reassignArea(a.id, null)} style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ink-faint)', transition: 'background 100ms' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>No area</div>
                      {areas.map(ar => (
                        <div key={ar.id} onClick={() => reassignArea(a.id, ar.id)} className="flex items-center gap-2"
                          style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '12px', transition: 'background 100ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: getAreaColor(ar.name), flexShrink: 0 }} />
                          <span style={{ color: 'var(--ink)' }}>{ar.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', color: 'var(--ink)', lineHeight: 1.4 }}>{a.text}</div>
                {dateRange && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)', marginTop: 4 }}>{dateRange}</div>}
              </div>
              <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                {showProg && <span style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 700, color: prog > 0 ? 'var(--accent-green)' : 'var(--ink-faint)' }}>{prog}%</span>}
                {showProg && <ProgressRing progress={prog} />}
                <button onClick={() => openEditAsp(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-faint)' }}><Pencil size={15} /></button>
                <button onClick={() => setDeletingAspId(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-faint)' }}><Trash2 size={15} /></button>
                <button onClick={() => toggleAspCollapse(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-faint)' }}>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
            <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--content-border)', marginTop: 12, overflow: 'hidden' }}>
              <div style={{ width: `${prog}%`, height: '100%', background: 'var(--accent-green)', borderRadius: 2, transition: 'width 400ms ease' }} />
            </div>
            {!isCollapsed && (
              <div style={{ borderTop: '1px solid var(--content-border)', paddingTop: 16, marginTop: 16 }}>
                {renderTree(a.id, null, 'Annual')}
                {!milestones.some(m => m.aspiration_id === a.id && m.horizon === 'Annual') && !(msForm && !msForm.id && msForm.aspirationId === a.id && !msForm.parentMilestoneId) && (
                  <p style={{ fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic', marginBottom: 8 }}>No milestones yet — add an Annual Milestone to start breaking this down</p>
                )}
                {!(msForm && !msForm.id && msForm.aspirationId === a.id && !msForm.parentMilestoneId && msForm.horizon === 'Annual') && (
                  <button onClick={() => openAddMs(a.id, null, 'Annual')} className="flex items-center gap-1" style={{ marginTop: 8, padding: '5px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--accent-coral)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500 }}>
                    <Plus size={13} /> Add Annual Milestone
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Render area section ──
  function renderAreaSection(areaId, label, color, asps, idx) {
    const isCollapsed = collapsedAreas.has(areaId)
    return (
      <div key={areaId}>
        <div className="flex items-center gap-2" style={{ marginTop: idx > 0 ? 24 : 0, marginBottom: 12 }}>
          {color && <span style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />}
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: color ? 'var(--ink)' : 'var(--ink-faint)', fontStyle: color ? 'normal' : 'italic' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>({asps.length})</span>
          <div style={{ flex: 1, height: 1, background: 'var(--content-border)' }} />
          <button onClick={() => toggleAreaCollapse(areaId)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        {!isCollapsed && <div className="flex flex-col gap-4">{asps.map(a => renderCard(a))}</div>}
      </div>
    )
  }

  // ── Main render ──
  return (
    <div className="page-pad flex flex-col gap-7">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>Aspirations</h1>
          <p style={{ fontSize: '14px', color: 'var(--ink-faint)' }}>Your long-term vision, broken down into action</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAreasPanel(p => !p)} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Manage Areas</button>
          <button onClick={openAddAsp} className="flex items-center gap-1" style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--ink)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
            <Plus size={14} /> Add Aspiration
          </button>
        </div>
      </div>

      {/* Area filter pills */}
      {areas.length > 0 && (
        <div className="flex gap-2" style={{ overflowX: 'auto', paddingBottom: 4, flexWrap: 'nowrap' }}>
          <button onClick={() => setAreaFilter(null)} style={{ padding: '4px 14px', borderRadius: 20, fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: !areaFilter ? 500 : 400, background: !areaFilter ? 'var(--accent-coral)' : 'transparent', color: !areaFilter ? 'white' : 'var(--ink-faint)', border: `1.5px solid ${!areaFilter ? 'var(--accent-coral)' : 'var(--content-border)'}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>All</button>
          {areas.map(a => {
            const ac = getAreaColor(a.name)
            const active = areaFilter === a.id
            return (
              <button key={a.id} onClick={() => setAreaFilter(a.id)}
                style={{ padding: '4px 14px', borderRadius: 20, fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: active ? 500 : 400, background: active ? ac : 'transparent', color: active ? 'white' : 'var(--ink-faint)', border: `1.5px solid ${active ? ac : 'var(--content-border)'}`, borderLeft: active ? undefined : `3px solid ${ac}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.name}</button>
            )
          })}
        </div>
      )}

      {/* Manage Areas panel */}
      {areasPanel && (
        <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', position: 'relative' }}>
          <button onClick={() => setAreasPanel(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 2 }}><X size={16} /></button>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', color: 'var(--ink)', marginBottom: 2 }}>Areas</div>
          <p style={{ fontSize: '13px', color: 'var(--ink-faint)', marginBottom: 14 }}>Group your aspirations by area of focus</p>

          {areas.length === 0 && <p style={{ fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic', marginBottom: 12 }}>No areas yet — add one below</p>}
          <div className="flex flex-col gap-2" style={{ marginBottom: 14 }}>
            {areas.map(a => {
              const count = aspirations.filter(asp => asp.area_id === a.id).length
              return (
                <div key={a.id} className="flex items-center gap-2" style={{ padding: '4px 0' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: getAreaColor(a.name), flexShrink: 0 }} />
                  {renamingAreaId === a.id ? (
                    <input autoFocus value={renamingText} onChange={e => setRenamingText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameArea(a.id, renamingText) }}
                      onBlur={() => { if (renamingText.trim()) renameArea(a.id, renamingText); else setRenamingAreaId(null) }}
                      style={{ ...inputStyle, flex: 1, fontSize: '14px' }} />
                  ) : (
                    <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--ink)' }}>{a.name}</span>
                  )}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>({count} aspiration{count !== 1 ? 's' : ''})</span>
                  <button onClick={() => { setRenamingAreaId(a.id); setRenamingText(a.name) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Pencil size={13} /></button>
                  {count === 0 ? (
                    <button onClick={() => deleteArea(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Trash2 size={13} /></button>
                  ) : (
                    <span title="Remove aspirations from this area first" style={{ padding: 2, color: 'var(--content-border)', cursor: 'not-allowed' }}><Trash2 size={13} /></span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <input value={areaInput} onChange={e => setAreaInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addArea() }}
              placeholder="e.g. Climate, Arena, Internal" className="flex-1 outline-none" style={inputStyle} />
            <button onClick={addArea} disabled={!areaInput.trim()} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', background: areaInput.trim() ? 'var(--accent-coral)' : 'var(--content-border)', color: areaInput.trim() ? 'white' : 'var(--ink-faint)', border: 'none', cursor: areaInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Add area →</button>
          </div>
        </div>
      )}

      {/* Aspiration form */}
      {aspForm && (
        <div ref={aspFormRef} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
          <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{aspForm.id ? 'Edit aspiration' : 'New aspiration'}</div>
          <textarea autoFocus value={aspForm.text} onChange={e => updateAspForm('text', e.target.value)} placeholder="What are you working toward?" className="w-full resize-none outline-none" style={{ ...inputStyle, width: '100%', minHeight: 80, marginBottom: 4, lineHeight: 1.6 }} />
          {formError && <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: 8 }}>{formError}</div>}
          <div className="flex gap-3 flex-wrap items-end" style={{ marginTop: 8 }}>
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Area</label>
              <select value={aspForm.area_id} onChange={e => updateAspForm('area_id', e.target.value)} style={inputStyle}>
                <option value="">No area</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Horizon (years)</label>
              <input type="number" min={1} max={10} value={aspForm.horizon_years} onChange={e => updateAspForm('horizon_years', e.target.value)} style={{ ...inputStyle, width: 80, fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Start</label>
              <input type="date" value={aspForm.start_date} onChange={e => updateAspForm('start_date', e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: '11px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>End</label>
              <input type="date" value={aspForm.end_date} onChange={e => updateAspForm('end_date', e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            </div>
            <button onClick={saveAsp} disabled={saving} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-coral)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>{saving ? 'Saving…' : 'Save aspiration'}</button>
            <button onClick={() => { setAspForm(null); setFormError('') }} style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="flex flex-col gap-4">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>}

      {/* Empty state */}
      {!loading && !aspirations.length && (
        <div className="flex flex-col items-center gap-4 py-16 px-6 text-center" style={{ borderRadius: 'var(--radius-lg)', background: 'var(--content-bg-card)', border: '1.5px dashed var(--content-border-strong)' }}>
          <Target size={48} style={{ color: 'var(--ink-faint)', opacity: 0.5 }} />
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: 'var(--ink)' }}>No aspirations yet</p>
          <p style={{ fontSize: '14px', color: 'var(--ink-faint)', lineHeight: 1.6, maxWidth: 400 }}>Add your first aspiration to start building your milestone tree</p>
          <button onClick={openAddAsp} className="flex items-center gap-1" style={{ marginTop: 4, padding: '9px 24px', borderRadius: 'var(--radius-sm)', background: 'var(--ink)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
            <Plus size={14} /> Add your first aspiration
          </button>
        </div>
      )}

      {/* Grouped aspiration cards */}
      {!loading && aspirations.length > 0 && (
        <div>
          {areaGroups.groups
            .filter(({ area }) => !areaFilter || area.id === areaFilter)
            .map(({ area, asps }, idx) => renderAreaSection(area.id, area.name, getAreaColor(area.name), asps, idx))}
          {!areaFilter && areaGroups.ungrouped.length > 0 && renderAreaSection('ungrouped', 'No area assigned', null, areaGroups.ungrouped, areaGroups.groups.length)}
        </div>
      )}
    </div>
  )
}
