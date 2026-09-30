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

export async function openDailyNote(date: string): Promise<void> {
  const folder = calendarFolder('dailyNotesFolder')
  const path = `${folder}/${date}.md`
  if (!dailyNoteDate(path, folder)) throw new Error(uiText('calendar.daily.invalid'))
  if (!await api.vault.stat(path)) {
    const result = await api.vault.createTextDocumentGuarded(path, `# ${date}\n\n`)
    if (!result.ok && !await api.vault.stat(path)) throw new Error(uiText('calendar.error.save'))
  }
  api.workspace.openFile(path)
}
