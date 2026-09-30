import type {
  CalendarItemAction,
  CalendarItemPatch,
  CalendarSourceItem,
  CalendarItemSourceIntegration,
  CalendarItemSourcePage,
  InteropServiceProvider,
  ValleyPluginApi
} from '@valley/plugin-sdk'
import {
  CALENDAR_ITEM_SOURCE_REVISION_V1,
  CALENDAR_ITEM_SOURCE_V1,
  CALENDAR_ITEM_SOURCE_V2,
  CALENDAR_ITEM_SOURCE_PAGE_LIMIT,
  CALENDAR_ITEM_SOURCE_TOTAL_LIMIT,
  CALENDAR_ITEM_ACTION_EDIT,
  type CalendarItemSourceV2
} from '@valley/plugin-sdk'
import { React, api, readOwner } from './runtime'
import { providerSourceKey } from './settingsStore'
import { uiText } from './localization'
import { createReloadQueue, createRevisionCache } from './reloadQueue'

export interface SourcedItem {
  sourceId: string
  sourceOwner: string
  labelKey: string
  item: CalendarSourceItem
  editable: boolean
}

export interface CalendarSourceProvider {
  sourceId: string
  sourceKey: string
  owner: string
  version: string
  methods: readonly string[]
  integration?: CalendarItemSourceIntegration
}

type SourceProvider = InteropServiceProvider<CalendarItemSourceV2>

function sources(owner = api): readonly SourceProvider[] {
  return owner.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)
}

function isIntegration(value: unknown): value is CalendarItemSourceIntegration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const integration = value as Partial<CalendarItemSourceIntegration>
  return typeof integration.name === 'string' && typeof integration.version === 'string'
}

export function sourceDescriptors(): CalendarSourceProvider[] {
  return sources().map((source) => ({
    sourceId: source.providerId,
    sourceKey: providerSourceKey(source.owner),
    owner: source.owner,
    version: source.version,
    methods: source.methods,
    integration: isIntegration(source.metadata) ? source.metadata : undefined
  }))
}

export function useCalendarSourceProviders(): CalendarSourceProvider[] {
  const [providers, setProviders] = React.useState<CalendarSourceProvider[]>(sourceDescriptors)
  React.useEffect(() => {
    const refresh = () => setProviders(sourceDescriptors())
    const off = api.interop.services.subscribe(CALENDAR_ITEM_SOURCE_V2, refresh)
    refresh()
    return off
  }, [])
  return providers
}

function sourceById(sourceId: string): SourceProvider | null {
  return sources().find((source) => source.providerId === sourceId) ?? null
}

function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

function isSourceItem(value: unknown): value is CalendarSourceItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const text = (value: unknown): value is string => typeof value === 'string'
  const optionalText = (value: unknown): boolean => value === undefined || text(value)
  const time = (value: unknown): boolean => value === undefined || text(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  const location = item.location as CalendarSourceItem['location']
  const document = item.documentRef as CalendarSourceItem['documentRef']
  return text(item.id) && !!item.id.trim() && text(item.title) && !!item.title.trim()
    && isCalendarDate(item.date)
    && (item.endDate === undefined || isCalendarDate(item.endDate) && item.endDate >= item.date)
    && time(item.startTime) && time(item.endTime)
    && (item.endTime === undefined || item.startTime !== undefined)
    && (item.endTime === undefined || item.endDate !== undefined && item.endDate > item.date || String(item.endTime) > String(item.startTime))
    && ['completed', 'readOnly'].every(key => item[key] === undefined || typeof item[key] === 'boolean')
    && ['filePath', 'note', 'priority', 'status', 'group', 'color', 'borderColor', 'icon'].every(key => optionalText(item[key]))
    && ['tags', 'urls', 'attachments', 'badges'].every(key => item[key] === undefined || Array.isArray(item[key]) && item[key].every(text))
    && (item.fields === undefined || Array.isArray(item.fields) && item.fields.every(field => field && text(field.key) && text(field.value)))
    && (location === undefined || !!location && !Array.isArray(location) && text(location.name)
      && (location.lat === undefined || typeof location.lat === 'number' && Number.isFinite(location.lat) && Math.abs(location.lat) <= 90)
      && (location.lng === undefined || typeof location.lng === 'number' && Number.isFinite(location.lng) && Math.abs(location.lng) <= 180))
    && (document === undefined || !!document && text(document.pluginId) && text(document.sourceId) && text(document.itemId))
}

export interface CalendarSourceError { owner: string; message: string }
interface SourceRead { items: SourcedItem[]; errors: CalendarSourceError[]; complete: boolean }
const EMPTY_SOURCE_READ: SourceRead = { items: [], errors: [], complete: false }

