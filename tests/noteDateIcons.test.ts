import { describe, expect, it, vi } from 'vitest'
import { createMockValleyApi } from './harness'
import type { PluginBackendApi } from '@valley/plugin-sdk'
import { register } from '../src/backend'
import { DEFAULT_NOTE_DATE_ICONS } from '../src/noteDateIconDefaults'
import { initRuntime } from '../src/runtime'
import { noteDateIconSvg, refreshNoteDateIcons, sanitizeNoteDateSvg } from '../src/noteDateIcons'

const fern = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M4 4L40 40" stroke="currentColor"/></svg>'

describe('vault calendar icons', () => {
  it('discovers user files and refreshes edited artwork', async () => {
    const mock = createMockValleyApi({ manifest: { id: 'calendar', drivers: ['files'] } })
    initRuntime(mock.api)
    let svg = fern
    const read = vi.spyOn(mock.api.backend, 'call').mockImplementation(async () => ({ icons: { pin: fern, fern: svg }, failed: [] }))
    await refreshNoteDateIcons(mock.api)
    expect(noteDateIconSvg('fern', mock.api)).toContain('viewBox="0 0 48 48"')
    svg = fern.replace('M4 4L40 40', 'M8 8L32 32')
    await refreshNoteDateIcons(mock.api)
    expect(noteDateIconSvg('fern', mock.api)).toContain('M8 8L32 32')
    expect(read).toHaveBeenCalledWith('noteDateIcons', {})
  })

  it('removes executable SVG content and rejects malformed or empty files', () => {
    const svg = sanitizeNoteDateSvg(fern.replace('<path', '<script>alert(1)</script><image href="https://example.com/a"/><path onclick="alert(1)" style="fill:red"'))
    expect(svg).not.toMatch(/script|image|href|onclick|style=/)
    expect(svg).toContain('width="24"')
    expect(() => sanitizeNoteDateSvg('<svg/>')).toThrow()
    expect(() => sanitizeNoteDateSvg(fern.replace('0 0 48 48', '0 0 0 48'))).toThrow()
    expect(() => sanitizeNoteDateSvg('<!DOCTYPE svg>'+fern)).toThrow()
  })

  it('isolates catalogs between vault sessions', async () => {
    const first = createMockValleyApi({ manifest: { id: 'calendar', drivers: ['files'] } })
    const second = createMockValleyApi({ manifest: { id: 'calendar', drivers: ['files'] } })
    expect(noteDateIconSvg('unknown', first.api)).toBe(noteDateIconSvg('pin', second.api))
  })
})


it('seeds missing default icons without overwriting edited artwork', async () => {
  const files = new Map([['cake.svg', fern], ['fern.svg', fern]])
  let readIcons: (() => Promise<unknown>) | undefined
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  const backend = {
    index: mock.api.index, vault: mock.api.vault, data: mock.api.data, documents: mock.api.documents, settings: mock.api.settings,
    notifications: { ...mock.api.notifications, onOccurrence: () => () => {} }, lifecycle: { onResume: () => () => {} },
    i18n: { t: mock.api.ui.t, language: () => 'en', onLanguageChanged: () => () => {} },
    pluginId: 'calendar',
    rpc: { emit: vi.fn(), handleOperation: () => () => {}, handle: (method: string, handler: () => Promise<unknown>) => { if (method === 'noteDateIcons') readIcons = handler; return () => {} } },
    storage: {
      open: vi.fn(async () => ({ handle: 'icons' })), mkdir: vi.fn(async () => {}), close: vi.fn(async () => {}),
      stat: async ({ path }: { path: string }) => files.has(path) ? { kind: 'file' } : null,
      write: async ({ path }: { path: string }, text: string) => { files.set(path, text) },
      read: async ({ path }: { path: string }) => files.get(path),
      list: async () => [...files].map(([name, svg]) => ({ name, kind: 'file', size: svg.length }))
    }
  } as unknown as PluginBackendApi
  const dispose = register(backend)
  const result = await readIcons!() as { icons: Record<string, string>; failed: string[] }
  expect(files.get('cake.svg')).toBe(fern)
  expect(result.icons.fern).toBe(fern)
  expect(Object.keys(DEFAULT_NOTE_DATE_ICONS).every(id => files.has(`${id}.svg`))).toBe(true)
  expect(backend.storage.open).toHaveBeenCalledWith({ area: 'metadata', path: 'assets/icon/calendar-icon', kind: 'directory', mode: 'write' })
  expect(backend.storage.close).toHaveBeenCalledWith('icons')
  await dispose()
})
