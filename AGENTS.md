# Calendar integration rules

- Read `README.md` and the workspace plugin skill before changes.
- Keep local event mutations in the backend domain owner. UI actions, undo, and Workflow use that writer through the SDK.
- Workflow actions own only local native events. Calendar-file occurrences, note dates, and contributed plugin items keep their existing ownership and readonly rules.
- Publish events only after committed document changes, retain scoped host causation, and preserve uncertain outcomes after commit failures.
- A failed event delivery must not undo the success or undo registration of an already committed UI save. Report delivery separately; Workflow actions retain their uncertain-outcome semantics.
- Preserve document revisions and relationships. Verify `tests/domain.test.ts`, `tests/workflow.test.ts`, and affected UI tests without replacing unrelated dirty work.
- Keep integrations behind public SDK contracts, with no app-internal imports or access to another plugin's source or files.

- Notification schedules and completion handling belong to the backend. Calendar/To-Do reminder offsets preserve Off, explicit choices and absolute reminders; date-only items require an explicit time. Persist occurrence recovery before notification and never replay a missed alarm or timer. Pomodoro recovery advances once into a paused phase. The host owns notification audio; UI sound players are for previews only.

- Reminder dataset version changes include explicit additive migrations and an existing-database preservation check; fresh-vault tests alone do not validate rollout.