export function listSourcedItems(strict = false, startDate = '0001-01-01', endDate = '9999-12-31'): Promise<SourcedItem[]> {
  return sourceReads().read(JSON.stringify([strict, startDate, endDate])).then(result => result.items)
}

function sourceReads() {
  return readOwner('sources', (owner) => {
    const cache = createRevisionCache((key: string, assertCurrent) => {
      const [strict, startDate, endDate] = JSON.parse(key) as [boolean, string, string]
      return readSourcedItems(owner, strict, startDate, endDate, assertCurrent)
    }, 32, result => result.complete)
    const signature = (): string => JSON.stringify([
      [...sources(owner), ...owner.interop.services.providers(CALENDAR_ITEM_SOURCE_V1)].map(({ providerId, owner, sessionId, version, methods, metadata }) => [providerId, owner, sessionId, version, methods, metadata]),
      owner.interop.state.providers(CALENDAR_ITEM_SOURCE_REVISION_V1).map(({ providerId, owner, sessionId, version, value }) => [providerId, owner, sessionId, version, value])
    ])
    let previous = signature()
    const changed = (): void => {
      const next = signature()
      if (next === previous) return
      previous = next
      cache.invalidate()
    }
    const offs = [
      owner.interop.services.subscribe(CALENDAR_ITEM_SOURCE_V1, changed),
      owner.interop.services.subscribe(CALENDAR_ITEM_SOURCE_V2, changed),
      owner.interop.state.subscribe(CALENDAR_ITEM_SOURCE_REVISION_V1, changed)
    ]
    return { ...cache, dispose: () => { offs.forEach(off => off()); cache.dispose() } }
  })
}

async function readSourcedItems(owner: ValleyPluginApi, strict: boolean, startDate: string, endDate: string, assertCurrent: () => void): Promise<SourceRead> {
  assertCurrent()
  const providers = sources(owner)
  const compatible = new Set(providers.map(source => source.owner))
  const errors: CalendarSourceError[] = owner.interop.services.providers(CALENDAR_ITEM_SOURCE_V1)
    .filter(source => !compatible.has(source.owner))
    .map(source => ({ owner: source.owner, message: uiText('calendar.source.incompatible', { owner: source.owner }) }))
  let total = 0
  const results = await Promise.allSettled(providers.map(async source => {
    const items: SourcedItem[] = []
    const ids = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    let revision: string | undefined
    for (let pageNumber = 0; pageNumber < CALENDAR_ITEM_SOURCE_TOTAL_LIMIT; pageNumber++) {
      assertCurrent()
      const result = await source.invoke('list', [{ startDate, endDate, limit: CALENDAR_ITEM_SOURCE_PAGE_LIMIT, ...(cursor ? { cursor } : {}) }])
      assertCurrent()
      if (!result.ok) throw new Error(result.error.message)
      const page = result.value as CalendarItemSourcePage
      if (!page || !Array.isArray(page.items) || page.items.length > CALENDAR_ITEM_SOURCE_PAGE_LIMIT || typeof page.revision !== 'string' || !page.revision || revision !== undefined && revision !== page.revision) throw new Error(uiText('calendar.source.pageRevision'))
      revision = page.revision
      if (total + page.items.length > CALENDAR_ITEM_SOURCE_TOTAL_LIMIT) throw new Error(uiText('calendar.source.rangeLimit', { limit: CALENDAR_ITEM_SOURCE_TOTAL_LIMIT }))
      total += page.items.length
      for (const item of page.items) {
        if (!isSourceItem(item) || ids.has(item.id) || item.date > endDate || (item.endDate ?? item.date) < startDate) throw new Error(uiText('calendar.source.invalidItems'))
        ids.add(item.id)
        items.push({ sourceId: source.providerId, sourceOwner: source.owner, labelKey: `plugin.${source.owner}.name`, item, editable: !item.readOnly && (source.methods.includes('update') || source.methods.includes('remove')) })
      }
      if (!page.cursor) return items
      if (typeof page.cursor !== 'string' || cursors.has(page.cursor) || !page.items.length) throw new Error(uiText('calendar.source.cursor'))
      cursors.add(page.cursor)
      cursor = page.cursor
    }
    throw new Error(uiText('calendar.source.pageBudget'))
  }))
  assertCurrent()
  const items = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value
    errors.push({ owner: providers[index].owner, message: uiText('calendar.source.failed', { owner: providers[index].owner, message: result.reason instanceof Error ? result.reason.message : uiText('calendar.source.unavailable') }) })
    return []
  })
  if (strict && errors.length) throw new Error(errors.map(error => error.message).join(' '))
  return { items, errors, complete: !errors.length }
}

