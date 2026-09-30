import type { CalendarRevealTarget, ValleyPluginApi } from '@valley/plugin-sdk'
import { normalizeTimeRange } from '@valley/plugin-sdk/timeControl'

/**
 * Module-global handles to the host's React instance and plugin API, set once in
 * `register(api)` before any view renders — same pattern as the Music and Todo
 * plugins. Components import these instead of bundling their own `react`. JSX
 * compiles to `React.createElement` (classic transform), resolving to this binding.
 */
export let React!: typeof import('react')
export let api!: ValleyPluginApi

interface ReadOwners {
  disposed: boolean
  epoch: number
  off?: () => void
  disposal?: Promise<void>
  retired?: Promise<void>
  values: Map<string, { dispose: () => void | Promise<void>; invalidate?: () => void }>
}

let activeOwners: ReadOwners | undefined

function disposeOwners(owners: ReadOwners): Promise<void> {
  if (owners.disposal) return owners.disposal
  owners.disposed = true
  owners.off?.()
  const values = [...owners.values.values()]
  owners.values.clear()
  const retired = owners.retired
  owners.disposal = (async () => {
    const results = await Promise.allSettled([...values.map(value => value.dispose()), retired])
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  })()
  return owners.disposal
}

export function initRuntime(a: ValleyPluginApi): () => Promise<void> {
  const retired = api !== a && activeOwners ? disposeOwners(activeOwners) : undefined
  void retired?.catch(() => {})
  api = a
  React = a.React
  const owners = a.runtime.getOrCreate<ReadOwners>('calendar.readOwners', () => ({ disposed: false, epoch: 0, values: new Map() }))
  const epoch = ++owners.epoch
  owners.retired = retired ?? owners.disposal ?? owners.retired
  owners.disposal = undefined
  owners.disposed = false
  owners.off?.()
  let vault = a.getState().vault?.path
  owners.off = a.subscribeState(['vault'], () => {
    const next = a.getState().vault?.path
    if (next === vault) return
    vault = next
    for (const value of owners.values.values()) value.invalidate?.()
  })
  activeOwners = owners
  return () => owners.epoch === epoch ? disposeOwners(owners) : Promise.resolve()
}

export function readOwner<T extends { dispose: () => void | Promise<void> }>(key: string, create: (owner: ValleyPluginApi) => T): T {
  if (!activeOwners || activeOwners.disposed) throw new Error('Calendar read owner is disposed.')
  let value = activeOwners.values.get(key)
  if (!value) {
    value = create(api)
    activeOwners.values.set(key, value)
  }
  return value as T
}

interface RevealTargetStore {
  value: CalendarRevealTarget | null
  listeners: Set<() => void>
  get(): CalendarRevealTarget | null
  publish(value: CalendarRevealTarget | null): void
  subscribe(listener: () => void): () => void
}

export function revealTargetStore(): RevealTargetStore {
  return api.runtime.getOrCreate('calendar.revealTarget', () => {
    const store: RevealTargetStore = {
      value: null,
      listeners: new Set(),
      get: () => store.value,
      publish: (value) => {
        store.value = value
        for (const listener of [...store.listeners]) listener()
      },
      subscribe: (listener) => {
        store.listeners.add(listener)
        return () => store.listeners.delete(listener)
      }
    }
    return store
  })
}

/**
 * Reveal one dated item: move the shared time selection to it and publish a
 * pulse addressed only to the destination surface. The caller then opens that
 * destination. Keeping the surface on the target prevents the clicked origin
 * from pulsing or scrolling itself.
 *
 * The nonce lives beside the store, in host runtime state, so the pulse survives
 * a module re-import and clears with the session rather than with a component.
 */
interface RevealPulse {
  nonce: number
  timer: ReturnType<typeof setTimeout> | null
}

const PULSE_MS = 2400

function publishCalendarReveal(request: {
  date: string
  startTime?: string
  endTime?: string
  sourceId?: string
  itemId?: string
  /** Switch the grid to this view; omit to keep whatever the user is on. */
  view?: 'month' | 'week' | 'year'
}, surface: CalendarRevealTarget['surface']): void {
  const pulse = api.runtime.getOrCreate<RevealPulse>('calendar.revealPulse', () => ({
    nonce: 0,
    timer: null
  }))
  const reveals = revealTargetStore()

  if (request.view) void api.settings.set('mainView', request.view)
  api.workspace.patchTimeControl({
    ...(request.view ? { view: request.view } : {}),
    cursor: `${request.date.slice(0, 7)}-01`,
    selectedDate: request.date,
    selectedTime: request.startTime ?? null,
    timeRange: normalizeTimeRange({ start: request.startTime, end: request.endTime }),
    rangeStart: null,
    rangeEnd: null
  })

  if (pulse.timer) clearTimeout(pulse.timer)
  // Republish from null so re-revealing the same item flashes again rather than
  // rendering an unchanged target and looking like the click was swallowed.
  reveals.publish(null)
  // No `sourceId` means the Calendar's own event; the flash is the same either way.
  if (request.itemId) {
    const target: CalendarRevealTarget = {
      surface,
      sourceId: request.sourceId ?? '',
      itemId: request.itemId,
      date: request.date,
      nonce: ++pulse.nonce
    }
    reveals.publish(target)
    pulse.timer = setTimeout(() => {
      if (reveals.get()?.nonce === target.nonce) reveals.publish(null)
      pulse.timer = null
    }, PULSE_MS)
  }

}

export function revealCalendarItem(request: {
  date: string
  startTime?: string
  endTime?: string
  sourceId?: string
  itemId?: string
  view?: 'month' | 'week' | 'year'
}): void {
  publishCalendarReveal(request, 'main')
  api.workspace.openMainTab()
}

export function revealCalendarAgendaItem(request: {
  date: string
  startTime?: string
  endTime?: string
  sourceId?: string
  itemId?: string
}): void {
  publishCalendarReveal(request, 'agenda')
  api.workspace.revealOwnPanel('left_sidebar')
}
