import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, isToday, isThisWeek } from 'date-fns'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'

// ── constants ─────────────────────────────────────────────────────────────────

const TAGS = [
  { key: 'Work',         emoji: '🏢', color: '#52b788',  bg: 'rgba(82,183,136,0.15)'  },
  { key: 'Self',         emoji: '🌱', color: '#e07a5f',  bg: 'rgba(224,122,95,0.15)'  },
  { key: 'Learning',     emoji: '💡', color: '#c9b8e8',  bg: 'rgba(201,184,232,0.15)' },
  { key: 'Relationship', emoji: '💕', color: '#c8982a',  bg: 'rgba(200,152,42,0.15)'  },
]

const FILTERS = ['All', 'Work', 'Self', 'Learning', 'Relationship', 'Today', 'This Week']

// ── helpers ───────────────────────────────────────────────────────────────────

function formatEntryTime(isoStr) {
  try { return format(new Date(isoStr), "EEE MMM d · h:mmaaa") } catch { return isoStr }
}

function matchesFilter(entry, filter) {
  if (filter === 'All') return true
  if (filter === 'Today') return isToday(new Date(entry.created_at))
  if (filter === 'This Week') return isThisWeek(new Date(entry.created_at), { weekStartsOn: 1 })
  return Array.isArray(entry.tags) && entry.tags.includes(filter)
}

// ── EntryRow ──────────────────────────────────────────────────────────────────

function EntryRow({ entry, onDelete, searchQuery }) {
  const entryTags = TAGS.filter(t => Array.isArray(entry.tags) && entry.tags.includes(t.key))

  function highlight(text) {
    if (!searchQuery) return text
    const q   = searchQuery.toLowerCase()
    const idx = text.toLowerCase().indexOf(q)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(200,152,42,0.25)', color: '#c8982a', borderRadius: '2px', padding: '0 1px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div className="group py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: '#52b788' }}>
          {formatEntryTime(entry.created_at)}
        </span>
        <button
          onClick={() => onDelete(entry.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: '15px', padding: '0 4px', lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-coral)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: '14px', lineHeight: 1.85, color: '#f0ebe2', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {highlight(entry.text)}
      </p>
      {entryTags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2.5">
          {entryTags.map(t => (
            <span
              key={t.key}
              style={{ fontSize: '11px', background: t.bg, color: t.color, border: `1px solid ${t.color}33`, padding: '2px 10px', borderRadius: '12px', fontFamily: 'var(--font-sans)' }}
            >
              {t.emoji} {t.key}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ReflectionLogPage() {
  const { user } = useOutletContext()

  const [text,       setText]       = useState('')
  const [activeTags, setActiveTags] = useState([])
  const [saving,     setSaving]     = useState(false)

  const [entries,        setEntries]        = useState([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [entriesError,   setEntriesError]   = useState(null)

  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true); setEntriesError(null)
    const { data, error } = await supabase
      .from('reflections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) setEntriesError(error.message)
    else setEntries(data)
    setEntriesLoading(false)
  }, [user.id])

  useEffect(() => { loadEntries() }, [loadEntries])

  function toggleTag(key) {
    setActiveTags(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key])
  }

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('reflections').insert({ user_id: user.id, text: text.trim(), tags: activeTags })
      if (error) throw error
      showToast('Entry saved', 'success')
      setText(''); setActiveTags([])
      await loadEntries()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('reflections').delete().eq('id', id).eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else setEntries(prev => prev.filter(e => e.id !== id))
  }

  const filtered = entries.filter(e => {
    if (!matchesFilter(e, filter)) return false
    if (search && !e.text.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ background: '#111111', color: '#f0ebe2', minHeight: 'calc(100vh - 52px)' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '40px 28px' }}>

        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: '#f0ebe2', marginBottom: '6px' }}>
            Reflection Log
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(240,235,226,0.4)', fontStyle: 'italic' }}>Private. Honest. Yours.</p>
        </div>

        {/* Entry box */}
        <div style={{ marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '28px' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave() }}
            rows={4}
            placeholder="What's on your mind right now…"
            className="w-full resize-none outline-none"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              color: '#f0ebe2',
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              lineHeight: 1.85,
              paddingBottom: '12px',
              marginBottom: '16px',
            }}
            onFocus={e => (e.target.style.borderBottomColor = 'rgba(255,255,255,0.3)')}
            onBlur={e => (e.target.style.borderBottomColor = 'rgba(255,255,255,0.12)')}
          />

          {/* Tags */}
          <div className="flex gap-2 flex-wrap mb-4">
            {TAGS.map(t => {
              const isActive = activeTags.includes(t.key)
              return (
                <button
                  key={t.key}
                  onClick={() => toggleTag(t.key)}
                  style={{
                    background: isActive ? t.bg : 'transparent',
                    color: isActive ? t.color : 'rgba(240,235,226,0.4)',
                    border: `1.5px solid ${isActive ? t.color + '66' : 'rgba(255,255,255,0.1)'}`,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12.5px',
                    padding: '4px 13px',
                    borderRadius: '20px',
                    userSelect: 'none',
                    transition: 'all 0.13s',
                  }}
                >
                  {t.emoji} {t.key}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !text.trim()}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-sm)',
                background: text.trim() ? 'var(--accent-purple)' : 'rgba(255,255,255,0.06)',
                color: text.trim() ? 'white' : 'rgba(255,255,255,0.25)',
                border: 'none',
                cursor: text.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {saving ? 'Saving…' : 'Save entry →'}
            </button>
            <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)' }}>
              Cmd+Enter
            </span>
          </div>
        </div>

        {/* Feed controls */}
        <div className="flex items-start gap-4 flex-wrap mb-4">
          <div className="flex gap-1.5 flex-wrap flex-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: filter === f ? '#f0ebe2' : 'rgba(240,235,226,0.35)',
                  border: `1.5px solid ${filter === f ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-sm)',
              color: '#f0ebe2',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '5px 12px',
              width: '150px',
            }}
          />
        </div>

        {/* Feed */}
        {entriesLoading && (
          <p style={{ fontSize: '13px', color: 'rgba(240,235,226,0.3)', textAlign: 'center', padding: '40px 0' }}>
            Loading entries…
          </p>
        )}
        {entriesError && (
          <p style={{ fontSize: '13px', color: 'var(--accent-coral)' }}>Error: {entriesError}</p>
        )}
        {!entriesLoading && !entriesError && filtered.length === 0 && (
          <p style={{ fontSize: '14px', color: 'rgba(240,235,226,0.25)', textAlign: 'center', padding: '56px 0', fontStyle: 'italic' }}>
            {entries.length === 0 ? 'No entries yet — write your first reflection above.' : 'No entries match this filter.'}
          </p>
        )}
        {!entriesLoading && !entriesError && filtered.length > 0 && (
          <div>
            {filtered.map(e => (
              <EntryRow key={e.id} entry={e} onDelete={handleDelete} searchQuery={search} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
