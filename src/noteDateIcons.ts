import type { ValleyPluginApi } from '@valley/plugin-sdk'
import { React, api } from './runtime'
import { DEFAULT_NOTE_DATE_ICONS } from './noteDateIconDefaults'

export const CALENDAR_ICON_FOLDER = '.valley/assets/icon/calendar-icon'
const elements = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title', 'desc'])
const attributes = new Set(['xmlns', 'viewBox', 'd', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'transform'])

export function sanitizeNoteDateSvg(source: string): string {
  if (source.length > 256_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Invalid SVG')
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || document.querySelector('parsererror')) throw new Error('Invalid SVG')
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (!elements.has(node.tagName)) { node.remove(); continue }
    for (const attribute of [...node.attributes]) {
      if (!attributes.has(attribute.name) || /url\s*\(|[\\@]|expression\s*\(/i.test(attribute.value)) node.removeAttribute(attribute.name)
    }
  }
  if (!root.querySelector('path,circle,ellipse,rect,line,polyline,polygon')) throw new Error('Empty SVG')
  if (!root.hasAttribute('viewBox')) {
    const width = Number.parseFloat(root.getAttribute('width') ?? '')
    const height = Number.parseFloat(root.getAttribute('height') ?? '')
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('Invalid SVG dimensions')
    root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  const box = root.getAttribute('viewBox')!.trim().split(/[\s,]+/).map(Number)
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('Invalid SVG dimensions')
  root.setAttribute('width', '24')
  root.setAttribute('height', '24')
  root.setAttribute('x', '0')
  root.setAttribute('y', '0')
  return new XMLSerializer().serializeToString(root)
}

function registry(owner = api) {
  return owner.runtime.getOrCreate('calendar.icons', () => ({
    icons: { ...DEFAULT_NOTE_DATE_ICONS } as Record<string, string>, revision: 0, error: '', pending: null as Promise<void> | null,
    listeners: new Set<() => void>()
  }))
}
export function subscribeNoteDateIcons(listener: () => void, owner = api): () => void {
  const current = registry(owner)
  current.listeners.add(listener)
  return () => { current.listeners.delete(listener) }
}
export function useNoteDateIcons() {
  const owner = api
  React.useSyncExternalStore(listener => subscribeNoteDateIcons(listener, owner), () => registry(owner).revision)
  return registry(owner)
}
export function noteDateIconSvg(id: string, owner = api): string {
  return registry(owner).icons[id] ?? DEFAULT_NOTE_DATE_ICONS.pin
}
export function refreshNoteDateIcons(owner = api): Promise<void> {
  const current = registry(owner)
  if (current.pending) return current.pending
  let changed = false
  const previousError = current.error
  current.pending = (async () => {
    const catalog = await owner.backend.call<{ icons: Record<string, string>; failed: string[] }>('noteDateIcons', {})
    const icons: Record<string, string> = {}
    const failed = [...catalog.failed]
    for (const [name, source] of Object.entries(catalog.icons)) {
      try { icons[name] = sanitizeNoteDateSvg(source) }
      catch { failed.push(`${name}.svg`) }
    }
    changed = Object.keys(icons).length !== Object.keys(current.icons).length || Object.entries(icons).some(([name, svg]) => current.icons[name] !== svg)
    if (changed) current.icons = icons
    current.error = failed.length ? failed.sort().join(', ') : ''
  })().catch(() => { current.error = 'sources.icons.readError' }).finally(() => {
    current.pending = null
    if (changed || previousError !== current.error) {
      current.revision += 1
      current.listeners.forEach(listener => listener())
    }
  })
  return current.pending
}
export function initializeNoteDateIcons(owner: ValleyPluginApi): () => void {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const refresh = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => { if (!disposed) void refreshNoteDateIcons(owner) }, 150)
  }
  void refreshNoteDateIcons(owner)
  const off = owner.vault.onChanged(info => {
    if (info.full || info.changes.some(change => change.relPath.startsWith(`${CALENDAR_ICON_FOLDER}/`))) refresh()
  })
  return () => { disposed = true; clearTimeout(timer); off() }
}
