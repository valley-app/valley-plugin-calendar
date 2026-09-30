import { ReminderOffsets } from './ReminderOffsets'
import { appendCalendarFile, saveCalendarFile } from './calendarFiles'
import { React, api } from './runtime'
import type { ReactElement, ReactNode } from 'react'
import { parseAppOpenUrl } from '@valley/plugin-sdk/paths'
import {
  AttachmentCard,
  FilePathInput,
  LocationField,
  type EventLocation
} from './fields'
import { appendEvent, loadEvents, newEvent, normalizeEventUrl, updateEvent, type DocumentRevision } from './events'
import { createSourcedItem, creatableSources, updateSourcedItem } from './itemSources'
import { FileText, Flag, Hash, Link, MapPin, Plus, Tags, X } from './icons'
import type { CalItem } from './items'
import { uiText } from './localization'

// ── quick-add popover ────────────────────────────────────────────────────────
//
// One composer for both kinds of dated thing. The two used to be separate JSX
// branches that had quietly drifted apart — the event grew attachments and
// links, the contributed item grew tags and a priority, and neither ever gained
// the other's. There is now a single field list; only priority is conditional,
// because only a contributed item has one.

type SourcePriority = 'normal' | 'low' | 'medium' | 'high'

const SOURCE_PRIORITIES: SourcePriority[] = ['normal', 'low', 'medium', 'high']
const PRIORITY_LABEL_KEYS: Record<SourcePriority, string> = {
  normal: 'calendar.priority.none',
  low: 'calendar.priority.low',
  medium: 'calendar.priority.medium',
  high: 'calendar.priority.high'
}

export interface QuickAddState {
  date: string
  startTime?: string
  endTime?: string
  /** `event` = the Calendar's own record; anything else is a
   *  `calendar.itemSource` id (the first creatable source is the default). */
  kind?: string
  sourceFilePath?: string
  editItem?: CalItem
  anchor?: { x: number; y: number }
}

interface EventDraft {
  fields: Map<string, unknown>
  listeners: Set<() => void>
}

function eventDraft(key: string): EventDraft {
  const drafts = api.runtime.getOrCreate('calendar.eventDrafts', () => new Map<string, EventDraft>())
  let draft = drafts.get(key)
  if (!draft) {
    draft = { fields: new Map(), listeners: new Set() }
    drafts.set(key, draft)
  }
  return draft
}

function useEventField<T>(key: string, field: string, initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  const draft = eventDraft(key)
  const initialRef = React.useRef(initial)
  initialRef.current = initial
  const read = React.useCallback((): T => {
    if (!draft.fields.has(field)) {
      const seed = initialRef.current
      draft.fields.set(field, typeof seed === 'function' ? (seed as () => T)() : seed)
    }
    return draft.fields.get(field) as T
  }, [draft, field])
  const value = React.useSyncExternalStore(React.useCallback((listener) => {
    draft.listeners.add(listener)
    return () => { draft.listeners.delete(listener) }
  }, [draft]), read, read)
  const setValue = React.useCallback((next: React.SetStateAction<T>) => {
    const previous = read()
    const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
    if (Object.is(previous, value)) return
    draft.fields.set(field, value)
    for (const listener of draft.listeners) listener()
  }, [draft, field, read])
  return [value, setValue]
}

/** A titled block of fields. The label is what turns a stack of grey boxes into
 *  a form you can skim. */
function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div className="calendar-quickadd-section">
      <span className="calendar-quickadd-section-label">{title}</span>
      {children}
    </div>
  )
}

/** One labelled row: a leading glyph, then the control. */
function Row({ glyph, children }: { glyph: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="calendar-quickadd-row">
      <span className="calendar-quickadd-row-glyph" aria-hidden="true">{glyph}</span>
      <div className="calendar-quickadd-row-body">{children}</div>
    </div>
  )
}

interface QuickAddProps {
  state: QuickAddState
  groups: import('@valley/plugin-sdk/types').ValleyGroup[]
  onClose: () => void
  onAdded: () => void
}

