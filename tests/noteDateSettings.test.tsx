import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IndexEntry } from '@valley/plugin-sdk/types'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { initLocalization } from '../src/localization'
import { NoteDatesSection } from '../src/NoteDateSettings'
import { NoteDateSourceFilterList } from '../src/filters'

afterEach(cleanup)

const contact = (name: string, birthdate: string): IndexEntry => ({
  relPath: `Archive/Contacts/${name}.md`,
  title: name,
  kind: 'note',
  frontmatter: { type: 'contact', birthdate },
  mtimeMs: 0
})

/** The note-date source the development realm seeds for birthdays. */
const BIRTHDAYS_SOURCE = {
  id: 'notedate-birthdays',
  title: 'Birthdays',
  matchKey: 'type',
  matchValue: 'contact',
  dateField: 'birthdate',
  match: 'day-month',
  recurrenceLimitYears: 2,
  showCount: true,
  labelMode: 'filename',
  showFields: [],
  visible: true,
  hidden: false,
  icon: 'cake',
  color: 'palette:primary-blue'
}

async function renderSection(
  options: { noteDateSources?: Record<string, unknown>[]; indexEntries?: IndexEntry[]; expand?: boolean } = {}
): Promise<ReturnType<typeof createMockValleyApi>> {
  const mock = createMockValleyApi({
    manifest: { id: 'calendar' },
    indexEntries: options.indexEntries,
    datasets: {
      'calendar.note_date_sources': (options.noteDateSources ?? []).map((definition, position) => ({
        id: definition.id,
        position,
        definition
      }))
    }
  })
  initLocalization(mock.api)
  initRuntime(mock.api)
  render(React.createElement(NoteDatesSection))
  await waitFor(() => expect(document.querySelector('.notedate-source-row')).not.toBeNull())
  if (options.expand !== false) for (const button of document.querySelectorAll('.notedate-source-disclosure')) fireEvent.click(button)
  return mock
}

const stored = (mock: ReturnType<typeof createMockValleyApi>): Record<string, unknown>[] =>
  (mock.datasets.get('calendar.note_date_sources') ?? []).map(row => row.definition as Record<string, unknown>)

