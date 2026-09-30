import { createIndexObserver } from '@valley/plugin-sdk'
import { React, api, readOwner } from './runtime'
import { calendarFolder, dailyNoteDate } from './dailyNotes'
import { parseCalendarFile } from './calendarFiles'
import type { CalItem } from './items'

function documentReads() {
  return readOwner('calendarDocuments', owner => {
    const cache = new Map<string, Promise<ReturnType<typeof parseCalendarFile>>>()
    const off = owner.vault.onChanged(info => {
      if (info.full) cache.clear()
      else for (const key of cache.keys()) if (info.changes.some(change => JSON.parse(key)[0] === change.relPath)) cache.delete(key)
    })
    return {
      read(path: string, start: string, end: string, revision?: number) {
        const key = JSON.stringify([path, start, end, revision])
        let value = cache.get(key)
        if (!value) {
          value = owner.vault.readFile(path).then(raw => parseCalendarFile(raw, path, start, end))
          cache.set(key, value)
          void value.catch(() => { cache.delete(key) })
          if (cache.size > 128) cache.delete(cache.keys().next().value!)
        }
        return value
      },
      invalidate: () => cache.clear(),
      dispose: () => { off(); cache.clear() }
    }
  })
}

export function useCalendarDocuments(start: string, end: string, onlyPath?: string): { items: CalItem[]; errors: string[] } {
  const [result, setResult] = React.useState<{ items: CalItem[]; errors: string[] }>({ items: [], errors: [] })
  const [settingsRevision, setSettingsRevision] = React.useState(0)
  React.useEffect(() => api.settings.subscribe(() => setSettingsRevision(value => value + 1)), [])
  React.useEffect(() => {
    let active = true, generation = 0
    const reads = documentReads()
    const calendarRoot = calendarFolder('calendarFolder')
    const dailyRoot = calendarFolder('dailyNotesFolder')
    const calendarIndex = createIndexObserver(api, { pathPrefix: calendarRoot, extensions: ['.ics', '.ifb', '.vcs'], fields: ['excluded', 'mtimeMs'] })
    const dailyIndex = createIndexObserver(api, { pathPrefix: dailyRoot, extensions: ['.md'], fields: ['excluded', 'title'] })
    const refresh = async (): Promise<void> => {
      const current = ++generation
      const entries: CalItem[] = []
      const errors: string[] = []
      const calendarSnapshot = calendarIndex.getSnapshot(), dailySnapshot = dailyIndex.getSnapshot()
      const paths = onlyPath ? [onlyPath] : calendarSnapshot.entries.filter(entry => !entry.excluded).map(entry => entry.relPath)
      for (const path of paths) {
        if (!active || current !== generation) return
        try {
          const parsed = await reads.read(path, start, end, calendarSnapshot.entries.find(entry => entry.relPath === path)?.mtimeMs)
          errors.push(...parsed.errors.map(error => `${path}: ${error}`))
          for (const file of parsed.entries) entries.push({ kind: 'file', ...file, id: file.id, filePath: path, file, icon: file.availability ? 'clock' : 'calendar', readOnly: false })
        } catch (error) { errors.push(`${path}: ${String(error)}`) }
      }
      if (!onlyPath) for (const note of dailySnapshot.entries) {
        const date = dailyNoteDate(note.relPath, dailyRoot)
        if (!note.excluded && date && date >= start && date <= end) entries.push({ kind: 'noteDate', id: `daily:${note.relPath}`, title: date, date, filePath: note.relPath, icon: 'file-text', readOnly: true })
      }
      for (const snapshot of [calendarSnapshot, dailySnapshot]) if (snapshot.status === 'error') errors.push(snapshot.error ?? 'Calendar index unavailable.')
      if (active && current === generation) setResult({ items: entries, errors })
    }
    const reload = (): void => { void refresh() }
    const offCalendar = calendarIndex.subscribe(reload), offDaily = dailyIndex.subscribe(reload)
    const offFiles = api.vault.onChanged(info => {
      if (info.full || info.changes.some(change => change.relPath === onlyPath || change.relPath.startsWith(`${calendarRoot}/`) || change.relPath.startsWith(`${dailyRoot}/`))) reload()
    })
    reload()
    return () => { active = false; offCalendar(); offDaily(); offFiles(); void calendarIndex.dispose(); void dailyIndex.dispose() }
  }, [start, end, onlyPath, settingsRevision])
  return result
}
