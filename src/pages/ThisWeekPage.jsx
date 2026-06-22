/*
 * Supabase migration — run once in the SQL Editor:
 *
 * alter table tasks add column if not exists starred boolean not null default false;
 */

import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format } from 'date-fns'
import { Star, Check, Link, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import LoadingSpinner from '../components/LoadingSpinner'

// ── constants ─────────────────────────────────────────────────────────────────

const QUADRANTS = [
  { key: 'Do Now',    label: 'Do Now',    desc: 'Due today or overdue',        borderColor: 'var(--accent-coral)',  bgLight: 'var(--accent-coral-light)'  },
  { key: 'Do Soon',  label: 'Do Soon',   desc: 'Due within 3 days',           borderColor: 'var(--accent-gold)',   bgLight: 'var(--accent-gold-light)'   },
  { key: 'Schedule', label: 'Schedule',  desc: 'Due in 4+ days or flexible',  borderColor: 'var(--accent-green)',  bgLight: 'var(--accent-green-light)'  },
  { key: 'Delegated',label: 'Delegated', desc: 'Owned by your team',          borderColor: 'var(--accent-purple)', bgLight: 'var(--accent-purple-light)' },
  { key: 'Awaited',  label: 'Awaited',   desc: 'Waiting on someone',          borderColor: 'var(--ink-faint)',     bgLight: 'rgba(152,152,184,0.12)'     },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDue(dateStr) {
  if (!dateStr) return null
  try { return format(new Date(dateStr + 'T00:00:00'), 'MMM d') } catch { return dateStr }
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, onToggleDone, onToggleStar, borderColor }) {
  const [busy, setBusy] = useState(false)

  async function handleDone() {
    setBusy(true); await onToggleDone(task); setBusy(false)
  }

  const dueLabel  = formatDue(task.due_date)
  const today     = format(new Date(), 'yyyy-MM-dd')
  const isOverdue = task.due_date && task.due_date < today && !task.done

  return (
    <div
      className="flex items-start gap-2.5"
      style={{
        background: 'var(--content-bg-card)',
        border: '1px solid var(--content-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '9px 10px',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={handleDone}
        disabled={busy}
        className="flex-shrink-0 flex items-center justify-center"
        style={{ marginTop: '2px', width: '15px', height: '15px', borderRadius: '4px', border: `2px solid ${task.done ? borderColor : 'var(--content-border-strong)'}`, background: task.done ? borderColor : 'transparent', cursor: 'pointer', flexShrink: 0 }}
      >
        {task.done && <Check size={8} color="white" strokeWidth={3} />}
      </button>

      {/* Text + meta */}
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: '13px', color: task.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {task.task}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {task.owner && (
            <span style={{ fontSize: '10.5px', background: 'var(--content-bg)', color: 'var(--ink-soft)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              {task.owner}
            </span>
          )}
          {dueLabel && (
            <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: isOverdue ? 'var(--accent-coral)' : 'var(--ink-faint)' }}>
              {dueLabel}{isOverdue ? ' · overdue' : ''}
            </span>
          )}
          {task.milestone_id && <Link size={9} color="var(--accent-green)" />}
        </div>
      </div>

      {/* Star */}
      <button
        onClick={() => onToggleStar(task)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
      >
        <Star
          size={12}
          fill={task.starred ? 'var(--accent-gold)' : 'none'}
          color={task.starred ? 'var(--accent-gold)' : 'var(--content-border-strong)'}
          strokeWidth={2}
        />
      </button>
    </div>
  )
}

// ── QuadrantColumn ────────────────────────────────────────────────────────────

function QuadrantColumn({ quadrant, tasks, onToggleDone, onToggleStar }) {
  const visible  = tasks.slice(0, 15)
  const overflow = tasks.length - 15

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: '260px',
        background: 'var(--content-bg-card)',
        border: '1px solid var(--content-border)',
        borderLeft: `3px solid ${quadrant.borderColor}`,
        borderRadius: 'var(--radius-lg)',
        maxHeight: 'calc(100vh - 240px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--content-border)', flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink)', fontWeight: 600 }}>
            {quadrant.label}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>{quadrant.desc}</p>
        </div>
        <span
          style={{ width: '24px', height: '24px', borderRadius: '50%', background: quadrant.bgLight, color: quadrant.borderColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5" style={{ padding: '10px', scrollbarWidth: 'none' }}>
        {visible.length === 0 && (
          <p style={{ fontSize: '12px', color: 'var(--ink-faint)', textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>Nothing here</p>
        )}
        {visible.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            borderColor={quadrant.borderColor}
            onToggleDone={onToggleDone}
            onToggleStar={onToggleStar}
          />
        ))}
        {overflow > 0 && (
          <p style={{ fontSize: '10.5px', color: 'var(--ink-faint)', textAlign: 'center', padding: '8px 0', fontFamily: 'var(--font-mono)' }}>
            +{overflow} more
          </p>
        )}
      </div>
    </div>
  )
}

// ── StarredStrip ──────────────────────────────────────────────────────────────

function StarredStrip({ tasks }) {
  const starred = tasks.filter(t => t.starred && !t.done).slice(0, 6)
  if (!starred.length) return null

  return (
    <div className="mb-5 rounded-xl p-4" style={{ background: 'var(--ink)', color: 'white' }}>
      <p style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '1.2px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
        Top priorities
      </p>
      <div className="flex gap-2 flex-wrap">
        {starred.map(t => (
          <div
            key={t.id}
            className="flex items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius-md)', padding: '6px 12px', fontSize: '12.5px', maxWidth: '260px' }}
          >
            <Star size={11} fill="var(--accent-gold)" color="var(--accent-gold)" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── DoneSection ───────────────────────────────────────────────────────────────

function DoneSection({ tasks, onClearDone, onToggleDone }) {
  const done      = tasks.filter(t => t.done)
  const [show, setShow] = useState(false)

  if (!done.length) return null

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setShow(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Check size={14} color="var(--accent-green)" />
          Done ({done.length}) {show ? '▲' : '▼'}
        </button>
        <button
          onClick={onClearDone}
          style={{ padding: '3px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--content-border)', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}
        >
          Clear all
        </button>
      </div>
      {show && (
        <div className="flex flex-col gap-1.5" style={{ background: 'var(--content-bg-card)', border: '1px solid var(--content-border)', borderRadius: 'var(--radius-lg)', padding: '12px', opacity: 0.6 }}>
          {done.map(t => (
            <TaskCard key={t.id} task={t} borderColor="var(--accent-green)" onToggleDone={onToggleDone} onToggleStar={() => {}} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ThisWeekPage() {
  const { user } = useOutletContext()
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const loadTasks = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) setError(error.message)
    else setTasks(data)
    setLoading(false)
  }, [user.id])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function onToggleDone(task) {
    const newDone = !task.done
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: newDone } : t))
    const { error } = await supabase.from('tasks').update({ done: newDone }).eq('id', task.id).eq('user_id', user.id)
    if (error) {
      showToast(error.message, 'error')
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !newDone } : t))
    }
  }

  async function onToggleStar(task) {
    const newStarred = !task.starred
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, starred: newStarred } : t))
    const { error } = await supabase.from('tasks').update({ starred: newStarred }).eq('id', task.id).eq('user_id', user.id)
    if (error) {
      showToast(error.message, 'error')
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, starred: !newStarred } : t))
    }
  }

  async function onClearDone() {
    const doneIds = tasks.filter(t => t.done).map(t => t.id)
    if (!doneIds.length) return
    const { error } = await supabase.from('tasks').delete().in('id', doneIds).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else { setTasks(prev => prev.filter(t => !t.done)); showToast('Done tasks cleared', 'success') }
  }

  if (loading) return <LoadingSpinner message="Loading your week…" />
  if (error) return (
    <div className="m-6 p-4 flex items-center gap-3" style={{ background: 'var(--accent-coral-light)', color: 'var(--accent-coral)', borderRadius: 'var(--radius-md)' }}>
      <AlertCircle size={18} /> <span style={{ fontSize: '14px' }}>{error}</span>
    </div>
  )

  const activeTasks = tasks.filter(t => !t.done)

  return (
    <div className="page-pad">
      {/* Header */}
      <div className="mb-5">
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>
          This Week
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>
          {activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''} across all quadrants
        </p>
      </div>

      {/* Starred strip */}
      <StarredStrip tasks={tasks} />

      {/* Quadrant board — horizontal scroll */}
      <div style={{ overflowX: 'auto', marginLeft: '-40px', marginRight: '-40px', paddingLeft: '40px', paddingRight: '40px', paddingBottom: '8px' }}>
        <div className="flex gap-4" style={{ width: 'max-content' }}>
          {QUADRANTS.map(q => (
            <QuadrantColumn
              key={q.key}
              quadrant={q}
              tasks={activeTasks.filter(t => t.quadrant === q.key)}
              onToggleDone={onToggleDone}
              onToggleStar={onToggleStar}
            />
          ))}
        </div>
      </div>

      {/* Done section */}
      <DoneSection tasks={tasks} onClearDone={onClearDone} onToggleDone={onToggleDone} />
    </div>
  )
}
