import { parseCalendarFile } from './calendarFiles'
import { CALENDAR_ITEM_SOURCE_REVISION_V1, CALENDAR_ITEM_SOURCE_V2, METADATA_PANEL_SEGMENT_V1, provideBookmarkSurface, type MainWorkspaceNavigationController, type PluginProperty, type PluginSurfaceSnapshot, type ValleyPluginApi } from '@valley/plugin-sdk'
import type { SlotId, TimeControlState } from '@valley/plugin-sdk/types'
import type { PluginLinkState } from '@valley/plugin-sdk/paths'
import { React, api } from './runtime'
import { calendarItemKey, type CalItem } from './items'
import { calendarLinkPatch, calendarLinkState, calendarViewMode, defaultTimeControl, saveCalendarViewMode } from './timeControl'
import { onChanged } from './events'
import { EVENTS_SOURCE_ID, HIDDEN_GROUPS_KEY, HIDDEN_SOURCES_KEY, NOTE_DATES_SOURCE_ID, readCalendarSettings, useCalendarSettings } from './settingsStore'
import { uiText } from './localization'
import { resolveCalendarTarget } from './commands'
import { sourceDescriptors, useCalendarSourceProviders } from './itemSources'
import { CalendarFilterList, NoteDateSourceFilterList } from './filters'
import { loadNoteDateSources } from './noteDateStore'
import { addDays, isoDay, isoWeek, localizedMonth, parseLocalDate, startOfWeek } from './dateMath'
import { WEEK_START_INDEX } from './lib'
import { subscribeHostField } from './hooks'
import type { InteropValueSchema } from '@valley/plugin-sdk'

const bookmarkStateSchema = {
  "type": "object",
  "properties": {
    "path": { "type": "string" },
    "v": {
      "type": "literal",
      "value": 1
    },
    "view": {
      "type": "union",
      "anyOf": [
        {
          "type": "literal",
          "value": "month"
        },
        {
          "type": "literal",
          "value": "week"
        },
        {
          "type": "literal",
          "value": "year"
        }
      ]
    },
    "cursor": {
      "type": "string"
    },
    "selectedDate": {
      "type": "union",
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "rangeStart": {
      "type": "union",
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "rangeEnd": {
      "type": "union",
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "selectedTime": {
      "type": "union",
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    },
    "timeRange": {
      "type": "union",
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "start": {
              "type": "string"
            },
            "end": {
              "type": "string"
            }
          },
          "required": [
            "start",
            "end"
          ],
          "additionalProperties": false
        },
        {
          "type": "null"
        }
      ]
    },
    "itemId": {
      "type": "string"
    },
    "kind": {
      "type": "union",
      "anyOf": [
        {
          "type": "literal",
          "value": "event"
        },
        {
          "type": "literal",
          "value": "sourced"
        },
        {
          "type": "literal",
          "value": "file"
        },
        {
          "type": "literal",
          "value": "noteDate"
        }
      ]
    },
    "date": {
      "type": "string"
    },
    "sourceId": {
      "type": "string"
    },
    "filePath": {
      "type": "string"
    }
  },
  "required": [
    "v",
    "view",
    "cursor",
    "selectedDate",
    "rangeStart",
    "rangeEnd",
    "selectedTime",
    "timeRange"
  ],
  "additionalProperties": false
} satisfies InteropValueSchema



interface CalendarSurfaces {
  time: TimeControlState
  views: Map<SlotId, TimeControlState['view']>
  selected: Map<SlotId, CalItem>
  navigation: Map<SlotId, MainWorkspaceNavigationController>
  listeners: Set<() => void>
}

function state(): CalendarSurfaces {
  return api.runtime.getOrCreate('calendar.surfaces', () => ({ time: defaultTimeControl(), views: new Map(), selected: new Map(), navigation: new Map(), listeners: new Set() }))
}

function notify(): void { for (const listener of state().listeners) listener() }

export function selectCalendarProperties(item: CalItem | null, surface: SlotId): void {
  if (item) state().selected.set(surface, item)
  else state().selected.delete(surface)
  notify()
}

export function useCalendarSurface(surface: SlotId, time: TimeControlState, navigation?: MainWorkspaceNavigationController): void {
  React.useEffect(() => {
    state().time = time
    state().views.set(surface, time.view)
    if (navigation) state().navigation.set(surface, navigation)
    notify()
  }, [surface, time, navigation])
}

function itemState(item: CalItem, surface: SlotId): PluginLinkState {
  return { ...calendarLinkState({ ...state().time, view: calendarViewMode(surface, state().views.get(surface) ?? state().time.view) }), itemId: item.id, kind: item.kind, date: item.date, sourceId: item.sourceId ?? '', filePath: item.filePath ?? '' }
}

