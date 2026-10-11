import type { MountedPluginView, PluginEditorSnapshot, ValleyPluginApi } from '@valley/plugin-sdk'
import type { TimeControlState } from '@valley/plugin-sdk/types'
import type { CommandContext, CommandFileTarget } from '@valley/plugin-sdk/commands'
import { isRealCalendarDate } from '@valley/plugin-sdk/datePattern'
import { React, api } from './runtime'
import type { EventLocation } from './fields'

const text = (maximum = 65536) => ({ type: 'string', maxLength: maximum })
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const dateSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', maxLength: 10 }
const locationSchema = { anyOf: [{ type: 'null' }, object({ name: text(4096), lat: { type: 'number', minimum: -90, maximum: 90 }, lng: { type: 'number', minimum: -180, maximum: 180 } }, ['name'])] }
const formProperties = {
  title: text(), date: dateSchema, endDate: text(10), start: text(5), end: text(5), allDay: { type: 'boolean' }, location: locationSchema,
  tags: { type: 'array', items: text(4096), maxItems: 256 }, note: text(), filePath: text(32768), details: { type: 'boolean' }, recurrenceScope: { enum: ['occurrence', 'series'] }
}
const targetSchema = object({ mountId: text(256), generation: { type: 'integer', minimum: 0 } })
const action = (type: string, properties: Record<string, unknown> = {}, required = Object.keys(properties)) => object({ type: { const: type }, ...properties }, ['type', ...required])
export const calendarFileControlSchema = { oneOf: [
  action('view', { view: { enum: ['week', 'month', 'year'] } }), ...['previous', 'next', 'today', 'history-back', 'history-forward'].map(type => action(type)),
  action('select-date', { date: dateSchema }), action('select-week', { date: dateSchema }), action('range', { start: dateSchema, end: dateSchema }), action('select-item', { key: text(4096) }),
  action('form-patch', { patch: { ...object(formProperties, []), minProperties: 1 } }),
  ...['url-add', 'url-remove', 'attachment-add', 'attachment-remove'].map(type => action(type, { value: text(32768) }))
] }
export const calendarFileExecuteSchema = { oneOf: [action('open-daily-note', { date: dateSchema }), action('open-editor', { date: dateSchema, start: text(5), end: text(5) }, ['date']), action('edit-item', { key: text(4096) }), action('cancel'), action('url-open', { value: text(32768) }), action('attachment-open', { value: text(32768) })] }
export const calendarFileSaveSchema = { oneOf: [action('save'), action('delete-item', { key: text(4096) })] }

type FormPatch = Partial<{ title: string; date: string; endDate: string; start: string; end: string; allDay: boolean; location: EventLocation | null; tags: string[]; note: string; filePath: string; details: boolean; recurrenceScope: 'occurrence' | 'series' }>
export type CalendarFileAction = { type: 'view'; view: 'week' | 'month' | 'year' } | { type: 'select-date' | 'select-week' | 'open-daily-note'; date: string } | { type: 'range'; start: string; end: string } | { type: 'select-item' | 'edit-item' | 'delete-item'; key: string } | { type: 'open-editor'; date: string; start?: string; end?: string } | { type: 'form-patch'; patch: FormPatch } | { type: 'url-add' | 'url-remove' | 'attachment-add' | 'attachment-remove' | 'url-open' | 'attachment-open'; value: string } | { type: 'previous' | 'next' | 'today' | 'history-back' | 'history-forward' | 'cancel' | 'save' }
export interface CalendarFileViewState {
  view: TimeControlState['view']; cursor: string; selectedDate: string | null; rangeStart: string | null; rangeEnd: string | null
  canGoBack: boolean; canGoForward: boolean; selectedItemKey: string | null
  items: { key: string; title: string; date: string; readOnly: boolean }[]
  editor: PluginEditorSnapshot
}
export interface CalendarFileFormState {
  title: string; date: string; endDate: string; start: string; end: string; allDay: boolean; location: EventLocation | null; tags: string[]; note: string; urls: string[]; attachments: string[]; filePath: string; details: boolean; recurrenceScope: 'occurrence' | 'series'; busy: boolean; frozen: boolean; readOnly: boolean; isNew: boolean
}
export interface CalendarFileActionContext { validate(targets?: CommandFileTarget[]): Promise<void>; targets: readonly CommandFileTarget[] }
/** `targets` declares the extra vault files an action reads or writes besides the mounted file; the command's fileTargets resolver publishes them, so `validate()` re-checks exactly the declared set. */
export interface CalendarFileController { snapshot(): CalendarFileViewState | CalendarFileFormState; actions: Partial<Record<CalendarFileAction['type'], (action: CalendarFileAction, context: CalendarFileActionContext) => void | Promise<unknown>>>; targets?: Partial<Record<CalendarFileAction['type'], (action: CalendarFileAction) => CommandFileTarget[] | Promise<CommandFileTarget[]>>> }
interface Entry { target: MountedPluginView; controllers: Map<'view' | 'form', { token: symbol; current: CalendarFileController }>; revision: string; signature: string; pending: boolean }
const runtimeState = (ownerApi = api) => ownerApi.runtime.getOrCreate('calendar.fileActions', () => ({ owners: new Map<string, Entry>(), id: crypto.randomUUID(), sequence: 0 }))
const keyOf = (target: Pick<MountedPluginView, 'mountId' | 'generation'>): string => JSON.stringify([target.mountId, target.generation])
const refused = (code: string, message: string): Error => Object.assign(new Error(message), { code, outcome: 'not-applied' })
const nextRevision = (ownerApi = api): string => { const state = runtimeState(ownerApi); return `${state.id}:${++state.sequence}` }

