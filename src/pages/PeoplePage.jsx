import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Users } from 'lucide-react'

const ROLE_STYLES = {
  Lead:          { bg: '#d8f3dc', color: '#2d6a4f' },
  Support:       { bg: '#dbeafe', color: '#1e40af' },
  Champion:      { bg: '#fdf3dc', color: '#c8982a' },
  Participation: { bg: '#ede8f5', color: '#7b5ea7' },
}

const SEED_NAMES = [
  'Akshit Jain', 'Sabita Digal', 'Varun P', 'Varun S',
  'Anagha', 'Rajesh', 'Sanjay',
]

function getInitials(name) {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function RoleBadge({ role }) {
  const style = ROLE_STYLES[role] || { bg: '#eee', color: '#666' }
  return (
    <span style={{
      fontSize: '11px', fontWeight: 500, padding: '2px 10px',
      borderRadius: '10px', background: style.bg, color: style.color,
      fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--content-bg-card)', border: '1px solid var(--content-border)',
      borderRadius: 'var(--radius-lg)', padding: '18px 20px',
    }}>
      <div className="flex items-center gap-3">
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e8e3da' }} />
        <div className="flex flex-col gap-2" style={{ flex: 1 }}>
          <div style={{ width: '45%', height: 14, borderRadius: 4, background: '#e8e3da' }} />
          <div style={{ width: '30%', height: 10, borderRadius: 4, background: '#f0ece4' }} />
        </div>
      </div>
    </div>
  )
}