async function resolveItem(raw: PluginLinkState): Promise<CalItem | null> {
  if (typeof raw.itemId !== 'string') return null
  if (raw.kind === 'event' || raw.kind === 'sourced') {
    return resolveCalendarTarget({ id: raw.itemId, sourceId: raw.kind === 'sourced' && typeof raw.sourceId === 'string' ? raw.sourceId : undefined })
  } else if (raw.kind === 'file' && typeof raw.filePath === 'string') {
    const parsed = parseCalendarFile(await api.vault.readFile(raw.filePath), raw.filePath, String(raw.date), String(raw.date))
    const file = parsed.entries.find(entry => entry.id === raw.itemId)
    return file ? { kind: 'file', ...file, filePath: file.path, file, readOnly: false } : null
  } else if (raw.kind === 'noteDate' && typeof raw.filePath === 'string' && await api.documents.resolve(raw.filePath)) {
    return { kind: 'noteDate', id: raw.itemId, title: raw.filePath.split('/').pop() ?? raw.filePath, date: String(raw.date ?? ''), filePath: raw.filePath, readOnly: true }
  }
  throw new Error('The bookmarked calendar item is unavailable.')
}

function snapshot(surface: SlotId, instanceId?: string): PluginSurfaceSnapshot {
  const path = surface === 'main_workspace' && instanceId && /\.(?:ics|ifb|vcs)$/i.test(instanceId) ? instanceId : undefined
  const focused = state().selected.get(surface)
  const selected = path && focused?.filePath !== path ? undefined : focused
  const file = path ? { path } : {}
  return {
    title: path?.split('/').pop() || uiText('manifest.name'), view: { ...calendarLinkState({ ...state().time, view: calendarViewMode(surface, state().views.get(surface) ?? state().time.view) }), ...file }, navigation: state().navigation.get(surface),
    ...(path ? { filePath: path } : {}),
    ...(selected ? { item: { id: calendarItemKey(selected), title: selected.title, state: { ...itemState(selected, surface), ...file } } } : {})
  }
}

function subscribe(listener: () => void): () => void {
  const listeners = state().listeners
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function viewProperties(view?: PluginLinkState): PluginProperty[] {
  const time = view ? { ...defaultTimeControl(), ...calendarLinkPatch(view) } : state().time
  const week = startOfWeek(parseLocalDate(time.selectedDate ?? isoDay(new Date())), WEEK_START_INDEX[api.getState().weekStart] ?? 1)
  return Object.entries({
    plugin: 'calendar',
    view: time.view,
    selectedDate: time.selectedDate,
    month: time.cursor.slice(0, 7),
    week: { number: isoWeek(week), start: isoDay(week), end: addDays(isoDay(week), 6) },
    year: Number(time.cursor.slice(0, 4)),
    ...(time.rangeStart && time.rangeEnd ? { range: [time.rangeStart, time.rangeEnd].sort() } : {}),
    ...(time.selectedTime ? { selectedTime: time.selectedTime } : {})
  }).map(([id, value]) => ({ id, label: uiText(`calendar.overview.${id}`), value, readOnly: true }))
}

async function contextProperties(): Promise<PluginProperty[]> {
  const settings = readCalendarSettings()
  const sources = [
    { id: EVENTS_SOURCE_ID, name: uiText('calendar.filter.events') },
    { id: NOTE_DATES_SOURCE_ID, name: uiText('calendar.filter.noteDates') },
    ...sourceDescriptors().map((source) => ({ id: source.sourceKey, name: source.integration?.localized?.[api.ui.language()]?.name ?? source.integration?.name ?? source.owner }))
  ].filter((source) => !settings.hiddenSources.includes(source.id))
  return [
    { id: 'sources', label: uiText('calendar.overview.sources'), value: sources, readOnly: true },
  ]
}

function overviewValue(field: PluginProperty): React.ReactNode {
  if (field.id === 'plugin') return uiText('auto.adab5090ac6a')
  if (field.id === 'view') return uiText(field.value === 'week' ? 'auto.f82be68a7fb4' : field.value === 'year' ? 'auto.879e32326c52' : 'auto.082bc378cd60')
  if (field.id === 'month') {
    const date = parseLocalDate(`${field.value}-01`)
    return `${localizedMonth(date.getMonth(), api.ui.language())} ${date.getFullYear()}`
  }
  if (field.id === 'week' && field.value && typeof field.value === 'object' && !Array.isArray(field.value)) return `${field.value.number} · ${field.value.start} – ${field.value.end}`
  if (Array.isArray(field.value)) {
    if (!field.value.length) return uiText('calendar.overview.none')
    return field.value.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return <div key={index}>{String(entry)}</div>
      const details = [entry.address !== entry.name ? entry.address : null, entry.provider, entry.timezone, entry.enabled === false ? uiText('calendar.overview.disabled') : null].filter(Boolean).join(' · ')
      return <div key={String(entry.id)}>{String(entry.name)}{details ? <small>{details}</small> : null}</div>
    })
  }
  return field.value === null ? uiText('calendar.overview.none') : String(field.value)
}

