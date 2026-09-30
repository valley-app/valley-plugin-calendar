import { React, api, readOwner } from './runtime'
import type { ValleyReadonlyState } from '@valley/plugin-sdk'

export function subscribeHostField<K extends keyof ValleyReadonlyState>(key: K, listener: () => void): () => void {
  const owner = api
  let previous = owner.getState()[key]
  return owner.subscribeState([key], () => {
    const next = owner.getState()[key]
    if (Object.is(previous, next)) return
    previous = next
    listener()
  })
}

export function useHostField<K extends keyof ValleyReadonlyState>(key: K): ValleyReadonlyState[K] {
  const subscribe = React.useCallback((listener: () => void) => subscribeHostField(key, listener), [key])
  const snapshot = React.useCallback(() => api.getState()[key], [key])
  return React.useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function useCalendarYear(): number {
  const clock = readOwner('year', () => {
    let year = new Date().getFullYear()
    let timer: ReturnType<typeof setTimeout> | undefined
    const listeners = new Set<() => void>()
    const refresh = (): void => {
      const now = new Date()
      if (year !== now.getFullYear()) {
        year = now.getFullYear()
        for (const listener of [...listeners]) listener()
      }
      if (timer) clearTimeout(timer)
      if (listeners.size) timer = setTimeout(refresh, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime())
    }
    const stop = (): void => {
      if (timer) clearTimeout(timer)
      timer = undefined
      globalThis.removeEventListener('focus', refresh)
    }
    return {
      get: () => year,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        if (listeners.size === 1) globalThis.addEventListener('focus', refresh)
        refresh()
        return () => { listeners.delete(listener); if (!listeners.size) stop() }
      },
      dispose: () => { stop(); listeners.clear() }
    }
  })
  return React.useSyncExternalStore(clock.subscribe, clock.get, clock.get)
}
