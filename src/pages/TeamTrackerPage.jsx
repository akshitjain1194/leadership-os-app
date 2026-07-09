import { useState, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Users, ChevronDown } from 'lucide-react'

function getInitials(name) {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const PALETTE = ['#3F7D9A', '#E07A5F', '#7B5EA7', '#5B8C3A', '#B8860B', '#B23B6B', '#3F8B7C']
function colorForPerson(id) {
  if (!id) return '#9a938a'
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

const HORIZON_STYLE = {
  Monthly:  { bg: 'var(--accent-gold-light)', color: 'var(--accent-gold)', label: 'Monthly' },
  SixMonth: { bg: '#deeaff', color: '#185fa5', label: '6M' },
  Annual:   { bg: 'var(--accent-green-light)', color: 'var(--accent-green)', label: 'Annual' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(s) {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}
function daysFromToday(dueStr) {
  const due = new Date(dueStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((due - today) / 86400000)
}
function isOverdue(dueStr) { return dueStr && daysFromToday(dueStr) < 0 }
function isThisMonth(dueStr) {
  if (!dueStr) return false
  const due = new Date(dueStr + 'T00:00:00')
  const today = new Date()
  return due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth()
}
function matchesFilter(dueStr, filter) {
  if (!dueStr) return filter === 'all'
  const diff = daysFromToday(dueStr)
  if (filter === 'overdue') return diff < 0
  if (filter === 'thismonth') return isThisMonth(dueStr)
  if (filter === 'next3') return diff <= 90
  if (filter === 'next6') return diff <= 180
  return true // all
}

const FILTERS = [
  { key: 'overdue',   label: 'Overdue' },
  { key: 'thismonth', label: 'This Month' },
  { key: 'next3',     label: 'Next 3 Months' },
  { key: 'next6',     label: 'Next 6 Months' },
  { key: 'all',       label: 'All' },
]

function getAncestorChain(milestone, milestoneById) {
  const chain = []
  let m = milestone
  let guard = 0
  while (m && guard < 10) {
    chain.push(m)
    m = m.parent_milestone_id ? milestoneById[m.parent_milestone_id] : null
    guard++
  }
  return chain
}

function findMonthlyAncestor(milestoneId, milestoneById) {
  let m = milestoneById[milestoneId]
  let guard = 0
  while (m && m.horizon !== 'Monthly' && guard < 10) {
    m = m.parent_milestone_id ? milestoneById[m.parent_milestone_id] : null
    guard++
  }
  return m && m.horizon === 'Monthly' ? m : null
}

function SkeletonBlock() {
  return (
    <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 14 }}>
      <div style={{ width: '55%', height: 12, borderRadius: 3, background: '#e8e3da', marginBottom: 8 }} />
      <div style={{ width: '30%', height: 9, borderRadius: 3, background: '#f0ece4' }} />
    </div>
  )
}

export default function TeamTrackerPage() {
  const { user } = useOutletContext()

  const [people, setPeople] = useState([])
  const [aspirations, setAspirations] = useState([])
  const [milestones, setMilestones] = useState([])
  const [tasks, setTasks] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [filter, setFilter] = useState('thismonth')

  useEffect(() => { loadData() }, [user.id])

  async function loadData() {
    setLoading(true)
    const [peopleRes, aspRes, msRes, taskRes, areaRes] = await Promise.all([
      supabase.from('people').select('id, name').order('name'),
      supabase.from('aspirations').select('id, text, area_id').eq('user_id', user.id),
      supabase.from('milestones').select('id, text, aspiration_id, parent_milestone_id, anchor_person_id, due_date, horizon, status').eq('user_id', user.id),
      supabase.from('tasks').select('id, task, owner_id, done, due_date, quadrant, milestone_id').eq('user_id', user.id),
      supabase.from('areas').select('id, name').eq('user_id', user.id),
    ])
    setPeople(peopleRes.data || [])
    setAspirations(aspRes.data || [])
    setMilestones(msRes.data || [])
    setTasks(taskRes.data || [])
    setAreas(areaRes.data || [])
    setLoading(false)
  }

  const sortedPeople = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people])
  const selectedPerson = people.find(p => p.id === selectedPersonId)

  const aspirationById = useMemo(() => { const m = {}; aspirations.forEach(a => { m[a.id] = a }); return m }, [aspirations])
  const areaById = useMemo(() => { const m = {}; areas.forEach(a => { m[a.id] = a }); return m }, [areas])
  const personById = useMemo(() => { const m = {}; people.forEach(p => { m[p.id] = p }); return m }, [people])
  const milestoneById = useMemo(() => { const m = {}; milestones.forEach(ms => { m[ms.id] = ms }); return m }, [milestones])

  const allCards = useMemo(() => {
    if (!selectedPersonId) return null

    const anchoredMonthlies = milestones.filter(m => m.horizon === 'Monthly' && m.anchor_person_id === selectedPersonId)

    const anchoredCards = anchoredMonthlies.map(m => {
      const allTasksHere = tasks.filter(t => t.milestone_id === m.id)
      const ownTasks = allTasksHere.filter(t => t.owner_id === selectedPersonId)
      const otherTasks = allTasksHere.filter(t => t.owner_id && t.owner_id !== selectedPersonId)
      const involvedIds = new Set([selectedPersonId, ...allTasksHere.map(t => t.owner_id).filter(Boolean)])
      const chain = getAncestorChain(m, milestoneById)
      const aspiration = aspirationById[m.aspiration_id]
      return {
        milestone: m,
        due: m.due_date,
        ownDone: ownTasks.filter(t => t.done).length,
        ownTotal: ownTasks.length,
        otherDone: otherTasks.filter(t => t.done).length,
        otherTotal: otherTasks.length,
        involved: Array.from(involvedIds).map(id => personById[id]).filter(Boolean),
        lineage: chain.slice(1),
        aspiration,
        area: aspiration ? areaById[aspiration.area_id] : null,
      }
    })

    const ownedTasks = tasks.filter(t => t.owner_id === selectedPersonId)
    const supportedCards = []
    const unlinkedTasks = []
    ownedTasks.forEach(t => {
      if (!t.milestone_id) { unlinkedTasks.push(t); return }
      const monthlyAncestor = findMonthlyAncestor(t.milestone_id, milestoneById)
      if (!monthlyAncestor || monthlyAncestor.anchor_person_id === selectedPersonId) return
      const chain = getAncestorChain(monthlyAncestor, milestoneById)
      const aspiration = aspirationById[monthlyAncestor.aspiration_id]
      supportedCards.push({
        task: t,
        due: t.due_date,
        monthly: monthlyAncestor,
        lineage: chain,
        aspiration,
        area: aspiration ? areaById[aspiration.area_id] : null,
      })
    })

    anchoredCards.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
    supportedCards.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))

    return { anchoredCards, supportedCards, unlinkedTasks }
  }, [selectedPersonId, milestones, tasks, milestoneById, aspirationById, areaById, personById])

  const filtered = useMemo(() => {
    if (!allCards) return null
    const anchored = allCards.anchoredCards.filter(c => matchesFilter(c.due, filter))
    const supported = allCards.supportedCards.filter(c => matchesFilter(c.due, filter))
    const ownDone = [...anchored.map(c => c.ownDone), ...supported.map(c => (c.task.done ? 1 : 0))].reduce((a, b) => a + b, 0)
    const ownTotal = [...anchored.map(c => c.ownTotal), ...supported.map(() => 1)].reduce((a, b) => a + b, 0)
    const otherDone = anchored.reduce((sum, c) => sum + c.otherDone, 0)
    const otherTotal = anchored.reduce((sum, c) => sum + c.otherTotal, 0)
    return { anchored, supported, ownDone, ownTotal, otherDone, otherTotal }
  }, [allCards, filter])

  function renderInvolvedBubbles(involved) {
    return (
      <div className="flex items-center" style={{ marginBottom: 11 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 8, flexShrink: 0 }}>Involved</span>
        <div className="flex">
          {involved.map((p, i) => (
            <span key={p.id} title={p.name} style={{
              width: 22, height: 22, borderRadius: '50%', color: 'white', fontSize: 8.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              border: '2px solid var(--content-bg-card)', marginLeft: i === 0 ? 0 : -6,
              background: colorForPerson(p.id), cursor: 'default',
            }}>{getInitials(p.name)}</span>
          ))}
        </div>
      </div>
    )
  }

  function renderLineageRow(m, key) {
    const style = HORIZON_STYLE[m.horizon]
    if (!style) return null
    const anchor = m.anchor_person_id ? personById[m.anchor_person_id] : null
    const overdue = isOverdue(m.due_date)
    return (
      <div key={key} className="flex items-center" style={{ gap: 7, fontSize: 11, color: '#555', padding: key !== 0 ? '6px 0 0' : 0, marginTop: key !== 0 ? 6 : 0, borderTop: key !== 0 ? '1px dashed var(--content-border)' : 'none' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 600, padding: '2px 0', borderRadius: 5, width: 46, textAlign: 'center', flexShrink: 0, background: style.bg, color: style.color }}>{style.label}</span>
        <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{m.text}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', color: overdue ? '#B23B3B' : style.color }}>{fmtDate(m.due_date) || 'no date'}</span>
        {anchor && <span title={anchor.name} style={{ width: 14, height: 14, borderRadius: '50%', background: colorForPerson(anchor.id), color: 'white', fontSize: 6.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{getInitials(anchor.name)}</span>}
      </div>
    )
  }

  function renderAnchoredCard(c) {
    const overdue = isOverdue(c.due)
    return (
      <div key={c.milestone.id} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 14, padding: '15px 17px', breakInside: 'avoid', marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 9 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 8, background: 'var(--accent-teal-light, #E3F2EE)', color: 'var(--accent-teal, #3F8B7C)', fontWeight: 600, flexShrink: 0 }}>{c.area?.name || 'No area'}</span>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap', background: c.ownTotal > 0 ? 'var(--accent-green-light)' : 'var(--content-bg)', color: c.ownTotal > 0 ? 'var(--accent-green)' : 'var(--ink-faint)', border: c.ownTotal > 0 ? 'none' : '1px solid var(--content-border)' }}>{c.ownDone}/{c.ownTotal} done</span>
        </div>
        <div className="flex items-start justify-between" style={{ gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word', flex: 1, minWidth: 0 }}>{c.milestone.text}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: overdue ? '#B23B3B' : 'var(--accent-gold)', flexShrink: 0, whiteSpace: 'nowrap', paddingTop: 1 }}>{fmtDate(c.due) || 'no date'}</div>
        </div>
        {renderInvolvedBubbles(c.involved)}
        {c.lineage.length > 0 && (
          <div style={{ background: 'var(--content-bg)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            {c.lineage.map((m, i) => renderLineageRow(m, i))}
          </div>
        )}
        {c.aspiration && <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontStyle: 'italic', wordBreak: 'break-word', lineHeight: 1.4 }}>{c.aspiration.text}</div>}
      </div>
    )
  }

  function renderSupportedCard(c) {
    const overdue = isOverdue(c.due)
    return (
      <div key={c.task.id} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 14, padding: '15px 17px', breakInside: 'avoid', marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 9 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 8, background: 'var(--accent-teal-light, #E3F2EE)', color: 'var(--accent-teal, #3F8B7C)', fontWeight: 600, flexShrink: 0 }}>{c.area?.name || 'No area'}</span>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap', background: c.task.done ? 'var(--accent-green-light)' : (overdue ? '#FBEAE4' : 'var(--content-bg)'), color: c.task.done ? 'var(--accent-green)' : (overdue ? '#B23B3B' : 'var(--ink-faint)'), border: c.task.done || overdue ? 'none' : '1px solid var(--content-border)' }}>
            {c.task.done ? 'Done' : `Due ${fmtDate(c.due) || 'no date'}`}
          </span>
        </div>
        <div className="flex items-start" style={{ gap: 8, marginBottom: 10 }}>
          <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 1, border: c.task.done ? 'none' : '1.5px solid var(--content-border)', background: c.task.done ? 'var(--accent-green)' : 'transparent' }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word', flex: 1, minWidth: 0, color: c.task.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: c.task.done ? 'line-through' : 'none' }}>{c.task.task}</div>
        </div>
        <div style={{ background: 'var(--content-bg)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          {c.lineage.map((m, i) => renderLineageRow(m, i))}
        </div>
        {c.aspiration && <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontStyle: 'italic', wordBreak: 'break-word', lineHeight: 1.4 }}>{c.aspiration.text}</div>}
      </div>
    )
  }

  return (
    <div className="page-pad flex flex-col gap-5">
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)', marginBottom: 4 }}>Team Tracker</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>See what one person is actually working on — and everything they need to ensure happens.</p>
      </div>

      <div style={{ position: 'relative', maxWidth: 320 }}>
        <div className="flex items-center gap-2" style={{ background: 'var(--content-bg-card)', border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
          {selectedPerson && (
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: colorForPerson(selectedPerson.id), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
              {getInitials(selectedPerson.name)}
            </div>
          )}
          <select value={selectedPersonId} onChange={e => setSelectedPersonId(e.target.value)} className="flex-1 outline-none"
            style={{ border: 'none', background: 'transparent', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, appearance: 'none', cursor: 'pointer' }}>
            <option value="">Select team member</option>
            {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        </div>
      </div>

      {loading && <><SkeletonBlock /><SkeletonBlock /></>}

      {!loading && !selectedPersonId && (
        <div className="flex flex-col items-center gap-3 py-16 px-6 text-center" style={{ borderRadius: 'var(--radius-lg)', background: 'var(--content-bg-card)', border: '1.5px dashed var(--content-border-strong)' }}>
          <Users size={36} style={{ color: 'var(--ink-faint)', opacity: 0.5 }} />
          <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Select a team member above to see what they're working on.</p>
        </div>
      )}

      {!loading && selectedPersonId && filtered && (
        <>
          <div className="flex" style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 14, padding: '16px 0' }}>
            {[
              { num: filtered.anchored.length, color: 'var(--accent-gold)', label: 'Monthly Milestones Anchored' },
              { num: filtered.supported.length, color: 'var(--accent-coral)', label: 'Monthly Milestones Supported' },
              { num: `${filtered.ownDone} / ${filtered.ownTotal}`, color: 'var(--accent-green)', label: 'His Own Tasks Done (Anchored + Supported)' },
              { num: `${filtered.otherDone} / ${filtered.otherTotal}`, color: '#3F7D9A', label: "Others' Tasks Under His Anchored Milestones" },
            ].map((s, i) => (
              <div key={i} className="flex-1 text-center" style={{ padding: '0 12px', borderLeft: i > 0 ? '1px solid var(--content-border)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1, marginBottom: 4, color: s.color }}>{s.num}</div>
                <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: 1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '6px 14px', borderRadius: 20, fontWeight: 500, cursor: 'pointer',
                  border: `1.5px solid ${filter === f.key ? (f.key === 'overdue' ? '#B23B3B' : 'var(--ink)') : 'var(--content-border)'}`,
                  background: filter === f.key ? (f.key === 'overdue' ? '#B23B3B' : 'var(--ink)') : 'var(--content-bg-card)',
                  color: filter === f.key ? 'white' : 'var(--ink-faint)',
                }}>{f.label}</button>
            ))}
          </div>

          <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, margin: '8px 0 5px' }}>Monthly Milestones Anchored by {selectedPerson?.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 16, maxWidth: 620, lineHeight: 1.5 }}>Every monthly milestone owned by {selectedPerson?.name}, with its lineage up to Annual — and the aspiration each one belongs to.</p>
            {filtered.anchored.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', fontStyle: 'italic', padding: '8px 0 20px' }}>No anchored monthly milestones in this window.</p>
            ) : (
              <div style={{ columnCount: 2, columnGap: 14 }}>{filtered.anchored.map(renderAnchoredCard)}</div>
            )}
          </div>

          <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, margin: '8px 0 5px' }}>Monthly Milestones Supported by {selectedPerson?.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 16, maxWidth: 620, lineHeight: 1.5 }}>Every monthly milestone anchored by someone else in the team, but where {selectedPerson?.name} is supporting through a task.</p>
            {filtered.supported.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', fontStyle: 'italic', padding: '8px 0 20px' }}>No supported monthly milestones in this window.</p>
            ) : (
              <div style={{ columnCount: 2, columnGap: 14 }}>{filtered.supported.map(renderSupportedCard)}</div>
            )}
          </div>

          {allCards.unlinkedTasks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Not linked to any milestone ({allCards.unlinkedTasks.length})
              </div>
              <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {allCards.unlinkedTasks.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2" style={{ padding: '9px 14px', borderBottom: i < allCards.unlinkedTasks.length - 1 ? '1px solid var(--content-border)' : 'none' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: t.done ? 'none' : '1.5px solid var(--content-border)', background: t.done ? 'var(--accent-green)' : 'transparent' }} />
                    <span style={{ fontSize: 13, flex: 1, color: t.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
