export function getQuadrant(owner_id, due_date, selfPersonId, supervisorPersonId) {
  if (!owner_id) return 'Schedule'
  if (owner_id === supervisorPersonId) return 'Awaited'
  if (owner_id === selfPersonId) {
    if (!due_date) return 'Schedule'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(due_date)
    due.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return 'Do Now'
    if (diffDays <= 3) return 'Do Soon'
    return 'Schedule'
  }
  return 'Delegated'
}

export function getOwnerName(task, people) {
  if (task.owner_id) {
    const person = people.find(p => p.id === task.owner_id)
    if (person) return person.name
  }
  return task.owner ?? ''
}
