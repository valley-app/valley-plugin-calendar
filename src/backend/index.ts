import { registerCalendarWorkflow } from '../workflow'
import type { PluginBackendApi } from '@valley/plugin-sdk'
import { DEFAULT_NOTE_DATE_ICONS } from '../noteDateIconDefaults'

export function register(api: PluginBackendApi): () => Promise<void> {
  const offWorkflow = registerCalendarWorkflow(api)
  const offIcons = api.rpc.handle('noteDateIcons', async () => {
    const grant = await api.storage.open({ area: 'metadata', path: 'assets/icon/calendar-icon', kind: 'directory', mode: 'write' })
    const location = (path: string) => ({ handle: grant.handle, path })
    try {
      await api.storage.mkdir(location(''))
      for (const [name, svg] of Object.entries(DEFAULT_NOTE_DATE_ICONS)) {
        if (!await api.storage.stat(location(`${name}.svg`))) await api.storage.write(location(`${name}.svg`), svg)
      }
      const icons: Record<string, string> = {}
      const failed: string[] = []
      let bytes = 0
      for (const entry of await api.storage.list(location(''))) {
        if (!/^[^/\\]+\.svg$/i.test(entry.name)) continue
        if (entry.kind !== 'file' || entry.size > 256_000 || bytes + entry.size > 2_000_000) { failed.push(entry.name); continue }
        try { icons[entry.name.slice(0, -4)] = await api.storage.read(location(entry.name)); bytes += entry.size }
        catch { failed.push(entry.name) }
      }
      return { icons, failed }
    } finally { await api.storage.close(grant.handle) }
  })
  return async () => { offIcons(); await offWorkflow() }
}
