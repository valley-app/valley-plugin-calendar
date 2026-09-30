import { React, api } from './runtime'
import { uiText } from './localization'

export function ReminderOffsets({ value, onChange, timed = true, time = '', onTimeChange, defaults = false }: {
  value?: number[]; onChange(value: number[] | undefined): void; timed?: boolean; time?: string; onTimeChange?(value: string): void; defaults?: boolean
}) {
  const { NumberField, SelectField, Button, TimeField } = api.ui.settings
  const [units, setUnits] = React.useState<Record<number, boolean>>({})
  const [error, setError] = React.useState(false)
  const mode = value === undefined ? 'default' : value.length ? 'custom' : 'off'
  const update = (next: number[]): void => {
    const invalid = next.some(value => !Number.isInteger(value) || value < 0 || value > 10080) || new Set(next).size !== next.length
    setError(invalid)
    if (!invalid) onChange(next)
  }
  return <div style={{ display: 'grid', gap: 8 }}>
    <SelectField ariaLabel={uiText('reminders.title')} value={mode} onChange={mode => { setError(false); setUnits({}); onChange(mode === 'off' ? [] : mode === 'default' ? undefined : [10]) }} options={[
      ...(!defaults ? [{ value: 'default', label: uiText('reminders.default') }] : []),
      { value: 'off', label: uiText('reminders.off') }, { value: 'custom', label: uiText('reminders.custom') }
    ]} />
    {value?.map((minutes, index) => {
      const hours = units[index] ?? (minutes > 0 && minutes % 60 === 0)
      return <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NumberField min={0} max={hours ? 168 : 10080} value={hours ? minutes / 60 : minutes} ariaLabel={uiText(hours ? 'reminders.hours' : 'reminders.minutes')}
          onChange={number => { if (number !== null) update(value.map((old, i) => i === index ? number * (hours ? 60 : 1) : old)) }} />
        <SelectField value={hours ? 'hours' : 'minutes'} ariaLabel={uiText('reminders.title')} options={[{ value: 'minutes', label: uiText('reminders.minutes') }, { value: 'hours', label: uiText('reminders.hours') }]}
          onChange={unit => { setUnits(previous => ({ ...previous, [index]: unit === 'hours' })); update(value.map((old, i) => i === index ? (hours ? minutes / 60 : minutes) * (unit === 'hours' ? 60 : 1) : old)) }} />
        <Button onClick={() => { setUnits({}); update(value.filter((_, i) => i !== index)) }} aria-label={uiText('reminders.remove')}>×</Button>
      </div>
    })}
    {mode === 'custom' && (value?.length ?? 0) < 16 && <Button onClick={() => { let offset = 10; while (value?.includes(offset)) offset += 5; update([...(value ?? []), offset]) }}>{uiText('reminders.add')}</Button>}
    {!timed && mode !== 'off' && onTimeChange && <TimeField value={time} onChange={onTimeChange} ariaLabel={uiText('reminders.time')} />}
    {!timed && !time && mode !== 'off' && <span>{uiText('reminders.timeRequired')}</span>}
    {error && <span role="alert">{uiText('reminders.invalid')}</span>}
  </div>
}

export function ReminderDefaults() {
  const [value, setValue] = React.useState<number[]>(() => api.settings.get().reminderOffsets as number[] ?? [10])
  React.useEffect(() => api.settings.subscribe(() => setValue(api.settings.get().reminderOffsets as number[] ?? [10])), [])
  return <api.ui.settings.Section title={uiText('reminders.title')}><ReminderOffsets value={value} defaults onChange={next => { void api.settings.set('reminderOffsets', next ?? [10]) }} /></api.ui.settings.Section>
}
