// @vitest-environment jsdom
import * as React from 'react'
import Ajv from 'ajv'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventRecord } from '@valley/plugin-sdk/types'
import config from '../config.json'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { initLocalization } from '../src/localization'
import {
  groupOfItem,
  isLocalGroupId,
  localGroupUsage,
  mergedGroups,
  normalizeLocalGroups,
  renameLocalGroup,
  resolveGroupId,
  type LocalGroup
} from '../src/localGroups'
import { visibleItems } from '../src/filters'
import type { CalItem } from '../src/items'

const events = vi.hoisted(() => ({ list: [] as Array<Partial<EventRecord>> }))
vi.mock('../src/events', async (original) => ({
  ...(await original<typeof import('../src/events')>()),
  loadEvents: vi.fn(async () => events.list),
  onChanged: vi.fn(() => () => {})
}))

afterEach(() => {
  cleanup()
  events.list = []
})

const shared = [
  { id: 'copper-finch', name: 'Copper Finch', color: 'palette:orange', aliases: ['Finches'] },
  { id: 'shared-0a1b2c3d4e5f', name: 'Moss', color: 'palette:green' }
]
const local: LocalGroup[] = [
  { id: 'local-a1b2c3d4e5f6', name: 'Banding', color: 'palette:violet' },
  { id: 'local-0f9e8d7c6b5a', name: 'Errands', color: 'palette:blue' }
]
const item = (id: string, extra: Partial<CalItem>): CalItem => ({ kind: 'event', id, title: id, date: '2026-11-13', ...extra } as CalItem)

