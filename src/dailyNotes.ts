import { api } from './runtime'
import { isRealCalendarDate } from '@valley/plugin-sdk/datePattern'
import { uiText } from './localization'

export const DEFAULT_CALENDAR_FOLDER = 'plugins/calendar'
export const DEFAULT_DAILY_FOLDER = `${DEFAULT_CALENDAR_FOLDER}/dailynotes`

export function calendarFolder(key: 'calendarFolder' | 'dailyNotesFolder'): string {
  const value = api.settings.get()[key]
  const fallback = key === 'calendarFolder' ? DEFAULT_CALENDAR_FOLDER : DEFAULT_DAILY_FOLDER
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/$/, '') : fallback
}

export function dailyNoteDate(path: string, folder: string): string | null {
  if (!path.startsWith(`${folder}/`)) return null
  const name = path.slice(folder.length + 1)
  const match = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(name)
  return match && isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) ? name.slice(0, 10) : null
}

/** The vault path of the daily note for `date`, or null when the date cannot name one. */
export function dailyNotePath(date: string): string | null {
  const folder = calendarFolder('dailyNotesFolder')
  const path = `${folder}/${date}.md`
  return dailyNoteDate(path, folder) ? path : null
}

/** `mayCreate` false (the caller was authorized only to read the note) refuses a missing note as not-applied instead of creating it. */
export async function openDailyNote(date: string, validateBeforeEffect?: (path: string) => Promise<void>, mayCreate = true): Promise<void> {
  const path = dailyNotePath(date)
  if (!path) throw new Error(uiText('calendar.daily.invalid'))
  if (!await api.vault.stat(path)) {
    if (!mayCreate) throw Object.assign(new Error('The daily note no longer exists and this open was authorized only to read it.'), { code: 'REVISION_CONFLICT', outcome: 'not-applied' })
    await validateBeforeEffect?.(path)
    const result = await api.vault.createTextDocumentGuarded(path, `# ${date}\n\n`)
    if (!result.ok && !await api.vault.stat(path)) throw new Error(uiText('calendar.error.save'))
  }
  await validateBeforeEffect?.(path)
  api.workspace.openFile(path)
}
