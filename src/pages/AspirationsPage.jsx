import { useState, useEffect, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { getAreaColor } from '../lib/areaUtils'
import { useUserProfile } from '../contexts/UserProfileContext'
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Target, X, GitBranch, Sparkles } from 'lucide-react'
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

function psmartScoreColor(s) {
  return s >= 8 ? '#22c55e' : s >= 5 ? '#d97706' : '#dc2626'
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

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '12px 18px', borderLeft: '3px solid #e8e3da' }}>
      <div className="flex items-center gap-3">
        <div style={{ flex: 1 }}>
          <div style={{ width: '55%', height: 14, borderRadius: 3, background: '#e8e3da', marginBottom: 4 }} />
          <div style={{ width: '30%', height: 9, borderRadius: 3, background: '#f0ece4' }} />
        </div>
        <div style={{ width: 48, height: 3, borderRadius: 2, background: '#e8e3da' }} />
      </div>
    </div>
  )
}

let cachedData = null
let cacheTime = null
const CACHE_TTL = 60000

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
  const [expandedAsps, setExpandedAsps] = useState(new Set())
  const [expandedMs, setExpandedMs] = useState(new Set())
  const [journeyAspirationId, setJourneyAspirationId] = useState(null)

  const [aspForm, setAspForm] = useState(null)
  const [msForm, setMsForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingAspId, setDeletingAspId] = useState(null)
  const [deletingMsId, setDeletingMsId] = useState(null)
  const [openTaskPanel, setOpenTaskPanel] = useState(null)
  const [taskSearch, setTaskSearch] = useState('')
  const [openPsmartPanel, setOpenPsmartPanel] = useState(null) // `asp-{id}` or `ms-{id}`
  const [psmartScoring, setPsmartScoring] = useState(new Set())
  const [taskPanelTasks, setTaskPanelTasks] = useState([])
  const [areasPanel, setAreasPanel] = useState(false)
  const [areaInput, setAreaInput] = useState('')
  const [renamingAreaId, setRenamingAreaId] = useState(null)
  const [renamingText, setRenamingText] = useState('')
  const [collapsedAreas, setCollapsedAreas] = useState(new Set())
  const [areaDropdownAspId, setAreaDropdownAspId] = useState(null)
  const aspFormRef = useRef(null)
  const msFormRef = useRef(null)
  const { selfPersonId } = useUserProfile()

  function applyData(d) { setAspirations(d.aspirations); setMilestones(d.milestones); setTasks(d.tasks); setPeople(d.people); setAreas(d.areas) }

  async function fetchAll() {
    if (cachedData && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
      applyData(cachedData); setLoading(false); return
    }
    if (cachedData) { applyData(cachedData); setLoading(false) }
    const showSkeleton = !cachedData
    if (showSkeleton) setLoading(true)
    const [aR, mR, tR, pR, arR] = await Promise.all([
      supabase.from('aspirations').select('*').order('created_at'),
      supabase.from('milestones').select('*').order('created_at'),
      supabase.from('tasks').select('id, done, milestone_id').not('milestone_id', 'is', null),
      supabase.from('people').select('id, name').order('name'),
      supabase.from('areas').select('*').order('name'),
    ])
    const fresh = { aspirations: aR.data || [], milestones: mR.data || [], tasks: tR.data || [], people: pR.data || [], areas: arR.data || [] }
    cachedData = fresh; cacheTime = Date.now()
    applyData(fresh); setLoading(false)
  }

  function invalidateCache() { cachedData = null; cacheTime = null }

  async function refetchTasks() {
    const { data } = await supabase.from('tasks').select('id, done, milestone_id').not('milestone_id', 'is', null)
    const t = data || []
    setTasks(t)
    if (cachedData) { cachedData = { ...cachedData, tasks: t }; cacheTime = Date.now() }
  }

  async function fetchTaskPanelTasks() {
    const { data } = await supabase.from('tasks').select('id, task, done, due_date, owner, quadrant, milestone_id')
    setTaskPanelTasks(data || [])
  }

  useEffect(() => { cachedData = null; fetchAll() }, [user.id])

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

  useEffect(() => {
    if (aspForm || msForm) { setOpenTaskPanel(null); setTaskSearch('') }
  }, [aspForm, msForm])

  const progressMap = useMemo(() => {
    const cache = {}
    function calc(id, horizon, depth) {
      if (cache[id] !== undefined) return cache[id]
      if (depth > 5) return 0
      const directTasks = tasks.filter(t => t.milestone_id === id)
      if (horizon === 'Weekly') {
        if (!directTasks.length) return (cache[id] = 0)
        return (cache[id] = (directTasks.filter(t => t.done).length / directTasks.length) * 100)
      }
      const ch = CHILD_H[horizon]
      if (!ch) return (cache[id] = 0)
      const kids = milestones.filter(m => m.parent_milestone_id === id && m.horizon === ch)
      if (!kids.length) {
        if (!directTasks.length) return (cache[id] = 0)
        return (cache[id] = (directTasks.filter(t => t.done).length / directTasks.length) * 100)
      }
      return (cache[id] = kids.reduce((a, c) => a + calc(c.id, c.horizon, depth + 1), 0) / kids.length)
    }
    milestones.forEach(m => calc(m.id, m.horizon, 0))
    aspirations.forEach(a => {
      const ann = milestones.filter(m => m.aspiration_id === a.id && m.horizon === 'Annual')
      cache['a-' + a.id] = ann.length ? ann.reduce((s, m) => s + (cache[m.id] || 0), 0) / ann.length : 0
    })
    return cache
  }, [milestones, tasks, aspirations])

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
    invalidateCache(); await fetchAll(); setSaving(false)
  }
  async function deleteAsp(id) {
    const { error } = await supabase.from('aspirations').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Aspiration deleted', 'success'); setDeletingAspId(null); invalidateCache(); await fetchAll() }
  }

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
    if (msForm.id) {
      const { error } = await supabase.from('milestones').update(fields).eq('id', msForm.id).eq('user_id', user.id)
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      setMilestones(prev => prev.map(m => m.id === msForm.id ? { ...m, ...fields } : m))
      showToast('Milestone updated', 'success')
    } else {
      const { data: row, error } = await supabase.from('milestones').insert({ ...fields, user_id: user.id, aspiration_id: msForm.aspirationId, parent_milestone_id: msForm.parentMilestoneId || null, horizon: msForm.horizon }).select().single()
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      setMilestones(prev => [...prev, row])
      showToast('Milestone added', 'success')
    }
    setMsForm(null); setSaving(false)
    invalidateCache(); fetchAll()
  }
  async function deleteMs(id) {
    const { error } = await supabase.from('milestones').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else {
      setMilestones(prev => prev.filter(m => m.id !== id))
      setDeletingMsId(null)
      showToast('Milestone deleted', 'success')
      invalidateCache(); fetchAll()
    }
  }

  async function linkTask(taskId, milestoneId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: milestoneId }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Task linked', 'success'); invalidateCache(); await refetchTasks() }
  }
  async function unlinkTask(taskId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: null }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Task unlinked', 'success'); invalidateCache(); await refetchTasks() }
  }

  async function scoreItem(itemType, itemId, text, context = {}) {
    const panelKey = itemType === 'aspiration' ? 'asp-' + itemId : 'ms-' + itemId
    setPsmartScoring(prev => new Set(prev).add(itemId))
    setOpenPsmartPanel(panelKey)
    try {
      const { data, error } = await supabase.functions.invoke('score-psmart', {
        body: { text, horizon: context.horizon || null, due_date: context.due_date || null, type: itemType },
      })
      if (error) throw new Error(error.message || 'Scoring failed')
      if (data?.error) throw new Error(data.error)
      const table = itemType === 'aspiration' ? 'aspirations' : 'milestones'
      await supabase.from(table).update({
        psmart_score: data.score,
        psmart_feedback: data,
        psmart_scored_at: new Date().toISOString(),
      }).eq('id', itemId).eq('user_id', user.id)
      const patch = { psmart_score: data.score, psmart_feedback: data, psmart_scored_at: new Date().toISOString() }
      if (itemType === 'aspiration') setAspirations(prev => prev.map(a => a.id === itemId ? { ...a, ...patch } : a))
      else setMilestones(prev => prev.map(m => m.id === itemId ? { ...m, ...patch } : m))
      invalidateCache()
    } catch (err) {
      showToast(err.message || 'Scoring failed', 'error')
      setOpenPsmartPanel(null)
    } finally {
      setPsmartScoring(prev => { const s = new Set(prev); s.delete(itemId); return s })
    }
  }

  async function scorePsmart(kind, item) {
    const key = `${kind}-${item.id}`
    setPsmartScoring(prev => new Set(prev).add(key))
    try {
      const { data, error } = await supabase.functions.invoke('score-psmart', {
        body: { text: item.text, horizon: item.horizon || null, due_date: item.due_date || item.end_date || null, type: kind === 'asp' ? 'aspiration' : 'milestone' },
      })
      if (error || data?.error) {
        showToast(data?.error || error.message || 'Scoring failed', 'error')
        return
      }
      const table = kind === 'asp' ? 'aspirations' : 'milestones'
      const fields = { psmart_score: data.score, psmart_feedback: { dimensions: data.dimensions, overall_note: data.overall_note, suggested_rewrite: data.suggested_rewrite }, psmart_scored_at: new Date().toISOString() }
      const { error: writeErr } = await supabase.from(table).update(fields).eq('id', item.id).eq('user_id', user.id)
      if (writeErr) { showToast(writeErr.message, 'error'); return }
      if (kind === 'asp') setAspirations(prev => prev.map(a => a.id === item.id ? { ...a, ...fields } : a))
      else setMilestones(prev => prev.map(m => m.id === item.id ? { ...m, ...fields } : m))
      setOpenPsmartPanel(key)
    } catch (e) {
      showToast('Scoring failed', 'error')
    } finally {
      setPsmartScoring(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  function psmartColor(score) {
    if (score >= 8) return 'var(--accent-green)'
    if (score >= 5) return 'var(--accent-gold)'
    return '#dc2626'
  }

  function renderPsmartBadge(kind, item) {
    const key = `${kind}-${item.id}`
    const scoring = psmartScoring.has(key)
    if (scoring) return <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', flexShrink: 0 }}>scoring...</span>
    if (item.psmart_score == null) {
      return (
        <button onClick={(e) => { e.stopPropagation(); scorePsmart(kind, item) }} style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 8, background: 'transparent', border: '1px dashed var(--content-border)', color: 'var(--ink-faint)', cursor: 'pointer', flexShrink: 0 }}>
          PSMART?
        </button>
      )
    }
    return (
      <button onClick={(e) => { e.stopPropagation(); setOpenPsmartPanel(openPsmartPanel === key ? null : key) }} title="View PSMART feedback" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'transparent', border: `1px solid ${psmartColor(item.psmart_score)}`, color: psmartColor(item.psmart_score), cursor: 'pointer', flexShrink: 0 }}>
        {item.psmart_score}/10
      </button>
    )
  }

  const DIM_LABEL = { performance: 'Performance', specific: 'Specific', measurable: 'Measurable', achievable: 'Achievable', relevant: 'Relevant', time_bound: 'Time-bound' }
  const RATING_COLOR = { strong: 'var(--accent-green)', partial: 'var(--accent-gold)', weak: '#dc2626' }

  function renderPsmartPanel(kind, item) {
    const key = `${kind}-${item.id}`
    if (openPsmartPanel !== key || !item.psmart_feedback) return null
    const fb = item.psmart_feedback
    return (
      <div style={{ background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '4px 0' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: psmartColor(item.psmart_score) }}>{item.psmart_score}/10</span>
            <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>PSMART score</span>
          </div>
          <button onClick={() => scorePsmart(kind, item)} style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', background: 'none', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer' }}>Re-score</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
          {Object.entries(DIM_LABEL).map(([k, label]) => {
            const d = fb.dimensions?.[k]
            if (!d) return null
            return (
              <div key={k} style={{ fontSize: '11.5px' }}>
                <div className="flex items-center gap-1" style={{ marginBottom: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: RATING_COLOR[d.rating] || 'var(--ink-faint)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
                </div>
                <div style={{ color: 'var(--ink-faint)', lineHeight: 1.4 }}>{d.note}</div>
              </div>
            )
          })}
        </div>
        {fb.overall_note && <p style={{ fontSize: '12px', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 10, fontStyle: 'italic' }}>{fb.overall_note}</p>}
        {fb.suggested_rewrite && (
          <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink-faint)', marginBottom: 4 }}>Suggested rewrite</div>
            <p style={{ fontSize: '12.5px', color: 'var(--ink)', lineHeight: 1.5 }}>{fb.suggested_rewrite}</p>
          </div>
        )}
      </div>
    )
  }

  function toggleAspExpand(id) { setExpandedAsps(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function toggleMsExpand(id) { setExpandedMs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function toggleAreaCollapse(id) { setCollapsedAreas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }

  async function addArea() {
    const name = areaInput.trim()
    if (!name) return
    if (areas.some(a => a.name.toLowerCase() === name.toLowerCase())) { showToast('Area already exists', 'error'); return }
    const { error } = await supabase.from('areas').insert({ user_id: user.id, name })
    if (error) showToast(error.message, 'error')
    else { showToast('Area added', 'success'); setAreaInput(''); invalidateCache(); await fetchAll() }
  }
  async function renameArea(id, newName) {
    if (!newName.trim()) return
    const { error } = await supabase.from('areas').update({ name: newName.trim() }).eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Area renamed', 'success'); setRenamingAreaId(null); invalidateCache(); await fetchAll() }
  }
  async function deleteArea(id) {
    const { error } = await supabase.from('areas').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Area deleted', 'success'); invalidateCache(); await fetchAll() }
  }
  async function reassignArea(aspirationId, areaId) {
    const { error } = await supabase.from('aspirations').update({ area_id: areaId }).eq('id', aspirationId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Area updated', 'success'); setAreaDropdownAspId(null); invalidateCache(); await fetchAll() }
  }

  const ownAspirations = useMemo(() => aspirations.filter(a => a.user_id === user.id), [aspirations, user.id])
  const sharedAspirations = useMemo(() => aspirations.filter(a => a.user_id !== user.id), [aspirations, user.id])

  const areaGroups = useMemo(() => {
    const byArea = {}
    const ungrouped = []
    ownAspirations.forEach(a => { if (a.area_id) { (byArea[a.area_id] ||= []).push(a) } else ungrouped.push(a) })
    const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name))
    const groups = sorted.filter(a => byArea[a.id]?.length).map(a => ({ area: a, asps: byArea[a.id] }))
    return { groups, ungrouped }
  }, [ownAspirations, areas])

  const msIndex = useMemo(() => {
    const byParent = {}
    const hasChild = new Set()
    milestones.forEach(m => {
      const key = `${m.aspiration_id}|${m.parent_milestone_id || ''}|${m.horizon}`
      ;(byParent[key] ||= []).push(m)
      if (m.parent_milestone_id) hasChild.add(m.parent_milestone_id)
    })
    return { byParent, hasChild }
  }, [milestones])

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

  function renderScorePanel(item, itemType) {
    const isLoading = psmartScoring.has(item.id)
    const fb = item.psmart_feedback
    if (!isLoading && !fb) return null
    const RATING_COLOR = { strong: '#22c55e', partial: '#d97706', weak: '#dc2626' }
    const DIMS = [
      ['Performance', 'performance'],
      ['Specific', 'specific'],
      ['Measurable', 'measurable'],
      ['Achievable', 'achievable'],
      ['Relevant', 'relevant'],
      ['Time-bound', 'time_bound'],
    ]
    const context = itemType === 'aspiration'
      ? { due_date: item.end_date }
      : { horizon: item.horizon, due_date: item.due_date }
    const sc = fb ? psmartScoreColor(fb.score) : 'var(--ink-faint)'
    return (
      <div style={{ background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '4px 0' }}>
        {isLoading && !fb ? (
          <div style={{ fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Scoring with Gemini…</div>
        ) : (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div className="flex items-center gap-3">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)' }}>PSMART</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: sc, lineHeight: 1 }}>
                  {fb.score}<span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--ink-faint)' }}>/10</span>
                </span>
                {isLoading && <span style={{ fontSize: '11px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Re-scoring…</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => scoreItem(itemType, item.id, item.text, context)} disabled={isLoading}
                  style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-faint)', border: '1px solid var(--content-border)', cursor: isLoading ? 'wait' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Re-score
                </button>
                <button onClick={() => setOpenPsmartPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><X size={14} /></button>
              </div>
            </div>
            {fb.overall_note && (
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: 12, lineHeight: 1.5 }}>{fb.overall_note}</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: fb.suggested_rewrite ? 14 : 0 }}>
              {DIMS.map(([label, key]) => {
                const dim = fb.dimensions?.[key]
                if (!dim) return null
                const rc = RATING_COLOR[dim.rating] || 'var(--ink-faint)'
                return (
                  <div key={key} className="flex items-start gap-2">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: rc, flexShrink: 0, marginTop: 5 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)', whiteSpace: 'nowrap', width: 88, flexShrink: 0, paddingTop: 1 }}>{label}</span>
                    <span style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5 }}>{dim.note}</span>
                  </div>
                )
              })}
            </div>
            {fb.suggested_rewrite && (
              <div style={{ background: '#f0f9f4', border: '1px solid #b8e8cc', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#2d6a4f', marginBottom: 5 }}>Suggested rewrite</div>
                <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>{fb.suggested_rewrite}</p>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const QUAD_BADGE = {
    'Do Now':    { bg: 'var(--accent-coral-light)', color: 'var(--accent-coral)' },
    'Do Soon':   { bg: 'var(--accent-gold-light)',  color: 'var(--accent-gold)' },
    Schedule:    { bg: 'var(--accent-green-light)',  color: 'var(--accent-green)' },
    Delegated:   { bg: 'var(--accent-purple-light)', color: 'var(--accent-purple)' },
    Awaited:     { bg: '#deeaff', color: '#185fa5' },
  }

  function renderTaskPanel(m) {
    const linked = taskPanelTasks.filter(t => t.milestone_id === m.id)
    const available = taskPanelTasks.filter(t => !t.done && (!t.milestone_id || t.milestone_id === m.id))
    const unlinked = available.filter(t => t.milestone_id !== m.id)
    const filtered = taskSearch
      ? unlinked.filter(t => t.task?.toLowerCase().includes(taskSearch.toLowerCase()))
      : unlinked
    const prog = Math.round(progressMap[m.id] || 0)

    return (
      <div style={{ background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '4px 0' }}>
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

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--content-border)', fontSize: '11px', color: 'var(--ink-faint)' }}>
          <div>Progress updates automatically as linked tasks are completed</div>
          <div style={{ marginTop: 2 }}>Current progress: <span style={{ fontWeight: 600, color: prog > 0 ? 'var(--accent-green)' : 'var(--ink-faint)' }}>{prog}%</span></div>
        </div>
      </div>
    )
  }

  const INDENT = { Annual: 0, SixMonth: 20, Monthly: 40, Weekly: 60 }
  const DATE_COLOR = { Annual: '#2d6a4f', SixMonth: '#185fa5', Monthly: '#c8982a', Weekly: '#e07a5f' }

  function renderTree(aspirationId, parentId, horizon) {
    const key = `${aspirationId}|${parentId || ''}|${horizon}`
    const items = msIndex.byParent[key] || []
    const nextH = CHILD_H[horizon]
    const indent = INDENT[horizon] || 0
    const showAddHere = msForm && !msForm.id && msForm.aspirationId === aspirationId &&
      (parentId ? msForm.parentMilestoneId === parentId : !msForm.parentMilestoneId) &&
      msForm.horizon === horizon

    if (!items.length && !showAddHere) return null

    return (
      <>
        {items.map(m => {
          const hasKids = nextH && msIndex.hasChild.has(m.id)
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
          const isDone = m.status === 'Done'
          const progColor = overdue && prog < 25 ? 'var(--danger)' : prog > 50 ? 'var(--accent-green)' : 'var(--ink-faint)'
          const isTaskLinkable = m.horizon === 'Weekly' || (m.horizon === 'Monthly' && !msIndex.hasChild.has(m.id))
          const linkedTasks = isTaskLinkable ? tasks.filter(t => t.milestone_id === m.id) : []
          const linkedDone = linkedTasks.filter(t => t.done).length

          return (
            <div key={m.id}>
              <div style={{ display: 'flex', minHeight: 32, alignItems: 'flex-start', background: isDone ? 'rgba(156,163,175,0.08)' : 'transparent', borderRadius: isDone ? 4 : 0 }}>
                <div style={{ width: 72, paddingLeft: 18, paddingRight: 8, paddingTop: 7, flexShrink: 0, textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: overdue ? 600 : 500, color: isDone ? 'var(--ink-faint)' : overdue ? '#dc2626' : (due ? DATE_COLOR[m.horizon] || 'var(--ink-faint)' : 'var(--ink-faint)') }}>
                    {due || '—'}
                  </span>
                </div>
                {deletingMsId === m.id ? (
                  <div className="flex items-center gap-2 flex-1" style={{ borderLeft: '1px solid var(--content-border)', paddingLeft: 12 + indent, height: 32, fontSize: '12px' }}>
                    <span style={{ color: 'var(--ink-soft)', flex: 1 }}>Delete &ldquo;{m.text.length > 30 ? m.text.slice(0, 30) + '…' : m.text}&rdquo;?</span>
                    <button onClick={() => deleteMs(m.id)} style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Delete</button>
                    <button onClick={() => setDeletingMsId(null)} style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--content-border)', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>Cancel</button>
                  </div>
                ) : (
                  <div className="ms-row flex items-start gap-2 flex-1" style={{ borderLeft: '1px solid var(--content-border)', paddingLeft: 12 + indent, paddingRight: 6, minHeight: 32, paddingTop: 7, paddingBottom: 7, transition: 'background 150ms', cursor: 'default' }}>
                    {hasKids ? (
                      <button onClick={() => toggleMsExpand(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-faint)', display: 'flex', flexShrink: 0 }}>
                        {isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    ) : <span style={{ width: 13, flexShrink: 0 }} />}
                    {badge && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 10, background: badge.bg, color: badge.color, fontWeight: 500, flexShrink: 0 }}>{badge.label}</span>}
                    <span onClick={isTaskLinkable ? () => { const next = openTaskPanel === m.id ? null : m.id; setOpenTaskPanel(next); setTaskSearch(''); if (next) fetchTaskPanelTasks() } : undefined} style={{ flex: 1, fontSize: '13px', fontFamily: 'var(--font-sans)', color: isDone ? 'var(--ink-faint)' : 'var(--ink)', cursor: isTaskLinkable ? 'pointer' : 'default', lineHeight: 1.4, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.65 : 1 }}>{m.text}</span>
                    {anchor && <div title={anchor.name} style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{getInitials(anchor.name)}</div>}
                    {showProg && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: progColor, flexShrink: 0 }}>{prog}%</span>}
                    {m.psmart_score != null && (
                      <span onClick={() => setOpenPsmartPanel(openPsmartPanel === 'ms-' + m.id ? null : 'ms-' + m.id)}
                        title="PSMART score — click to view"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '1px 5px', borderRadius: 8, background: psmartScoreColor(m.psmart_score) + '22', color: psmartScoreColor(m.psmart_score), cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>
                        {m.psmart_score}/10
                      </span>
                    )}
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    {isTaskLinkable && linkedTasks.length > 0 && (
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: linkedDone === linkedTasks.length ? 'var(--accent-green-light)' : 'var(--content-bg)', border: '1px solid var(--content-border)', color: linkedDone === linkedTasks.length ? 'var(--accent-green)' : 'var(--ink-faint)', flexShrink: 0 }}>
                        {linkedTasks.length}t · {linkedDone}d
                      </span>
                    )}
                    {renderPsmartBadge('ms', m)}
                    <div className="ms-actions flex items-center gap-1" style={{ flexShrink: 0 }}>
                      <button onClick={() => scoreItem('milestone', m.id, m.text, { horizon: m.horizon, due_date: m.due_date })}
                        disabled={psmartScoring.has(m.id)}
                        title={m.psmart_score != null ? 'Re-score with PSMART' : 'Score with PSMART'}
                        style={{ background: 'none', border: 'none', cursor: psmartScoring.has(m.id) ? 'wait' : 'pointer', padding: 2, color: m.psmart_score != null ? psmartScoreColor(m.psmart_score) : 'var(--ink-faint)', display: 'flex', opacity: psmartScoring.has(m.id) ? 0.5 : 1 }}>
                        <Sparkles size={12} />
                      </button>
                      <button onClick={() => openEditMs(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Pencil size={12} /></button>
                      {nextH && <button onClick={() => openAddMs(m.aspiration_id, m.id, nextH)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Plus size={12} /></button>}
                      <button onClick={() => setDeletingMsId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                )}
              </div>
              {isEditing && renderMsForm()}
              {renderPsmartPanel('ms', m)}
              {isTaskLinkable && openTaskPanel === m.id && renderTaskPanel(m)}
              {openPsmartPanel === 'ms-' + m.id && renderScorePanel(m, 'milestone')}
              {(isExp || hasAddChild) && nextH && renderTree(aspirationId, m.id, nextH)}
            </div>
          )
        })}
        {showAddHere && renderMsForm()}
      </>
    )
  }

  function renderJourney(a) {
    const aspMilestones = milestones.filter(m => m.aspiration_id === a.id)

    if (!aspMilestones.length) {
      return (
        <div style={{ borderTop: '1px solid var(--content-border)', padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
            No milestones yet — add an Annual Milestone to start the journey
          </p>
        </div>
      )
    }

    const annuals  = aspMilestones.filter(m => m.horizon === 'Annual')
    const sixMonths = aspMilestones.filter(m => m.horizon === 'SixMonth')
    const monthlys = aspMilestones.filter(m => m.horizon === 'Monthly')
    const weeklys  = aspMilestones.filter(m => m.horizon === 'Weekly')

    const stops = [
      ...monthlys.map(m => ({ ...m, stopType: 'Monthly' })),
      ...sixMonths.map(m => ({ ...m, stopType: 'SixMonth' })),
    ].sort((x, y) => {
      if (!x.due_date && !y.due_date) return 0
      if (!x.due_date) return 1
      if (!y.due_date) return -1
      return x.due_date.localeCompare(y.due_date)
    })

    const prog = Math.round(progressMap['a-' + a.id] || 0)

    function ml(dateStr) {
      if (!dateStr) return null
      return MONTHS[new Date(dateStr + 'T00:00:00').getMonth()]
    }

    function ai(m) {
      if (!m.anchor_person_id) return null
      const p = people.find(p => p.id === m.anchor_person_id)
      return p ? getInitials(p.name) : null
    }

    function AnchorCircle({ initials }) {
      if (!initials) return null
      return (
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {initials}
        </div>
      )
    }

    return (
      <div style={{ borderTop: '1px solid var(--content-border)', padding: '20px 24px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)', marginBottom: '18px' }}>
          The path to the Annual goal · earliest → destination
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '20px', top: 0, bottom: 0, width: '2px', background: 'var(--content-border)' }} />

          <div style={{ position: 'relative', paddingLeft: '52px', paddingBottom: '24px' }}>
            <div style={{ position: 'absolute', left: '15px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--ink-faint)' }} />
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>Now · {prog}% complete</span>
          </div>

          {stops.map(m => {
            const label = ml(m.due_date)
            const initials = ai(m)
            const dotColor = STATUS_DOT[m.status] || STATUS_DOT.Active

            if (m.stopType === 'Monthly') {
              const weeklyKids = weeklys.filter(w => w.parent_milestone_id === m.id)
              return (
                <div key={m.id} style={{ position: 'relative', paddingLeft: '52px', paddingBottom: '24px' }}>
                  {label && <span style={{ position: 'absolute', left: 0, top: '4px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{label}</span>}
                  <div style={{ position: 'absolute', left: '13px', top: '3px', width: '14px', height: '14px', borderRadius: '50%', background: 'white', border: '3px solid #c8982a' }} />
                  <div style={{ background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: '12px', padding: '11px 14px' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 10, background: '#fdf3dc', color: '#c8982a', fontWeight: 500 }}>Monthly</span>
                      <div className="flex items-center gap-2">
                        <AnchorCircle initials={initials} />
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--ink)', marginTop: '8px' }}>{m.text}</div>
                    {weeklyKids.length > 0 && (
                      <div className="flex flex-wrap gap-1" style={{ marginTop: '8px' }}>
                        {weeklyKids.map(w => (
                          <span key={w.id} style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: '20px', background: w.status === 'Done' ? 'rgba(156,163,175,0.15)' : '#fde8e3', color: w.status === 'Done' ? 'var(--ink-faint)' : '#993c1d', textDecoration: w.status === 'Done' ? 'line-through' : 'none', opacity: w.status === 'Done' ? 0.7 : 1 }}>
                            {w.text.length > 25 ? w.text.slice(0, 25) + '…' : w.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            if (m.stopType === 'SixMonth') {
              return (
                <div key={m.id} style={{ position: 'relative', paddingLeft: '52px', paddingBottom: '24px' }}>
                  {label && <span style={{ position: 'absolute', left: 0, top: '4px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{label}</span>}
                  <div style={{ position: 'absolute', left: '11px', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#3B6FB0', border: '2px solid white' }} />
                  <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: '12px', padding: '12px 14px' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 10, background: '#deeaff', color: '#185fa5', fontWeight: 500 }}>6 Month</span>
                      <div className="flex items-center gap-2">
                        <AnchorCircle initials={initials} />
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--ink)', marginTop: '8px' }}>{m.text}</div>
                  </div>
                </div>
              )
            }

            return null
          })}

          {annuals.map(m => {
            const label = ml(m.due_date)
            const initials = ai(m)
            const due = m.due_date ? (() => { const d = new Date(m.due_date + 'T00:00:00'); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}` })() : null
            return (
              <div key={m.id} style={{ position: 'relative', paddingLeft: '52px', paddingBottom: '8px' }}>
                {label && <span style={{ position: 'absolute', left: 0, top: '4px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#2d6a4f', textTransform: 'uppercase' }}>{label}</span>}
                <div style={{ position: 'absolute', left: '9px', top: '2px', width: '22px', height: '22px', borderRadius: '50%', background: '#2E7D5B', boxShadow: '0 0 0 4px #E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'white' }}>★</div>
                <div style={{ background: 'linear-gradient(135deg, #E1F5EE, #d8f3dc)', border: '1.5px solid #9FE1CB', borderRadius: '14px', padding: '14px 16px' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 10, background: '#2E7D5B', color: 'white', fontWeight: 500 }}>Annual goal</span>
                    <div className="flex items-center gap-2">
                      <AnchorCircle initials={initials} />
                      {due && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#085041' }}>{due}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#085041', marginTop: '9px' }}>{m.text}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderCard(a) {
    const areaObj = areas.find(ar => ar.id === a.area_id)
    const aName = areaObj?.name || null
    const isSharedAsp = a.user_id !== user.id
    const borderCol = isSharedAsp ? '#7b5ea7' : getAreaColor(aName)
    const prog = Math.round(progressMap['a-' + a.id] || 0)
    const isExpanded = expandedAsps.has(a.id)
    const subtitle = [aName, a.start_date && a.end_date ? (() => { const s = new Date(a.start_date + 'T00:00:00'), e = new Date(a.end_date + 'T00:00:00'); return `${MONTHS[s.getMonth()]} ${s.getFullYear()} → ${MONTHS[e.getMonth()]} ${e.getFullYear()}` })() : null].filter(Boolean).join(' · ')
    const hasAnn = milestones.some(m => m.aspiration_id === a.id && m.horizon === 'Annual')

    return (
      <div key={a.id} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', borderLeft: `3px solid ${borderCol}`, marginBottom: 0 }}>
        {deletingAspId === a.id ? (
          <div style={{ padding: '12px 18px' }}>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 8 }}>Delete this aspiration and all milestones?</p>
            <div className="flex gap-2">
              <button onClick={() => deleteAsp(a.id)} style={{ padding: '5px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>Delete</button>
              <button onClick={() => setDeletingAspId(null)} style={{ padding: '5px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--content-border)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div onClick={() => toggleAspExpand(a.id)} className="flex items-center gap-3" style={{ padding: '12px 18px', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: borderCol, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                </div>
                {subtitle && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)', marginTop: 2, marginLeft: 16 }}>{subtitle}</div>}
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                {(prog > 0 || hasAnn) && <span style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', color: prog > 0 ? 'var(--accent-green)' : 'var(--ink-faint)' }}>{prog}%</span>}
                {(prog > 0 || hasAnn) && (
                  <div style={{ width: 48, height: 3, borderRadius: 2, background: 'var(--content-border)', overflow: 'hidden' }}>
                    <div style={{ width: `${prog}%`, height: '100%', background: 'var(--accent-green)', borderRadius: 2, transition: 'width 400ms ease' }} />
                  </div>
                )}
                {isSharedAsp && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: 'var(--accent-purple-light)', color: '#7b5ea7' }}>shared</span>}
                {a.psmart_score != null && (
                  <span onClick={e => { e.stopPropagation(); setOpenPsmartPanel(openPsmartPanel === 'asp-' + a.id ? null : 'asp-' + a.id) }}
                    title="PSMART score — click to view"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '2px 7px', borderRadius: 8, background: psmartScoreColor(a.psmart_score) + '22', color: psmartScoreColor(a.psmart_score), cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>
                    {a.psmart_score}/10
                  </span>
                )}
                {!isSharedAsp && <button onClick={e => { e.stopPropagation(); openEditAsp(a) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--ink-faint)' }}><Pencil size={13} /></button>}
                {!isSharedAsp && <button onClick={e => { e.stopPropagation(); setDeletingAspId(a.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--ink-faint)' }}><Trash2 size={13} /></button>}
                {!isSharedAsp && (
                  <button onClick={e => { e.stopPropagation(); scoreItem('aspiration', a.id, a.text, { due_date: a.end_date }) }}
                    disabled={psmartScoring.has(a.id)}
                    title={a.psmart_score != null ? 'Re-score with PSMART' : 'Score with PSMART'}
                    style={{ background: 'none', border: 'none', cursor: psmartScoring.has(a.id) ? 'wait' : 'pointer', padding: 3, color: a.psmart_score != null ? psmartScoreColor(a.psmart_score) : 'var(--ink-faint)', display: 'flex', opacity: psmartScoring.has(a.id) ? 0.5 : 1 }}>
                    <Sparkles size={13} />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); setJourneyAspirationId(journeyAspirationId === a.id ? null : a.id) }} className="flex items-center gap-1" style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: journeyAspirationId === a.id ? 'var(--accent-coral)' : 'transparent', color: journeyAspirationId === a.id ? 'white' : 'var(--ink-faint)', border: `1px solid ${journeyAspirationId === a.id ? 'var(--accent-coral)' : 'var(--content-border)'}`, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  <GitBranch size={12} /> Journey
                </button>
                <span style={{ color: 'var(--ink-faint)', display: 'flex', transition: 'transform 150ms' }}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
              </div>
            </div>

            {openPsmartPanel === 'asp-' + a.id && (
              <div style={{ padding: '0 18px 10px' }}>{renderScorePanel(a, 'aspiration')}</div>
            )}
            {(isExpanded || journeyAspirationId === a.id) && (
              journeyAspirationId === a.id ? renderJourney(a) : (
              <div style={{ borderTop: '1px solid var(--content-border)', padding: '10px 0' }}>
                {!isSharedAsp && (
                <div style={{ padding: '0 18px 6px', position: 'relative', display: 'inline-block' }}>
                  <div onClick={() => setAreaDropdownAspId(areaDropdownAspId === a.id ? null : a.id)} style={{ cursor: 'pointer' }} className="flex items-center gap-1">
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: borderCol, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-faint)' }}>{aName || 'Assign area'} ▾</span>
                  </div>
                  {areaDropdownAspId === a.id && (
                    <div style={{ position: 'absolute', top: '100%', left: 18, zIndex: 10, background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', marginTop: 4, minWidth: 160, padding: '4px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                      <div onClick={() => reassignArea(a.id, null)} style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ink-faint)', transition: 'background 100ms' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>No area</div>
                      {areas.map(ar => (
                        <div key={ar.id} onClick={() => reassignArea(a.id, ar.id)} className="flex items-center gap-2" style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '12px', transition: 'background 100ms' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: getAreaColor(ar.name), flexShrink: 0 }} />
                          <span style={{ color: 'var(--ink)' }}>{ar.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}

                {renderTree(a.id, null, 'Annual')}

                {!isSharedAsp && !hasAnn && !(msForm && !msForm.id && msForm.aspirationId === a.id && !msForm.parentMilestoneId) && (
                  <p style={{ fontSize: '12px', color: 'var(--ink-faint)', fontStyle: 'italic', padding: '6px 18px' }}>No milestones yet — add an Annual Milestone to start</p>
                )}
                {!isSharedAsp && !(msForm && !msForm.id && msForm.aspirationId === a.id && !msForm.parentMilestoneId && msForm.horizon === 'Annual') && (
                  <div style={{ padding: '4px 18px 2px', marginLeft: 72 }}>
                    <button onClick={() => openAddMs(a.id, null, 'Annual')} className="flex items-center gap-1" style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-faint)', border: '1px dashed var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      <Plus size={11} /> Annual milestone
                    </button>
                  </div>
                )}
              </div>
              )
            )}
          </>
        )}
      </div>
    )
  }

  function renderAreaSection(areaId, label, color, asps, idx) {
    const isCollapsed = collapsedAreas.has(areaId)
    return (
      <div key={areaId}>
        <div className="flex items-center gap-2" style={{ marginTop: idx > 0 ? 20 : 0, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--content-border)' }}>
          {color && <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />}
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: color ? 'var(--ink)' : 'var(--ink-faint)', fontStyle: color ? 'normal' : 'italic' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>({asps.length})</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => toggleAreaCollapse(areaId)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        {!isCollapsed && <div className="flex flex-col" style={{ gap: 8 }}>{asps.map(a => renderCard(a))}</div>}
      </div>
    )
  }

  return (
    <div className="page-pad flex flex-col gap-7">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>Aspirations</h1>
          <p style={{ fontSize: '14px', color: 'var(--ink-faint)' }}>Your long-term vision, broken down into action</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { cachedData = null; cacheTime = null; fetchAll() }} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Refresh</button>
          <button onClick={() => setAreasPanel(p => !p)} style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Manage Areas</button>
          <button onClick={openAddAsp} className="flex items-center gap-1" style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--ink)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
            <Plus size={14} /> Add Aspiration
          </button>
        </div>
      </div>

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

      {loading && <div className="flex flex-col gap-4">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>}

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

      {!loading && sharedAspirations.length > 0 && !areaFilter && (
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--content-border)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: '#7b5ea7', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: '#7b5ea7' }}>Shared with me</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-faint)' }}>({sharedAspirations.length})</span>
          </div>
          <div className="flex flex-col" style={{ gap: 8 }}>{sharedAspirations.map(a => renderCard(a))}</div>
        </div>
      )}

      {!loading && ownAspirations.length > 0 && (
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
