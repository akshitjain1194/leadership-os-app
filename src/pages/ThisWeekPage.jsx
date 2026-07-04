import { useState, useEffect, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Star, Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getQuadrant, getOwnerName } from '../lib/taskUtils'
import { useUserProfile } from '../contexts/UserProfileContext'
import { showToast } from '../components/Toast'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CLUSTERS = [
  { key: 'Do Now',    label: 'Do Now',    color: '#dc2626', prominent: true },
  { key: 'Delegated', label: 'Delegated', color: '#7b5ea7', showOwner: true },
  { key: 'Do Soon',   label: 'Do Soon',   color: '#d97706' },
  { key: 'Awaited',   label: 'Awaited',   color: '#9898b8', showOwner: true },
  { key: 'Schedule',  label: 'Schedule',  color: '#2d6a4f' },
]

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDue(dateStr) {
  if (!dateStr) return null
  const today = todayDateStr()
  if (dateStr === today) return { text: 'Today', color: 'var(--accent-gold)', bold: true }
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (d < t) return { text: label, color: 'var(--danger)', bold: true }
  return { text: label, color: 'var(--ink-faint)', bold: false }
}

let cachedData = null
let cacheTime = null
const CACHE_TTL = 60000

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 18px', gap: 10 }}>
      <div style={{ width: 18, height: 18, borderRadius: 4, background: '#e8e3da', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: '70%', height: 12, borderRadius: 3, background: '#e8e3da', marginBottom: 4 }} />
        <div style={{ width: '35%', height: 8, borderRadius: 3, background: '#f0ece4' }} />
      </div>
    </div>
  )
}