describe('Calendar note-date source editor', () => {
  it.each([false, true])('persists JSON-safe source definitions when the name field commits (edited: %s)', async (edited) => {
    const mock = await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })
    const dataset = mock.api.data.dataset
    const batch = vi.fn()
    mock.api.data.dataset = ((id: string) => {
      const handle = dataset(id)
      return { ...handle, batch: async (operations) => { batch(operations); return handle.batch(operations) } }
    }) as typeof dataset
    const title = within(document.body).getByRole('textbox', { name: 'Source name' })
    fireEvent.focus(title)
    if (edited) fireEvent.change(title, { target: { value: 'Field dates' } })
    fireEvent.blur(title)
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1))
    const operations = batch.mock.calls[0][0]
    expect(operations).toStrictEqual(JSON.parse(JSON.stringify(operations)))
    expect(stored(mock)[0]).toMatchObject({ title: edited ? 'Field dates' : 'Birthdays', visible: true, hidden: false, showFields: [] })
  })

  it('draws its colours with the same kit chips, in the same order, as the Map pin editor', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })

    const chips = document.querySelectorAll('.notedate-source-color .settings-color-swatch')
    expect(chips).toHaveLength(2)
    expect(chips[0].getAttribute('data-variant')).toBe('fill')
    expect(chips[1].getAttribute('data-variant')).toBe('ring')
    expect(chips[0].getAttribute('data-color')).toBe('palette:primary-blue')
  })

  it('marks an unset colour as unset rather than painting the fallback blue', async () => {
    await renderSection({ noteDateSources: [{ ...BIRTHDAYS_SOURCE, color: undefined }] })

    const [fill, ring] = document.querySelectorAll('.notedate-source-color .settings-color-swatch')
    // Both are optional here — unlike the Map's, where a pin must have a body
    // colour — so both start as the "no colour set" chip.
    expect(fill.getAttribute('data-unset')).toBe('true')
    expect(ring.getAttribute('data-unset')).toBe('true')
    expect(document.querySelector('.notedate-source-disc')).toHaveClass('unset')
  })

  it('paints the source disc through custom properties, never a resolved colour', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })

    const disc = document.querySelector('.notedate-source-disc') as HTMLElement
    expect(disc.style.getPropertyValue('--swatch-fill')).toBe('var(--color-primary-blue)')
    expect(disc.style.getPropertyValue('--swatch-on')).toBe('var(--color-primary-blue-on)')
    expect(disc.style.background).toBe('')
  })

  it('gives Delete a glyph on a kit Button and arms it before deleting', async () => {
    const mock = await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })

    const footer = document.querySelector('.notedate-source-footer') as HTMLElement
    const remove = within(footer).getByRole('button')
    expect(remove).toHaveTextContent('Delete source')
    expect(remove.getAttribute('data-variant')).toBe('ghost')
    expect(remove.getAttribute('data-size')).toBe('small')
    expect(remove.querySelector('svg')).not.toBeNull()
    fireEvent.click(remove)
    await waitFor(() => expect(remove).toHaveTextContent('Confirm'))
    expect(remove.getAttribute('data-variant')).toBe('danger')
    // Still one row: the first click arms, it does not delete.
    expect(document.querySelectorAll('.notedate-source-row')).toHaveLength(1)
    await act(async () => fireEvent.click(remove))
    await waitFor(() => expect(stored(mock)).toHaveLength(0))
  })

  it('still reports what the rule finds', async () => {
    await renderSection({
      noteDateSources: [BIRTHDAYS_SOURCE],
      indexEntries: [contact('Tim Cook', '1960-11-01'), contact('Ed Catmull', '1945-03-31')]
    })

    expect(document.querySelector('.notedate-source-stats')).toHaveTextContent('2 notes found · 2 with a usable date')
    expect(document.querySelector('.notedate-source-count')).toHaveTextContent(/^2$/)
  })

  it('keeps empty results neutral while reporting unusable dates', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'invalid-date', title: 'Undated', matchValue: 'observation' }], indexEntries: [{ ...contact('Canopy observation', ''), frontmatter: { type: 'observation' } }] })
    const rows = document.querySelectorAll('.notedate-source-row')
    expect(rows[0].querySelector('.notedate-source-stats')).toHaveTextContent(/^0 notes found$/)
    expect(rows[0].querySelector('.notedate-source-stats.warn')).toBeNull()
    expect(rows[0].querySelector('.notedate-source-warn')).toBeNull()
    expect(rows[1].querySelector('.notedate-source-stats.warn')).toHaveTextContent('1 note found · none has a usable “birthdate”')
    expect(rows[1].querySelector('.notedate-source-sub .notedate-source-warn')).toHaveTextContent('birthdate')
  })

  it('lays the editor out as Name, then Notes, Date and Entry, then use and delete', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })
    const editor = document.querySelector('.notedate-source-editor') as HTMLElement
    expect([...editor.querySelectorAll('.notedate-source-group > .notedate-source-group-title')].map(node => node.textContent)).toEqual(['Notes', 'Date', 'Entry'])
    expect([...editor.querySelectorAll('.notedate-source-form-label')].map(node => node.textContent).filter(Boolean)).toEqual([
      'Name', 'Folder', 'Property', 'Property', 'Format', 'Repeats', 'Show count', 'Range (years)', 'Time', 'Look', 'Title', 'Show'
    ])
    // The name is edited in the form, never in the head; the status sits under the rule.
    expect(within(editor).getByRole('textbox', { name: 'Source name' })).toHaveValue('Birthdays')
    expect(document.querySelector('.notedate-source-head input:not([type=checkbox])')).toBeNull()
    expect((editor.querySelector('.notedate-source-stats') as HTMLElement).closest('.notedate-source-group')).toHaveTextContent('Notes')
    // The folder sits next to the rule, never behind an Advanced disclosure.
    expect(within(editor).getByRole('textbox', { name: 'Folder scope' }).closest('.notedate-source-group')).toHaveTextContent('Notes')
    expect(within(editor).queryByRole('button', { name: 'Advanced' })).toBeNull()
    expect(editor.querySelector('.notedate-source-footer')).toHaveTextContent('Use this source')
    // Shared kit widgets only: no raw inputs of the plugin's own.
    expect(editor.querySelector('input.notedate-source-title, .notedate-source-show, .notedate-source-advanced')).toBeNull()
  })

  it('edits every rule, date and entry control and saves each value', async () => {
    const mock = await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })
    const editor = document.querySelector('.notedate-source-editor') as HTMLElement
    const commitText = async (name: string, value: string): Promise<void> => {
      const field = within(editor).getByRole('textbox', { name })
      fireEvent.change(field, { target: { value } })
      await act(async () => fireEvent.blur(field))
    }
    await commitText('Folder scope', 'Archive/Contacts')
    await waitFor(() => expect(stored(mock)[0].folder).toBe('Archive/Contacts'))
    await commitText('Frontmatter key', 'kind')
    await commitText('Frontmatter value', 'person')
    await waitFor(() => expect(stored(mock)[0]).toMatchObject({ matchKey: 'kind', matchValue: 'person' }))
    await commitText('Date property', 'born')
    await commitText('Date format', 'dd.mm.yyyy')
    await waitFor(() => expect(stored(mock)[0]).toMatchObject({ dateField: 'born', dateFormat: 'dd.mm.yyyy' }))
    await commitText('Start time property', 'start')
    await commitText('End time property', 'end')
    await waitFor(() => expect(stored(mock)[0]).toMatchObject({ startTimeField: 'start', endTimeField: 'end' }))

    await act(async () => fireEvent.click(within(editor).getByRole('switch', { name: 'Show count' })))
    await waitFor(() => expect(stored(mock)[0].showCount).toBe(false))
    await act(async () => fireEvent.click(within(within(editor).getByRole('group', { name: 'Date match' })).getByRole('button', { name: 'Every month' })))
    await waitFor(() => expect(stored(mock)[0].match).toBe('day'))
    expect(within(editor).queryByRole('switch', { name: 'Show count' })).toBeNull()
    await act(async () => fireEvent.click(within(within(editor).getByRole('group', { name: 'Date match' })).getByRole('button', { name: 'Exact date' })))
    await waitFor(() => expect(stored(mock)[0].match).toBe('exact'))
    expect(within(editor).queryByRole('spinbutton', { name: 'Recurring date range in years' })).toBeNull()

    await act(async () => fireEvent.click(within(within(editor).getByRole('group', { name: 'Title' })).getByRole('button', { name: 'Property' })))
    await waitFor(() => expect(stored(mock)[0].labelMode).toBe('property'))
    await commitText('Title property', 'firstName')
    await waitFor(() => expect(stored(mock)[0].labelField).toBe('firstName'))

    const chips = within(editor).getByRole('textbox', { name: 'Fields to show' })
    fireEvent.change(chips, { target: { value: ' phone ' } })
    await act(async () => fireEvent.keyDown(chips, { key: 'Enter' }))
    await waitFor(() => expect(stored(mock)[0].showFields).toEqual(['phone']))

    await act(async () => fireEvent.click(within(editor).getByRole('button', { name: 'Clear Entry colour' })))
    await waitFor(() => expect(stored(mock)[0].color).toBeUndefined())
  })

  it('picks the entry icon from a popover that also carries the icon folder actions', async () => {
    const mock = await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })
    const open = vi.spyOn(mock.api.ui, 'openPopover').mockResolvedValue(undefined)
    fireEvent.click(within(document.body).getByRole('button', { name: 'Entry icon' }))
    expect(open).toHaveBeenCalledTimes(1)
    const close = vi.fn()
    const content = open.mock.calls[0][0]({ close } as never)
    const popover = render(<>{content}</>)
    expect(within(popover.container).getByRole('button', { name: 'Open icon folder' })).toBeInTheDocument()
    expect(within(popover.container).getByRole('button', { name: 'Refresh icons' })).toBeInTheDocument()
    await act(async () => fireEvent.click(within(popover.container).getByRole('button', { name: 'No icon' })))
    expect(close).toHaveBeenCalled()
    await waitFor(() => expect(stored(mock)[0].icon).toBeUndefined())
    // No Date icons row on the page any more.
    expect(within(document.body).queryByText('Date icons')).toBeNull()
  })

  it('turns a source off with Use this source and disables its row switch', async () => {
    const mock = await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })
    const use = within(document.body).getByRole('switch', { name: 'Use this source' })
    expect(use).toBeChecked()
    await act(async () => fireEvent.click(use))
    await waitFor(() => expect(stored(mock)[0].hidden).toBe(true))
    const row = within(document.body).getByRole('switch', { name: 'Birthdays' })
    expect(row).toBeDisabled()
    expect(row).not.toBeChecked()
    expect(document.querySelector('.notedate-source-row')).toHaveClass('is-off')
    expect(document.querySelector('.notedate-source-count')).toHaveTextContent('–')
    expect(document.querySelector('.notedate-source-sub')).toHaveTextContent(/^Turned off · type = contact$/)
    expect(document.querySelector('.notedate-source-stats')).toHaveTextContent(/^0 notes found · Turned off$/)
    await act(async () => fireEvent.click(within(document.body).getByRole('switch', { name: 'Use this source' })))
    await waitFor(() => expect(stored(mock)[0].hidden).toBe(false))
    expect(within(document.body).getByRole('switch', { name: 'Birthdays' })).not.toBeDisabled()
  })

  it('mounts only the visibility switch in a collapsed row and states rule, folder and count', async () => {
    await renderSection({ expand: false, noteDateSources: [{ ...BIRTHDAYS_SOURCE, folder: 'Archive/Contacts' }], indexEntries: [contact('Tim Cook', '1960-11-01')] })
    const row = document.querySelector('.notedate-source-row') as HTMLElement
    expect(row.querySelector('.settings-color-swatch, .notedate-source-icon-btn')).toBeNull()
    expect(within(row).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(row).queryByRole('combobox')).toBeNull()
    expect(within(row).getAllByRole('switch')).toHaveLength(1)
    expect(row.querySelector('.notedate-source-name')).toHaveTextContent('Birthdays')
    expect(row.querySelector('.notedate-source-sub')).toHaveTextContent(/^type = contact · Archive\/Contacts$/)
    const count = row.querySelector('.notedate-source-count') as HTMLElement
    expect(count).toHaveTextContent(/^1$/)
    expect(count).toHaveAttribute('title', '1 note found · 1 with a usable date')
  })

  it('names an untitled source and the whole realm in its collapsed row', async () => {
    await renderSection({ expand: false, noteDateSources: [{ ...BIRTHDAYS_SOURCE, title: '' }] })
    expect(document.querySelector('.notedate-source-name')).toHaveTextContent('Untitled')
    expect(document.querySelector('.notedate-source-sub')).toHaveTextContent('type = contact · Whole realm')
  })

  it('keeps the head identical open and closed, with the chevron between the count and the switch', async () => {
    await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE] })
    const head = document.querySelector('.notedate-source-head') as HTMLElement
    const snapshot = (): unknown => ({ meta: head.querySelector('.notedate-source-meta')!.outerHTML, count: head.querySelector('.notedate-source-count')!.outerHTML, children: [...head.children].map(node => node.className || node.tagName) })
    const closed = snapshot()
    const order = [...head.children]
    const chevron = order.indexOf(head.querySelector('.notedate-source-disclosure')!)
    expect(chevron).toBe(order.indexOf(head.querySelector('.notedate-source-count')!) + 1)
    expect(order[chevron + 1]).toBe(within(head).getByRole('switch', { name: 'Birthdays' }))
    fireEvent.click(head.querySelector('.notedate-source-count')!)
    expect(document.querySelector('.notedate-source-editor')).not.toBeNull()
    expect(head.querySelector('.notedate-source-disclosure')).toHaveAttribute('aria-expanded', 'true')
    expect(snapshot()).toEqual(closed)
    // The row switch never opens or closes the source.
    await act(async () => fireEvent.click(within(head).getByRole('switch', { name: 'Birthdays' })))
    expect(document.querySelector('.notedate-source-editor')).not.toBeNull()
    fireEvent.click(head.querySelector('.notedate-source-name')!)
    expect(document.querySelector('.notedate-source-editor')).toBeNull()
  })

  it('expands and collapses every listed source from the toolbar', async () => {
    await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'second', title: 'Second' }] })
    const toolbar = document.querySelector('.notedate-sources-toolbar') as HTMLElement
    const opened = (): boolean[] => [...document.querySelectorAll('.notedate-source-row')].map(row => row.classList.contains('is-open'))
    const fold = within(toolbar).getByRole('button', { name: 'Expand all sources' })
    expect(fold).toHaveClass('panel-tool-btn')
    expect(fold.previousElementSibling).toHaveClass('notedate-sources-search')
    expect(fold.nextElementSibling).toHaveClass('notedate-add-source-row')
    fireEvent.click(fold)
    expect(opened()).toEqual([true, true])
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Collapse all sources' }))
    expect(opened()).toEqual([false, false])
  })

  it('fills the pane and keeps the Note dates bar outside the scrolling content', async () => {
    const config = (await import('../config.json')).default as { settingsSections: { id: string; layout?: string }[] }
    expect(config.settingsSections.find(section => section.id === 'dates')?.layout).toBe('fill')
    expect(config.settingsSections.filter(section => section.layout === 'fill').map(section => section.id)).toEqual(['dates'])
    await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE] })
    expect(document.querySelector('.notedate-settings-frame')).toHaveAttribute('data-plugin-widget-layout', 'fill')
    const bar = document.querySelector('.notedate-sources-header') as HTMLElement
    const body = document.querySelector('.notedate-settings') as HTMLElement
    expect(bar).toHaveClass('settings-listpage-header')
    expect(within(bar).getByRole('switch', { name: 'All sources' })).toBeInTheDocument()
    expect(body.contains(bar)).toBe(false)
    for (const part of ['.notedate-sources-description', '.notedate-sources-toolbar', '.notedate-source-list']) expect(body.querySelector(part), part).not.toBeNull()
  })

  it('adds a new source first, opened, through the preset menu', async () => {
    const mock = await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE] })
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: /Add source/i })))
    await act(async () => { await mock.menus.at(-1)?.find(entry => entry.id === 'blank')?.onSelect?.({ newTab: false }) })
    await waitFor(() => expect(document.querySelectorAll('.notedate-source-row')).toHaveLength(2))
    expect([...document.querySelectorAll('.notedate-source-row')].map(row => row.classList.contains('is-open'))).toEqual([true, false])
    expect(document.querySelector('.notedate-source-name')).toHaveTextContent('Untitled')
    await waitFor(() => expect(stored(mock)).toHaveLength(2))
    expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'notedate-birthdays')).toMatchObject({ position: 1 })
    expect(scroll).toHaveBeenCalledTimes(1)
    // Editing the new source afterwards never scrolls the page back up.
    const name = within(document.querySelector('.notedate-source-editor') as HTMLElement).getByRole('textbox', { name: 'Source name' })
    fireEvent.change(name, { target: { value: 'Field days' } })
    await act(async () => fireEvent.blur(name))
    await waitFor(() => expect(stored(mock).some(source => source.title === 'Field days')).toBe(true))
    expect(scroll).toHaveBeenCalledTimes(1)
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })
})

