/**
 * Calendar's own groups in Settings: the same list as Settings → Appearance →
 * Groups (grip, name, colour, add subgroup, usage, remove, and an add row on the
 * same columns). A group is deleted only once no event uses it and it has no
 * subgroups, like a shared group.
 */
import { React, api } from './runtime'
import type { ReactElement } from 'react'
import type { EventRecord } from '@valley/plugin-sdk/types'
import { groupFamily, groupKey, nextGroupColor, placeGroup, resolveGroupDrop, stepGroup, subgroupsOf, type GroupPlacement } from '@valley/plugin-sdk/groups'
import { GripVertical, Plus, X } from './icons'
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
  const { Button, ColorField, IconButton, Section, useReorderDrag } = api.ui.settings
  const { localGroups: local, groups } = useCalendarSettings()
  const usage = localGroupUsage(useEvents(), local)
  const [draftName, setDraftName] = React.useState('')
  const [draftColor, setDraftColor] = React.useState(() => nextGroupColor(groups))
  const [addKey, setAddKey] = React.useState(0)
  const [duplicate, setDuplicate] = React.useState(false)
  const [saveError, setSaveError] = React.useState(false)
  const taken = (name: string, except?: string): boolean => groups.some((group) => group.id !== except && [group.name, ...(group.aliases ?? [])].some((candidate) => groupKey(candidate) === groupKey(name)))
  const save = async (next: LocalGroup[]): Promise<boolean> => {
    const ok = await setLocalGroups(next).catch(() => false)
    setSaveError(!ok)
    return ok
  }
  // A group's count covers its subgroups, like a shared group's.
  const total = (group: LocalGroup): number => groupFamily(local, group).reduce((sum, member) => sum + (usage[member.id] ?? 0), 0)
  // A pointer this far right of a row's left edge asks for a subgroup where the slot allows both levels.
  const NEST_OFFSET = 28
  const [nest, setNest] = React.useState(false)
  const [subgroupOf, setSubgroupOf] = React.useState<string | null>(null)
  const [subColor, setSubColor] = React.useState(() => nextGroupColor(groups))
  const [subDuplicate, setSubDuplicate] = React.useState(false)
  const subRow = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { if (subgroupOf) subRow.current?.querySelector('input')?.focus() }, [subgroupOf])
  const place = (id: string, placement: GroupPlacement | null): void => {
    if (!placement) return
    let next: LocalGroup[]
    try { next = placeGroup(local, id, placement) } catch { return }
    if (next.every((group, index) => group.id === local[index]?.id && group.parent === local[index]?.parent)) return
    void save(next)
  }
  const reorder = useReorderDrag({
    items: local,
    indicatorOnly: true,
    getId: (group) => group.id,
    getLabel: (group) => group.name,
    // Pointer drops are resolved in `dropProps`; this is the keyboard path, which keeps a group on its level.
    onReorder: (_next, move) => {
      const edge = move.position === 'before' ? local[0]?.id : local.at(-1)?.id
      place(move.activeId, stepGroup(local, move.activeId, move.position, move.overId === edge))
    }
  })
  const wantsNest = (event: React.DragEvent<HTMLElement>): boolean => event.clientX > event.currentTarget.getBoundingClientRect().left + NEST_OFFSET
  const dropProps = (group: LocalGroup): ReturnType<typeof reorder.getItemProps> => {
    const props = reorder.getItemProps(group)
    return {
      ...props,
      onDragOver: (event) => { props.onDragOver?.(event); setNest(wantsNest(event)) },
      onDrop: (event) => {
        const dragId = reorder.activeId ?? event.dataTransfer.getData('text/plain')
        if (!dragId) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        place(dragId, resolveGroupDrop(local, dragId, group.id, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after', wantsNest(event)))
        reorder.cancel()
      }
    }
  }
  // The insertion line sits where the group will land, indented when it lands as a subgroup.
  const target = reorder.activeId && reorder.overId && reorder.dropPosition
    ? resolveGroupDrop(local, reorder.activeId, reorder.overId, reorder.dropPosition, nest)
    : null
  const dropClass = (group: LocalGroup, index: number): string => {
    if (!target) return ''
    const nested = target.parent !== null ? ' drop-nested' : ''
    if (target.before !== null) return target.before === group.id ? ` drop-before${nested}` : ''
    const scope = target.parent === null ? local : local.filter((entry) => entry.id === target.parent || entry.parent === target.parent)
    const last = scope.filter((entry) => entry.id !== reorder.activeId && entry.parent !== reorder.activeId).at(-1) ?? local[index]
    return last.id === group.id ? ` drop-after${nested}` : ''
  }
  const addSubgroup = async (value: string): Promise<void> => {
    const name = value.trim().slice(0, LOCAL_GROUP_NAME_MAX)
    if (!subgroupOf || !name || local.length >= LOCAL_GROUP_LIMIT) { setSubgroupOf(null); return }
    if (taken(name)) { setSubDuplicate(true); return }
    const created: LocalGroup = { id: newLocalGroupId(), name, color: subColor }
    let next: LocalGroup[]
    try { next = placeGroup([...local, created], created.id, { parent: subgroupOf, before: null }) } catch { setSubgroupOf(null); return }
    if (await save(next)) setSubgroupOf(null)
  }
  const update = (id: string, change: (group: LocalGroup) => LocalGroup): void => {
    void save(local.map((group) => group.id === id ? change(group) : group))
  }
  const add = async (): Promise<void> => {
    const name = draftName.trim().slice(0, LOCAL_GROUP_NAME_MAX)
    if (!name || local.length >= LOCAL_GROUP_LIMIT) return
    if (taken(name)) { setDuplicate(true); return }
    const created: LocalGroup = { id: newLocalGroupId(), name, color: draftColor }
    if (!await save([...local, created])) return
    setDraftName('')
    setDuplicate(false)
    setDraftColor(nextGroupColor([...groups, created]))
    setAddKey((key) => key + 1)
  }

  return (
    <Section>
      <div className="settings-path-row settings-groups-row">
      <span className="settings-toggle-text">
        <span className="settings-toggle-title">{uiText('calendar.localGroups.title')}</span>
        <span className="settings-toggle-desc">{uiText('calendar.localGroups.description')}</span>
      </span>
      <div className="settings-colorrules settings-groups" role="list" aria-label={uiText('calendar.localGroups.title')}>
        {saveError && <span role="alert" className="settings-path-error">{uiText('calendar.localGroups.saveError')}</span>}
        {local.map((group, index) => {
          // Host-drawn controls are matched to their slot, so a moved row
          // remounts them; otherwise they keep the values of the row that was there.
          const slot = `${group.id}@${index}`
          const handleProps = reorder.getHandleProps(group)
          const subgroups = subgroupsOf(local, group.id).length
          const count = group.parent ? usage[group.id] ?? 0 : total(group)
          const blocked = count > 0 || subgroups > 0
          const draftHere = subgroupOf !== null && (local[index + 1]?.parent ?? null) !== subgroupOf
            && (group.id === subgroupOf || group.parent === subgroupOf)
          return (
            <React.Fragment key={group.id}>
            <div
              role="listitem"
              className={`settings-colorrule-row${group.parent ? ' settings-group-sub' : ''}${dropClass(group, index)}`}
              {...dropProps(group)}
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
              <ColorField
                key={`color:${slot}`}
                value={group.color}
                onChange={(color) => update(group.id, (current) => ({ ...current, color }))}
                ariaLabel={uiText('calendar.localGroups.colorOf', { p0: group.name })}
              />
              {group.parent
                ? <span aria-hidden="true" />
                : (
                  <IconButton
                    key={`addsub:${slot}`}
                    className="settings-group-addsub"
                    ariaLabel={uiText('calendar.localGroups.subgroupAddTo', { p0: group.name })}
                    title={uiText('calendar.localGroups.subgroupAdd')}
                    onClick={() => { setSubDuplicate(false); setSubColor(nextGroupColor(groups)); setSubgroupOf(group.id) }}
                  >
                    <Plus />
                  </IconButton>
                )}
              <span
                className="settings-group-usage"
                aria-label={uiText('calendar.localGroups.usage', { p0: String(count) })}
                title={uiText('calendar.localGroups.usage', { p0: String(count) })}
              >{count}</span>
              <IconButton
                key={`remove:${slot}`}
                className="settings-colormap-remove"
                aria-disabled={blocked || undefined}
                ariaLabel={uiText('calendar.localGroups.removeOf', { p0: group.name })}
                title={count > 0 ? uiText('calendar.localGroups.removeBlocked', { p0: String(count) }) : subgroups > 0 ? uiText('calendar.localGroups.removeSubgroups') : uiText('calendar.localGroups.remove')}
                onClick={() => { if (!blocked) void save(local.filter((candidate) => candidate.id !== group.id)) }}
              >
                <X />
              </IconButton>
            </div>
            {draftHere && (
              <div ref={subRow} className="settings-colorrule-row settings-group-sub">
                <span className="settings-colorrule-grip settings-colorrule-grip-placeholder" aria-hidden="true" />
                <NameInput
                  initial=""
                  placeholder={uiText('calendar.localGroups.subgroupNew')}
                  ariaLabel={uiText('calendar.localGroups.subgroupNew')}
                  invalid={subDuplicate}
                  onType={() => setSubDuplicate(false)}
                  onCommit={(value) => { void addSubgroup(value) }}
                />
                <ColorField
                  key={`sub-color:${subgroupOf}`}
                  value={subColor}
                  onChange={setSubColor}
                  ariaLabel={uiText('calendar.localGroups.newColor')}
                />
              </div>
            )}
            </React.Fragment>
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
          <ColorField
            key={`add-color:${addKey}`}
            value={draftColor}
            onChange={setDraftColor}
            ariaLabel={uiText('calendar.localGroups.newColor')}
          />
          <span aria-hidden="true" />
          <span className="settings-colorrule-add-action">
            <span className="settings-button settings-button--medium settings-colorrule-add-sizer" aria-hidden="true">{uiText('calendar.localGroups.add')}</span>
            <Button className="settings-colormap-add-btn" disabled={local.length >= LOCAL_GROUP_LIMIT} onClick={() => void add()}>
              {uiText('calendar.localGroups.add')}
            </Button>
          </span>
        </div>
        {(duplicate || subDuplicate) && <span className="settings-empty-text">{uiText('calendar.localGroups.duplicate')}</span>}
      </div>
      </div>
    </Section>
  )
}
