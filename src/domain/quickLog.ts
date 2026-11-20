import { estimateCalories } from './calories'
import { blankEntry, habits, meals, metrics, type Entry, type Food, type Journal } from './journal'

type Field = { key: 'h' | 'm' | 'f'; index: number } | { key: 'notes' | 'cal' }
type Value = boolean | string | number | null | Food[]
export type Change = { field: Field; before: Value; after: Value }
export type QuickInput = { kind: 'metric'; index: 0 | 1; amount: number }
  | { kind: 'habit'; index: number; checked: boolean }
  | { kind: 'meal'; index: number; text: string }
  | { kind: 'edit'; changes: Change[] }
  | { kind: 'undo'; target: string }
export type QuickAction = QuickInput & { id: string; day: string }
export type QuickReceipt = { changes: Change[]; undone?: boolean; created?: boolean; afterEntry?: Entry; skipped?: boolean }

const fields: Field[] = [
  ...habits.map((_, index): Field => ({ key: 'h', index })),
  ...meals.map((_, index): Field => ({ key: 'f', index })),
  ...metrics.map((_, index): Field => ({ key: 'm', index })),
  { key: 'notes' }, { key: 'cal' },
]
const equality = (a: Value, b: Value) => a === b || (Array.isArray(a) && Array.isArray(b) &&
  a.length === b.length && a.every((food, i) => {
    const other = b[i]
    return food.meal === other.meal && food.name === other.name && food.qty === other.qty && food.rate === other.rate
  }))
function read(entry: Entry, field: Field): Value {
  if ('index' in field) return entry[field.key][field.index]
  return entry[field.key] ?? null
}
function write(entry: Entry, field: Field, value: Value) {
  if (field.key === 'h' && 'index' in field) entry.h[field.index] = Boolean(value)
  if (field.key === 'f' && 'index' in field) entry.f[field.index] = String(value ?? '')
  if (field.key === 'm' && 'index' in field) entry.m[field.index] = value as Entry['m'][number]
  if (field.key === 'notes') entry.notes = String(value ?? '')
  if (field.key === 'cal') {
    if (value === null) delete entry.cal
    else entry.cal = value as Food[]
  }
}
export function changesBetween(before: Entry, after: Entry): Change[] {
  const changes = fields.flatMap(field => {
    const from = read(before, field)
    const to = read(after, field)
    return equality(from, to) ? [] : [{ field, before: from, after: to }]
  })
  // Food text and calorie corrections are a single logical edit.
  if (changes.some(change => change.field.key === 'f' || change.field.key === 'cal')) {
    for (const field of fields.filter(field => field.key === 'f' || field.key === 'cal')) {
      if (!changes.some(item => item.field === field)) changes.push({ field, before: read(before, field), after: read(after, field) })
    }
  }
  return changes
}
export const conflictsWith = (changes: Change[], entry: Entry) =>
  changes.some(change => !equality(read(entry, change.field), change.before) && !equality(read(entry, change.field), change.after))
const isFood = (change: Change) => change.field.key === 'f' || change.field.key === 'cal'
export function uncontestedChanges(changes: Change[], entry: Entry) {
  const foodConflict = conflictsWith(changes.filter(isFood), entry)
  return changes.filter(change => (!foodConflict || !isFood(change)) && !conflictsWith([change], entry))
}
export function applyChanges(entry: Entry, changes: Change[]): Entry {
  const result = structuredClone(entry)
  for (const change of changes) write(result, change.field, change.after)
  return result
}
export function canUndoQuick(journal: Journal, day: string, target: string) {
  const receipt = journal.quickReceipts?.[target]
  const entry = journal.entries[day] ?? blankEntry()
  return Boolean(receipt && !receipt.undone && receipt.changes.length &&
    receipt.changes.every(change => equality(read(entry, change.field), change.after)))
}

export function projectQuick(journal: Journal, actions: QuickAction[]): Journal {
  if (!actions.length) return journal
  const receipts = { ...journal.quickReceipts }
  const entries = { ...journal.entries }
  for (const action of actions) {
    if (receipts[action.id]) continue
    const current = entries[action.day] ?? blankEntry()
    if (action.kind === 'undo') {
      const receipt = receipts[action.target]
      let restoredLog = false
      if (receipt && !receipt.undone && receipt.changes.every(change => equality(read(current, change.field), change.after))) {
        const restored = applyChanges(current, receipt.changes.map(change => ({ ...change, after: change.before })))
        if (receipt.created && receipt.afterEntry && changesBetween(receipt.afterEntry, current).length === 0) delete entries[action.day]
        else entries[action.day] = restored
        receipts[action.target] = { ...receipt, undone: true }
        restoredLog = true
      }
      receipts[action.id] = { changes: [], skipped: !restoredLog }
      continue
    }
    if (action.kind === 'edit') {
      const available = uncontestedChanges(action.changes, current)
      if (available.length) entries[action.day] = applyChanges(current, available)
      receipts[action.id] = { changes: [], skipped: available.length !== action.changes.length }
      continue
    }
    const next = structuredClone(current)
    if (action.kind === 'metric') {
      const before = Number(current.m[action.index] ?? 0)
      next.m[action.index] = String(Math.round(((Number.isFinite(before) ? before : 0) + action.amount) * 1000) / 1000)
    } else if (action.kind === 'habit') {
      next.h[action.index] = action.checked
    } else {
      const text = action.text.trim()
      next.f[action.index] = [current.f[action.index], text].filter(Boolean).join('\n')
      const newMeal = meals.map((_, i) => i === action.index ? text : '')
      next.cal = [...(current.cal?.length ? current.cal : estimateCalories(current.f).items), ...estimateCalories(newMeal).items]
    }
    const changes = changesBetween(current, next)
    const created = !entries[action.day]
    receipts[action.id] = { changes, ...(created ? { created, afterEntry: next } : {}) }
    if (changes.length) entries[action.day] = next
  }
  return { ...journal, entries, quickReceipts: receipts }
}

export function recentMeals(journal: Journal, onOrBefore: string) {
  const result: { index: number; text: string }[] = []
  const seen = new Set<string>()
  for (const [day, entry] of Object.entries(journal.entries).sort(([a], [b]) => b.localeCompare(a))) {
    if (day > onOrBefore) continue
    entry.f.forEach((food, index) => {
      for (const part of food.split('\n').reverse()) {
        const text = part.trim()
        const key = index + ':' + text.toLowerCase()
        if (!text || seen.has(key)) continue
        seen.add(key)
        result.push({ index, text })
      }
    })
    if (result.length >= 5) break
  }
  return result.slice(0, 5)
}
