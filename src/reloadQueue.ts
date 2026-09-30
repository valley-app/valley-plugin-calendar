import type { ValleyPluginApi } from '@valley/plugin-sdk'

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

export function createRevisionCache<K, V>(
  read: (key: K, assertCurrent: () => void) => Promise<V>,
  capacity = 32,
  reusable: (value: V) => boolean = () => true
): {
  read: (key: K) => Promise<V>
  invalidate: () => void
  subscribe: (listener: () => void) => () => void
  dispose: () => void
} {
  const entries = new Map<K, { revision: number; value?: V; pending?: Promise<V> }>()
  const listeners = new Set<() => void>()
  let revision = 0
  let disposed = false
  const prune = (): void => {
    for (const [key, entry] of entries) {
      if (entries.size <= capacity) break
      if (!entry.pending) entries.delete(key)
    }
  }
  return {
    read: (key) => {
      if (disposed) return Promise.reject(new Error('Calendar read owner is disposed.'))
      let entry = entries.get(key)
      if (entry) {
        entries.delete(key)
        entries.set(key, entry)
        if (entry.pending) return entry.pending
        if (entry.revision === revision) return Promise.resolve(entry.value as V)
      } else {
        if (entries.size >= capacity) {
          const settled = [...entries].find(([, value]) => !value.pending)
          if (!settled) return Promise.reject(new Error('Calendar has too many pending read ranges.'))
          entries.delete(settled[0])
        }
        entry = { revision: -1 }
        entries.set(key, entry)
      }
      const current = entry
      current.pending = (async () => {
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
          if (reusable(value)) {
            current.value = value
            current.revision = accepted
          }
          return value
        }
        throw new Error('Calendar read owner is disposed.')
      })().finally(() => { current.pending = undefined; prune() })
      prune()
      return current.pending
    },
    invalidate: () => {
      if (disposed) return
      revision++
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      if (!disposed) listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => { disposed = true; entries.clear(); listeners.clear() }
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