export default function ThisWeekPage() {
  const { user } = useOutletContext()

  const [tasks, setTasks] = useState([])
  const [milestones, setMilestones] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [collapsedClusters, setCollapsedClusters] = useState(new Set())
  const [showDone, setShowDone] = useState(false)
  const [quickAdd, setQuickAdd] = useState({})
  const [msPickerTaskId, setMsPickerTaskId] = useState(null)
  const [msPickerSearch, setMsPickerSearch] = useState('')
  const [editForm, setEditForm] = useState(null)
  const [editMsSearch, setEditMsSearch] = useState('')
  const [editMsOpen, setEditMsOpen] = useState(false)

  const msPickerRef = useRef(null)
  const editPanelRef = useRef(null)

  const now = new Date()
  const todayLabel = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`
  const todayStr = todayDateStr()

  async function fetchAll() {
    if (cachedData && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
      setTasks(cachedData.tasks); setMilestones(cachedData.milestones); setPeople(cachedData.people)
      setLoading(false)
      return
    }
    if (cachedData) {
      setTasks(cachedData.tasks); setMilestones(cachedData.milestones); setPeople(cachedData.people)
      setLoading(false)
    }
    const showSkeleton = !cachedData
    if (showSkeleton) setLoading(true)
    const [tR, mR, pR] = await Promise.all([
      supabase.from('tasks').select('id, user_id, task, done, due_date, owner, owner_id, quadrant, starred, milestone_id').eq('done', false).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('milestones').select('id, text, aspiration_id, horizon, parent_milestone_id, aspirations(text)').eq('user_id', user.id).in('horizon', ['Weekly', 'Monthly']),
      supabase.from('people').select('id, name').order('name'),
    ])
    const fresh = { tasks: tR.data || [], milestones: mR.data || [], people: pR.data || [] }
    cachedData = fresh; cacheTime = Date.now()
    setTasks(fresh.tasks); setMilestones(fresh.milestones); setPeople(fresh.people)
    setLoading(false)
  }

  function invalidateCache() { cachedData = null; cacheTime = null }

  async function refetchTasks() {
    const { data } = await supabase.from('tasks').select('id, user_id, task, done, due_date, owner, owner_id, quadrant, starred, milestone_id').eq('done', false).order('due_date', { ascending: true, nullsFirst: false })
    if (data) { setTasks(data); if (cachedData) { cachedData = { ...cachedData, tasks: data }; cacheTime = Date.now() } }
  }

  useEffect(() => { invalidateCache(); fetchAll() }, [user.id])

  // Escape / click-outside for milestone picker + edit panel
  useEffect(() => {
    if (!msPickerTaskId && !editForm) return
    function onKey(e) {
      if (e.key === 'Escape') { setMsPickerTaskId(null); setMsPickerSearch(''); closeEditPanel() }
    }
    function onMouse(e) {
      if (msPickerTaskId && msPickerRef.current && !msPickerRef.current.contains(e.target)) { setMsPickerTaskId(null); setMsPickerSearch('') }
      if (editForm && editPanelRef.current && !editPanelRef.current.contains(e.target)) closeEditPanel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse) }
  }, [msPickerTaskId, editForm])

  // ── Handlers ──
  async function toggleDone(task) {
    const next = !task.done
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: next } : t))
    const { error } = await supabase.from('tasks').update({ done: next }).eq('id', task.id).eq('user_id', user.id)
    if (error) { showToast(error.message, 'error'); setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !next } : t)) }
  }

  async function toggleStar(task) {
    const next = !task.starred
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, starred: next } : t))
    const { error } = await supabase.from('tasks').update({ starred: next }).eq('id', task.id).eq('user_id', user.id)
    if (error) { showToast(error.message, 'error'); setTasks(prev => prev.map(t => t.id === task.id ? { ...t, starred: !next } : t)) }
  }

  // ── Edit panel ──
  function openEditPanel(task) {
    setEditForm({ id: task.id, task: task.task, due_date: task.due_date || '', owner_id: task.owner_id || '', milestone_id: task.milestone_id || '', starred: task.starred })
    setEditMsSearch(''); setEditMsOpen(false)
    setMsPickerTaskId(null); setMsPickerSearch('')
  }
  function closeEditPanel() { setEditForm(null); setEditMsSearch(''); setEditMsOpen(false) }

  const { selfPersonId, supervisorPersonId, selfName: profileSelfName } = useUserProfile()

  const liveTasks = useMemo(() =>
    tasks.map(t => ({ ...t, quadrant: getQuadrant(t.owner_id, t.due_date, selfPersonId, supervisorPersonId) })),
    [tasks, selfPersonId, supervisorPersonId]
  )

  async function saveEdit() {
    if (!editForm || !editForm.task.trim()) return
    const selectedOwnerId = editForm.owner_id || null
    const ownerName = selectedOwnerId ? (people.find(p => p.id === selectedOwnerId)?.name || null) : null
    const quadrant = getQuadrant(selectedOwnerId, editForm.due_date || null, selfPersonId, supervisorPersonId)
    const { error } = await supabase.from('tasks').update({
      task: editForm.task.trim(), due_date: editForm.due_date || null, owner_id: selectedOwnerId, owner: ownerName,
      milestone_id: editForm.milestone_id || null, starred: editForm.starred, quadrant,
    }).eq('id', editForm.id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Task updated', 'success'); closeEditPanel(); invalidateCache(); await refetchTasks() }
  }

  async function toggleEditStar() {
    if (!editForm) return
    const next = !editForm.starred
    setEditForm(p => ({ ...p, starred: next }))
    setTasks(prev => prev.map(t => t.id === editForm.id ? { ...t, starred: next } : t))
    const { error } = await supabase.from('tasks').update({ starred: next }).eq('id', editForm.id).eq('user_id', user.id)
    if (error) {
      showToast(error.message, 'error')
      setEditForm(p => p ? { ...p, starred: !next } : p)
      setTasks(prev => prev.map(t => t.id === editForm.id ? { ...t, starred: !next } : t))
    }
  }

  async function handleQuickAdd(quadrant) {
    const text = (quickAdd[quadrant] || '').trim()
    if (!text) return
    const ownerName = profileSelfName || people.find(p => p.id === selfPersonId)?.name || ''
    const { error } = await supabase.from('tasks').insert({ user_id: user.id, task: text, quadrant, owner_id: selfPersonId, owner: ownerName, due_date: quadrant === 'Do Now' ? todayStr : null, done: false, starred: false })
    if (error) showToast(error.message, 'error')
    else { setQuickAdd(p => ({ ...p, [quadrant]: '' })); invalidateCache(); await refetchTasks() }
  }

  async function handleLinkMs(taskId, milestoneId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: milestoneId }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Linked', 'success'); setMsPickerTaskId(null); setMsPickerSearch(''); invalidateCache(); await refetchTasks() }
  }

  async function handleUnlinkMs(taskId) {
    const { error } = await supabase.from('tasks').update({ milestone_id: null }).eq('id', taskId).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Unlinked', 'success'); setMsPickerTaskId(null); setMsPickerSearch(''); invalidateCache(); await refetchTasks() }
  }

  async function clearDone() {
    const doneIds = tasks.filter(t => t.done).map(t => t.id)
    if (!doneIds.length) return
    const { error } = await supabase.from('tasks').delete().in('id', doneIds).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { setTasks(prev => prev.filter(t => !t.done)); invalidateCache(); showToast('Done tasks cleared', 'success') }
  }

  function toggleCluster(key) { setCollapsedClusters(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s }) }

  // ── Computed ──
  const activeTasks = liveTasks.filter(t => !t.done)
  const doneTasks = liveTasks.filter(t => t.done)
  const starred = liveTasks.filter(t => t.starred && !t.done)

  // Weekly + Monthly milestones without weekly children are linkable
  const weeklyParentIds = new Set(milestones.filter(m => m.horizon === 'Weekly').map(m => m.parent_milestone_id).filter(Boolean))
  const linkableMilestones = milestones.filter(m => m.horizon === 'Weekly' || (m.horizon === 'Monthly' && !weeklyParentIds.has(m.id)))

  // ── Milestone picker ──
  function renderMsPicker(task) {
    const linked = task.milestone_id ? milestones.find(m => m.id === task.milestone_id) : null
    const available = linkableMilestones.filter(m => m.id !== task.milestone_id)
    const filtered = msPickerSearch ? available.filter(m => m.text.toLowerCase().includes(msPickerSearch.toLowerCase())) : available

    return (
      <div ref={msPickerRef} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: 12, margin: '4px 18px 4px 46px' }}>
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', marginBottom: 8 }}>Link to milestone</div>
        {linked && (
          <div className="flex items-center gap-2" style={{ marginBottom: 8, padding: '4px 8px', background: 'var(--accent-green-light)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
            <Check size={10} color="var(--accent-green)" />
            <span style={{ flex: 1, color: 'var(--accent-green)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linked.text}</span>
            <button onClick={() => handleUnlinkMs(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--accent-green)' }}><X size={12} /></button>
          </div>
        )}
        <input value={msPickerSearch} onChange={e => setMsPickerSearch(e.target.value)} placeholder="Search milestones…" className="w-full outline-none"
          style={{ border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', marginBottom: 4, background: 'var(--content-bg)', color: 'var(--ink)' }} />
        <div style={{ maxHeight: 140, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '11px', color: 'var(--ink-faint)', padding: '6px 0' }}>{msPickerSearch ? 'No matching milestones' : 'No milestones available'}</p>
          ) : filtered.map(m => (
            <div key={m.id} onClick={() => handleLinkMs(task.id, m.id)}
              style={{ padding: '5px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background 100ms' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontSize: '12px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</div>
              {m.aspirations?.text && <div style={{ fontSize: '10px', color: 'var(--ink-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.aspirations.text}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Inline edit panel ──
  function renderEditPanel() {
    if (!editForm) return null
    const selectedMs = editForm.milestone_id ? milestones.find(m => m.id === editForm.milestone_id) : null
    const filteredMs = editMsSearch ? linkableMilestones.filter(m => m.text.toLowerCase().includes(editMsSearch.toLowerCase())) : linkableMilestones
    const labelSt = { fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', marginBottom: 4, display: 'block' }
    const fieldSt = { border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'var(--content-bg-card)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: '13px', outline: 'none', width: '100%' }

    return (
      <div ref={editPanelRef}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveEdit() } }}
        style={{ background: 'var(--content-bg)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-md)', padding: '14px 18px', margin: '0 18px 4px 18px' }}>

        <input value={editForm.task} onChange={e => setEditForm(p => ({ ...p, task: e.target.value }))}
          style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--content-border)', padding: '4px 0 8px', fontSize: '14px', fontFamily: 'var(--font-sans)', color: 'var(--ink)', outline: 'none', background: 'transparent' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '14px 20px', marginTop: 12, alignItems: 'end' }}>
          <div>
            <label style={labelSt}>Due date</label>
            <div className="flex items-center gap-1">
              <input type="date" value={editForm.due_date} onChange={e => setEditForm(p => ({ ...p, due_date: e.target.value }))}
                style={{ ...fieldSt, flex: 1, fontFamily: 'var(--font-mono)' }} />
              {editForm.due_date && <button onClick={() => setEditForm(p => ({ ...p, due_date: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)', flexShrink: 0, display: 'flex' }}><X size={12} /></button>}
            </div>
          </div>

          <div>
            <label style={labelSt}>Owner</label>
            <select value={editForm.owner_id} onChange={e => setEditForm(p => ({ ...p, owner_id: e.target.value }))} style={fieldSt}>
              <option value="">No owner</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelSt}>Priority</label>
            <button onClick={toggleEditStar} style={{
              padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: '12.5px', fontFamily: 'var(--font-sans)', fontWeight: 500, whiteSpace: 'nowrap',
              background: editForm.starred ? 'var(--accent-coral)' : 'transparent',
              color: editForm.starred ? 'white' : 'var(--ink-faint)',
              border: `1px solid ${editForm.starred ? 'var(--accent-coral)' : 'var(--content-border)'}`,
            }}>{editForm.starred ? "★ In today's focus" : "☆ Add to focus"}</button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelSt}>Milestone</label>
          <div className="flex items-center" style={fieldSt}>
            <input
              value={editMsOpen ? editMsSearch : (selectedMs?.text || '')}
              onChange={e => { setEditMsSearch(e.target.value); if (!editMsOpen) setEditMsOpen(true) }}
              onFocus={() => { setEditMsOpen(true); setEditMsSearch('') }}
              onBlur={() => setTimeout(() => setEditMsOpen(false), 150)}
              placeholder="Search milestones…"
              className="flex-1 outline-none"
              style={{ border: 'none', background: 'transparent', fontSize: '13px', color: 'var(--ink)', padding: 0, fontFamily: 'var(--font-sans)' }} />
            {selectedMs && !editMsOpen && <button onClick={() => setEditForm(p => ({ ...p, milestone_id: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: 'var(--ink-faint)', flexShrink: 0, display: 'flex' }}><X size={12} /></button>}
          </div>
          {editMsOpen && (
            <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-sm)', marginTop: 2, maxHeight: 150, overflowY: 'auto' }}>
              <div onMouseDown={() => { setEditForm(p => ({ ...p, milestone_id: '' })); setEditMsSearch(''); setEditMsOpen(false) }}
                style={{ padding: '6px 8px', cursor: 'pointer', fontSize: '13px', color: 'var(--ink-faint)', borderBottom: '1px solid var(--content-border)', transition: 'background 100ms' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>No milestone</div>
              {filteredMs.map(m => (
                <div key={m.id} onMouseDown={() => { setEditForm(p => ({ ...p, milestone_id: m.id })); setEditMsSearch(''); setEditMsOpen(false) }}
                  style={{ padding: '6px 8px', cursor: 'pointer', transition: 'background 100ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: '13px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</div>
                  {m.aspirations?.text && <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.aspirations.text}</div>}
                </div>
              ))}
              {filteredMs.length === 0 && editMsSearch && <p style={{ fontSize: '11px', color: 'var(--ink-faint)', padding: '6px 8px' }}>No milestones found</p>}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end" style={{ marginTop: 14 }}>
          <button onClick={saveEdit}
            style={{ padding: '7px 20px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-coral)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Save</button>
          <button onClick={closeEditPanel}
            style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--ink-soft)', border: '1.5px solid var(--content-border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Cluster card ──
  function renderCluster(cluster) {
    const clusterTasks = activeTasks.filter(t => t.quadrant === cluster.key)
    const isCollapsed = collapsedClusters.has(cluster.key)
    const isProminent = cluster.prominent

    return (
      <div className={isProminent ? 'md:col-span-2' : ''} key={cluster.key}
        style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderLeft: `3px solid ${cluster.color}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...(isProminent ? { borderTop: `2px solid ${cluster.color}` } : {}) }}>
        {/* Header */}
        <div className="flex items-center justify-between"
          style={{ padding: '14px 18px', borderBottom: isCollapsed ? 'none' : '1px solid var(--content-border)', ...(isProminent ? { background: 'rgba(220,38,38,0.04)' } : {}) }}>
          <div className="flex items-center gap-2">
            <span style={{ width: isProminent ? 12 : 10, height: isProminent ? 12 : 10, borderRadius: '50%', background: cluster.color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: isProminent ? '14px' : '13px', fontWeight: 600, color: 'var(--ink)' }}>{cluster.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '1px 8px', borderRadius: 10, background: 'var(--content-bg)', border: '1px solid var(--content-border)', color: 'var(--ink-faint)' }}>{clusterTasks.length}</span>
          </div>
          <button onClick={() => toggleCluster(cluster.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}>
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Body */}
        {!isCollapsed && (
          <div style={{ padding: '8px 0' }}>
            {loading ? (
              <>{[1, 2, 3].map(i => <SkeletonRow key={i} />)}</>
            ) : clusterTasks.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic', padding: '12px 18px' }}>Nothing here</p>
            ) : (
              clusterTasks.map((task, idx) => (
                <div key={task.id} style={idx < clusterTasks.length - 1 ? { borderBottom: '1px solid rgba(232,227,218,0.5)' } : undefined}>
                  {renderTaskRow(task, cluster)}
                  {editForm?.id === task.id && renderEditPanel()}
                  {msPickerTaskId === task.id && renderMsPicker(task)}
                </div>
              ))
            )}
            {/* Quick add */}
            <div style={{ padding: '4px 18px 6px' }}>
              <input value={quickAdd[cluster.key] || ''} onChange={e => setQuickAdd(p => ({ ...p, [cluster.key]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(cluster.key) }}
                placeholder="Add a task…"
                className="w-full outline-none"
                style={{ border: '1px dashed var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'transparent', fontSize: '13px', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Task row ──
  function renderTaskRow(task, cluster) {
    const due = formatDue(task.due_date)
    const isShared = task.user_id && task.user_id !== user.id
    const sharedOwnerName = isShared ? (people.find(p => p.id === task.user_id)?.name || 'another user') : null
    const sharedTooltip = isShared ? `Assigned by ${sharedOwnerName}` : undefined

    return (
      <div className="tw-task-row" style={{ display: 'flex', alignItems: 'center', padding: '9px 18px', gap: 10, transition: 'background 100ms', minHeight: 44, cursor: 'default', borderLeft: isShared ? '3px solid #7b5ea7' : undefined }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

        {/* Checkbox */}
        {isShared ? (
          <div title={sharedTooltip} style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--content-border)', background: 'var(--content-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'not-allowed', opacity: 0.5 }} />
        ) : (
          <button onClick={() => toggleDone(task)}
            style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${task.done ? 'var(--accent-green)' : 'var(--content-border-strong)'}`, background: task.done ? 'var(--accent-green)' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            {task.done && <Check size={10} color="white" strokeWidth={3} />}
          </button>
        )}

        {/* Text — click to edit (disabled for shared) */}
        <span onClick={isShared ? undefined : () => openEditPanel(task)} style={{ flex: 1, fontSize: '13px', fontFamily: 'var(--font-sans)', lineHeight: 1.4, color: task.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.4 : 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor: isShared ? 'default' : 'pointer' }}>
          {task.task}
        </span>

        {/* Shared badge */}
        {isShared && <span title={sharedTooltip} style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 8, background: 'var(--accent-purple-light)', color: '#7b5ea7', flexShrink: 0 }}>shared</span>}

        {/* Due date */}
        {due && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: due.color, fontWeight: due.bold ? 600 : 400, flexShrink: 0 }}>{due.text}</span>}

        {/* Owner badge — only on Delegated/Awaited */}
        {cluster.showOwner && (() => { const n = getOwnerName(task, people); return n ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '2px 8px', borderRadius: 20, background: 'var(--content-bg)', border: '1px solid var(--content-border)', color: 'var(--ink-soft)', flexShrink: 0 }}>{n}</span>
        ) : null })()}

        {/* Milestone link indicator */}
        {task.milestone_id ? (
          <div title="Linked to milestone" onClick={() => { setMsPickerTaskId(msPickerTaskId === task.id ? null : task.id); setMsPickerSearch(''); closeEditPanel() }}
            style={{ width: 14, height: 14, borderRadius: '50%', background: '#2d6a4f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Check size={8} color="white" strokeWidth={3} />
          </div>
        ) : (
          <div title="Not linked to any milestone" onClick={() => { setMsPickerTaskId(msPickerTaskId === task.id ? null : task.id); setMsPickerSearch(''); closeEditPanel() }}
            style={{ width: 14, height: 14, borderRadius: '50%', border: '1px dashed var(--content-border)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
        )}

        {/* Star */}
        <button onClick={() => toggleStar(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex' }}>
          <Star size={16} fill={task.starred ? '#e07a5f' : 'none'} color={task.starred ? '#e07a5f' : 'var(--ink-faint)'} />
        </button>
      </div>
    )
  }

  // ── Main render ──
  return (
    <div className="page-pad" style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Top Priorities ── */}
      <div style={{ background: 'var(--ink)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 28 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '15px', color: 'rgba(255,255,255,0.7)' }}>Today&apos;s Focus</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{starred.length} of 6 priorities</span>
        </div>
        {starred.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '10px 0 4px' }}>Star tasks below to set today&apos;s focus</p>
        ) : (
          <div className="flex gap-2.5 flex-wrap" style={{ marginTop: 12 }}>
            {starred.slice(0, 6).map(t => (
              <div key={t.id} className="flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '6px 14px', transition: 'background 150ms', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}>
                <span style={{ color: '#e07a5f', fontSize: '12px', flexShrink: 0 }}>★</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                  {t.task.length > 28 ? t.task.slice(0, 28) + '…' : t.task}
                </span>
                <button onClick={() => toggleStar(t)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(255,255,255,0.4)', display: 'flex', flexShrink: 0, lineHeight: 1 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section header ── */}
      <div className="flex items-baseline justify-between" style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--ink)' }}>Tasks</h2>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-faint)' }}>{todayLabel}</span>
      </div>

      {/* ── Cluster grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
        {CLUSTERS.map(c => renderCluster(c))}
      </div>

      {/* ── Done section ── */}
      {doneTasks.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
            <button onClick={() => setShowDone(s => !s)} className="flex items-center gap-2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-faint)', padding: 0 }}>
              {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Done ({doneTasks.length})
            </button>
            <button onClick={clearDone}
              style={{ padding: '3px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--content-border)', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}>
              Clear all
            </button>
          </div>
          {showDone && (
            <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {doneTasks.map((task, idx) => (
                <div key={task.id} style={idx < doneTasks.length - 1 ? { borderBottom: '1px solid rgba(232,227,218,0.5)' } : undefined}>
                  {renderTaskRow(task, {})}
                  {editForm?.id === task.id && renderEditPanel()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
