import type { Activity, Draft } from '../domain/activity'
import type { ActivityMutation } from './activityCloud'

export type ActivityCache = { draft: Draft | null; checkpoint: number; records: Activity[]; outbox?: ActivityMutation[]; goals?: { walkMinutes: number; runKm: number } }
let opening: Promise<IDBDatabase> | undefined
function database() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('routine-activity-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('accounts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(error => { opening = undefined; throw error })
}

export async function readActivities(owner: string): Promise<ActivityCache | undefined> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('accounts').objectStore('accounts').get(owner)
    request.onsuccess = () => resolve(request.result as ActivityCache | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function writeActivities(owner: string, state: ActivityCache) {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite')
    tx.objectStore('accounts').put(state, owner)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
}
