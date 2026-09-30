# Calendar

Event and todo planner: left-sidebar agenda, right-sidebar compact calendar, and a full workspace page with month/week/year grids beside a live agenda column.

This repository owns the plugin’s interface, behavior, dependencies, schemas, tests, translations, and compiled releases. It uses Valley manifest API 5 and the injected SDK 6.

Valley ships this core plugin as a verified release artifact in its application resources. Core and external installations run with the same sandbox, permissions, and SDK/IPC contract. The core package and its locale files are never installed into `.valley`; ordinary vault documents and saved plugin data retain their existing locations.

## Package

- `manifest.json`: readable English identity, version, and paired `author` / `authorUrl` arrays.
- `config.json`: runtime entry points, permissions, contributions, and storage declarations.
- `src/`: plugin interface and background engine.
- `locales/`: English, German, Spanish, French, and Simplified Chinese catalogs.
- `tests/`: package-owned checks using the portable SDK testkit.
- `runtime/`: compiled installation artifact, including the package’s locale catalogs.
- `vendor/`: pinned SDK, testkit, and build-tool archives for independent development.

The package’s `manifest.name` and `manifest.description` catalog entries translate its identity, including while disabled. Missing translations fall back to this package’s English catalog. A plugin never falls back to Valley’s catalog or another plugin’s catalog.

## Development and releases

Use Node 24.19.0 and npm 11.17.0. From this repository, run:

```sh
npm ci
npm run check
```

The check validates types and package boundaries, runs the package tests, and rebuilds `runtime/`. It requires no Valley source checkout. Keep the rebuilt runtime, locale files, dependency lock, and vendored tools with each release. Increment the package and manifest versions together.

Valley release maintainers explicitly import the compiled artifact into the application’s `plugins.lock.json`; building Valley does not build or read this repository. All privileged work uses declared SDK capabilities, authenticated IPC, and explicit grants. Disabling or unloading the plugin releases its subscriptions and resources.

Version 3.1 shares identical in-flight event ranges and contributed-item reads across surfaces. Note-date sources load every page, and definition edits batch changed rows atomically without deleting retained definitions. A removal exceeding the host’s 1,000-operation limit reports an error before writing.

Groups are edited here and in To-Do using one shared vault registry. Calendar displays local events, note dates, and plugin-contributed items; it does not connect to accounts or synchronize remote calendars. Task completion changes in place without navigating or resetting the current view.

## Calendar documents and daily notes

Calendar indexes `.ics`, `.ifb`, and `.vcs` in the configured Calendar folder (default `plugins/calendar`). Opening a calendar file uses its own editable view; saves use revision-guarded writes and retain drafts on conflicts. ICAL.js handles iCalendar recurrence, exceptions, floating/UTC/embedded timezone values, and availability. Times retain their source timezone, shown in the editor. Unknown properties, alarms, attendees, and unrelated components are preserved. The vCalendar 1.0 adapter supports daily, weekly and numeric monthly/yearly rules; unsupported rules report a diagnostic without writing. Legacy occurrence edits exclude the original date and add the edited event without converting the source format.

Existing `dailynotes/YYYY-MM-DD.md` files appear across Calendar surfaces. Open / create daily note creates a heading only when the selected date has no note. Navigation creates no files. Both folder paths are configurable.

The `calendar` Markdown fence includes events, provider items, calendar files, and daily notes using the same filters. Optional `file: plugins/calendar/Forest calendar.ics` limits a block to one source document. The shared composer creates provider items through `calendar.itemSource` v2; Edit opens the provider’s own editor. Providers own task and birthday data.

## Calendar contribution schema

Plugins register `CALENDAR_ITEM_SOURCE_V2` from the injected SDK. Calendar owns every agenda row: a single left column contains the completion checkbox when `completed` is a boolean, otherwise the source plugin icon. The right column contains `title`, optional time, optional location/map action, then a plain-text preview of `note`. No provider markup, extra badge rows, or duplicate task icon is rendered.

| Field | Required format |
| --- | --- |
| `id`, `title` | Nonempty strings; IDs are unique within the source. |
| `date`, optional `endDate` | Valid `YYYY-MM-DD`; end date is inclusive and cannot precede date. |
| `startTime`, `endTime` | Optional `HH:mm` in 24-hour time; end requires start and follows it unless the item spans multiple dates. Omit both for an untimed entry. |
| `completed` | Optional boolean; requests the task control instead of the plugin icon. |
| `note` | Optional Markdown string, rendered as plain description text in the row. |
| `location` | Optional `{ name, lat?, lng? }`; coordinates must be finite and in geographic range. |
| `tags`, `urls`, `attachments` | Optional string arrays. |
| `group`, `priority`, `status`, `filePath`, `icon`, `color`, `borderColor` | Optional strings from the SDK contract. |
| `readOnly` | Optional boolean preventing Calendar mutations; provider-owned Edit may still open the original record. |
| `fields` | Optional `{ key, value }` string pairs for chip hover text only; never agenda rows or context-menu entries. |
| `documentRef` | Optional `{ pluginId, sourceId, itemId }` document identity. |

`list({ startDate, endDate, limit, cursor? })` returns `{ items, revision, cursor? }`. Calendar rejects invalid items or incomplete page sequences. `create(date, patch)` receives the same typed fields without an ID; title and date are required and validated before dispatch. The provider validates its own domain rules and owns persistence. The shared compact Calendar composer is used for creation.

Clicking an agenda row opens Calendar and reveals its date/time and item. The context menu orders Edit, Open in Calendar, and Open in the source plugin before auxiliary actions. Implement `open(itemId)` for source navigation and contribute action `edit` with `runAction(itemId, 'edit')` for the owning editor. Calendar supplies Open in the source plugin from its localized integration name; `open-owner` is reserved for that action. Completion changes use `update(itemId, { completed })` without navigation. Publish the source revision after mutations.

Context menus contain actions with leading icons, including submenu entries. Calendar uses the source plugin icon when an action omits its icon or names an unsupported icon, with a visible Calendar fallback while the plugin icon is unavailable. Metadata such as age never becomes a disabled menu row.

## Note-date sources

Settings → Calendar → Note dates and the left sidebar share one saved source order. Search source names, folders or matching rules; filtered reordering preserves the other sources. Drag a source’s grip or use its arrow keys to reorder; chevrons reveal the matching details. The full-width standard header switch turns source visibility on or off while preserving definitions. Empty matches show neutral “0 notes found” text. Add source and the per-source Hide/Delete controls use compact aligned icon labels.

Source icons live in `.valley/assets/icon/calendar-icon/`. Missing bundled SVGs are seeded without replacing saved artwork. Added or edited SVGs are discovered automatically, and Refresh icons is available in settings.

## Workflow integration

The backend publishes `workflow.provider` version `1.0.0` through the injected SDK. Actions create, get, list, and update Calendar's local events; creation and update triggers contain `record`. Calendar file occurrences, note-date matches, and items contributed by other plugins remain owned by their existing sources and are outside these actions.

The interface and Workflow use the same serialized backend writer. Revision-guarded document updates preserve event relationships, while existing undo and readonly rules remain in effect. Events follow successful commits and retain the host's causal context. A Workflow action with a delivery failure after commit reports an uncertain outcome and must not be retried automatically. Interface saves retain their successful result and undo entry, with a separate event-delivery warning. Calendar must be installed and enabled; integrations never read another plugin's data files.