it('collapses details, toggles all sources, and persists keyboard ordering in settings', async () => {
  const mock = await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'season', title: 'Season', hidden: true }] })
  expect(document.querySelector('.notedate-source-editor')).toBeNull()
  const controls = document.querySelectorAll('.notedate-source-grip')
  await act(async () => fireEvent.keyDown(controls[0], { key: 'ArrowDown' }))
  await waitFor(() => expect(document.querySelector('.notedate-source-name')).toHaveTextContent('Season'))
  const rows = mock.datasets.get('calendar.note_date_sources')!
  expect(rows.find(row => row.id === 'season')).toMatchObject({ position: 0, definition: { hidden: true } })
  await act(async () => fireEvent.click(document.querySelector('.notedate-sources-header input')!))
  await waitFor(() => expect(mock.datasets.get('calendar.note_date_sources')!.every(row => !(row.definition as Record<string, unknown>).visible)).toBe(true))
  await act(async () => fireEvent.click(document.querySelector('.notedate-source-disclosure')!))
  expect(document.querySelector('.notedate-source-editor')).not.toBeNull()
})


it('shares sidebar ordering and visibility with settings while retaining hidden source definitions', async () => {
  const contacts: IndexEntry[] = [{ relPath: 'People/Fern.md', title: 'Fern', kind: 'note', frontmatter: { type: 'contact', birthdate: '1990-05-04' }, mtimeMs: 0 } as IndexEntry]
  const mock = await renderSection({ expand: false, indexEntries: contacts, noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'hidden', title: 'Hidden', hidden: true }, { ...BIRTHDAYS_SOURCE, id: 'season', title: 'Season' }, { ...BIRTHDAYS_SOURCE, id: 'empty', title: 'Empty', matchValue: 'nobody' }] })
  render(<NoteDateSourceFilterList />)
  await waitFor(() => expect([...document.querySelectorAll('.notedate-tree-source .notedate-row-title')].map(node => node.textContent)).toEqual(['Birthdays', 'Season']))
  expect(document.querySelector('.notedate-sidebar-sources [role="switch"]')).toBeNull()
  await act(async () => fireEvent.keyDown(document.querySelector('.notedate-tree-source')!, { key: 'ArrowDown', altKey: true }))
  await waitFor(() => expect(document.querySelector('.notedate-source-name')).toHaveTextContent('Season'))
  expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'hidden')).toMatchObject({ position: 1, definition: { hidden: true } })
  await act(async () => fireEvent.click(within(document.querySelector('.notedate-sidebar-bar') as HTMLElement).getByRole('button', { name: 'Hide all note dates in the calendar' })))
  await waitFor(() => expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'season')!.definition).toMatchObject({ visible: false }))
  expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'hidden')!.definition).toMatchObject({ visible: true, hidden: true })
  await act(async () => fireEvent.click(document.querySelector('.notedate-tree-source')!))
  await waitFor(() => expect([...document.querySelectorAll('.notedate-tree-row:not(.notedate-tree-source) .notedate-row-title')].map(node => node.textContent)).toEqual(['Fern']))
  fireEvent.click(within(document.querySelector('.notedate-sidebar-bar') as HTMLElement).getByRole('button', { name: 'Add date source' }))
  expect(mock.api.workspace.openOwnSettings).toHaveBeenCalledWith('dates')
})