describe('Calendar own groups', () => {
  it('keeps only valid, uniquely named groups and drops a parent that is no own group', () => {
    expect(normalizeLocalGroups([
      { id: 'local-a1', name: 'Banding', color: 'palette:violet', parent: 'copper-finch' },
      { id: 'local-a2', name: 'copper finch', color: 'palette:red' },
      { id: 'local-a3', name: 'finches', color: 'palette:red' },
      { id: 'local-a4', name: 'Banding', color: 'palette:red' },
      { id: 'group_x', name: 'Wrong id', color: 'palette:red' },
      { id: 'local-a5', name: 'Errands', color: 'palette:blue', parent: 'nowhere' },
      { id: 'local-a6', name: 'Nameless color' }
    ], shared)).toEqual([
      { id: 'local-a1', name: 'Banding', color: 'palette:violet' },
      { id: 'local-a5', name: 'Errands', color: 'palette:blue' }
    ])
    expect(isLocalGroupId('local-a1b2c3d4e5f6')).toBe(true)
    expect(isLocalGroupId('shared-a1b2c3d4e5f6')).toBe(false)
  })

  it('keeps the old name as an alias on rename', () => {
    expect(renameLocalGroup(local[1], 'Chores')).toEqual({ id: 'local-0f9e8d7c6b5a', name: 'Chores', color: 'palette:blue', aliases: ['Errands'] })
  })

  it('lists shared groups first, then its own, and resolves names against shared groups only', () => {
    const groups = mergedGroups(shared, local)
    expect(groups.map((group) => group.id)).toEqual(['copper-finch', 'shared-0a1b2c3d4e5f', 'local-a1b2c3d4e5f6', 'local-0f9e8d7c6b5a'])
    expect(groupOfItem({ groupId: 'local-a1b2c3d4e5f6' }, groups)?.name).toBe('Banding')
    expect(groupOfItem({ group: 'finches' }, groups)?.id).toBe('copper-finch')
    // A contributed item named like a Calendar-own group is not in it: other plugins do not know those groups.
    expect(groupOfItem({ group: 'Errands' }, groups)).toBeUndefined()
    expect(resolveGroupId('errands', groups)).toBe('local-0f9e8d7c6b5a')
    expect(resolveGroupId('copper-finch', groups)).toBe('copper-finch')
    expect(resolveGroupId('Unknown', groups)).toBe('Unknown')
  })

  it('hides an own group only when it is switched off itself, never with a shared group', () => {
    const groups = mergedGroups(shared, local)
    const items = [
      item('in-parent', { groupId: 'copper-finch' }),
      item('in-child', { groupId: 'local-a1b2c3d4e5f6' }),
      item('in-errands', { groupId: 'local-0f9e8d7c6b5a' }),
      item('todo-named-errands', { kind: 'sourced', group: 'Errands' } as Partial<CalItem>),
      item('ungrouped', {})
    ]
    expect(visibleItems(items, groups, ['copper-finch'], []).map((entry) => entry.id)).toEqual(['in-child', 'in-errands', 'todo-named-errands', 'ungrouped'])
    expect(visibleItems(items, groups, ['local-0f9e8d7c6b5a'], []).map((entry) => entry.id)).toEqual(['in-parent', 'in-child', 'todo-named-errands', 'ungrouped'])
  })

  it('keeps one level of subgroups and hides them with their group', () => {
    const nested = normalizeLocalGroups([
      { id: 'local-b1', name: 'Ringing', color: 'palette:blue', parent: 'local-a1' },
      { id: 'local-c1', name: 'Garden', color: 'palette:green' },
      { id: 'local-a1', name: 'Banding', color: 'palette:violet' },
      { id: 'local-b2', name: 'Nets', color: 'palette:teal', parent: 'local-b1' },
      { id: 'local-d1', name: 'Shared child', color: 'palette:red', parent: 'copper-finch' }
    ], shared)
    expect(nested.map((group) => [group.name, group.parent ?? null])).toEqual([['Garden', null], ['Banding', null], ['Ringing', 'local-a1'], ['Nets', null], ['Shared child', null]])
    const merged = mergedGroups(shared, nested)
    expect(merged.find((group) => group.name === 'Ringing')).toMatchObject({ local: true, parent: 'local-a1' })
    const items = [item('own', { groupId: 'local-a1' }), item('sub', { groupId: 'local-b1' }), item('other', { groupId: 'local-c1' }), item('none', {})]
    expect(visibleItems(items, merged, ['local-a1'], []).map((entry) => entry.id)).toEqual(['other', 'none'])
    expect(visibleItems(items, merged, ['local-b1'], []).map((entry) => entry.id)).toEqual(['own', 'other', 'none'])
  })

  it('counts events per own group', () => {
    expect(localGroupUsage([{ groupId: 'local-a1b2c3d4e5f6' }, { groupId: 'local-a1b2c3d4e5f6' }, { groupId: 'copper-finch' }, { groupId: 'constructor' }], local))
      .toEqual({ 'local-a1b2c3d4e5f6': 2, 'local-0f9e8d7c6b5a': 0 })
  })

  it('accepts the saved shape in the settings schema, so the host never rejects a save', () => {
    const field = config.settingsSchema.fields.find((candidate) => candidate.key === 'localGroups')!
    const validate = new Ajv().compile(field.schema)
    expect(validate(normalizeLocalGroups([...local, { ...renameLocalGroup(local[1], 'Chores'), id: 'local-123456abcdef' }], shared))).toBe(true)
    // A parent saved by 3.3.17 stays valid, so the host never rejects a save that still carries one.
    expect(validate([{ id: 'local-a1', name: 'X', color: 'palette:red', parent: 'copper-finch' }])).toBe(true)
    expect(validate([{ id: 'local-a1', name: 'X', color: 'palette:red', extra: true }])).toBe(false)
  })
})

