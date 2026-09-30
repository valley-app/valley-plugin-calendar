import { createIndexObserver, type PluginBackendApi } from '@valley/plugin-sdk'
import { parseCalendarFile } from './calendarFiles'
import type { EventRecord } from '@valley/plugin-sdk/types'

export function reminderTimes(record: EventRecord, defaults: number[] = [10]): { id: string; at: number }[] {
  if (record.readOnly || record.source) return []

  const time = record.startTime || record.reminderTime
  if (!record.date || !time) return []
  const at = new Date(`${record.date}T${time}`).getTime()
  if (!Number.isFinite(at)) return []
  const offsets = record.reminderOffsets ?? defaults
  if (offsets.length > 16 || offsets.some(value => !Number.isInteger(value) || value < 0 || value > 10080) || new Set(offsets).size !== offsets.length) throw new Error('Invalid reminder offsets')
  return offsets.map(minutes => ({ id: String(minutes), at: at - minutes * 60000 }))
}

export function startReminderOwner(api: PluginBackendApi, list: () => Promise<EventRecord[]>, complete?: (id: string) => Promise<unknown>): () => Promise<void> {
  let active = true
  let pending = Promise.resolve()
  let keys: string[] = []
  let fired: Record<string, number> = {}
  const save = async () => {
    fired = Object.fromEntries(Object.entries(fired).sort((a, b) => b[1] - a[1]).slice(0, 4096))
    const current = await api.data.files.readTextBaseline('reminder-state.json')
    const result = await api.data.files.writeTextGuarded('reminder-state.json', JSON.stringify({ keys, fired }), current?.baseline ?? null)
    if (!result.ok) throw new Error('Could not persist reminder state')
  }
  const ready = api.data.files.readText('reminder-state.json').then(text => {
    if (!text) return
    const raw = JSON.parse(text) as { keys: string[]; fired: Record<string, number> }
    keys = Array.isArray(raw.keys) ? raw.keys.filter(key => typeof key === 'string') : []
    fired = raw.fired && typeof raw.fired === 'object' ? raw.fired : {}
  })
  const queue = (work: () => Promise<void>) => {
    pending = pending.catch(() => {}).then(async () => { await ready; if (active) await work() })
    void pending.catch(() => api.rpc.emit('reminders.error', { code: 'REMINDER_RECONCILIATION_FAILED' }))
  }
  const files = createIndexObserver(api, { extensions: ['.ics', '.ifb', '.vcs'], fields: ['excluded'] })
  const reconcile = () => queue(async () => {
    const wanted: string[] = []
    const settings = api.settings.get().reminderOffsets
    const defaults = Array.isArray(settings) ? settings as number[] : [10]
    for (const record of await list()) {
      for (const occurrence of reminderTimes(record, defaults)) {
        const key = `reminder:${record.id}:${occurrence.id}`
        wanted.push(key)
        if (fired[key] === occurrence.at) continue
        await api.notifications.schedule(key, [occurrence.at], {
          eventId: 'reminder', title: record.title, body: record.note.trim().split('\n')[0], targetItemId: record.id,
          reminderId: occurrence.id, scheduleRevision: String(occurrence.at),
          actions: [
            { id: 'open', kind: 'open', label: api.i18n.t('notification.open') },
            ...(complete ? [{ id: 'complete', kind: 'action' as const, label: api.i18n.t('notification.complete') }] : []),
            { id: 'snooze', kind: 'snooze', label: api.i18n.t('notification.snooze'), choices: [5, 10, 30, 60].map(minutes => ({ id: String(minutes), label: api.i18n.t('notification.minutes', { count: minutes }), minutes })) }
          ]
        })
      }
    }
    const indexed = files.getSnapshot()
    if (indexed.status !== 'ready') return
    const now = Date.now()
    const from = new Date(now - 7 * 86400000).toISOString().slice(0, 10)
    const to = new Date(now + 90 * 86400000).toISOString().slice(0, 10)
    for (const file of indexed.entries.filter(file => !file.excluded)) {
      const content = await api.vault.read(file.relPath)
      if (!content) continue
      for (const event of parseCalendarFile(content.content, file.relPath, from, to).entries) {
        for (const alarm of event.alarmTimes ?? []) {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${event.id}:${alarm.id}`))
          const identity = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
          const key = `reminder:file:${identity}`
          wanted.push(key)
          if (fired[key] === alarm.at) continue
          await api.notifications.schedule(key, [alarm.at], { eventId: 'reminder', title: event.title.slice(0, 256), body: event.note.slice(0, 4096), targetItemId: file.relPath.slice(0, 256), reminderId: identity, scheduleRevision: String(alarm.at), actions: [
            { id: 'open', kind: 'open', label: api.i18n.t('notification.open') },
            { id: 'snooze', kind: 'snooze', label: api.i18n.t('notification.snooze'), choices: [5, 10, 30, 60].map(minutes => ({ id: String(minutes), label: api.i18n.t('notification.minutes', { count: minutes }), minutes })) }
          ] })
        }
      }
    }
    for (const key of keys) if (!wanted.includes(key)) await api.notifications.cancel(key)
    keys = wanted
    await save()
  })
  const offFiles = files.subscribe(reconcile)
  const offVault = api.vault.onChanged(reconcile)
  const offData = api.data.dataset('calendar.events').subscribe(reconcile)
  const offSettings = api.settings.subscribe(reconcile)
  const offResume = api.lifecycle.onResume(reconcile)
  const offOccurrence = api.notifications.onOccurrence(event => {
    if (!event.key.startsWith('reminder:')) return
    queue(async () => { fired[event.key] = event.scheduledAt; await save() })
  })
  const offAction = api.rpc.handle('notifications.action', async payload => {
    const event = payload as { action?: string; targetItemId?: string }
    if (event.action !== 'complete' || !complete || typeof event.targetItemId !== 'string') throw new Error('Unknown reminder action')
    const result = await complete(event.targetItemId)
    reconcile()
    return result
  })
  const interval = setInterval(reconcile, 60_000)
  reconcile()
  return async () => { active = false; clearInterval(interval); offFiles(); offVault(); await files.dispose(); offData(); offSettings(); offResume(); offOccurrence(); offAction(); await pending }
}