it('searches source titles and folders without losing filtered-out definitions during reordering', async () => {
  const mock = await renderSection({ expand: false, noteDateSources: [
    { ...BIRTHDAYS_SOURCE, title: 'Season A', folder: 'examples/yearly' },
    { ...BIRTHDAYS_SOURCE, id: 'unmatched', title: 'Monthly', folder: 'examples/monthly' },
    { ...BIRTHDAYS_SOURCE, id: 'season-b', title: 'Season B', folder: 'examples/yearly' }
  ] })
  const search = within(document.body).getByRole('textbox', { name: 'Find date sources' })
  fireEvent.change(search, { target: { value: 'yearly' } })
  expect(document.querySelectorAll('.notedate-source-row')).toHaveLength(2)
  await act(async () => fireEvent.keyDown(document.querySelector('.notedate-source-grip')!, { key: 'ArrowDown' }))
  await waitFor(() => expect(document.querySelector('.notedate-source-name')).toHaveTextContent('Season B'))
  expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'unmatched')).toMatchObject({ position: 1, definition: { title: 'Monthly' } })
  fireEvent.change(search, { target: { value: 'missing' } })
  expect(within(document.body).getByText('0 sources found')).toBeTruthy()
  fireEvent.change(search, { target: { value: '' } })
  expect(document.querySelectorAll('.notedate-source-row')).toHaveLength(3)
})