export function useSourcedItems(startDate = '0001-01-01', endDate = '9999-12-31'): { items: SourcedItem[]; errors: CalendarSourceError[]; reload: () => void } {
  const key = JSON.stringify([false, startDate, endDate])
  const [snapshot, setSnapshot] = React.useState<{ key: string; value: SourceRead }>({ key, value: EMPTY_SOURCE_READ })
  const reads = React.useRef<ReturnType<typeof sourceReads> | null>(null)
  const reload = React.useCallback(() => { reads.current?.invalidate() }, [])
  React.useEffect(() => {
    const cache = sourceReads()
    const current = createReloadQueue(() => cache.read(key), value => setSnapshot({ key, value }), error => console.error('[calendar] item sources reload failed', error))
    reads.current = cache
    const off = cache.subscribe(() => { void current.reload() })
    void current.reload()
    return () => {
      current.dispose()
      if (reads.current === cache) reads.current = null
      off()
    }
  }, [reload, key])
  const value = snapshot.key === key ? snapshot.value : EMPTY_SOURCE_READ
  return { items: value.items, errors: value.errors, reload }
}

async function invokeBoolean(
  sourceId: string,
  method: keyof CalendarItemSourceV2 & string,
  args: readonly unknown[]
): Promise<boolean> {
  const source = sourceById(sourceId)
  if (!source?.methods.includes(method)) return false
  const reads = sourceReads()
  const result = await source.invoke(method, args)
  if (result.ok && result.value === true) reads.invalidate()
  return result.ok && result.value === true
}

export function updateSourcedItem(
  sourceId: string,
  itemId: string,
  patch: CalendarItemPatch
): Promise<boolean> {
  return invokeBoolean(sourceId, 'update', [itemId, patch])
}

export function removeSourcedItem(sourceId: string, itemId: string): Promise<boolean> {
  return invokeBoolean(sourceId, 'remove', [itemId])
}

export function createSourcedItem(
  sourceId: string,
  date: string,
  patch: CalendarItemPatch
): Promise<boolean> {
  if (!isSourceItem({ ...patch, id: 'new', date })) return Promise.resolve(false)
  return invokeBoolean(sourceId, 'create', [date, patch])
}

export async function openSourcedItem(sourceId: string, itemId: string): Promise<boolean> {
  const source = sourceById(sourceId)
  if (!source?.methods.includes('open')) return false
  const result = await source.invoke('open', [itemId])
  return result.ok
}

function isItemAction(value: unknown): value is CalendarItemAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const action = value as Partial<CalendarItemAction>
  return typeof action.id === 'string' && typeof action.label === 'string'
}

/**
 * The provider's own menu entries for one item. An older provider has no
 * `actions` method at all, so an empty list is the normal answer, not a failure
 * — the surface still renders whatever it offers on its own.
 */
export async function sourcedItemActions(sourceId: string, itemId: string): Promise<CalendarItemAction[]> {
  const source = sourceById(sourceId)
  if (!source?.methods.includes('actions')) return []
  const result = await source.invoke('actions', [itemId])
  if (!result.ok) {
    console.error(`[calendar] item source "${source.owner}" failed: ${result.error.message}`)
    return []
  }
  return Array.isArray(result.value) ? result.value.filter(isItemAction) : []
}

export function runSourcedItemAction(sourceId: string, itemId: string, actionId: string): Promise<boolean> {
  return invokeBoolean(sourceId, 'runAction', [itemId, actionId])
}

export async function editSourcedItem(sourceId: string, itemId: string): Promise<void> {
  if (await runSourcedItemAction(sourceId, itemId, CALENDAR_ITEM_ACTION_EDIT)) return
  await api.ui.confirm({
    title: uiText('calendar.editor.unavailable'),
    message: uiText('calendar.editor.retry'),
    actions: [{ label: uiText('calendar.editor.close'), value: 'close' }]
  })
}

export function creatableSources(): { id: string; labelKey: string; label: string }[] {
  return sources()
    .filter((source) => source.methods.includes('create') && !((api.settings.get().hiddenSources as string[] | undefined) ?? []).includes(providerSourceKey(source.owner)))
    .map((source) => { const integration = isIntegration(source.metadata) ? source.metadata : undefined; return { id: source.providerId, labelKey: `plugin.${source.owner}.name`, label: integration?.localized?.[api.ui.language()]?.name ?? integration?.name ?? source.owner } })
}

export async function configureSource(sourceId: string): Promise<boolean> {
  const source = sourceById(sourceId)
  if (!source?.methods.includes('configure')) return false
  const result = await source.invoke('configure')
  return result.ok
}
