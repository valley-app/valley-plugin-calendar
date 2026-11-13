/**
 * Calendar's own groups in Settings: the same list as Settings → Appearance →
 * Groups (grip, name, colour, usage, remove, and an add row on the same
 * columns), plus the shared group each one sits under. A group is deleted only
 * once no event uses it, like a shared group.
 */
import { React, api } from './runtime'
import type { ReactElement } from 'react'
import type { EventRecord } from '@valley/plugin-sdk/types'
import { groupKey, nextGroupColor } from '@valley/plugin-sdk/groups'
import { GripVertical, X } from './icons'
import { uiText } from './localization'
import { setLocalGroups } from './groups'
import { useCalendarSettings } from './settingsStore'
import { loadEvents, onChanged } from './events'
import {
  LOCAL_GROUP_LIMIT,
  LOCAL_GROUP_NAME_MAX,
  localGroupUsage,
  newLocalGroupId,
  renameLocalGroup,
  type LocalGroup
} from './localGroups'

function useEvents(): EventRecord[] {
  const [events, setEvents] = React.useState<EventRecord[]>([])
  React.useEffect(() => {
    let active = true
    const load = (): void => { void loadEvents().then((next) => { if (active) setEvents(next) }).catch(() => {}) }
    load()
    const off = onChanged(load)
    return () => { active = false; off() }
  }, [])
  return events
}

