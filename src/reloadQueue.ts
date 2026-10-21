import { createBoundedCache, type ValleyPluginApi } from '@valley/plugin-sdk'

const REVISION_CACHE_MAX_BYTES = 16 * 1024 * 1024

export function createReloadQueue<T>(read: () => Promise<T>, publish: (value: T) => void, onError?: (error: unknown) => void): {
  reload: () => Promise<void>
  dispose: () => void
} {
  let pending: Promise<void> | null = null
  let dirty = false
  let disposed = false
  return {
    reload: () => {
      if (disposed) return Promise.resolve()
      dirty = true
      if (!pending) {
        pending = (async () => {
          while (dirty && !disposed) {
            dirty = false
            const value = await read()
            if (!dirty && !disposed) publish(value)
          }
        })().finally(() => { pending = null })
        if (onError) void pending.catch((error) => { if (!disposed) onError(error) })
      }
      return pending
    },
    dispose: () => { disposed = true }
  }
}

export interface RevisionCacheMemory<V> {
  owner: ValleyPluginApi
  label: string
  sizeOf: (value: V) => number
}

export function createRevisionCache<K, V>(
  read: (key: K, assertCurrent: () => void) => Promise<V>,
  capacity = 32,
  reusable: (value: V) => boolean = () => true,
  memory?: RevisionCacheMemory<V>
): {
  read: (key: K) => Promise<V>
  invalidate: () => void
  subscribe: (listener: () => void) => () => void
  dispose: () => void
} {
  const values = createBoundedCache<K, { revision: number; value: V }>({
    maxBytes: REVISION_CACHE_MAX_BYTES,
    maxEntries: capacity,
    sizeOf: (entry) => memory ? memory.sizeOf(entry.value) : 0
  })
  const pending = new Map<K, Promise<V>>()
  const listeners = new Set<() => void>()
  const unregister = memory?.owner.cache.memory.register(values, memory.label)
  let revision = 0
  let disposed = false
  return {
    read: (key) => {
      if (disposed) return Promise.reject(new Error('Calendar read owner is disposed.'))
      const inflight = pending.get(key)
      if (inflight) return inflight
      const cached = values.get(key)
      if (cached?.revision === revision) return Promise.resolve(cached.value)
      if (pending.size >= capacity) return Promise.reject(new Error('Calendar has too many pending read ranges.'))
      const current: Promise<V> = (async () => {
        while (!disposed) {
          const accepted = revision
          let value: V
          try { value = await read(key, () => {
            if (disposed) throw new Error('Calendar read owner is disposed.')
            if (accepted !== revision) throw new Error('Calendar read was superseded.')
          }) } catch (error) {
            if (!disposed && accepted !== revision) continue
            throw error
          }
          if (disposed) break
          if (accepted !== revision) continue
          if (reusable(value)) values.set(key, { revision: accepted, value })
          return value
        }
        throw new Error('Calendar read owner is disposed.')
      })().finally(() => { if (pending.get(key) === current) pending.delete(key) })
      pending.set(key, current)
      return current
    },
    invalidate: () => {
      if (disposed) return
      revision++
      values.clear()
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      if (!disposed) listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => { disposed = true; unregister?.(); values.clear(); pending.clear(); listeners.clear() }
  }
}

export function subscribeDatasetRevisions(owner: ValleyPluginApi, datasets: string[], invalidate: () => void): () => void {
  let generation = -1
  const revisions = new Map<string, number>()
  const off = datasets.map((name) => owner.data.dataset(name).subscribe((event) => {
    if (event.vaultGeneration < generation) return
    if (event.vaultGeneration !== generation) {
      generation = event.vaultGeneration
      revisions.clear()
    }
    if ((revisions.get(name) ?? -1) >= event.revision) return
    revisions.set(name, event.revision)
    invalidate()
  }))
  return () => off.forEach((dispose) => dispose())
}
