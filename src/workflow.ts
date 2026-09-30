import { startReminderOwner } from './reminderOwner'
import { registerWorkflowContribution, type PluginBackendApi, type WorkflowContributionContract } from '@valley/plugin-sdk'
import type { DataRecord, EventRecord } from '@valley/plugin-sdk/types'
import { createCalendarDomain } from './domain'
import { generateId } from './lib'
import { normalizeEventRecord } from './records'
import config from '../config.json'

const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Expected ${name}.`)
  return value.trim()
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value

export function calendarWorkflowValues(raw: Record<string, unknown>): Partial<EventRecord> {
  const values: Record<string, unknown> = {}
  for (const key of ['title', 'date', 'endDate', 'startTime', 'endTime', 'note']) {
    if (raw[key] === undefined) continue
    if (typeof raw[key] !== 'string') throw new Error(`Expected ${key} to be text.`)
    values[key] = raw[key]
  }
  if (values.title !== undefined) values.title = text(values.title, 'an event title')
  for (const key of ['date', 'endDate']) if (values[key] && !validDate(String(values[key]))) throw new Error('Expected a valid event date (YYYY-MM-DD).')
  for (const key of ['startTime', 'endTime']) if (values[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(values[key]))) throw new Error('Expected a valid event time (HH:mm).')
  if (values.endDate && values.date && String(values.endDate) < String(values.date)) throw new Error('Event end date must follow its start date.')
  if (values.endTime && (!values.startTime || ((!values.endDate || values.endDate === values.date) && String(values.endTime) <= String(values.startTime)))) throw new Error('Event end time must follow its start time.')
  return values as Partial<EventRecord>
}

export function registerCalendarWorkflow(api: PluginBackendApi): () => Promise<void> {
  const domain = createCalendarDomain(api, async (event, payload) => {
    try { await api.services.emit('workflow.provider', event, JSON.parse(JSON.stringify(payload))) }
    catch (error) { api.rpc.emit('records.eventDeliveryFailed', { event, recordId: payload.record.id, message: error instanceof Error ? error.message : String(error) }) }
  })
  const offReminders = startReminderOwner(api, () => domain.list())
  const offs = [
    api.rpc.handle('records.append', payload => domain.append((payload as { record: EventRecord }).record)),
    api.rpc.handle('records.update', payload => {
      const input = payload as { id: string; record: EventRecord; expectedUpdatedAt?: string; documentRevision?: { expectedRevision: number; vaultGeneration: number } }
      return domain.update(text(input.id, 'an event id'), input.record, input.expectedUpdatedAt, input.documentRevision)
    }),
    api.rpc.handle('records.delete', payload => domain.remove(text((payload as { id: string }).id, 'an event id')))
  ]
  const contract = config.runtime.services[0].metadata.workflow as unknown as WorkflowContributionContract
  const contribution = registerWorkflowContribution(api, contract, async ({ nodeTypeId, parameters }, context) => {
    const scoped = context.api
    const emit = (event: string, payload: unknown) => scoped.services.emit('workflow.provider', event, JSON.parse(JSON.stringify(payload)))
    if (nodeTypeId === 'event.list') {
      const limit = parameters.limit === undefined ? 100 : Number(parameters.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Event limit must be between 1 and 1000.')
      const start = typeof parameters.from === 'string' && parameters.from ? parameters.from : undefined
      const end = typeof parameters.to === 'string' && parameters.to ? parameters.to : undefined
      if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end)) throw new Error('Invalid event date range.')
      const records = (await domain.list(start, end, scoped)).filter(record => (!start || (record.endDate ?? record.date) >= start) && (!end || record.date <= end)).slice(0, limit)
      return { items: records.map(record => ({ json: JSON.parse(JSON.stringify(record)) as Record<string, unknown> })) }
    }
    let record: EventRecord
    if (nodeTypeId === 'event.create') {
      const values = calendarWorkflowValues(parameters)
      const now = new Date().toISOString()
      record = normalizeEventRecord({ ...values, id: generateId('event'), title: text(values.title, 'an event title'), date: text(values.date, 'an event date'), createdAt: now, updatedAt: now } as unknown as DataRecord)
      await domain.append(record, scoped, emit)
    } else {
      const id = text(parameters.id, 'an event id')
      if (nodeTypeId === 'event.get') {
        const found = await domain.get(id, scoped)
        if (!found) throw new Error('The event no longer exists.')
        record = found
      } else if (nodeTypeId === 'event.update') {
        record = await domain.patch(id, current => {
          const values = calendarWorkflowValues({ ...current, ...parameters })
          return { ...values, allDay: !values.startTime && !values.endTime }
        }, scoped, emit)
      } else throw new Error('Unknown Calendar workflow action.')
    }
    return { items: [{ json: JSON.parse(JSON.stringify(record)) as Record<string, unknown> }] }
  })
  return async () => { await offReminders(); contribution.dispose(); offs.forEach(off => off()); await domain.dispose() }
}
