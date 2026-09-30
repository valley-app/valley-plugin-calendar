export const eventEditorStyles = `/* ── Calendar editor modal ──────────────────────────────────────────────── */
.calendar-quickadd {
  min-height: 0;
  padding: 0;
  gap: 0;
  overflow: hidden;
}
/* The head and the actions are bands, not part of the scrolling field list —
   hence their own padding and rules rather than a gap on the container. */
.calendar-quickadd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.calendar-quickadd-title {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  background: var(--body-color);
  color: var(--title-color);
  font-family: var(--interface-font);
  font-size: var(--normal-font-size);
  font-weight: var(--font-medium);
}

/* ── Sections and rows ───────────────────────────────────────────────────── */
/* A titled block of fields. The label is what turns a stack of grey boxes into
   a form you can skim; the glyph column keeps every control on one left edge. */
.calendar-quickadd-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.calendar-quickadd-section-label {
  color: var(--text-tertiary);
  font-size: var(--smaller-font-size);
  font-weight: var(--font-semi-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.calendar-quickadd-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.calendar-quickadd-row-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 16px;
  color: var(--text-tertiary);
}
.calendar-quickadd-row-glyph svg { width: 14px; height: 14px; }
.calendar-quickadd-row-body { flex: 1; min-width: 0; }
.calendar-quickadd-row-body > * { width: 100%; min-width: 0; }

.calendar-quickadd-dates { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.calendar-quickadd-dates .calendar-quickadd-date { flex: 1; min-width: 0; }
.calendar-quickadd-dash { flex: none; color: var(--text-tertiary); font-size: var(--small-font-size); }
.calendar-quickadd-times { display: flex; align-items: center; gap: var(--space-2); }
.calendar-quickadd-times .time-field { flex: 1; min-width: 92px; }
.calendar-quickadd-allday {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-inline-start: auto;
  color: var(--text-secondary);
  font-size: var(--small-font-size);
  white-space: nowrap;
}

/* ── Actions ─────────────────────────────────────────────────────────────── */
/* These used to be the To-Do plugin's .todo-save-btn / .todo-cancel-btn. Plugin
   CSS is injected globally, so borrowing them worked right up until someone
   disabled To-Do and the popover lost its buttons. */
.calendar-quickadd-save,
.calendar-quickadd-cancel {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--small-font-size);
  font-weight: var(--font-medium);
  cursor: pointer;
}
.calendar-quickadd-save { border: none; background: var(--accent-color); color: #fff; }
.calendar-quickadd-save:disabled { opacity: 0.5; cursor: default; }
.calendar-quickadd-cancel {
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-secondary);
}
.calendar-quickadd-cancel:hover { background: var(--hover-bg); color: var(--title-color); }

/* Shared SelectField: it draws the frame, this only sizes it for the compact row. */
.calendar-quickadd-select.select-field {
  width: 100%;
  min-height: 28px;
  font-size: var(--small-font-size);
}
.calendar-quickadd-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  background: var(--body-color);
  color: var(--title-color);
  font-size: var(--small-font-size);
}
.calendar-quickadd-note {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 96px;
  min-height: 96px;
  max-height: 96px;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  background: var(--body-color);
  color: var(--title-color);
  font: inherit;
  font-size: var(--small-font-size);
  line-height: 1.4;
  resize: none;
  overflow-y: auto;
}
.calendar-quickadd-note:focus { outline: none; border-color: var(--accent-color); box-shadow: none; }
.calendar-quickadd-note::placeholder { color: var(--text-tertiary); }

/* The fields scroll; the head and the actions do not. An event with three
   attachments must never push Save past the bottom of the window. */
.calendar-quickadd-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  padding: var(--space-4);
}
.calendar-quickadd-adders { display: flex; gap: var(--space-4); }
.calendar-quickadd-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--accent-color);
  font-family: var(--interface-font);
  font-size: var(--small-font-size);
  cursor: pointer;
}
.calendar-quickadd-add svg { width: 12px; height: 12px; }

/* ── Tags ────────────────────────────────────────────────────────────────── */
/* Restated here rather than borrowed from the To-Do plugin's stylesheet: its
   .todo-tag-* rules only reached this popover because plugin CSS is global. */
.calendar-tag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}
.calendar-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--accent-soft-bg);
  color: var(--accent-color);
  font-size: var(--smaller-font-size);
}
.calendar-tag-remove {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
}
.calendar-tag-remove:hover { opacity: 1; }
.calendar-tag-remove svg { width: 10px; height: 10px; }
.calendar-tag-input {
  flex: 1;
  min-width: 80px;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--title-color);
  font-family: var(--interface-font);
  font-size: var(--small-font-size);
  outline: none;
}
.calendar-tag-input::placeholder { color: var(--text-tertiary); }
.calendar-quickadd-url-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.calendar-quickadd-url {
  padding: 0;
  border: none;
  background: transparent;
  flex: 1;
  min-width: 0;
  color: var(--accent-color);
  font-size: var(--smaller-font-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  cursor: pointer;
}
/* The small round action beside a field — remove, open on the map. */
.calendar-field-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}
.calendar-field-btn:hover { background: var(--hover-bg); color: var(--title-color); }
.calendar-field-btn svg { width: 13px; height: 13px; }

/* Location: the query field, its two actions, and the geocoder's hits below.
   Ported from the Todo detail view — a plugin may not import another plugin, so
   the class names travel with the markup and the rules are restated here. */
.calendar-location { position: relative; display: flex; flex-direction: column; gap: var(--space-2); }
.calendar-location-row { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.calendar-location-input { flex: 1; min-width: 0; }
.calendar-location-hits {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius);
  background: var(--container-color);
}
.calendar-location-hit {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 5px var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--title-color);
  font-family: var(--interface-font);
  font-size: var(--small-font-size);
  text-align: left;
  cursor: pointer;
}
.calendar-location-hit:hover { background: var(--hover-bg); }
.calendar-location-hit-name { color: var(--title-color); font-weight: var(--font-medium); }
.calendar-location-hit-context { color: var(--text-tertiary); font-size: var(--smaller-font-size); }

/* One attachment, as a card. Same shape as the Todo detail view's, minus the
   thumbnail column — this one lives in a 360px popover. */
.calendar-attach-card { position: relative; display: flex; align-items: stretch; }
.calendar-attach-open {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius);
  background: var(--surface-color-alt);
  color: var(--text-color);
  font-family: var(--interface-font);
  text-align: left;
  cursor: pointer;
}
.calendar-attach-open:hover { background: var(--hover-bg); }
.calendar-attach-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
.calendar-attach-name {
  color: var(--title-color);
  font-size: var(--small-font-size);
  font-weight: var(--font-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.calendar-attach-meta { color: var(--text-secondary); font-size: var(--smaller-font-size); }
.calendar-attach-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size:0.9375rem;
}
/* Revealed on hover so a resting list of attachments is just the cards. */
.calendar-attach-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  background: var(--container-color);
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
}
.calendar-attach-card:hover .calendar-attach-remove,
.calendar-attach-remove:focus-visible { opacity: 1; }
.calendar-attach-remove:hover { color: var(--negative-color); border-color: var(--negative-color); }
.calendar-attach-remove svg { width: 12px; height: 12px; }

.calendar-editor-popover { width: 340px; max-width: calc(100vw - 16px); padding: 0; }
.calendar-quickadd { width: 100%; }
.calendar-quickadd-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 10px; border-top: 1px solid var(--border-light); }
.calendar-quickadd-title,
.calendar-quickadd-title:focus { background: transparent; border: none; outline: none; box-shadow: none; font-size: 1rem; line-height: 1.4; padding: 4px 0; }
.calendar-quickadd-body { padding: 12px; gap: 12px; }
.calendar-quickadd-body > fieldset > div[hidden] { display: none; }
.calendar-quickadd-body > fieldset > div:not([hidden]) > .calendar-quickadd-section { margin-top: 12px; }
.calendar-quickadd-head { padding: 10px 12px; flex-shrink: 0; }
.calendar-quickadd-head > * { width: 100%; min-width: 0; }
.calendar-quickadd-schedule { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-top: 1px solid var(--border-light); border-bottom: 1px solid var(--border-light); }
.calendar-quickadd-schedule .calendar-quickadd-allday { display: flex; justify-content: space-between; width: 100%; margin: 0 0 4px; }
.calendar-quickadd-schedule-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 86px; align-items: center; gap: 6px; }
.calendar-quickadd-schedule-row[data-all-day='true'] { grid-template-columns: 40px minmax(0, 1fr); }
.calendar-quickadd-schedule-row > span { color: var(--text-secondary); font-size: var(--small-font-size); }
.calendar-quickadd-control { min-width: 0; width: 100%; }
.calendar-quickadd-control > * { min-width: 0 !important; width: 100% !important; max-width: 100%; }
.calendar-quickadd-footer { padding: 8px 12px; flex-shrink: 0; }
.calendar-quickadd-save, .calendar-quickadd-cancel { height: 26px; padding: 0 12px; }
`