/** A name field that commits on blur or Enter and reverts on Escape. */
function NameInput({ initial, placeholder, ariaLabel, invalid, onType, onCommit, onEnter }: {
  initial: string
  placeholder?: string
  ariaLabel: string
  invalid?: boolean
  onType?: (value: string) => void
  onCommit: (value: string) => void
  /** Runs after the Enter commit, for the add row. */
  onEnter?: () => void
}): ReactElement {
  const skip = React.useRef(false)
  return (
    <input
      className={`settings-control settings-colorrule-key${invalid ? ' invalid' : ''}`}
      type="text"
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      maxLength={LOCAL_GROUP_NAME_MAX}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onType?.(event.currentTarget.value)}
      onBlur={(event) => {
        if (skip.current) { skip.current = false; return }
        onCommit(event.currentTarget.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); onEnter?.() }
        else if (event.key === 'Escape') {
          event.preventDefault()
          skip.current = true
          event.currentTarget.value = initial
          onType?.(initial)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function LocalGroupsSettings(): ReactElement {
  const { Button, ColorField, IconButton, Section, SelectField, useReorderDrag } = api.ui.settings
  const { sharedGroups: shared, localGroups: local, groups } = useCalendarSettings()
  const usage = localGroupUsage(useEvents(), local)
  const [draftName, setDraftName] = React.useState('')
  const [draftColor, setDraftColor] = React.useState(() => nextGroupColor(groups))
  const [draftParent, setDraftParent] = React.useState('')
  const [addKey, setAddKey] = React.useState(0)
  const [duplicate, setDuplicate] = React.useState(false)
  const [saveError, setSaveError] = React.useState(false)
  const taken = (name: string, except?: string): boolean => groups.some((group) => group.id !== except && [group.name, ...(group.aliases ?? [])].some((candidate) => groupKey(candidate) === groupKey(name)))
  const save = async (next: LocalGroup[]): Promise<boolean> => {
    const ok = await setLocalGroups(next).catch(() => false)
    setSaveError(!ok)
    return ok
  }
  const reorder = useReorderDrag({
    items: local,
    indicatorOnly: true,
    getId: (group) => group.id,
    getLabel: (group) => group.name,
    onReorder: (next) => { void save(next) }
  })
  const update = (id: string, change: (group: LocalGroup) => LocalGroup): void => {
    void save(local.map((group) => group.id === id ? change(group) : group))
  }
  const add = async (): Promise<void> => {
    const name = draftName.trim().slice(0, LOCAL_GROUP_NAME_MAX)
    if (!name || local.length >= LOCAL_GROUP_LIMIT) return
    if (taken(name)) { setDuplicate(true); return }
    const created: LocalGroup = { id: newLocalGroupId(), name, color: draftColor, ...(draftParent ? { parent: draftParent } : {}) }
    if (!await save([...local, created])) return
    setDraftName('')
    setDuplicate(false)
    setDraftColor(nextGroupColor([...groups, created]))
    setAddKey((key) => key + 1)
  }
  const parentOptions = [
    { value: '', label: uiText('calendar.localGroups.noParent') },
    ...shared.map((group) => ({ value: group.id, label: group.name, color: group.color }))
  ]
  const parentPatch = (value: string) => (group: LocalGroup): LocalGroup => {
    const { parent: _, ...rest } = group
    return value ? { ...rest, parent: value } : rest
  }

  return (
    <Section title={uiText('calendar.localGroups.title')}>
      <span className="settings-empty-text">{uiText('calendar.localGroups.description')}</span>
      <div className="settings-colorrules settings-groups settings-groups--parent" role="list" aria-label={uiText('calendar.localGroups.title')}>
        {saveError && <span role="alert" className="settings-path-error">{uiText('calendar.localGroups.saveError')}</span>}
        {local.map((group, index) => {
          // Host-drawn controls are matched to their slot, so a moved row
          // remounts them; otherwise they keep the values of the row that was there.
          const slot = `${group.id}@${index}`
          const handleProps = reorder.getHandleProps(group)
          const count = usage[group.id] ?? 0
          return (
            <div
              role="listitem"
              key={group.id}
              className={`settings-colorrule-row${reorder.overId === group.id ? ` drop-${reorder.dropPosition ?? 'before'}` : ''}`}
              {...reorder.getItemProps(group)}
            >
              <button {...handleProps} className={`${handleProps.className ?? ''} settings-colorrule-grip`}>
                <GripVertical aria-hidden="true" />
              </button>
              <NameInput
                key={`name:${group.id}:${group.name}`}
                initial={group.name}
                ariaLabel={uiText('calendar.localGroups.nameOf', { p0: group.name })}
                onCommit={(value) => {
                  const name = value.trim()
                  if (!name || name === group.name || taken(name, group.id)) return
                  update(group.id, (current) => renameLocalGroup(current, name))
                }}
              />
              <SelectField
                key={`parent:${slot}`}
                value={group.parent ?? ''}
                options={parentOptions}
                ariaLabel={uiText('calendar.localGroups.parentOf', { p0: group.name })}
                onChange={(value) => update(group.id, parentPatch(value))}
              />
              <ColorField
                key={`color:${slot}`}
                value={group.color}
                onChange={(color) => update(group.id, (current) => ({ ...current, color }))}
                ariaLabel={uiText('calendar.localGroups.colorOf', { p0: group.name })}
              />
              <span
                className="settings-group-usage"
                aria-label={uiText('calendar.localGroups.usage', { p0: String(count) })}
                title={uiText('calendar.localGroups.usage', { p0: String(count) })}
              >{count}</span>
              <IconButton
                key={`remove:${slot}`}
                className="settings-colormap-remove"
                aria-disabled={count > 0 || undefined}
                ariaLabel={uiText('calendar.localGroups.removeOf', { p0: group.name })}
                title={count > 0 ? uiText('calendar.localGroups.removeBlocked', { p0: String(count) }) : uiText('calendar.localGroups.remove')}
                onClick={() => { if (count === 0) void save(local.filter((candidate) => candidate.id !== group.id)) }}
              >
                <X />
              </IconButton>
            </div>
          )
        })}
        {reorder.liveRegion}
        <div className="settings-colorrule-row settings-colorrule-add">
          <span className="settings-colorrule-grip settings-colorrule-grip-placeholder" aria-hidden="true" />
          <NameInput
            key={`add:${addKey}`}
            initial=""
            placeholder={uiText('calendar.localGroups.name')}
            ariaLabel={uiText('calendar.localGroups.new')}
            invalid={duplicate}
            onType={(value) => { setDraftName(value); setDuplicate(false) }}
            onCommit={(value) => setDraftName(value)}
            onEnter={() => void add()}
          />
          <SelectField
            key={`add-parent:${addKey}`}
            value={draftParent}
            options={parentOptions}
            ariaLabel={uiText('calendar.localGroups.newParent')}
            onChange={setDraftParent}
          />
          <ColorField
            key={`add-color:${addKey}`}
            value={draftColor}
            onChange={setDraftColor}
            ariaLabel={uiText('calendar.localGroups.newColor')}
          />
          <span className="settings-colorrule-add-action">
            <span className="settings-button settings-button--medium settings-colorrule-add-sizer" aria-hidden="true">{uiText('calendar.localGroups.add')}</span>
            <Button className="settings-colormap-add-btn" disabled={!draftName.trim() || local.length >= LOCAL_GROUP_LIMIT} onClick={() => void add()}>
              {uiText('calendar.localGroups.add')}
            </Button>
          </span>
        </div>
        {duplicate && <span className="settings-empty-text">{uiText('calendar.localGroups.duplicate')}</span>}
      </div>
    </Section>
  )
}