function Overview({ view, sources = false }: { view?: PluginLinkState; sources?: boolean }): React.ReactElement {
  const [, update] = React.useReducer((n: number) => n + 1, 0)
  const [details, setDetails] = React.useState<PluginProperty[]>([])
  const [error, setError] = React.useState(false)
  const settings = useCalendarSettings()
  const providers = useCalendarSourceProviders()
  React.useEffect(() => {
    if (!sources) return subscribe(update)
    let generation = 0
    const refresh = (): void => {
      const current = ++generation
      update()
      void contextProperties().then((fields) => { if (current === generation) { setDetails(fields); setError(false) } }).catch(() => { if (current === generation) setError(true) })
    }
    const offs = [subscribe(update), subscribeHostField('vault', refresh), api.settings.subscribe(refresh), api.data.dataset('calendar.calendars').subscribe(refresh), api.interop.services.subscribe(CALENDAR_ITEM_SOURCE_V2, refresh)]
    refresh()
    return () => { generation++; offs.forEach((off) => off()) }
  }, [sources])
  return <div className="right-panel-body props-info">
    {sources && <CalendarFilterList embedded label={uiText('calendar.filter.sources')} options={[
      { id: EVENTS_SOURCE_ID, label: uiText('calendar.filter.events') },
      { id: NOTE_DATES_SOURCE_ID, label: uiText('calendar.filter.noteDates') },
      ...providers.map((source) => ({ id: source.sourceKey, label: source.integration?.localized?.[api.ui.language()]?.name ?? source.integration?.name ?? source.owner }))
    ]} hidden={settings.hiddenSources} settingsKey={HIDDEN_SOURCES_KEY} emptyText={uiText('calendar.overview.none')} />}
    <dl className="props-info-table">{(sources ? details.filter((field) => field.id !== 'sources') : viewProperties(view)).map((field) => <div className="props-info-row" key={field.id}><dt className="props-info-key">{field.label}</dt><dd className="props-info-value">{overviewValue(field)}</dd></div>)}</dl>
    {error && <p role="alert">{uiText('calendar.overview.unavailable')}</p>}
  </div>
}

function GroupProperties(): React.ReactElement {
  const settings = useCalendarSettings()
  return <div className="right-panel-body props-info"><CalendarFilterList embedded label={uiText('calendar.filter.groups')} options={settings.groups.map((group) => ({ id: group.id, label: group.name, color: group.color }))} hidden={settings.hiddenGroups} settingsKey={HIDDEN_GROUPS_KEY} emptyText={uiText('calendar.overview.none')} onOpenSettings={() => api.workspace.openOwnSettings()} /></div>
}

function Properties({ item, view }: { item?: PluginLinkState; view?: PluginLinkState }): React.ReactElement {
  const [selected, setSelected] = React.useState<CalItem | null>(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    let disposed = false
    const refresh = (): void => {
      if (!item) { setSelected(null); setError(''); return }
      void resolveItem(item).then((value) => { if (!disposed) { setSelected(value); setError('') } }).catch((reason) => { if (!disposed) { setSelected(null); setError(reason instanceof Error ? reason.message : String(reason)) } })
    }
    refresh()
    const offs = [onChanged(refresh), api.interop.state.subscribe(CALENDAR_ITEM_SOURCE_REVISION_V1, refresh), api.vault.onChanged(info => {
      if (info.full || info.changes.some(change => change.relPath === item?.filePath)) refresh()
    })]
    return () => { disposed = true; offs.forEach(off => off()) }
  }, [item])
  if (error) return <div className="right-panel-body" role="alert">{error}</div>
  if (!item) return <Overview view={view} />
  if (!selected) return <div className="right-panel-body">{uiText('calendar.overview.loading')}</div>
  return <div className="right-panel-body props-info"><dl className="props-info-table">{(['title', 'date', 'endDate', 'startTime', 'endTime', 'group', 'note', 'filePath'] as const).filter((key) => selected[key]).map((key) => <div className="props-info-row" key={key}><dt className="props-info-key">{uiText(`calendar.field.${key}`)}</dt><dd className="props-info-value">{selected[key]}</dd></div>)}</dl></div>
}

