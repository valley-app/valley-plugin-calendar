import { React, api } from './runtime'
import { uiText } from './localization'

const MAX_MINUTES = 10080

/** "1:30" → 90. Hours up to 168, minutes 00–59; anything else is not a time. */
export function parseReminderTime(value: string): number | null {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes <= MAX_MINUTES ? minutes : null
}

/** 90 → "01:30", 10 → "00:10". */
export function formatReminderTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * The hh:mm field of a reminder, as in To-Do (18 Nov): digits and one colon
 * only, saved on blur or Enter and only when it is a valid time.
 */
function ReminderTime({ minutes, onCommit, onInvalid }: { minutes: number; onCommit(minutes: number): void; onInvalid(invalid: boolean): void }) {
  const [text, setText] = React.useState(() => formatReminderTime(minutes))
  const [invalid, setInvalid] = React.useState(false)
  React.useEffect(() => { setText(formatReminderTime(minutes)); setInvalid(false); onInvalid(false) }, [minutes])
  const commit = (): void => {
    const next = parseReminderTime(text)
    setInvalid(next === null)
    onInvalid(next === null)
    if (next !== null && next !== minutes) onCommit(next)
  }
  return <input
    className={`settings-control calendar-reminder-time${invalid ? ' invalid' : ''}`}
    type="text"
    inputMode="numeric"
    value={text}
    placeholder="0:10"
    aria-label={uiText('reminders.timeBefore')}
    aria-invalid={invalid || undefined}
    maxLength={6}
    onChange={(event) => { setText(event.currentTarget.value.replace(/[^\d:]/g, '').replace(/:(?=.*:)/g, '')); setInvalid(false); onInvalid(false) }}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }}
  />
}

/**
 * An event's reminder: the plugin default, off, or one reminder a set time
 * (hh:mm) before it starts. A date-only event also needs the time of day the
 * reminder rings.
 */
export function ReminderOffsets({ value, onChange, timed = true, time = '', onTimeChange }: {
  value?: number[]; onChange(value: number[] | undefined): void; timed?: boolean; time?: string; onTimeChange?(value: string): void
}) {
  const { SelectField, TimeField } = api.ui.settings
  const [invalid, setInvalid] = React.useState(false)
  const mode = value === undefined ? 'default' : value.length ? 'custom' : 'off'
  return <div className="calendar-reminder">
    <div className="calendar-reminder-row">
      <SelectField ariaLabel={uiText('reminders.title')} value={mode} onChange={next => { setInvalid(false); onChange(next === 'off' ? [] : next === 'default' ? undefined : [value?.[0] ?? 10]) }} options={[
        { value: 'default', label: uiText('reminders.default') }, { value: 'off', label: uiText('reminders.off') }, { value: 'custom', label: uiText('reminders.custom') }
      ]} />
      {mode === 'custom' && <ReminderTime minutes={value?.[0] ?? 10} onCommit={minutes => onChange([minutes])} onInvalid={setInvalid} />}
      {!timed && mode !== 'off' && onTimeChange && <TimeField value={time} onChange={onTimeChange} ariaLabel={uiText('reminders.time')} />}
    </div>
    {invalid && <span className="calendar-reminder-note is-error" role="alert">{uiText('reminders.timeInvalid')}</span>}
    {!invalid && !timed && !time && mode !== 'off' && <span className="calendar-reminder-note">{uiText('reminders.timeRequired')}</span>}
  </div>
}

/**
 * The default reminder, as in To-Do (18 Nov): off, or one reminder a set time
 * (hh:mm) before a timed event.
 */
export function ReminderDefaults() {
  const read = (): number[] => {
    const raw = api.settings.get().reminderOffsets
    return Array.isArray(raw) ? raw.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= MAX_MINUTES).slice(0, 1) : [10]
  }
  const [value, setValue] = React.useState<number[]>(read)
  React.useEffect(() => api.settings.subscribe(() => setValue(read())), [])
  const [invalid, setInvalid] = React.useState(false)
  const { Row, Section, SelectField } = api.ui.settings
  const mode = value.length ? 'custom' : 'off'
  const save = (next: number[]): void => { setValue(next); void api.settings.set('reminderOffsets', next) }
  return <Section title={uiText('reminders.title')}>
    <Row title={uiText('reminders.defaultTitle')} description={uiText('reminders.defaultDesc')}>
      <SelectField className="calendar-reminder-mode" ariaLabel={uiText('reminders.defaultTitle')} value={mode}
        onChange={(next) => save(next === 'off' ? [] : [value[0] ?? 10])}
        options={[{ value: 'off', label: uiText('reminders.off') }, { value: 'custom', label: uiText('reminders.custom') }]} />
    </Row>
    {mode === 'custom' && (
      <Row title={uiText('reminders.timeBefore')} description={invalid ? <span className="calendar-reminder-note is-error" role="alert">{uiText('reminders.timeInvalid')}</span> : uiText('reminders.timeBeforeDesc')}>
        <ReminderTime minutes={value[0] ?? 10} onCommit={minutes => save([minutes])} onInvalid={setInvalid} />
      </Row>
    )}
  </Section>
}