export function QuickAdd(props: QuickAddProps): ReactElement | null {
  const initial = React.useRef(props)
  React.useEffect(() => {
    const current = initial.current
    const control = { canDismiss: async () => true }
    const target = current.state.anchor ?? { x: 24, y: 76 }
    const focus = document.activeElement as HTMLElement | null
    let closePopover: (() => void) | undefined
    let mounted = true
    let finished = false
    const finish = (): void => {
      if (!mounted || finished) return
      finished = true
      current.onClose()
      focus?.focus()
    }
    void api.ui.openPopover(({ close }) => {
      closePopover = close
      return <QuickAddForm {...current} dismissControl={control} onDismiss={finish} onClose={() => { close(); finish() }} />
    }, target, { width: 340, className: 'calendar-editor-popover', ariaLabel: uiText('calendar.quickadd.kind'), beforeDismiss: () => control.canDismiss() })
      .then(finish)
    return () => { mounted = false; closePopover?.() }
  }, [])
  return null
}

function QuickAddForm({ state, groups, onClose, onAdded, dismissControl, onDismiss }: QuickAddProps & { dismissControl: { canDismiss(): Promise<boolean> }; onDismiss: () => void }): ReactElement {
  React.useEffect(() => onDismiss, [onDismiss])
  const editing = state.editItem
  const closing = React.useRef(false)
  const draftKey = editing ? `${editing.sourceId ?? editing.kind}:${editing.id}` : `new:${state.kind ?? ''}:${state.date}:${state.startTime ?? ''}`
  // Which sources accept new items. Read once per mount: the tab strip must not
  // reshuffle under the user's cursor if a plugin loads mid-edit.
  const [sources] = React.useState(() => creatableSources())
  const defaultKind = state.kind === 'todo' ? sources[0]?.id ?? 'event' : state.kind ?? 'event'
  // Note dates are read-only and never reach this editor — they only ever land
  // here as `undefined`, falling through to the requested kind. An edit of a
  // contributed item stays with the source that offered it.
  const [kind, setKind] = useEventField<string>(draftKey, 'kind',
    editing?.kind === 'sourced' ? editing.sourceId ?? defaultKind
      : editing?.kind === 'event' ? 'event'
      : defaultKind
  )
  const [title, setTitle] = useEventField(draftKey, 'title', editing?.title ?? (state.sourceFilePath?.endsWith('.ifb') ? 'BUSY' : ''))
  const [date, setDate] = useEventField(draftKey, 'date', editing?.file?.date ?? editing?.event?.date ?? editing?.date ?? state.date)
  const [endDate, setEndDate] = useEventField(draftKey, 'endDate', editing?.endDate ?? '')
  const [start, setStart] = useEventField(draftKey, 'start', editing?.startTime ?? state.startTime ?? (state.sourceFilePath?.endsWith('.ifb') ? '09:00' : ''))
  const [reminderOffsets, setReminderOffsets] = useEventField<number[] | undefined>(draftKey, 'reminderOffsets', editing?.event?.reminderOffsets)
  const [reminderTime, setReminderTime] = useEventField(draftKey, 'reminderTime', editing?.event?.reminderTime ?? '')
  const [end, setEnd] = useEventField(draftKey, 'end', editing?.endTime ?? state.endTime ?? (state.sourceFilePath?.endsWith('.ifb') ? '10:00' : ''))
  // Always the group's **id**. The two tabs used to store an id and a name in
  // this one slot, so switching tabs left a value that resolved in neither; the
  // name is derived at submit time, where the contributed-item contract wants it.
  const [groupId, setGroupId] = useEventField(draftKey, 'groupId', () => {
    const stored = editing?.event?.groupId ?? editing?.sourced?.group ?? ''
    return groups.find((g) => g.id === stored)?.id ?? groups.find((g) => g.name === stored)?.id ?? ''
  })
  const [location, setLocation] = useEventField<EventLocation | undefined>(draftKey, 'location', editing?.location)
  const [note, setNote] = useEventField(draftKey, 'note', editing?.note ?? '')
  // Everything hanging off an event — a vault file, a web address, the note it
  // links. One block, the way the row reads them.
  const [urls, setUrls] = useEventField<string[]>(draftKey, 'urls', editing?.urls ?? editing?.event?.urls ?? editing?.sourced?.urls ?? [])
  const [attachments, setAttachments] = useEventField<string[]>(draftKey, 'attachments', editing?.attachments ?? editing?.event?.attachments ?? editing?.sourced?.attachments ?? [])
  const [addingAttachment, setAddingAttachment] = React.useState(false)
  const [attachmentDraft, setAttachmentDraft] = React.useState('')
  const [addingUrl, setAddingUrl] = React.useState(false)
  const [urlDraft, setUrlDraft] = React.useState('')
  // Fields only a contributed item carries.
  const [priority, setPriority] = useEventField<SourcePriority>(draftKey, 'priority',
    (editing?.sourced?.priority as SourcePriority | undefined) ?? 'normal'
  )
  const [tags, setTags] = useEventField<string[]>(draftKey, 'tags', editing?.tags ?? editing?.sourced?.tags ?? editing?.event?.tags ?? [])
  const [filePath, setFilePath] = useEventField(draftKey, 'filePath',
    editing?.sourced?.filePath ?? editing?.event?.filePath ?? ''
  )
  const [busy, setBusy] = useEventField(draftKey, 'busy', false)
  const [error, setError] = useEventField(draftKey, 'error', '')

  const [details, setDetails] = React.useState(false)
  const [recurrenceScope, setRecurrenceScope] = React.useState<'occurrence' | 'series'>('occurrence')
  const [fileBaseline, setFileBaseline] = React.useState<{ content: string; revisionToken: string } | null>(null)
  React.useEffect(() => {
    const path = editing?.file?.path ?? state.sourceFilePath
    if (path) void api.vault.readTextDocument(path).then(setFileBaseline, error => setError(String(error)))
  }, [editing?.file?.path, state.sourceFilePath])

  const addUrl = (raw: string): void => {
    const next = normalizeEventUrl(raw)
    // An empty commit closes the field; a duplicate is a no-op rather than an
    // error, matching the attachment picker.
    if (next && !urls.includes(next)) setUrls([...urls, next])
    setUrlDraft('')
    setAddingUrl(false)
  }

  /** Both times off ⇒ all-day. Turning it on is the only way to clear a time
   *  pair in one gesture; turning it off hands back a sensible default hour. */
  const allDay = !start && !end
  const setAllDay = (next: boolean): void => {
    if (next) {
      setStart('')
      setEnd('')
    } else {
      setStart(state.startTime ?? '09:00')
      setEnd(state.endTime ?? '10:00')
    }
  }

  const [expectedUpdatedAt] = useEventField(draftKey, 'expectedUpdatedAt', editing?.event?.updatedAt)
  const [documentRevision, setDocumentRevision] = useEventField<DocumentRevision | undefined>(draftKey, 'documentRevision', undefined)
  const documentRef = editing?.kind === 'event' && !editing.readOnly
    ? { pluginId: 'calendar', sourceId: 'events', itemId: editing.id }
    : undefined
  React.useEffect(() => {
    if (!documentRef || documentRevision) return
    let active = true
    void api.documents.read(documentRef).then(document => {
      if (!active || closing.current) return
      if (!document) { setError(uiText('calendar.error.missing')); return }
      setDocumentRevision(current => current ?? { expectedRevision: document.revision, vaultGeneration: document.vaultGeneration })
    }, () => { if (active) setError(uiText('calendar.error.save')) })
    return () => { active = false }
  }, [editing?.id, editing?.kind, editing?.readOnly, documentRevision])
  const cancel = async (): Promise<boolean> => {
    if (eventDraft(draftKey).fields.get('busy') || closing.current) return false
    try {
      closing.current = true
      if (documentRef) await api.documents.drafts.clear(documentRef)
      eventDraft(draftKey).fields.clear()
      onClose()
      return true
    } catch (reason) {
      closing.current = false
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    }
  }
  dismissControl.canDismiss = cancel

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed || eventDraft(draftKey).fields.get('busy') || editing?.readOnly) return
    setBusy(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const day = date || state.date
      // A contributed item references its group by **name** — how `@valley/plugin-sdk/groups`
      // models it, and what `CalendarSourceItem.group` documents.
      const groupName = groups.find((g) => g.id === groupId)?.name
      const shared = {
        location,
        urls: editing?.file ? urls : urls.length > 0 ? urls : undefined,
        attachments: editing?.file ? attachments : attachments.length > 0 ? attachments : undefined,
        filePath: filePath.trim() || undefined,
        note
      }
      const eventExtras = { ...shared, reminderOffsets, reminderTime: reminderTime || undefined, groupId: groupId || undefined, tags }
      const sourcedExtras = { ...shared, group: groupName, tags, priority }
      if (editing) {
        if (editing.file) {
          if (!fileBaseline) throw new Error(uiText('calendar.error.save'))
          await saveCalendarFile(editing.file, { title: trimmed, date: day, endDate: endDate || undefined, startTime: start || undefined, endTime: end || undefined, ...shared, tags }, recurrenceScope, fileBaseline)
        } else if (editing.kind === 'sourced' && editing.sourceId) {
          if (!await updateSourcedItem(editing.sourceId, editing.id, { title: trimmed, date: day, startTime: start || undefined, endTime: end || undefined, ...sourcedExtras })) throw new Error(uiText('calendar.error.save'))
        } else if (editing.kind === 'event' && editing.event) {
          if (!documentRevision) throw new Error(uiText('calendar.error.save'))
          const current = (await loadEvents()).find((event) => event.id === editing.id)
          if (!current) throw new Error(uiText('calendar.error.missing'))
          if (current.updatedAt !== expectedUpdatedAt) throw new Error(uiText('calendar.error.changed'))
          const saved = await updateEvent(editing.id, {
            ...current,
            allDay: !start && !end,
            title: trimmed,
            date: day,
            endDate: endDate || undefined,
            startTime: start || undefined,
            endTime: end || undefined,
            ...eventExtras,
            updatedAt: now
          }, expectedUpdatedAt, documentRevision)
          if (!saved) throw new Error(uiText('calendar.error.save'))
        }
      } else if (state.sourceFilePath) {
        if (!fileBaseline) throw new Error(uiText('calendar.error.save'))
        const content = appendCalendarFile(fileBaseline.content, state.sourceFilePath, { title: trimmed, date: day, endDate: endDate || undefined, startTime: start || undefined, endTime: end || undefined, ...shared })
        const saved = await api.vault.writeTextDocumentGuarded(state.sourceFilePath, content, fileBaseline.revisionToken)
        if (!saved.ok || saved.editorConflict) throw new Error(uiText('calendar.error.changed'))
      } else if (kind === 'event') {
        const saved = await appendEvent(
          newEvent(trimmed, day, {
            endDate: endDate || undefined,
            startTime: start || undefined,
            endTime: end || undefined,
            ...eventExtras
          })
        )
        if (!saved) throw new Error(uiText('calendar.error.save'))
      } else {
        const saved = await createSourcedItem(kind, day, {
          title: trimmed,
          startTime: start || undefined,
          endTime: end || undefined,
          ...sourcedExtras,
          completed: false
        })
        if (!saved) throw new Error(uiText('calendar.error.save'))
      }
      closing.current = true
      if (documentRef) await api.documents.drafts.clear(documentRef)
      eventDraft(draftKey).fields.clear()
      onAdded()
      onClose()
    } catch (reason) {
      closing.current = false
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (!closing.current) setBusy(false)
    }
  }

  const isEvent = kind === 'event'
  const kindLabel = (id: string): string =>
    id === 'event'
      ? uiText('auto.ad8919ace091')
      : sources.find((s) => s.id === id)?.label ?? id
  // The host's styled controls — never a raw `<select>` or `<input type="date">`,
  // whose popups Chromium hands to the OS unthemed.
  const { SelectField, DateField, TimeField, Segmented, Toggle } = api.ui.settings

  return (
    <api.ui.ScrollPanel
      className="calendar-quickadd"
      maxHeight={620}
      header={!editing && !state.sourceFilePath && <div className="calendar-quickadd-head">
            <Segmented
              value={kind}
              onChange={setKind}
              ariaLabel={uiText('calendar.quickadd.kind')}
              options={[
                { value: 'event', label: uiText('auto.ad8919ace091') },
                ...sources.map((source) => ({ value: source.id, label: source.label }))
              ]}
            />
        </div>}
      footer={<div className="calendar-quickadd-footer">
        <button className="calendar-quickadd-cancel" type="button" disabled={busy} onClick={() => void cancel()}>{uiText('auto.77dfd2135f4d')}</button>
        {!editing?.readOnly && <button className="calendar-quickadd-save" type="button" onClick={() => void submit()} disabled={!title.trim() || busy || (!!documentRef && !documentRevision) || (!!(editing?.file || state.sourceFilePath) && !fileBaseline)}>
          {editing ? uiText('auto.efc007a393f6') : uiText('auto.61cc55aa0453')}
        </button>}

      </div>}
    >
      <div className="calendar-quickadd-body" onKeyDown={event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      void cancel()
    }}>
          <fieldset disabled={!!editing?.readOnly} style={{ display: 'contents' }}>
          <input
            data-modal-initial-focus="true"
            autoFocus
            aria-label={uiText('auto.768e0c1c6957')}
            className="calendar-quickadd-title"
            value={title}
            readOnly={!!editing?.file?.availability}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder={isEvent ? uiText('auto.0cd372226ee9') : uiText('auto.33a5a701e541')}
          />

          {(editing?.file?.timeZone || state.sourceFilePath?.toLowerCase().endsWith('.ifb')) && <div className="calendar-quickadd-section-label">{editing?.file?.timeZone === 'floating' ? uiText('calendar.time.floating') : editing?.file?.timeZone ?? 'UTC'}</div>}
          <div className="calendar-quickadd-schedule">
            <div className="calendar-quickadd-allday">
              <span>{uiText('calendar.quickadd.allDay')}</span>
              <Toggle checked={allDay} onChange={setAllDay} disabled={!!editing?.file?.availability || state.sourceFilePath?.toLowerCase().endsWith('.ifb')} label={uiText('calendar.quickadd.allDay')} />
            </div>
            <div className="calendar-quickadd-schedule-row" data-all-day={allDay}>
              <span>{uiText('calendar.quickadd.starts')}</span>
              <div className="calendar-quickadd-control">
                <DateField value={date} onChange={setDate} clearable={false}
                  ariaLabel={isEvent ? uiText('calendar.quickadd.startDate') : uiText('calendar.quickadd.dueDate')} />
              </div>
              {!allDay && <div className="calendar-quickadd-control">
                <TimeField value={start} onChange={setStart} ariaLabel={uiText('auto.88d8206d586a')} />
              </div>}
            </div>
            <div className="calendar-quickadd-schedule-row" data-all-day={allDay}>
              <span>{uiText('calendar.quickadd.ends')}</span>
              <div className="calendar-quickadd-control">
                {isEvent ? <DateField value={endDate || date} onChange={value => setEndDate(value === date ? '' : value)} min={date}
                  clearable={false} ariaLabel={uiText('calendar.quickadd.endDate')} />
                  : <DateField value={date} onChange={setDate} clearable={false} ariaLabel={uiText('calendar.quickadd.dueDate')} />}
              </div>
              {!allDay && <div className="calendar-quickadd-control">
                <TimeField value={end} onChange={setEnd} ariaLabel={uiText('auto.cd7800da7f4f')} />
              </div>}
            </div>
          </div>

          {isEvent && !editing?.file && !state.sourceFilePath && <ReminderOffsets value={reminderOffsets} onChange={setReminderOffsets} timed={Boolean(start)} time={reminderTime} onTimeChange={setReminderTime} />}
          {editing?.file?.recurring && <Segmented ariaLabel={uiText('calendar.recurrence.series')} value={recurrenceScope} onChange={value => setRecurrenceScope(value as 'occurrence' | 'series')} options={[
            { value: 'occurrence', label: uiText('calendar.recurrence.occurrence') }, { value: 'series', label: uiText('calendar.recurrence.series') }
          ]} />}
          <button className="calendar-quickadd-add" type="button" aria-expanded={details} onClick={() => setDetails(!details)}>{uiText('calendar.quickadd.details')}</button>
          <div hidden={!details}>
          <div className="calendar-quickadd-section">
            {groups.length > 0 && !editing?.file && !state.sourceFilePath && (
              <Row glyph={<Tags />}>
                <SelectField
                  className="calendar-quickadd-select"
                  value={groupId}
                  onChange={setGroupId}
                  ariaLabel={uiText('auto.dbed7864623f')}
                  options={[
                    { value: '', label: uiText('auto.f6b2246c64fa') },
                    ...groups.map((g) => ({ value: g.id, label: g.name, color: g.color }))
                  ]}
                />
              </Row>
            )}
            <Row glyph={<MapPin />}>
              <LocationField value={location} onChange={setLocation} />
            </Row>
            <Row glyph={<FileText />}>
              <FilePathInput
                value={filePath}
                onChange={setFilePath}
              />
            </Row>
            <Row glyph={<Hash />}>
              <api.ui.TagInput value={tags} onChange={setTags} readOnly={!!editing?.readOnly} />
            </Row>
            {/* Only a contributed item has a priority; `EventRecord` has no such
                field, so the row is left out rather than shown and dropped. */}
            {!isEvent && (
              <Row glyph={<Flag />}>
                <Segmented
                  value={priority}
                  onChange={(v) => setPriority(v as SourcePriority)}
                  ariaLabel={uiText('calendar.quickadd.priority')}
                  options={SOURCE_PRIORITIES.map((p) => ({
                    value: p,
                    label: uiText(PRIORITY_LABEL_KEYS[p])
                  }))}
                />
              </Row>
            )}
          </div>

          {/* One block for everything else hanging off the item — a vault file
              and a web address are the same thing to the person reading the
              chip, so the links sit with the files. */}
          <Section title={uiText('calendar.attachments')}>
            {attachments.map((relPath) => (
              <AttachmentCard
                key={relPath}
                relPath={relPath}
                onRemove={() => setAttachments(attachments.filter((p) => p !== relPath))}
              />
            ))}
            {urls.map((url) => (
              <div className="calendar-quickadd-url-row" key={url}>
                <button
                  className="calendar-quickadd-url"
                  type="button"
                  onClick={(event) => {
                    const relPath = parseAppOpenUrl(url)
                    if (relPath) api.workspace.openFile(relPath, undefined, { newTab: api.ui.hasModKey(event) })
                    else void api.files.openExternalUrl(url)
                  }}
                >{url}</button>
                <button
                  className="calendar-field-btn"
                  type="button"
                  title={uiText('calendar.removeUrl')}
                  aria-label={uiText('calendar.removeUrlOf', { p0: url })}
                  onClick={() => setUrls(urls.filter((u) => u !== url))}
                >
                  <X />
                </button>
              </div>
            ))}
            {addingAttachment ? (
              <FilePathInput
                value={attachmentDraft}
                placeholder={uiText('calendar.attachmentPlaceholder')}
                ariaLabel={uiText('calendar.attachmentPath')}
                onChange={(v) => {
                  setAttachmentDraft(v)
                  if (v) {
                    if (!attachments.includes(v)) setAttachments([...attachments, v])
                    setAttachmentDraft('')
                    setAddingAttachment(false)
                  }
                }}
              />
            ) : null}
            {addingUrl ? (
              <input
                className="calendar-quickadd-input"
                value={urlDraft}
                autoFocus
                placeholder={uiText('calendar.urlPlaceholder')}
                aria-label={uiText('calendar.url')}
                onChange={(e) => setUrlDraft(e.target.value)}
                onBlur={(e) => addUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addUrl(e.currentTarget.value)
                  }
                  if (e.key === 'Escape') {
                    setUrlDraft('')
                    setAddingUrl(false)
                  }
                }}
              />
            ) : null}
            <div className="calendar-quickadd-adders">
              {!addingAttachment && (
                <button className="calendar-quickadd-add" type="button" onClick={() => setAddingAttachment(true)}>
                  <Plus /> {uiText('calendar.addAttachment')}
                </button>
              )}
              {!addingUrl && (
                <button className="calendar-quickadd-add" type="button" onClick={() => setAddingUrl(true)}>
                  <Link /> {uiText('calendar.addUrl')}
                </button>
              )}
            </div>
          </Section>
          <textarea
            className="calendar-quickadd-note"
            aria-label={uiText('auto.2c924e308820')}
            value={note}
            onChange={event => setNote(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder={uiText('auto.1a29d1bf66f5')}
            rows={4}
            readOnly={!!editing?.readOnly}
          />
          </div>
          </fieldset>
        {error && <div role="alert">{error}</div>}
      </div>
    </api.ui.ScrollPanel>
  )
}
