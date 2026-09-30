import { createIndexObserver, type PluginIndexEntry, type PluginIndexScope, type PluginIndexSnapshot } from '@valley/plugin-sdk'
import { React, readOwner } from './runtime'
import type { NoteDateSource, NoteDateIndexEntry } from './noteDates'

interface NoteIndexStore {
  get(): NoteDateIndexEntry[]
  subscribe(listener: () => void): () => void
  invalidate(): void
  dispose(): void
}

export function noteIndexScope(sources?: readonly NoteDateSource[]): PluginIndexScope {
  const fields: PluginIndexScope['fields'] = ['title', 'kind', 'excluded', 'frontmatter']
  if (!sources) return { kinds: ['note'], fields }
  if (!sources.length) return { kinds: [], fields: [] }
  const keys = [...new Set(sources.flatMap(source => [source.matchKey, source.dateField, source.startTimeField, source.endTimeField, source.labelField, ...source.showFields]).filter((key): key is string => Boolean(key)))].sort()
  return { kinds: ['note'], fields, ...(keys.length <= 64 && keys.every(key => key.length <= 1024 && !['__proto__', 'constructor', 'prototype'].includes(key)) ? { frontmatterKeys: keys } : {}) }
}

function owners() {
  return readOwner('noteIndex', api => {
    const stores = new Map<string, NoteIndexStore>()
    const pending = new Set<Promise<void>>()
    let disposed = false
    const retire = (index: ReturnType<typeof createIndexObserver>): void => {
      const release = index.dispose()
      pending.add(release)
      void release.then(() => pending.delete(release), () => {})
    }
    function createStore(scope: PluginIndexScope, key: string): NoteIndexStore {
      let index: ReturnType<typeof createIndexObserver> | undefined
      let off: (() => void) | undefined
      let snapshot: PluginIndexSnapshot = { status: 'loading', version: null, entries: [] }
      let entries: NoteDateIndexEntry[] = []
      const listeners = new Set<() => void>()
      const stop = (): void => {
        off?.(); off = undefined
        if (index) retire(index)
        index = undefined
      }
      const start = (): void => {
        if (disposed || index) return
        const current = createIndexObserver(api, scope)
        index = current
        const refresh = (): void => {
          if (index !== current) return
          snapshot = current.getSnapshot()
          if (snapshot.status === 'ready') entries = snapshot.entries.filter((entry): entry is PluginIndexEntry & NoteDateIndexEntry => typeof entry.title === 'string' && entry.kind === 'note')
          for (const listener of listeners) listener()
        }
        off = current.subscribe(refresh)
        refresh()
      }
      const store = {
        get: () => { if (snapshot.status === 'error') throw new Error(snapshot.error ?? 'Calendar note index is unavailable.'); return entries },
        subscribe(listener: () => void) {
          if (!stores.has(key)) stores.set(key, store)
          listeners.add(listener)
          start()
          return () => {
            listeners.delete(listener)
            if (!listeners.size) {
              stop()
              entries = []
              if (stores.get(key) === store) stores.delete(key)
            }
          }
        },
        invalidate: () => {
          stop()
          entries = []
          snapshot = { status: 'loading', version: null, entries }
          if (listeners.size) start()
        },
        dispose: () => { stop(); listeners.clear() }
      }
      return store
    }
    return {
      get(key: string) {
        let store = stores.get(key)
        if (!store) { store = createStore(JSON.parse(key) as PluginIndexScope, key); stores.set(key, store) }
        return store
      },
      invalidate: () => { for (const store of stores.values()) store.invalidate() },
      dispose: async () => {
        disposed = true
        for (const store of stores.values()) store.dispose()
        stores.clear()
        const results = await Promise.allSettled([...pending])
        const failure = results.find(result => result.status === 'rejected')
        if (failure?.status === 'rejected') throw failure.reason
      }
    }
  })
}

export function useNoteIndex(sources?: readonly NoteDateSource[]): NoteDateIndexEntry[] {
  const store = owners().get(JSON.stringify(noteIndexScope(sources)))
  return React.useSyncExternalStore(store.subscribe, store.get, store.get)
}