function PersonCard({ person, roster, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const aspirations = roster.filter(r => r.person_name === person.name)

  const roleCounts = {}
  aspirations.forEach(a => { roleCounts[a.role] = (roleCounts[a.role] || 0) + 1 })

  const profileParts = Object.entries(roleCounts).map(([role, count]) => `${count} ${role}`)

  return (
    <div style={{
      background: 'var(--content-bg-card)', border: '1px solid var(--content-border)',
      borderRadius: 'var(--radius-lg)', padding: '18px 20px',
      transition: 'box-shadow 150ms ease',
    }}>
      <div className="flex items-center gap-3">
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-coral)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-sans)', flexShrink: 0,
        }}>
          {getInitials(person.name)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{person.name}</div>
          {profileParts.length > 0 ? (
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {profileParts.join(' · ')}
            </div>
          ) : (
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontStyle: 'italic', marginTop: '2px' }}>
              No aspirations assigned
            </div>
          )}
        </div>

        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <button
            onClick={() => onEdit(person)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: 'var(--ink-faint)', borderRadius: 'var(--radius-sm)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-faint)')}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(person)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: 'var(--ink-faint)', borderRadius: 'var(--radius-sm)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-faint)')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {aspirations.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', marginTop: '12px',
              fontSize: '11.5px', color: 'var(--accent-coral)', fontFamily: 'var(--font-sans)',
              fontWeight: 500, padding: 0,
            }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {aspirations.length} aspiration{aspirations.length !== 1 ? 's' : ''}
          </button>

          {expanded && (
            <div className="flex flex-col gap-2" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--content-border)' }}>
              {aspirations.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.aspiration_name}
                  </span>
                  <RoleBadge role={a.role} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function PeoplePage() {
  const { user } = useOutletContext()
  const [people, setPeople] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingPerson, setEditingPerson] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => { loadData() }, [user.id])

  async function loadData() {
    setLoading(true)
    const [peopleRes, rosterRes] = await Promise.all([
      supabase.from('people').select('*').eq('user_id', user.id).order('name'),
      supabase.from('aspiration_roster').select('*').eq('user_id', user.id),
    ])
    if (peopleRes.error) showToast(peopleRes.error.message, 'error')
    else setPeople(peopleRes.data)
    if (!rosterRes.error) setRoster(rosterRes.data)
    setLoading(false)
  }

  async function handleAdd() {
    if (!formName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('people').insert({ user_id: user.id, name: formName.trim() })
    if (error) showToast(error.message, 'error')
    else {
      showToast(`Added ${formName.trim()}`, 'success')
      setFormName('')
      setShowAdd(false)
      await loadData()
    }
    setSaving(false)
  }

  async function handleEdit(person) {
    setEditingPerson(person)
    setFormName(person.name)
    setShowAdd(false)
  }

  async function handleSaveEdit() {
    if (!formName.trim() || !editingPerson) return
    setSaving(true)
    const { error } = await supabase
      .from('people')
      .update({ name: formName.trim() })
      .eq('id', editingPerson.id)
      .eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Updated', 'success')
      setEditingPerson(null)
      setFormName('')
      await loadData()
    }
    setSaving(false)
  }

  async function handleDelete(person) {
    const { error } = await supabase
      .from('people')
      .delete()
      .eq('id', person.id)
      .eq('user_id', user.id)
    if (error) showToast(error.message, 'error')
    else {
      showToast(`Removed ${person.name}`, 'success')
      await loadData()
    }
  }

  async function handleSeed() {
    setSeeding(true)
    const rows = SEED_NAMES.map(name => ({ user_id: user.id, name }))
    const { error } = await supabase.from('people').insert(rows)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Team seeded!', 'success')
      await loadData()
    }
    setSeeding(false)
  }

  function cancelForm() {
    setShowAdd(false)
    setEditingPerson(null)
    setFormName('')
  }

  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name))
  const isFormOpen = showAdd || editingPerson

  return (
    <div className="page-pad flex flex-col gap-7">
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', color: 'var(--ink)', marginBottom: '4px' }}>
          People
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>
          Your team roster.&nbsp;
          <span style={{ color: 'var(--accent-coral)', fontWeight: 500 }}>{people.length} member{people.length !== 1 ? 's' : ''}</span>
        </p>
      </div>

      {/* Add / Edit form */}
      {isFormOpen && (
        <div style={{
          background: 'var(--content-bg-card)', border: '1px solid var(--content-border)',
          borderRadius: 'var(--radius-lg)', padding: '16px 20px',
        }}>
          <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {editingPerson ? 'Edit person' : 'Add person'}
          </div>
          <div className="flex gap-3 items-center">
            <input
              autoFocus
              value={formName}
              onChange={e => setFormName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') editingPerson ? handleSaveEdit() : handleAdd() }}
              placeholder="Full name"
              className="flex-1 outline-none"
              style={{
                border: '1.5px solid var(--content-border)', borderRadius: 'var(--radius-sm)',
                padding: '8px 12px', background: 'var(--content-bg)', color: 'var(--ink)',
                fontFamily: 'var(--font-sans)', fontSize: '14px',
              }}
            />
            <button
              onClick={editingPerson ? handleSaveEdit : handleAdd}
              disabled={saving || !formName.trim()}
              style={{
                padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                background: formName.trim() ? 'var(--accent-coral)' : 'var(--content-border)',
                color: formName.trim() ? 'white' : 'var(--ink-faint)',
                border: 'none', cursor: formName.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
              }}
            >
              {saving ? 'Saving…' : editingPerson ? 'Update' : 'Add'}
            </button>
            <button
              onClick={cancelForm}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                background: 'transparent', color: 'var(--ink-soft)',
                border: '1.5px solid var(--content-border)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!isFormOpen && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowAdd(true); setEditingPerson(null); setFormName('') }}
            className="flex items-center gap-1"
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-coral)', color: 'white',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
            }}
          >
            <Plus size={14} /> Add person
          </button>
        </div>
      )}

      {/* Skeleton loading */}
      {loading && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state with seed button */}
      {!loading && people.length === 0 && (
        <div
          className="flex flex-col items-center gap-4 py-16 px-6 text-center"
          style={{
            borderRadius: 'var(--radius-lg)', background: 'var(--content-bg-card)',
            border: '1.5px dashed var(--content-border-strong)',
          }}
        >
          <Users size={36} style={{ color: 'var(--ink-faint)', opacity: 0.5 }} />
          <p style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: '14px' }}>No team members yet</p>
          <p style={{ fontSize: '13px', color: 'var(--ink-faint)', lineHeight: 1.6, maxWidth: '360px' }}>
            Add people to your team to track aspirations, roles, and responsibilities.
          </p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{
              marginTop: '4px', padding: '9px 24px', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-coral)', color: 'white',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500,
            }}
          >
            {seeding ? 'Seeding…' : 'Seed my team'}
          </button>
        </div>
      )}

      {/* People grid */}
      {!loading && sorted.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {sorted.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              roster={roster}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