function record(raw: unknown, keys: readonly string[], required = keys): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !keys.includes(key)) || required.some(key => !(key in raw))) throw new Error('Expected a strict Calendar file action object.')
  return raw as Record<string, unknown>
}
function boundedText(raw: unknown, maximum = 65536): string { if (typeof raw !== 'string' || raw.length > maximum) throw new Error('Calendar action text is invalid or exceeds its bound.'); return raw }
function date(raw: unknown): string {
  const value = boundedText(raw, 10), parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts || !isRealCalendarDate(Number(parts[1]), Number(parts[2]), Number(parts[3]))) throw new Error('Expected a valid Calendar date.')
  return value
}
function time(raw: unknown): string { const value = boundedText(raw, 5); if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Expected a Calendar time in HH:mm format.'); return value }
const controlTypes = ['view', 'previous', 'next', 'today', 'history-back', 'history-forward', 'select-date', 'select-week', 'range', 'select-item', 'form-patch', 'url-add', 'url-remove', 'attachment-add', 'attachment-remove']
const executeTypes = ['open-daily-note', 'open-editor', 'edit-item', 'cancel', 'url-open', 'attachment-open']
const saveTypes = ['save', 'delete-item']
// Openers hand off to another surface that may unmount this view; their own resolution is the outcome, checked for currency before the handoff.
const openerTypes = ['url-open', 'attachment-open', 'open-daily-note']
function parseAction(raw: unknown, types: readonly string[]): CalendarFileAction {
  const type = record(raw, ['type', 'view', 'date', 'start', 'end', 'key', 'patch', 'value'], ['type']).type
  if (typeof type !== 'string' || !types.includes(type)) throw new Error('This action is unavailable through this Calendar command effect.')
  if (type === 'view') { const input = record(raw, ['type', 'view']); if (!['week', 'month', 'year'].includes(String(input.view))) throw new Error('Expected a Calendar view.'); return { type, view: input.view as 'week' | 'month' | 'year' } }
  if (['select-date', 'select-week', 'open-daily-note'].includes(type)) { const input = record(raw, ['type', 'date']); return { type, date: date(input.date) } as CalendarFileAction }
  if (type === 'range') { const input = record(raw, ['type', 'start', 'end']); return { type, start: date(input.start), end: date(input.end) } }
  if (type === 'open-editor') { const input = record(raw, ['type', 'date', 'start', 'end'], ['type', 'date']); return { type, date: date(input.date), ...(input.start === undefined ? {} : { start: time(input.start) }), ...(input.end === undefined ? {} : { end: time(input.end) }) } }
  if (['select-item', 'edit-item', 'delete-item'].includes(type)) { const input = record(raw, ['type', 'key']); const key = boundedText(input.key, 4096); if (!key) throw new Error('Expected the exact Calendar item key.'); return { type, key } as CalendarFileAction }
  if (type === 'form-patch') {
    const input = record(raw, ['type', 'patch']), patch = record(input.patch, Object.keys(formProperties), [])
    if (!Object.keys(patch).length) throw new Error('Expected one or more Calendar draft fields.')
    for (const [key, value] of Object.entries(patch)) {
      if (['allDay', 'details'].includes(key)) { if (typeof value !== 'boolean') throw new Error('Expected a Calendar boolean field.') }
      else if (key === 'location') {
        if (value !== null) { const point = record(value, ['name', 'lat', 'lng'], ['name']); boundedText(point.name, 4096); if ((point.lat === undefined) !== (point.lng === undefined) || point.lat !== undefined && (typeof point.lat !== 'number' || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || typeof point.lng !== 'number' || !Number.isFinite(point.lng) || Math.abs(point.lng) > 180)) throw new Error('Expected a valid Calendar location.') }
      } else if (key === 'tags') { if (!Array.isArray(value) || value.length > 256) throw new Error('Expected bounded Calendar tags.'); value.forEach(item => boundedText(item, 4096)) }
      else if (key === 'recurrenceScope') { if (value !== 'occurrence' && value !== 'series') throw new Error('Expected a recurrence scope.') }
      else if (key === 'date') date(value)
      else if (key === 'endDate') { if (value !== '') date(value) }
      else if (key === 'start' || key === 'end') time(value)
      else boundedText(value, key === 'filePath' ? 32768 : 65536)
    }
    return { type, patch: patch as FormPatch }
  }
  if (type.includes('url-') || type.includes('attachment-')) { const input = record(raw, ['type', 'value']); return { type, value: boundedText(input.value, 32768) } as CalendarFileAction }
  record(raw, ['type']); return { type } as CalendarFileAction
}
function parseInput(raw: unknown, types?: readonly string[]) {
  const input = record(raw, types ? ['target', 'expectedRevision', 'action'] : ['target'])
  const target = record(input.target, ['mountId', 'generation'])
  const mountId = boundedText(target.mountId, 256)
  if (!mountId || !Number.isSafeInteger(target.generation) || Number(target.generation) < 0) throw new Error('Expected an exact Calendar mount and generation.')
  return { target: { mountId, generation: Number(target.generation) }, ...(types ? { expectedRevision: boundedText(input.expectedRevision, 256), action: parseAction(input.action, types) } : {}) }
}
function owner(target: Pick<MountedPluginView, 'mountId' | 'generation'>, ownerApi = api): Entry {
  const entry = runtimeState(ownerApi).owners.get(keyOf(target))
  if (!entry?.controllers.has('view')) throw refused('TARGET_REPLACED', 'The exact Calendar file view is unavailable. Inspect its current mount again.')
  return entry
}
function inspect(entry: Entry, ownerApi = api) {
  const view = entry.controllers.get('view')!.current.snapshot() as CalendarFileViewState
  const form = entry.controllers.get('form')?.current.snapshot() as CalendarFileFormState | undefined
  const signature = JSON.stringify({ view, form: form ?? null })
  if (new TextEncoder().encode(signature).byteLength > 131072) throw refused('OUTPUT_TOO_LARGE', 'This Calendar inspection exceeds its complete response bound.')
  if (entry.signature !== signature) { entry.signature = signature; entry.revision = nextRevision(ownerApi) }
  return { target: { mountId: entry.target.mountId, generation: entry.target.generation }, filePath: entry.target.filePath, revision: entry.revision, view, form: form ?? null }
}
export function useCalendarFileActions(target: MountedPluginView | undefined, part: 'view' | 'form', controller: CalendarFileController): void {
  const latest = React.useRef(controller); latest.current = controller
  const [ownerApi] = React.useState(() => api)
  const key = target ? keyOf(target) : null
  React.useEffect(() => {
    if (!key || !target) return
    const state = runtimeState(ownerApi), token = Symbol()
    let entry = state.owners.get(key)
    if (!entry) { entry = { target, controllers: new Map(), revision: nextRevision(ownerApi), signature: '', pending: false }; state.owners.set(key, entry) }
    if (entry.controllers.has(part)) throw new Error('This exact Calendar controller is already registered.')
    entry.controllers.set(part, { token, current: { snapshot: () => latest.current.snapshot(), actions: Object.fromEntries(Object.keys(controller.actions).map(type => [type, (action: CalendarFileAction, context: CalendarFileActionContext) => latest.current.actions[action.type]?.(action, context)])), targets: Object.fromEntries(Object.keys(controller.actions).map(type => [type, (action: CalendarFileAction) => latest.current.targets?.[action.type]?.(action) ?? []])) } })
    entry.revision = nextRevision(ownerApi); entry.signature = ''
    const captured = entry
    return () => {
      if (captured.controllers.get(part)?.token !== token) return
      captured.controllers.delete(part); captured.revision = nextRevision(ownerApi); captured.signature = ''
      if (part === 'view' && state.owners.get(key) === captured) state.owners.delete(key)
    }
  }, [ownerApi, key, part])
}

export function registerCalendarFileCommands(pluginApi: ValleyPluginApi): () => void {
  const ownerApi = pluginApi
  const inputSchema = (actions?: Record<string, unknown>) => object({ target: targetSchema, ...(actions ? { expectedRevision: text(256), action: actions } : {}) })
  const editorSchema = object({ revision: text(256), dirty: { type: 'boolean' }, readiness: { enum: ['loading', 'ready', 'saving', 'uncertain'] } })
  const formSchema = object({ ...formProperties, urls: { type: 'array', items: text(32768), maxItems: 256 }, attachments: { type: 'array', items: text(32768), maxItems: 256 }, busy: { type: 'boolean' }, frozen: { type: 'boolean' }, readOnly: { type: 'boolean' }, isNew: { type: 'boolean' } })
  const viewSchema = object({ view: { enum: ['week', 'month', 'year'] }, cursor: dateSchema, selectedDate: { anyOf: [dateSchema, { type: 'null' }] }, rangeStart: { anyOf: [dateSchema, { type: 'null' }] }, rangeEnd: { anyOf: [dateSchema, { type: 'null' }] }, canGoBack: { type: 'boolean' }, canGoForward: { type: 'boolean' }, selectedItemKey: { anyOf: [text(4096), { type: 'null' }] }, items: { type: 'array', maxItems: 1000, items: object({ key: text(4096), title: text(), date: dateSchema, readOnly: { type: 'boolean' } }) }, editor: editorSchema })
  const inspectionSchema = object({ target: targetSchema, filePath: text(32768), revision: text(256), view: viewSchema, form: { anyOf: [formSchema, { type: 'null' }] } })
  const resultSchema = object({ status: { const: 'queued' }, target: targetSchema, action: text(256), originalRevision: text(256) })
  const revisionRequirements = [{ argument: 'expectedRevision', inspectionCommand: 'calendar:file-view-inspect', description: 'Revision of the exact mounted Calendar file view and its current raw form, including editor readiness.' }]
  const fileTargets = async (input: ReturnType<typeof parseInput>, write = false): Promise<CommandFileTarget[]> => {
    const entry = owner(input.target, ownerApi), action = input.action
    const controller = action ? [...entry.controllers.values()].find(controller => controller.current.actions[action.type]) : undefined
    return [{ kind: 'file', path: entry.target.filePath, fileOperation: write ? 'write' : 'read' }, ...(action ? await controller?.current.targets?.[action.type]?.(action) ?? [] : [])]
  }
  const invoke = async (input: ReturnType<typeof parseInput>, context: CommandContext) => {
    const entry = owner(input.target, ownerApi), observation = inspect(entry, ownerApi)
    if (entry.pending || !input.action || observation.revision !== input.expectedRevision) throw refused('REVISION_CONFLICT', 'Calendar controls or draft changed. Inspect the exact file view again.')
    const action = input.action
    const controller = [...entry.controllers.values()].find(controller => controller.current.actions[action.type])
    if (!controller) throw refused('CONTROL_UNAVAILABLE', 'This Calendar action requires its current owning file editor or form.')
    const assertCurrent = (): void => {
      if (context.cancellation?.aborted) throw refused('CANCELLED', 'The Calendar action was cancelled before its effect.')
      if (runtimeState(ownerApi).owners.get(keyOf(input.target)) !== entry || !entry.controllers.has('view') || ![...entry.controllers.values()].includes(controller)) throw refused('TARGET_REPLACED', 'The Calendar action owner changed before its effect.')
    }
    const authorized = await fileTargets(input, saveTypes.includes(action.type))
    const validate = async (targets?: CommandFileTarget[]): Promise<void> => { assertCurrent(); const before = inspect(entry, ownerApi).revision; if (context.validateBeforeRun && !await context.validateBeforeRun(targets ?? authorized)) throw refused('PERMISSION_DENIED', 'The Calendar action was denied before its effect.'); assertCurrent(); if (inspect(entry, ownerApi).revision !== before) throw refused('REVISION_CONFLICT', 'Calendar state changed while authorization was pending.') }
    await validate()
    if (inspect(entry, ownerApi).revision !== input.expectedRevision) throw refused('REVISION_CONFLICT', 'Calendar state changed while authorization was pending.')
    entry.pending = true; entry.revision = nextRevision(ownerApi)
    try {
      await controller.current.actions[action.type]!(action, { validate, targets: authorized })
      if (!openerTypes.includes(action.type) && (runtimeState(ownerApi).owners.get(keyOf(input.target)) !== entry || !entry.controllers.has('view'))) throw new Error('The Calendar file view changed after dispatch.')
      return { status: 'queued' as const, target: input.target, action: action.type, originalRevision: input.expectedRevision! }
    } catch (cause) {
      if ((cause as { outcome?: string })?.outcome === 'not-applied') throw cause
      throw Object.assign(new Error('The Calendar action was dispatched without a confirmed effect. Inspect its original execution and current file/form; do not replay it.'), { code: 'EFFECT_UNVERIFIED', outcome: 'unknown', outcomeUnknown: true, retryable: false, cause, details: { cause: { code: typeof (cause as { code?: unknown })?.code === 'string' ? (cause as { code: string }).code : null, message: cause instanceof Error ? cause.message : String(cause) } } })
    } finally { entry.pending = false; entry.revision = nextRevision(ownerApi); entry.signature = '' }
  }
  const disposers = [pluginApi.commands.register({ id: 'file-view-inspect', label: 'Calendar: inspect exact mounted file view and form', sideEffect: 'read', paletteSafe: false, input: { schema: inputSchema(), parse: raw => parseInput(raw) }, outputSchema: inspectionSchema, fileTargets, recovery: 'observational', idempotent: true, limits: { requestBytes: 131072, responseBytes: 131072 }, run: input => inspect(owner(input.target, ownerApi), ownerApi) })]
  for (const [id, types, schema, effect] of [['file-view-control', controlTypes, calendarFileControlSchema, 'write'], ['file-view-execute', executeTypes, calendarFileExecuteSchema, 'execute'], ['file-view-save', saveTypes, calendarFileSaveSchema, 'write']] as const) {
    if (effect === 'execute') disposers.push(pluginApi.commands.register({ id, label: 'Calendar: execute exact file view action', sideEffect: effect, paletteSafe: false, input: { schema: inputSchema(schema), parse: raw => parseInput(raw, types) }, outputSchema: resultSchema, fileTargets: input => fileTargets(input), revision: input => inspect(owner(input.target, ownerApi), ownerApi), revisionRequirements, recovery: 'non-replayable', idempotent: false, limits: { requestBytes: 131072, responseBytes: 131072 }, run: invoke }))
    else disposers.push(pluginApi.commands.register({ id, label: 'Calendar: change exact file view or save its observed draft', sideEffect: effect, paletteSafe: false, input: { schema: inputSchema(schema), parse: raw => parseInput(raw, types) }, outputSchema: resultSchema, fileTargets: input => fileTargets(input, id === 'file-view-save'), revision: input => inspect(owner(input.target, ownerApi), ownerApi), revisionRequirements, recovery: 'non-replayable', idempotent: false, limits: { requestBytes: 131072, responseBytes: 131072 }, preview: input => input, run: async (input, context) => ({ value: await invoke(input, context), revert: null }) }))
  }
  return () => { disposers.forEach(dispose => dispose()); runtimeState(ownerApi).owners.clear() }
}
