export function findSelfPersonId(people) {
  const self = people.find(p => p.name.toLowerCase().includes('akshit'))
  return self?.id ?? null
}

export function findRajeshPersonId(people) {
  const rajesh = people.find(p => p.name.toLowerCase().includes('rajesh'))
  return rajesh?.id ?? null
}

export function getQuadrant(owner_id, due_date, selfPersonId, rajeshPersonId) {
  if (!owner_id) return 'Schedule'
  if (owner_id === rajeshPersonId) return 'Awaited'
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
