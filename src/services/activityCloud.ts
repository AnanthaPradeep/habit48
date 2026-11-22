import type { Activity } from '../domain/activity'
import { publishableKey, supabaseUrl } from './config'

export type ActivityMutation = { id: string; expected: number | null; record: Activity | null }
type ActivityRow = { id: string; user_id: string; revision: number; activity?: Activity }
export type ActivityToken = () => Promise<string>

async function request(token: string, query: URLSearchParams, method = 'GET', body?: object, prefer?: string): Promise<ActivityRow[]> {
  const response = await fetch(supabaseUrl + '/rest/v1/routine_activities?' + query, {
    method, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw Error('Activity cloud request failed')
  return await response.json() as ActivityRow[]
}

export async function syncActivity(owner: string, token: string, mutation: ActivityMutation) {
  const query = new URLSearchParams({ user_id: 'eq.' + owner, id: 'eq.' + mutation.id, select: 'id,user_id,revision,activity' })
  if (mutation.expected === null && !mutation.record) return true
  if (mutation.expected === null && mutation.record) {
    const insert = new URLSearchParams({ on_conflict: 'id', select: 'id,user_id,revision,activity' })
    const rows = await request(token, insert, 'POST', {
      id: mutation.id, user_id: owner, revision: mutation.record.editedAt, activity: mutation.record,
    }, 'resolution=ignore-duplicates,return=representation')
    if (rows.length) return true
  } else {
    query.set('revision', 'eq.' + mutation.expected)
    const rows = mutation.record
      ? await request(token, query, 'PATCH', { revision: mutation.record.editedAt, activity: mutation.record }, 'return=representation')
      : await request(token, query, 'DELETE', undefined, 'return=representation')
    if (rows.length) return true
  }
  query.delete('revision')
  const [remote] = await request(token, query)
  return mutation.record ? remote?.revision === mutation.record.editedAt && remote.activity?.title === mutation.record.title && remote.activity?.notes === mutation.record.notes : !remote
}

export async function pullActivities(owner: string, token: string, known: Activity[]) {
  const records: Activity[] = []
  const local = new Map(known.map(activity => [activity.id, activity]))
  const filters = { user_id: 'eq.' + owner, order: 'id.asc', limit: '40' }
  for (let offset = 0; ; offset += 40) {
    const metadata = new URLSearchParams({ ...filters, select: 'id,user_id,revision', offset: String(offset) })
    const rows = await request(token, metadata)
    const missing = []
    for (const row of rows) {
      if (row.user_id !== owner) continue
      const previous = local.get(row.id)
      if (previous?.editedAt === row.revision) records.push(previous)
      else missing.push(row.id)
    }
    if (missing.length) {
      const details = new URLSearchParams({ user_id: filters.user_id, select: 'id,user_id,revision,activity',
        id: 'in.(' + missing.join(',') + ')' })
      for (const row of await request(token, details)) {
        if (row.user_id === owner && row.activity?.id === row.id && row.activity.editedAt === row.revision) records.push(row.activity)
      }
    }
    if (rows.length < 40) return records
  }
}
