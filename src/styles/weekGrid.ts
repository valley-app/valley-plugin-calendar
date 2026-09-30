export const weekGridStyles = `/* ── Week time-grid ──────────────────────────────────────────────────────── */
.calendar-weekgrid { display: flex; flex-direction: column; min-height: 0; }
.calendar-weekgrid-allday,
.calendar-weekgrid-body {
  display: grid;
  grid-template-columns: 48px repeat(var(--week-cols, 7), minmax(0, 1fr));
}
.calendar-weekgrid-head {
  display: grid;
  grid-template-columns: 48px repeat(var(--week-cols, 7), minmax(0, 1fr));
  border-bottom: 1px solid var(--border-medium);
}
.calendar-weekgrid-headgutter { border: none; }
.calendar-weekgrid-gutter {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  text-align: right;
  padding-right: var(--space-2);
}
.calendar-weekgrid-dayhead {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2) 0;
  gap: 3px;
  border: none;
  background: transparent;
  cursor: pointer;
  outline: none;
}
.calendar-weekgrid-dow { font-size: 0.68rem; color: var(--text-secondary); font-weight: var(--font-semi-bold); }
.calendar-weekgrid-dom {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: var(--h3-font-size);
  font-weight: var(--font-semi-bold);
  color: var(--title-color);
  transition: background 0.12s ease, color 0.12s ease;
}
.calendar-weekgrid-dayhead:hover .calendar-weekgrid-dom { background: var(--bg-hover, rgba(0, 0, 0, 0.04)); }
.calendar-weekgrid-dayhead.today .calendar-weekgrid-dom { color: var(--accent-color); }
.calendar-weekgrid-dayhead.selected .calendar-weekgrid-dom {
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
  color: var(--accent-color);
}

/* Compact (sidebar) week: a row of 7 day pills above the single-day grid. */
.calendar-weekgrid-daypicker {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
  padding: var(--space-1) 0 var(--space-2);
  border-bottom: 1px solid var(--border-medium);
}
.calendar-daypick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 0 2px;
  border: none;
  background: transparent;
  cursor: pointer;
}
.calendar-daypick-dow {
  font-size: 0.6rem;
  font-weight: var(--font-semi-bold);
  color: var(--text-secondary);
}
.calendar-daypick-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: var(--small-font-size);
  font-weight: var(--font-medium);
  color: var(--title-color);
}
.calendar-daypick.today .calendar-daypick-num { color: var(--accent-color); }
.calendar-daypick.selected .calendar-daypick-num {
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
  color: var(--accent-color);
}
.calendar-daypick-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
}
.calendar-daypick-dot.on { background: var(--text-tertiary); }
.calendar-daypick.selected .calendar-daypick-dot.on { background: var(--accent-color); }

/* The all-day strip owns its height: as a flex item it must never be shrunk
   below its content, or the chips paint over its bottom border and into the hour
   grid. It grows with its chips and scrolls internally once it would claim a
   third of the view; the hour grid below absorbs the rest (flex: 1 1 auto). */
.calendar-weekgrid-allday {
  border-bottom: 1px solid var(--border-light);
  min-height: 24px;
  flex: 0 0 auto;
  max-height: 33vh;
  overflow-y: auto;
}
/* Compact (sidebar) week: one column, matching the single-day hour grid below —
   a chip in a seventh of a sidebar is three letters wide. */
.calendar-weekgrid-allday--compact { grid-template-columns: 30px minmax(0, 1fr); }
.calendar-weekgrid-alldaycol { display: flex; flex-direction: column; gap: 2px; padding: 2px; }
/* Chips keep their own height too — a squeezed column must scroll, not squash. */
.calendar-weekgrid-alldaycol .calendar-chip { flex: 0 0 auto; }

.calendar-weekgrid-body { position: relative; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
.calendar-weekgrid-hours { display: flex; flex-direction: column; }
.calendar-weekgrid-hour {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-right: var(--space-2);
  padding-top: 2px;
  color: var(--text-tertiary);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  border-top: 1px solid var(--border-light);
}
.calendar-weekgrid-col { position: relative; border-left: 1px solid var(--border-light); }
.calendar-weekgrid-cell { border-top: 1px solid var(--border-light); }

/* Horizontal geometry comes from overlap.ts, never from here: the custom
   properties default to the full column, so the create- and move-preview blocks
   — which set neither — keep painting exactly as they always did. */
.calendar-weekgrid-block {
  position: absolute;
  left: calc(var(--block-left, 0%) + 2px);
  width: calc(var(--block-width, 100%) - 4px);
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 5px 2px 8px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--chip-color, var(--accent-color)) 22%, var(--container-color));
  color: var(--title-color);
  font-size: 0.72rem;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}
/* The colour rail is drawn, not bordered, so it keeps square corners while the
   block itself carries the 1px radius: a left border would inherit that radius
   and round the rail with it. */
.calendar-weekgrid-block::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0;
  background: var(--chip-color, var(--accent-color));
}
.calendar-weekgrid-block.selected {
  background: color-mix(in srgb, var(--chip-color, var(--accent-color)) 58%, var(--container-color));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--chip-color, var(--accent-color)) 72%, var(--title-color));
}
.calendar-weekgrid-block.selected .calendar-weekgrid-block-time { color: var(--title-color); }
.calendar-weekgrid-block.dragging { cursor: grabbing; opacity: 0.85; box-shadow: var(--shadow-md, 0 6px 16px rgba(0,0,0,0.2)); z-index: 5; }
.calendar-weekgrid-block.drag-ghost { opacity: 0.35; pointer-events: none; }
.calendar-weekgrid-block--create { opacity: 0.7; pointer-events: none; border: 1px dashed var(--chip-color, var(--accent-color)); z-index: 3; }
.calendar-weekgrid-block--ghost { opacity: 0.6; pointer-events: none; border: 1px dashed var(--chip-color, var(--accent-color)); z-index: 3; }
.calendar-weekgrid-block.completed { opacity: 0.55; text-decoration: line-through; }
.calendar-weekgrid-block-time { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.calendar-weekgrid-block-title {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
  font-weight: var(--font-medium);
}
.calendar-weekgrid-block-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.calendar-weekgrid-resize {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  cursor: ns-resize;
}

/* ── Current-time indicator (Apple Calendar "now line") ─────────────────── */
.calendar-weekgrid-now {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  pointer-events: none;
  z-index: 6;
}
.calendar-weekgrid-now-time {
  position: absolute;
  left: 0;
  width: 46px;
  transform: translateY(-50%);
  text-align: center;
  font-size: 0.62rem;
  font-weight: var(--font-semi-bold);
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  color: #fff;
  background: var(--tint-red-text);
  border-radius: var(--radius-sm);
}
.calendar-weekgrid-now-line {
  position: absolute;
  left: 48px;
  right: 0;
  top: 0;
  height: 1px;
  background: var(--tint-red-text);
  opacity: 0.3;
}
.calendar-weekgrid-now-line--today {
  right: auto;
  opacity: 1;
}
.calendar-weekgrid-now-dot {
  position: absolute;
  top: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tint-red-text);
  transform: translate(-50%, -50%);
}




/* ── Linked-file input with autocomplete (QuickAdd) ────────────────────── */

/* ── Todo: file-path input with autocomplete ─────────────────────────────── */

`
