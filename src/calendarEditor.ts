import type { MountedPluginView, PluginEditorProvider, PluginEditorSnapshot } from '@valley/plugin-sdk'
import type { TextFileWithBaseline } from '@valley/plugin-sdk/types'
import { React, api } from './runtime'

export class CalendarFileEditor {
  readonly instanceId = crypto.randomUUID()
  private readonly owner: typeof api
  private readonly listeners = new Set<() => void>()
  private readonly locks = new Set<string>()
  private sequence = 0
  private generation = 0
  private active = false
  private disposed = false
  private draft = false
  private pendingReload = false
  private disposeRegistration?: () => void
  private disposeChanges?: () => void
  private snapshot: PluginEditorSnapshot = { revision: `${this.instanceId}:0`, dirty: false, readiness: 'loading' }
  baseline: TextFileWithBaseline | null = null
  error = ''

  constructor(readonly path: string, readonly mountedView?: MountedPluginView) { this.owner = api }

  readonly getSnapshot = (): PluginEditorSnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly provider: PluginEditorProvider = {
    getSnapshot: this.getSnapshot,
    subscribe: this.subscribe,
    prepare: (revision, request) => {
      if (!this.active || revision !== this.snapshot.revision || (request.ownSave
        ? this.snapshot.readiness !== 'saving' || this.locks.size > 0
        : this.snapshot.readiness !== 'ready' || this.snapshot.dirty)) throw new Error('Calendar draft is not ready for this mutation.')
      this.locks.add(request.fenceId)
      this.publish()
      let released = false
      return {
        validate: () => {
          if (released || !this.active || !this.locks.has(request.fenceId)) throw new Error('Calendar editor lease expired.')
          return this.snapshot
        },
        release: () => {
          if (released) return
          released = true
          this.locks.delete(request.fenceId)
          this.publish()
          if (this.pendingReload && !this.locked) void this.reload()
        }
      }
    }
  }

  get locked(): boolean { return this.locks.size > 0 || this.snapshot.readiness === 'saving' }

  start(): () => void {
    if (this.disposed) throw new Error('The Calendar editor is disposed.')
    this.active = true
    this.disposeRegistration = this.mountedView
      ? this.owner.vault.editors.register(this.mountedView, this.provider)
      : this.owner.vault.editors.registerDocument(this.path, this.instanceId, this.provider)
    this.disposeChanges = this.owner.vault.onChanged(info => {
      if (!info.full && !info.changes.some(change => change.relPath === this.path)) return
      this.pendingReload = true
      if (!this.locked) void this.reload()
    })
    void this.reload()
    return () => {
      if (this.disposed) return
      const terminal = this.snapshot
      const clean = terminal.readiness === 'ready' && !terminal.dirty && !this.locked
      this.active = false
      this.disposed = true
      this.generation++
      this.snapshot = clean ? terminal : { ...terminal, readiness: 'uncertain' }
      this.publish()
      this.disposeChanges?.()
      this.disposeRegistration?.()
    }
  }

  attachDraft(dirty = false): () => void {
    if (!this.active || this.draft || this.locked) throw new Error('Calendar editor already has a draft or a mutation in progress.')
    this.draft = true
    this.update({ dirty })
    return () => {
      this.draft = false
      if (!this.active) return
      if (this.snapshot.dirty || this.snapshot.readiness !== 'ready' || this.locked) this.update({ readiness: 'uncertain' })
    }
  }

  async discardDraft(): Promise<boolean> {
    if (!this.active || this.locked) return false
    this.draft = false
    await this.reload()
    if (!this.active || this.locked || this.snapshot.readiness !== 'ready') { this.draft = true; return false }
    this.update({ dirty: false })
    return true
  }

  change(): boolean {
    if (!this.active || this.locked || this.snapshot.readiness !== 'ready') return false
    this.update({ dirty: true })
    return true
  }

  async save(content: string, revision: string, validateBeforeEffect?: () => Promise<void>): Promise<void> {
    if (!this.active || this.locked || this.snapshot.readiness !== 'ready' || !this.baseline || revision !== this.snapshot.revision) throw new Error('Calendar file changed. Your draft is preserved.')
    const baseline = this.baseline.baseline
    await validateBeforeEffect?.()
    if (!this.active || this.locked || this.snapshot.readiness !== 'ready' || revision !== this.snapshot.revision || this.baseline?.baseline !== baseline) throw Object.assign(new Error('Calendar file changed before save. Your draft is preserved.'), { code: 'REVISION_CONFLICT', outcome: 'not-applied' })
    this.snapshot = { ...this.snapshot, readiness: 'saving' }
    this.publish()
    try {
      const result = this.mountedView
        ? await this.owner.vault.editors.save(this.mountedView, content, baseline, revision)
        : await this.owner.vault.editors.saveDocument(this.path, this.instanceId, content, baseline, revision)
      if (!this.active || revision !== this.snapshot.revision || !result.ok) throw new Error('Calendar file changed or could not be saved. Your draft is preserved.')
      this.baseline = { content, baseline: result.baseline }
      this.pendingReload = false
      this.error = ''
      this.update({ dirty: false, readiness: 'ready' })
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      this.update({ readiness: 'uncertain' })
      throw error
    }
  }

  private async reload(): Promise<void> {
    if (!this.active || this.locked) return
    this.pendingReload = false
    if (this.draft && this.baseline) {
      this.error = 'Calendar file changed. Your draft is preserved.'
      this.update({ readiness: 'uncertain' })
      return
    }
    const generation = ++this.generation
    this.update({ readiness: 'loading' })
    try {
      const baseline = await this.owner.vault.readFileBaseline(this.path)
      if (!this.active || generation !== this.generation) return
      if (!baseline?.baseline) throw new Error('Calendar file could not be loaded.')
      this.baseline = baseline
      this.error = ''
      this.update({ readiness: 'ready' })
    } catch (error) {
      if (!this.active || generation !== this.generation) return
      this.error = String(error)
      this.update({ readiness: 'uncertain' })
    }
  }

  private update(patch: Partial<PluginEditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, revision: `${this.instanceId}:${++this.sequence}` }
    this.publish()
  }

  private publish(): void {
    this.snapshot = { ...this.snapshot }
    for (const listener of this.listeners) listener()
  }
}

export function useCalendarFileEditor(path?: string, mountedView?: MountedPluginView): CalendarFileEditor | undefined {
  const mounted = React.useRef(mountedView)
  if (mounted.current?.mountId !== mountedView?.mountId || mounted.current?.generation !== mountedView?.generation) mounted.current = mountedView
  const stableView = mounted.current
  const editor = React.useMemo(() => path ? new CalendarFileEditor(path, stableView) : undefined, [path, stableView])
  React.useLayoutEffect(() => editor?.start(), [editor])
  return editor
}
