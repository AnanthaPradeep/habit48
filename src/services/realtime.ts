import { RealtimeClient } from '@supabase/realtime-js'
import { publishableKey, supabaseUrl } from './config'

export type WatchJournal = (options: {
  userId: string
  accessToken(): Promise<string>
  onChange(timestamp: number): void
  onConnection(connected: boolean): void
}) => () => void

export const watchJournal: WatchJournal = ({ userId, accessToken, onChange, onConnection }) => {
  const socket = new RealtimeClient(supabaseUrl.replace(/^http/, 'ws') + '/realtime/v1', {
    params: { apikey: publishableKey },
    accessToken,
  })
  const table = { schema: 'public', table: 'routine_journal', filter: 'user_id=eq.' + userId }
  function observe({ new: row }: { new: Record<string, unknown> }) {
    if (row.user_id !== userId || typeof row.updated_at !== 'string') return
    const timestamp = Date.parse(row.updated_at)
    if (Number.isFinite(timestamp)) onChange(timestamp)
  }
  const channel = socket.channel('routine-journal:' + userId)
    .on('postgres_changes', { ...table, event: 'INSERT' }, observe)
    .on('postgres_changes', { ...table, event: 'UPDATE' }, observe)
  let active = true
  void socket.setAuth().then(() => {
    if (active) channel.subscribe(status => onConnection(status === 'SUBSCRIBED'))
  }).catch(() => { if (active) onConnection(false) })
  return () => {
    active = false
    void socket.removeChannel(channel).finally(() => socket.disconnect()).catch(() => undefined)
  }
}
