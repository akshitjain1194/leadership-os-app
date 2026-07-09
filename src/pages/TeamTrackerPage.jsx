import { useState, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Users, ChevronDown } from 'lucide-react'

function getInitials(name) {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const QUAD_BADGE = {
  'Do Now':    { bg: 'var(--accent-coral-light)', color: 'var(--accent-coral)' },
  'Do Soon':   { bg: 'var(--accent-gold-light)',  color: 'var(--accent-gold)' },
  Schedule:    { bg: 'var(--accent-green-light)',  color: 'var(--accent-green)' },
  Delegated:   { bg: 'var(--accent-purple-light)', color: 'var(--accent-purple)' },
  Awaited:     { bg: '#deeaff', color: '#185fa5' },
}

const HORIZON_BADGE = {
  Annual:   { bg: 'var(--accent-green-light)', color: 'var(--accent-green)' },
  SixMonth: { bg: '#deeaff', color: '#185fa5' },
  Monthly:  { bg: 'var(--accent-gold-light)', color: 'var(--accent-gold)' },
  Weekly:   { bg: 'var(--accent-coral-light)', color: 'var(--accent-coral)' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(s) {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function SkeletonRow() {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--content-border)' }}>
      <div style={{ width: '55%', height: 12, borderRadius: 3, background: '#e8e3da', marginBottom: 6 }} />
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

  useEffect(() => { loadData() }, [user.id])

  async function loadData() {
    setLoading(true)
    const [peopleRes, aspRes, msRes, taskRes, areaRes] = await Promise.all([
      supabase.from('people').select('id, name').order('name'),
      supabase.from('aspirations').select('id, text, area_id').eq('user_id', user.id),
      supabase.from('milestones').select('id, text, aspiration_id, anchor_person_id, due_date, horizon, status').eq('user_id', user.id),
      supabase.from('tasks').select('id, task, owner_id, done, due_date, quadrant, milestone_id, starred').eq('user_id', user.id),
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

  const aspirationById = useMemo(() => {
    const m = {}
    aspirations.forEach(a => { m[a.id] = a })
    return m
  }, [aspirations])

  const areaById = useMemo(() => {
    const m = {}
    areas.forEach(a => { m[a.id] = a })
    return m
  }, [areas])

  const personById = useMemo(() => {
    const m = {}
    people.forEach(p => { m[p.id] = p })
    return m
  }, [people])

  const view = useMemo(() => {
    if (!selectedPersonId) return null

    const anchoredIds = new Set(milestones.filter(m => m.anchor_person_id === selectedPersonId).map(m => m.id))
    const ownedTasks = tasks.filter(t => t.owner_id === selectedPersonId)
    const taskLinkedIds = new Set(ownedTasks.filter(t => t.milestone_id).map(t => t.milestone_id))
    const relevantIds = new Set([...anchoredIds, ...taskLinkedIds])
    const relevantMilestones = milestones.filter(m => relevantIds.has(m.id))

    const unlinkedTasks = ownedTasks
      .filter(t => !t.milestone_id)
      .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1) || (a.due_date || '9999').localeCompare(b.due_date || '9999'))

    const byAspiration = new Map()
    relevantMilestones.forEach(m => {
      if (!m.aspiration_id) return
      const asp = aspirationById[m.aspiration_id]
      if (!asp) return
      const tasksForThis = ownedTasks
        .filter(t => t.milestone_id === m.id)
        .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1))
      const entry = byAspiration.get(asp.id) || { aspiration: asp, milestones: [] }
      entry.milestones.push({ milestone: m, tasks: tasksForThis })
      byAspiration.set(asp.id, entry)
    })

    const aspirationGroups = Array.from(byAspiration.values())
      .map(g => ({ ...g, milestones: g.milestones.sort((a, b) => (a.milestone.due_date || '9999').localeCompare(b.milestone.due_date || '9999')) }))
      .sort((a, b) => a.aspiration.text.localeCompare(b.aspiration.text))

    return {
      aspirationGroups,
      unlinkedTasks,
      aspirationCount: aspirationGroups.length,
      milestoneCount: relevantMilestones.length,
      taskCount: ownedTasks.length,
    }
  }, [selectedPersonId, milestones, tasks, aspirationById])

  return (
    <div className="page-pad flex flex-col gap-7">
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>Team Tracker</h1>
        <p style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>See what one person is actually working on — aspiration through to task.</p>
      </div>

      <div style={{ position: 'relative', maxWidth: 320 }}>
        <div className="flex items-center gap-2" style={{
          background: 'var(--content-bg-card)', border: '1.5px solid var(--content-border)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px',
        }}>
          {selectedPerson && (
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-coral)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>
              {getInitials(selectedPerson.name)}
            </div>
          )}
          <select
            value={selectedPersonId}
            onChange={e => setSelectedPersonId(e.target.value)}
            className="flex-1 outline-none"
            style={{ border: 'none', background: 'transparent', color: 'var(--ink)', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, appearance: 'none', cursor: 'pointer' }}
          >
            <option value="">Select team member</option>
            {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        </div>
      </div>

      {loading && (
        <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
        </div>
      )}

      {!loading && !selectedPersonId && (
        <div className="flex flex-col items-center gap-3 py-16 px-6 text-center" style={{ borderRadius: 'var(--radius-lg)', background: 'var(--content-bg-card)', border: '1.5px dashed var(--content-border-strong)' }}>
          <Users size={36} style={{ color: 'var(--ink-faint)', opacity: 0.5 }} />
          <p style={{ fontSize: '14px', color: 'var(--ink-soft)' }}>Select a team member above to see what they're working on.</p>
        </div>
      )}

      {!loading && selectedPersonId && view && (
        <>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '3px 10px', borderRadius: 20, background: 'var(--accent-coral-light)', color: 'var(--accent-coral)' }}>
              {view.aspirationCount} aspiration{view.aspirationCount !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '3px 10px', borderRadius: 20, background: 'var(--accent-green-light)', color: 'var(--accent-green)' }}>
              {view.milestoneCount} milestone{view.milestoneCount !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '3px 10px', borderRadius: 20, background: 'var(--accent-gold-light)', color: 'var(--accent-gold)' }}>
              {view.taskCount} task{view.taskCount !== 1 ? 's' : ''}
            </span>
          </div>

          {view.aspirationGroups.length === 0 ? (
            <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>No aspirations, milestones, or linked tasks for {selectedPerson?.name} yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {view.aspirationGroups.map(({ aspiration, milestones: msGroup }) => (
                <div key={aspiration.id} style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-coral)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{aspiration.text}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginBottom: 12, marginLeft: 16 }}>{areaById[aspiration.area_id]?.name || 'No area'}</div>

                  <div style={{ borderLeft: '2px dashed var(--content-border)', marginLeft: 4, paddingLeft: 18 }}>
                    {msGroup.map(({ milestone: m, tasks: msTasks }, mi) => {
                      const hb = HORIZON_BADGE[m.horizon]
                      const anchorPerson = m.anchor_person_id ? personById[m.anchor_person_id] : null
                      const anchoredToOther = anchorPerson && anchorPerson.id !== selectedPersonId
                      return (
                        <div key={m.id} style={{ marginBottom: mi < msGroup.length - 1 ? 16 : 0 }}>
                          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                            {hb && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 8, background: hb.bg, color: hb.color, fontWeight: 600 }}>{m.horizon}</span>}
                            <span style={{ fontSize: '13px', fontWeight: 500, color: m.status === 'Done' ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: m.status === 'Done' ? 'line-through' : 'none' }}>{m.text}</span>
                            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: m.status === 'Done' ? 'var(--accent-green)' : 'var(--ink-faint)', marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {m.status === 'Done' ? 'Done' : (fmtDate(m.due_date) || 'no date')}
                            </span>
                          </div>
                          {anchoredToOther && (
                            <div style={{ fontSize: '10.5px', color: '#7b5ea7', marginBottom: 6, fontStyle: 'italic' }}>
                              Anchored by {anchorPerson.name}
                            </div>
                          )}
                          {msTasks.length > 0 ? (
                            <div style={{ borderLeft: '2px solid var(--accent-green-light)', marginLeft: 2, paddingLeft: 10 }}>
                              {msTasks.map(t => {
                                const qb = QUAD_BADGE[t.quadrant]
                                return (
                                  <div key={t.id} className="flex items-center gap-2" style={{ padding: '4px 0' }}>
                                    <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: t.done ? 'none' : '1.5px solid var(--content-border)', background: t.done ? 'var(--accent-green)' : 'transparent' }} />
                                    <span style={{ fontSize: '12.5px', flex: 1, color: t.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task}</span>
                                    {t.done ? (
                                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', flexShrink: 0 }}>Done</span>
                                    ) : qb ? (
                                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 8, background: qb.bg, color: qb.color, flexShrink: 0 }}>{t.quadrant}</span>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontStyle: 'italic', marginLeft: 12 }}>No tasks logged yet</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Not linked to a milestone ({view.unlinkedTasks.length})
            </div>
            <div style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {view.unlinkedTasks.length === 0 ? (
                <p style={{ padding: '14px', fontSize: '13px', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Every task for {selectedPerson?.name} is linked to a milestone.</p>
              ) : view.unlinkedTasks.map((t, i) => {
                const qb = QUAD_BADGE[t.quadrant]
                return (
                  <div key={t.id} className="flex items-center gap-2" style={{ padding: '9px 14px', borderBottom: i < view.unlinkedTasks.length - 1 ? '1px solid var(--content-border)' : 'none' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: t.done ? 'none' : '1.5px solid var(--content-border)', background: t.done ? 'var(--accent-green)' : 'transparent' }} />
                    <span style={{ fontSize: '13px', flex: 1, color: t.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task}</span>
                    {t.done ? (
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', flexShrink: 0 }}>Done</span>
                    ) : qb ? (
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 8, background: qb.bg, color: qb.color, flexShrink: 0 }}>{t.quadrant}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