export function registerCalendarSurfaces(pluginApi: ValleyPluginApi): () => void {
  let disposed = false
  void pluginApi.workspace.getTimeControl().then((time) => { if (!disposed) { state().time = time; notify() } })
  const offTime = pluginApi.workspace.onTimeControlChanged((time) => { state().time = time; notify() })
  const surfaces = ['main_workspace', 'left_sidebar', 'right_sidebar'] as const
  const offs = surfaces.map((surface) => provideBookmarkSurface(pluginApi, {
    id: `calendar.${surface}`, surface, getSnapshot: instanceId => snapshot(surface, instanceId), subscribe,
    restore: async (raw) => {
      const patch = calendarLinkPatch(raw)
      if (!patch) throw new Error('Unsupported Calendar bookmark.')
      if (raw.path !== undefined && (typeof raw.path !== 'string' || !/\.(?:ics|ifb|vcs)$/i.test(raw.path) || !await pluginApi.vault.fileInfo(raw.path))) throw new Error('The calendar file is unavailable.')
      const item = await resolveItem(raw)
      if (raw.itemId !== undefined && !item) throw new Error('The bookmarked calendar item is unavailable.')
      if (patch.view) saveCalendarViewMode(surface, patch.view)
      pluginApi.workspace.patchTimeControl(patch)
      selectCalendarProperties(item, surface)
    }
  }, { stateSchema: bookmarkStateSchema, itemStateSchema: { ...bookmarkStateSchema, required: [...bookmarkStateSchema.required, "itemId", "kind", "date", "sourceId", "filePath"] }, description: snapshot => String(snapshot.view.selectedDate || snapshot.view.cursor || uiText('bookmark.view')), validate: state => calendarLinkPatch(state) !== null }))
  offs.push(pluginApi.interop.extensions.provide(METADATA_PANEL_SEGMENT_V1, {
    id: 'calendar.properties', label: 'Calendar', labelKey: 'manifest.name', icon: 'calendar', pluginSurfaces: ['main_workspace'],
    inspect: async ({ subject }) => {
      const item = subject?.item ? await resolveItem(subject.item.state) : null
      const fields = item?.kind === 'event' ? ['title', 'date', 'endDate', 'startTime', 'endTime', 'groupId', 'note', 'filePath', 'tags', 'urls', 'attachments', 'location'] : ['title', 'date', 'startTime', 'endTime', 'group', 'note', 'filePath', 'priority', 'completed', 'tags', 'urls', 'attachments', 'location']
      return item ? fields.map((id) => ({ id, label: uiText(`calendar.field.${id}`), value: (item as unknown as Record<string, import('@valley/plugin-sdk/types').WorkspaceViewStateValue>)[id] ?? null, readOnly: true })) : viewProperties(subject?.view)
    },
    render: ({ subject }) => <Properties item={subject?.item?.state} view={subject?.view} />
  }))
  offs.push(pluginApi.interop.extensions.provide(METADATA_PANEL_SEGMENT_V1, {
    id: 'calendar.groups', label: 'Groups', labelKey: 'calendar.filter.groups', icon: 'group', pluginSurfaces: ['main_workspace'],
    inspect: () => { const settings = readCalendarSettings(); return settings.groups.map((group) => ({ id: group.id, label: group.name, value: !settings.hiddenGroups.includes(group.id), type: 'boolean' as const })) },
    render: () => <GroupProperties />
  }))
  offs.push(pluginApi.interop.extensions.provide(METADATA_PANEL_SEGMENT_V1, {
    id: 'calendar.sources', label: 'Sources', labelKey: 'calendar.filter.sources', icon: 'layers', pluginSurfaces: ['main_workspace'],
    inspect: contextProperties,
    render: () => <Overview sources />
  }))
  offs.push(pluginApi.interop.extensions.provide(METADATA_PANEL_SEGMENT_V1, {
    id: 'calendar.noteDates', label: 'Note dates', labelKey: 'calendar.filter.noteDates', icon: 'push-pin', pluginSurfaces: ['main_workspace'],
    inspect: async () => (await loadNoteDateSources())
      .filter((source) => !source.hidden)
      .map((source) => ({ id: source.id, label: source.title || uiText('calendar.noteDatePreset.blank'), value: source.visible, type: 'boolean' as const })),
    render: () => <div className="right-panel-body"><NoteDateSourceFilterList embedded /></div>
  }))
  let refreshing = 0
  const refreshSelected = (): void => {
    const generation = ++refreshing
    for (const [surface, selected] of state().selected) {
      if (selected.kind === 'noteDate') continue
      void resolveCalendarTarget({ id: selected.id, sourceId: selected.sourceId }).then((item) => {
        if (disposed || generation !== refreshing || state().selected.get(surface)?.id !== selected.id) return
        state().selected.set(surface, item)
        notify()
      }).catch(() => { if (!disposed) notify() })
    }
  }
  offs.push(onChanged(refreshSelected))
  return () => { disposed = true; offTime(); offs.forEach((off) => off()) }
}
