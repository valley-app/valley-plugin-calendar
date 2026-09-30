export const calendarStyles = `
/* ── Calendar (ported from core App.css) ───────────────────────────────── */

.calendar-view {
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  height: 100%;
  color: var(--title-color);
  overflow: hidden;
}

.calendar-view.calendar-view-main,
.calendar-view.calendar-view-sidebar {
  gap: 0;
  padding: 0;
}

.calendar-view-main {
  container: calendar-main / inline-size;
}

/* Calendar top bar — 37px content invariant (see CLAUDE.md). Full-bleed,
   sits above the padded body so the grid keeps its own inset. */
.calendar-topbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex: 0 0 auto;
  height: var(--app-bar-height);
  box-sizing: border-box;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-light);
  background: var(--container-color-alt);
}
.calendar-view-main .calendar-topbar {
  display: flex;
}
.calendar-view-main .calendar-topbar-actions {
  margin-right: var(--plugin-actions-offset, 0px);
}
.calendar-topbar-leading {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-width: 0;
  margin-left: var(--plugin-navigation-offset, 0px);
}
.calendar-topbar h2 {
  margin: 0;
  min-width: 0;
  font-size: 0.82rem;
  font-weight: var(--font-semi-bold);
  color: var(--title-color);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.calendar-view-main .calendar-topbar h2 {
  flex: 0 1 auto;
  text-align: left;
}
.calendar-topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
  margin-left: auto;
  min-width: 0;
  z-index: 1;
}
.calendar-topbar .calendar-filter-actions { flex: 0 0 auto; }
.calendar-topbar .calendar-switcher-inline { flex: 0 0 auto; }
.calendar-topbar .calendar-actions { flex: 0 0 auto; }
.calendar-view-main .calendar-topbar .calendar-switcher {
  align-self: center;
  height: 24px;
}
.calendar-view-main .calendar-topbar .calendar-switcher-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  font-size: 0.72rem;
  line-height: 1;
}
.calendar-view-main .calendar-topbar .calendar-actions button {
  height: 24px;
  min-width: 24px;
  font-size: 0.7rem;
  line-height: 1;
}

@container calendar-main (max-width: 520px) {
  .calendar-view-main .calendar-topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    height: auto;
  }
  .calendar-view-main .calendar-topbar-leading {
    min-height: var(--app-bar-height);
    margin-right: var(--plugin-actions-offset, 0px);
  }
  .calendar-view-main .calendar-topbar-actions {
    justify-content: space-between;
    flex-wrap: wrap;
    margin: 0 0 var(--space-2, 8px);
  }
}

.calendar-view-sidebar .calendar-topbar {
  gap: 4px;
  padding: 0 6px;
}
.calendar-view-sidebar .calendar-topbar h2 {
  flex: 0 1 auto;
  font-size: 0.72rem;
  text-align: left;
}
.calendar-view-sidebar .calendar-topbar-actions {
  gap: 2px;
}
.calendar-view-sidebar .calendar-topbar .calendar-switcher {
  gap: 0;
  height: 22px;
}
.calendar-view-sidebar .calendar-topbar .calendar-switcher-btn {
  display: flex;
  align-items: center;
  height: 22px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 0.64rem;
  line-height: 1;
}
.calendar-view-sidebar .calendar-topbar .calendar-actions {
  gap: 0;
}
.calendar-view-sidebar .calendar-topbar .calendar-actions button {
  height: 22px;
  min-width: 20px;
  padding: 0 3px;
  font-size: 0.62rem;
  line-height: 1;
}

.calendar-view-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  overflow: hidden;
}

.calendar-view-compact .calendar-view-body {
  gap: var(--space-4);
  padding: var(--space-4) var(--space-3);
  overflow-x: visible;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.calendar-header h2 {
  flex: 1;
  margin: 0;
  color: var(--title-color);
  font-size: 1.75rem;
  line-height: 1;
  font-weight: var(--font-semi-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar-view-main .calendar-header h2 {
  font-size: 1.75rem;
  flex: 1;
}
.calendar-view-main .calendar-header .calendar-switcher-inline {
  flex: 0 0 auto;
}
.calendar-view-main .calendar-header .calendar-actions {
  flex: 1;
  justify-content: flex-end;
}

.calendar-header h2 span,
.calendar-topbar h2 span {
  color: var(--accent-color);
}

.calendar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.calendar-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  min-width: 28px;
  padding: 0 5px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--smaller-font-size);
  font-weight: var(--font-semi-bold);
}

.calendar-actions button:hover {
  background: var(--hover-bg);
  color: var(--title-color);
}

/* Scrollable area below the view switcher — header + tabs stay pinned. */
.calendar-scroll-area {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.calendar-view-compact .calendar-scroll-area {
  gap: var(--space-4);
}
.calendar-view-compact .calendar-scroll-area[data-view='month'] {
  margin-inline: calc(-1 * var(--space-3));
  overflow-x: visible;
}
.calendar-view-compact .calendar-scroll-area[data-view='month'] .calendar-stage {
  margin-inline: var(--space-3);
}
/* Month/year: stage must not shrink — its content height drives the scroll-area overflow. */
.calendar-scroll-area .calendar-stage {
  flex-shrink: 0;
}
/* Week view: grid handles its own internal scroll, no external overflow. */
.calendar-scroll-area[data-view='week'] {
  overflow: hidden;
}
.calendar-scroll-area[data-view='week'] .calendar-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.calendar-scroll-area[data-view='week'] .calendar-grid-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.calendar-scroll-area[data-view='week'] .calendar-weekgrid {
  flex: 1 1 auto;
}

.calendar-stage {
  overflow: hidden;
}

.calendar-grid {
  display: grid;
  grid-template-columns: 36px repeat(7, minmax(0, 1fr));
  row-gap: var(--space-3);
  align-items: center;
}

.calendar-view-compact .calendar-grid {
  grid-template-columns: 30px repeat(7, minmax(0, 1fr));
  column-gap: 1px;
  row-gap: var(--space-2);
}

.calendar-week-heading,
.calendar-day-heading,
.calendar-week-number {
  color: var(--text-secondary);
  font-size: var(--small-font-size);
  font-weight: var(--font-semi-bold);
  line-height: 1;
}

.calendar-view-compact .calendar-week-heading,
.calendar-view-compact .calendar-day-heading,
.calendar-view-compact .calendar-week-number {
  font-size: 0.68rem;
}

.calendar-week-heading {
  text-align: right;
  padding-right: var(--space-3);
}

.calendar-day-heading {
  text-align: center;
  letter-spacing: 0;
}

.calendar-week-number {
  padding-right: var(--space-3);
  border: none;
  border-right: 1px solid var(--border-medium);
  background: transparent;
  font: inherit;
  text-align: right;
  cursor: pointer;
}

.calendar-week-number:hover {
  color: var(--title-color);
}

.calendar-day {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  min-width: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--title-color);
  font-size: var(--normal-font-size);
  font-weight: var(--font-medium);
}

.calendar-view-main .calendar-day {
  width: 100%;
  max-width: 64px;
  justify-self: center;
}

.calendar-day:hover {
  background: var(--hover-bg);
}

.calendar-day.outside {
  color: color-mix(in srgb, var(--text-tertiary) 45%, transparent);
}

.calendar-day.today {
  color: var(--accent-color);
}

.calendar-day.selected {
  background: color-mix(in srgb, var(--accent-color) 20%, transparent);
  color: var(--title-color);
  border-radius: 50%;
}

.calendar-day.today.selected {
  color: var(--accent-color);
}

/* View switcher (Month / Week / Year) */
.calendar-switcher {
  display: flex;
  gap: 2px;
  align-self: center;
}
.calendar-switcher-inline { flex: 0 0 auto; }

.calendar-switcher-btn {
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--small-font-size);
  font-weight: var(--font-semi-bold);
}

.calendar-switcher-btn:hover {
  color: var(--title-color);
}

.calendar-switcher-btn.active {
  background: var(--accent-color);
  color: #fff;
  border-radius: var(--radius-lg);
}

/* Week view — single row of the 7 days */
.calendar-week-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
}

.calendar-week-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.calendar-week-cell .calendar-day {
  width: 100%;
  aspect-ratio: 1;
}

/* Year view — 12 mini-month grids */
.calendar-year {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-4);
}

.calendar-view-compact .calendar-year {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.calendar-mini {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
}

.calendar-mini:hover {
  background: var(--hover-bg);
}

.calendar-mini-name {
  color: var(--title-color);
  font-size: var(--small-font-size);
  font-weight: var(--font-semi-bold);
}

.calendar-mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

.calendar-mini-heading {
  color: var(--text-tertiary);
  font-size: 0.55rem;
  text-align: center;
  line-height: 1.4;
}

.calendar-mini-day {
  color: var(--title-color);
  font-size: 0.62rem;
  text-align: center;
  line-height: 1.4;
}

.calendar-mini-day.outside {
  color: color-mix(in srgb, var(--text-tertiary) 40%, transparent);
}

.calendar-mini-day.today {
  color: var(--accent-color);
  font-weight: var(--font-semi-bold);
}

/* Selected-day Agenda section below the compact month grid. */
.calendar-todos {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  margin-top: var(--space-3);
  padding: var(--space-2) calc(var(--space-3) / 2) var(--space-4);
  border-top: 1px solid var(--border-light);
  background: transparent;
  overflow-y: auto;
}

.calendar-selected {
  margin-top: auto;
  padding-top: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--small-font-size);
  font-weight: var(--font-medium);
}

/* ── Planner: month day-cells with chips ─────────────────────────────────── */
.calendar-view-main .calendar-grid {
  align-items: stretch;
  row-gap: 0;
  column-gap: 0;
  grid-auto-rows: auto;
  grid-template-rows: auto repeat(6, 1fr);
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}

/* Header: W cell right-border + day headings left-border extend vertical lines into header row */
.calendar-view-main .calendar-week-heading {
  border-right: 1px solid var(--border-light);
}

.calendar-view-main .calendar-day-heading {
  border-left: 1px solid var(--border-light);
  padding: 6px 0;
}

.calendar-view-main .calendar-week-number {
  border-top: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-top: 6px;
}

.calendar-day-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
}
.calendar-view-main .calendar-day-cell {
  min-height: 78px;
  align-items: stretch;
  border-top: 1px solid var(--border-light);
  border-left: 1px solid var(--border-light);
  border-radius: 0;
  padding: 1px 1px;
}
.calendar-day-cell:hover { background: var(--hover-bg); }
.calendar-day-cell.in-range { background: color-mix(in srgb, var(--accent-color) 14%, transparent); }
.calendar-day-cell.outside .calendar-day-num {
  color: color-mix(in srgb, var(--text-tertiary) 45%, transparent);
}

.calendar-day-cell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.calendar-view-compact .calendar-day-cell {
  align-items: center;
  aspect-ratio: 1;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.calendar-view-compact .calendar-day-cell-head { justify-content: center; }

.calendar-day-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: var(--normal-font-size);
  font-weight: var(--font-medium);
  color: var(--title-color);
  transition: background 0.12s ease, color 0.12s ease;
}
.calendar-day-cell.today .calendar-day-num { color: var(--accent-color); }
.calendar-day-cell.selected .calendar-day-num {
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
  color: var(--accent-color);
}

.calendar-chips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.calendar-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 1px 6px;
  border: none;
  border-radius: 1px;
  background: color-mix(in srgb, var(--chip-color, var(--accent-color)) 20%, transparent);
  color: var(--title-color);
  font-size: 0.72rem;
  font-weight: var(--font-medium);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.calendar-chip.completed { opacity: 0.55; text-decoration: line-through; }
.calendar-chip.selected {
  background: color-mix(in srgb, var(--chip-color, var(--accent-color)) 58%, var(--container-color));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--chip-color, var(--accent-color)) 72%, var(--title-color));
}
/* The title takes the slack and truncates; the badges keep their width, so what
   an item carries survives a long title instead of being ellipsed away. */
.calendar-chip-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.calendar-chip-glyph { flex: 0 0 auto; font-size: 0.85em; color: var(--chip-color, currentColor); }
.calendar-chip-time { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.calendar-chip-more { font-size: 0.68rem; color: var(--text-tertiary); padding-left: 4px; }

.calendar-day-dots { position: absolute; bottom: 3px; left: 0; right: 0; display: flex; gap: 3px; justify-content: center; }
.calendar-day-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.calendar-reveal-dot { box-shadow: 0 0 0 2px var(--container-color), 0 0 0 4px var(--accent-color); }

@keyframes calendar-reveal-pulse {
  0%, 100% {
    outline-color: transparent;
    box-shadow: 0 0 0 0 transparent;
    filter: brightness(1);
  }
  14%, 48% {
    outline-color: var(--accent-color);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent-color) 24%, transparent);
    filter: brightness(1.08);
  }
  30%, 68% {
    outline-color: color-mix(in srgb, var(--accent-color) 45%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 12%, transparent);
    filter: brightness(1.02);
  }
}

@keyframes calendar-reveal-fill-pulse {
  0%, 100% { opacity: 0; }
  14%, 48% { opacity: 0.2; }
  30%, 68% { opacity: 0.08; }
}

/* The ring's corner radius is the target's own radius plus its outline-offset,
   so an offset visibly rounds it beyond the block it is marking. Zero keeps the
   ring on the border box, where it traces the shape exactly. */
.calendar-reveal-target {
  position: relative;
  z-index: 8;
  outline: 2px solid transparent;
  outline-offset: 0;
  animation: calendar-reveal-pulse 1.8s ease-out;
}
.calendar-reveal-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--accent-color);
  opacity: 0;
  pointer-events: none;
  animation: calendar-reveal-fill-pulse 1.8s ease-out;
}
.calendar-reveal-day { outline-offset: -3px; }

@media (prefers-reduced-motion: reduce) {
  .calendar-reveal-target {
    animation: none;
    outline-color: var(--accent-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-color) 20%, transparent);
  }
  .calendar-reveal-target::after {
    animation: none;
    opacity: 0.14;
  }
}

`
