import {
  createAgentToolProvider,
  type AgentToolExecutionContext,
  type AgentToolProvider,
  type ValleyPluginApi
} from '@valley/plugin-sdk'

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false
})
const text = (description: string) => ({ type: 'string', description })

async function execute<T>(api: ValleyPluginApi, id: string, input: unknown, context?: AgentToolExecutionContext): Promise<T> {
  const result = await api.commands.executeOwn(id, input, { ...context, autonomous: true })
  if (!result.ok) throw new Error(result.error.message)
  return result.value as T
}

export function calendarAgentTools(api: ValleyPluginApi): AgentToolProvider {
  return createAgentToolProvider([
    {
      name: 'list_events',
      description: 'List Calendar events, optionally filtered by a day or month.',
      parameters: schema({ on: text('Optional YYYY-MM-DD day or YYYY-MM month') }),
      sideEffect: 'read',
      commandId: 'list',
      run: async (args, context) => {
        const on = String(args.on ?? '').trim()
        const input = /^\d{4}-\d{2}-\d{2}$/.test(on)
          ? { from: on, to: on }
          : /^\d{4}-\d{2}$/.test(on)
            ? { from: `${on}-01`, to: `${on}-31` }
            : { from: '', to: '' }
        const events = await execute<Array<{ title?: string; date?: string }>>(api, 'list', input, context)
        return events.length
          ? events.slice(0, 40).map((event) => `- ${event.date ?? ''}: ${event.title ?? ''}`).join('\n')
          : 'No events.'
      }
    },
    {
      name: 'add_event',
      description: 'Add an event to the Calendar plugin.',
      parameters: schema({ title: text('Event title'), date: text('Date YYYY-MM-DD') }, ['title', 'date']),
      sideEffect: 'write',
      commandId: 'add',
      run: async (args, context) => {
        const input = { title: String(args.title ?? ''), date: String(args.date ?? '') }
        const event = await execute<{ title?: string; date?: string }>(api, 'add', input, context)
        return `Added event "${event.title || input.title}" on ${event.date || input.date}.`
      }
    }
  ])
}
