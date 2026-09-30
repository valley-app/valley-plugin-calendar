import { ReminderDefaults } from './ReminderOffsets'
import { calendarFolder } from './dailyNotes'
import { React, api } from './runtime'
import type { ReactElement } from 'react'
import {
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
  HIDDEN_SOURCES_KEY,
  ITEM_CLICK_TARGET_KEY,
  useCalendarSettings,
} from './settingsStore'
import { NoteDatesSection } from './NoteDateSettings'
import { uiText } from './localization'
import { configureSource, useCalendarSourceProviders } from './itemSources'

function DayWindowEditor({
  dayStartHour,
  dayEndHour
}: {
  dayStartHour: number
  dayEndHour: number
}): ReactElement {
  const { NumberField, Row } = api.ui.settings
  return (
    <>
      <Row title={uiText('auto.46fbb53a9be2')} description={uiText('auto.f07b365f8502')}>
        <NumberField
          min={0}
          max={23}
          value={dayStartHour}
          onChange={() => {}}
          onCommit={(value) => {
            if (value != null) void api.settings.set('dayStartHour', value)
          }}
          ariaLabel={uiText('auto.46fbb53a9be2')}
        />
      </Row>
      <Row title={uiText('calendar.dayEndHour')} description={uiText('calendar.dayEndHourDesc')}>
        <NumberField
          min={1}
          max={24}
          value={dayEndHour}
          onChange={() => {}}
          onCommit={(value) => {
            if (value != null) void api.settings.set('dayEndHour', value)
          }}
          ariaLabel={uiText('calendar.dayEndHour')}
        />
      </Row>
      <span className="settings-empty-text">
        {uiText('auto.808d7dca8a74')}{' '}{DEFAULT_DAY_START_HOUR}:00–{DEFAULT_DAY_END_HOUR}:00.{' '}
        {uiText('calendar.dayWindowGrows')}
      </span>
    </>
  )
}

function GroupsSection(): ReactElement {
  const { Section, GroupsEditor } = api.ui.settings
  return <Section><GroupsEditor /></Section>
}

function CalendarSection(): ReactElement {
  const { dayStartHour, dayEndHour, itemClickTarget } = useCalendarSettings()
  const { Row, Section, SelectField, VaultFolderField } = api.ui.settings
  return (
    <>
      <ReminderDefaults />
      <Section>
        <Row
          title={uiText('calendar.settings.openItemsIn')}
          description={uiText('calendar.settings.openItemsInDesc')}
        >
          <SelectField
            value={itemClickTarget}
            onChange={(value) => void api.settings.set(ITEM_CLICK_TARGET_KEY, value)}
            options={[
              { value: 'owner', label: uiText('calendar.settings.openItemsOwner') },
              { value: 'agenda', label: uiText('calendar.settings.openItemsAgenda') }
            ]}
            ariaLabel={uiText('calendar.settings.openItemsIn')}
          />
        </Row>
        <DayWindowEditor dayStartHour={dayStartHour} dayEndHour={dayEndHour} />
      </Section>
      <Section>
        <Row title={uiText('calendar.daily.folder')}><VaultFolderField value={calendarFolder('dailyNotesFolder')} ariaLabel={uiText('calendar.daily.folder')} onChange={() => {}} onCommit={value => void api.settings.set('dailyNotesFolder', value)} /></Row>
        <Row title={uiText('calendar.files.folder')}><VaultFolderField value={calendarFolder('calendarFolder')} ariaLabel={uiText('calendar.files.folder')} onChange={() => {}} onCommit={value => void api.settings.set('calendarFolder', value)} /></Row>
      </Section>
      <GroupsSection />
    </>
  )
}

function PluginsSection(): ReactElement {
  const providers = useCalendarSourceProviders()
  const { hiddenSources } = useCalendarSettings()
  const { PluginCard, Section } = api.ui.settings
  const hidden = new Set(hiddenSources)
  const setEnabled = (sourceKey: string, enabled: boolean): void => {
    const next = new Set(hidden)
    if (enabled) next.delete(sourceKey)
    else next.add(sourceKey)
    void api.settings.set(HIDDEN_SOURCES_KEY, [...next])
  }
  return (
    <Section className="calendar-plugins-settings">
      <div className="calendar-source-intro"><p>{uiText('calendar.plugins.description')}</p></div>
      {providers.length === 0 ? (
        <span className="settings-empty-text">{uiText('calendar.plugins.empty')}</span>
      ) : (
        <div className="settings-plugin-list">
          {providers.map((provider) => {
            const identity = provider.integration
            const localized = identity?.localized?.[api.ui.language()]
            const name = localized?.name ?? identity?.name ?? provider.owner
            const enabled = !hidden.has(provider.sourceKey)
            return (
              <PluginCard
                key={provider.sourceId}
                name={name}
                version={identity?.version ?? provider.version}
                versionLabel={uiText('calendar.plugins.version')}
                author={identity?.author}
                authorLabel={uiText('calendar.plugins.by')}
                description={localized?.description ?? identity?.description}
                enabled={enabled}
                onChange={(next) => setEnabled(provider.sourceKey, next)}
                toggleLabel={uiText(enabled ? 'calendar.plugins.disable' : 'calendar.plugins.enable', { p0: name })}
                onConfigure={provider.methods.includes('configure')
                  ? () => void configureSource(provider.sourceId)
                  : undefined}
                configureLabel={uiText('calendar.plugins.configure', { p0: name })}
              />
            )
          })}
        </div>
      )}
    </Section>
  )
}

export function Settings({ section }: { section?: string }): ReactElement {
  if (section === 'dates') return <NoteDatesSection />
  if (section === 'plugins') return <PluginsSection />
  return <CalendarSection />
}
