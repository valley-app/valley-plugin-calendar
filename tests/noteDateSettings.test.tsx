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

/** The note-date source the development vault seeds for birthdays. */
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

describe('Calendar note-date source editor', () => {
  it.each([false, true])('persists JSON-safe source definitions when title focus ends (edited: %s)', async (edited) => {
    const mock = await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })
    const dataset = mock.api.data.dataset
    const batch = vi.fn()
    mock.api.data.dataset = ((id: string) => {
      const handle = dataset(id)
      return { ...handle, batch: async (operations) => { batch(operations); return handle.batch(operations) } }
    }) as typeof dataset
    const title = document.querySelector<HTMLInputElement>('.notedate-source-title')!
    fireEvent.focus(title)
    if (edited) fireEvent.change(title, { target: { value: 'Field dates' } })
    fireEvent.blur(title)
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1))
    const operations = batch.mock.calls[0][0]
    expect(operations).toStrictEqual(JSON.parse(JSON.stringify(operations)))
    expect(mock.datasets.get('calendar.note_date_sources')?.[0]?.definition).toMatchObject({
      title: edited ? 'Field dates' : 'Birthdays', visible: true, hidden: false, showFields: []
    })
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
    // colour — so both start as the dashed "no colour set" chip.
    expect(fill.getAttribute('data-unset')).toBe('true')
    expect(ring.getAttribute('data-unset')).toBe('true')
  })

  it('paints the glyph swatch through custom properties, never a resolved colour', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })

    const swatch = document.querySelector('.notedate-source-swatch') as HTMLElement
    expect(swatch.style.getPropertyValue('--swatch-fill')).toBe('var(--color-primary-blue)')
    expect(swatch.style.getPropertyValue('--swatch-on')).toBe('var(--color-primary-blue-on)')
    expect(swatch.style.background).toBe('')
  })

  it('gives Hide and Delete a glyph each, as the Map pin-source row does', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })

    const actions = document.querySelector('.notedate-source-actions') as HTMLElement
    const [hide, remove] = within(actions).getAllByRole('button')
    expect(hide).toHaveTextContent('Hide')
    expect(remove).toHaveTextContent('Delete')
    for (const button of [hide, remove]) {
      expect(button.getAttribute('data-variant')).toBe('ghost')
      expect(button.getAttribute('data-size')).toBe('small')
      expect(button.querySelector('svg')).not.toBeNull()
    }
  })

  it('arms Delete before it deletes, and turns the kit button red while armed', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE] })

    const actions = document.querySelector('.notedate-source-actions') as HTMLElement
    const remove = within(actions).getAllByRole('button')[1]
    fireEvent.click(remove)
    await waitFor(() => expect(remove).toHaveTextContent('Confirm'))
    expect(remove.getAttribute('data-variant')).toBe('danger')
    // Still one row: the first click arms, it does not delete.
    expect(document.querySelectorAll('.notedate-source-row')).toHaveLength(1)
  })

  it('still reports what the rule finds', async () => {
    await renderSection({
      noteDateSources: [BIRTHDAYS_SOURCE],
      indexEntries: [contact('Tim Cook', '1960-11-01'), contact('Ed Catmull', '1945-03-31')]
    })

    expect(document.querySelector('.notedate-source-stats')).toHaveTextContent('2 notes match')
  })

  it('keeps empty results neutral while reporting unusable dates', async () => {
    await renderSection({ noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'invalid-date', title: 'Undated', matchValue: 'observation' }], indexEntries: [{ ...contact('Canopy observation', ''), frontmatter: { type: 'observation' } }] })
    const rows = document.querySelectorAll('.notedate-source-row')
    expect(rows[0].querySelector('.notedate-source-stats')).toHaveTextContent('0 notes found')
    expect(rows[0].querySelector('.notedate-source-stats.warn')).toBeNull()
    expect(rows[1].querySelector('.notedate-source-stats.warn')).toHaveTextContent('birthdate')
  })

  it('reveals the saved folder through the Advanced disclosure', async () => {
    await renderSection({ noteDateSources: [{ ...BIRTHDAYS_SOURCE, folder: 'Archive/Contacts' }] })
    const button = within(document.body).getByRole('button', { name: 'Advanced' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(within(document.body).queryByRole('textbox', { name: 'Folder scope' })).toBeNull()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(document.body).getByRole('textbox', { name: 'Folder scope' })).toHaveValue('Archive/Contacts')
    fireEvent.click(button)
    expect(within(document.body).queryByRole('textbox', { name: 'Folder scope' })).toBeNull()
  })
})


it('collapses details, toggles all sources, and persists keyboard ordering in settings', async () => {
  const mock = await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'season', title: 'Season', hidden: true }] })
  expect(document.querySelector('.notedate-source-grid')).toBeNull()
  const controls = document.querySelectorAll('.notedate-source-grip')
  await act(async () => fireEvent.keyDown(controls[0], { key: 'ArrowDown' }))
  await waitFor(() => expect(document.querySelector('.notedate-source-summary')).toHaveTextContent('Season'))
  const rows = mock.datasets.get('calendar.note_date_sources')!
  expect(rows.find(row => row.id === 'season')).toMatchObject({ position: 0, definition: { hidden: true } })
  await act(async () => fireEvent.click(document.querySelector('.notedate-sources-header input')!))
  await waitFor(() => expect(mock.datasets.get('calendar.note_date_sources')!.every(row => !(row.definition as Record<string, unknown>).visible)).toBe(true))
  await act(async () => fireEvent.click(document.querySelector('.notedate-source-disclosure')!))
  expect(document.querySelector('.notedate-source-grid')).not.toBeNull()
})


it('shares sidebar ordering and visibility with settings while retaining hidden source definitions', async () => {
  const mock = await renderSection({ expand: false, noteDateSources: [BIRTHDAYS_SOURCE, { ...BIRTHDAYS_SOURCE, id: 'hidden', title: 'Hidden', hidden: true }, { ...BIRTHDAYS_SOURCE, id: 'season', title: 'Season' }] })
  render(<NoteDateSourceFilterList />)
  await waitFor(() => expect(document.querySelectorAll('.notedate-sidebar-row')).toHaveLength(2))
  await act(async () => fireEvent.keyDown(document.querySelector('.notedate-sidebar-row .notedate-source-grip')!, { key: 'ArrowDown' }))
  await waitFor(() => expect(document.querySelector('.notedate-source-summary')).toHaveTextContent('Season'))
  expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'hidden')).toMatchObject({ position: 1, definition: { hidden: true } })
  await act(async () => fireEvent.click(document.querySelector('.notedate-sidebar-sources .notedate-sources-header input')!))
  await waitFor(() => expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'season')!.definition).toMatchObject({ visible: false }))
  expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'hidden')!.definition).toMatchObject({ visible: true, hidden: true })
  fireEvent.click(document.querySelector('.notedate-sidebar-row .notedate-source-disclosure')!)
  expect(document.querySelector('.notedate-sidebar-details')).toHaveTextContent('birthdate')
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
  await waitFor(() => expect(document.querySelector('.notedate-source-summary')).toHaveTextContent('Season B'))
  expect(mock.datasets.get('calendar.note_date_sources')!.find(row => row.id === 'unmatched')).toMatchObject({ position: 1, definition: { title: 'Monthly' } })
  fireEvent.change(search, { target: { value: 'missing' } })
  expect(within(document.body).getByText('0 sources found')).toBeTruthy()
  fireEvent.change(search, { target: { value: '' } })
  expect(document.querySelectorAll('.notedate-source-row')).toHaveLength(3)
})