describe('Calendar own groups with the host', () => {
  const setup = (settings: Record<string, unknown> = {}) => {
    const mock = createMockValleyApi({ manifest: { id: 'calendar' }, groups: shared, settings })
    initLocalization(mock.api)
    initRuntime(mock.api)
    return mock
  }

  it('reports usage for shared groups only, never for its own groups', async () => {
    const mock = setup({ localGroups: local })
    events.list = [
      { id: 'a', groupId: 'copper-finch' },
      { id: 'b', groupId: 'local-a1b2c3d4e5f6' },
      { id: 'c', groupId: 'local-0f9e8d7c6b5a' },
      { id: 'd', groupId: 'shared-0a1b2c3d4e5f' }
    ]
    const report = vi.spyOn(mock.api.workspace, 'reportGroupUsage')
    const { startGroupUsageReporting } = await import('../src/groups')
    const stop = startGroupUsageReporting()
    await vi.waitFor(() => expect(report).toHaveBeenCalled())
    expect(report).toHaveBeenLastCalledWith({ 'copper finch': 1, moss: 1 })
    stop()
  })

  it('creates an own group from Settings like the shared list and refuses to delete one in use', async () => {
    const mock = setup({ localGroups: [{ ...local[1], parent: 'copper-finch' }] })
    events.list = [{ id: 'c', groupId: 'local-0f9e8d7c6b5a' }]
    const { Settings } = await import('../src/Settings')
    render(React.createElement(Settings))
    expect(await screen.findByDisplayValue('Errands')).toHaveClass('settings-control', 'settings-colorrule-key')
    expect(await screen.findByLabelText('1 events use this group')).toHaveTextContent('1')
    const list = screen.getByRole('list', { name: 'Calendar groups' })
    expect(list).not.toHaveClass('settings-groups--parent')
    expect(within(list).queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'New Calendar group' }), { target: { value: 'Banding' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    const saved = mock.api.settings.get().localGroups as LocalGroup[]
    expect(saved).toHaveLength(2)
    expect(saved[0]).toEqual({ id: 'local-0f9e8d7c6b5a', name: 'Errands', color: 'palette:blue' })
    expect(saved[1]).toMatchObject({ name: 'Banding' })
    expect(saved[1]).not.toHaveProperty('parent')
    expect(saved[1].id).toMatch(/^local-[0-9a-f]{12}$/)

    const remove = screen.getByRole('button', { name: 'Remove Errands' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAttribute('title', 'Still used by 1 events — move them to another group to delete it')
    await act(async () => { fireEvent.click(remove) })
    expect((mock.api.settings.get().localGroups as LocalGroup[]).map((group) => group.name)).toEqual(['Errands', 'Banding'])

    fireEvent.change(screen.getByRole('textbox', { name: 'New Calendar group' }), { target: { value: 'moss' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    expect(screen.getByText('A group with that name already exists.')).toBeInTheDocument()
    expect(mock.api.settings.get().localGroups).toHaveLength(2)
  })

  it('adds a subgroup from the + of an own group, counts its events under the group and keeps both from removal', async () => {
    const mock = setup({ localGroups: [
      { id: 'local-0f9e8d7c6b5a', name: 'Errands', color: 'palette:blue' },
      { id: 'local-1a2b3c4d5e6f', name: 'Post', color: 'palette:green', parent: 'local-0f9e8d7c6b5a' },
      { id: 'local-aaaaaaaaaaaa', name: 'Garden', color: 'palette:red' }
    ] })
    events.list = [{ id: 'c', groupId: 'local-1a2b3c4d5e6f' }]
    const { Settings } = await import('../src/Settings')
    render(React.createElement(Settings))
    const row = (name: string): Element => screen.getByDisplayValue(name).closest('.settings-colorrule-row')!
    await screen.findByDisplayValue('Post')
    expect(row('Post')).toHaveClass('settings-group-sub')
    expect(row('Errands')).not.toHaveClass('settings-group-sub')
    expect(screen.queryByRole('button', { name: 'Add subgroup to Post' })).toBeNull()
    await vi.waitFor(() => expect(row('Errands').querySelector('.settings-group-usage')).toHaveTextContent('1'))
    expect(screen.getByRole('button', { name: 'Remove Errands' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Remove Garden' })).not.toHaveAttribute('aria-disabled')

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add subgroup to Errands' })) })
    const input = screen.getByRole('textbox', { name: 'New subgroup' })
    expect(input).toHaveFocus()
    expect(input.closest('.settings-colorrule-row')!.previousElementSibling).toBe(row('Post'))
    fireEvent.change(input, { target: { value: 'Bank' } })
    await act(async () => { fireEvent.blur(input) })
    const saved = (): Array<[string, string | null]> => (mock.api.settings.get().localGroups as LocalGroup[]).map((group) => [group.name, group.parent ?? null])
    expect(saved()).toEqual([['Errands', null], ['Post', 'local-0f9e8d7c6b5a'], ['Bank', 'local-0f9e8d7c6b5a'], ['Garden', null]])
    expect(screen.queryByRole('textbox', { name: 'New subgroup' })).toBeNull()

    // Keyboard reordering keeps a subgroup under its group.
    await act(async () => { fireEvent.keyDown(row('Bank').querySelector('.settings-colorrule-grip')!, { key: 'ArrowUp' }) })
    expect(saved()).toEqual([['Errands', null], ['Bank', 'local-0f9e8d7c6b5a'], ['Post', 'local-0f9e8d7c6b5a'], ['Garden', null]])
  })
})
