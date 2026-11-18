import { registerCalendarWorkflow } from '../workflow'
import type { PluginBackendApi } from '@valley/plugin-sdk'
import { DEFAULT_NOTE_DATE_ICONS } from '../noteDateIconDefaults'

/** OpenStreetMap's own tile server: the standard map, free to use with attribution and a client that names itself. */
const MAP_TILE_HOST = 'tile.openstreetmap.org'
const MAP_TILE_CLIENT = 'Valley-Calendar (+https://github.com/valley-app/valley-plugin-calendar)'
const MAX_MAP_ZOOM = 19

/**
 * One 256px map tile as base64 PNG, for the right sidebar's map of an entry's
 * place. The UI cannot reach the network; the request goes through the host's
 * broker to the one host the package declares.
 */
export async function readMapTile(api: Pick<PluginBackendApi, 'network'>, raw: unknown): Promise<string> {
  const { z, x, y } = (raw ?? {}) as Record<string, unknown>
  const whole = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < limit
  if (!whole(z, MAX_MAP_ZOOM + 1) || !whole(x, 2 ** z) || !whole(y, 2 ** z)) throw new Error('Not a map tile')
  const response = await api.network.fetch({ url: `https://${MAP_TILE_HOST}/${z}/${x}/${y}.png`, headers: { 'User-Agent': MAP_TILE_CLIENT }, timeoutMs: 10000, maxResponseBytes: 1_000_000 })
  if (response.status !== 200) throw new Error(`Map tile unavailable (${response.status})`)
  return response.bodyBase64
}

export function register(api: PluginBackendApi): () => Promise<void> {
  const offWorkflow = registerCalendarWorkflow(api)
  const offIcons = api.rpc.handle('noteDateIcons', async () => {
    const grant = await api.storage.open({ area: 'metadata', path: 'assets/icons/calendar-icon', kind: 'directory', mode: 'write' })
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
  const offTiles = api.rpc.handle('map.tile', payload => readMapTile(api, payload))
  return async () => { offIcons(); offTiles(); await offWorkflow() }
}
