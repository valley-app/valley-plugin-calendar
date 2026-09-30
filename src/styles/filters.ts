export const headerFilterStyles = `/* ── Header filters (groups / sources) ───────────────────────────────────── */
/* The chips are unchanged — they simply moved out of the Calendar's top bar,
   where they only fitted on a wide window and were missing from the Agenda
   entirely, into a popover behind one icon on both surfaces. */
.calendar-filter-actions { display: inline-flex; align-items: center; gap: 2px; }
.calendar-filter-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary, var(--text-secondary));
  font-size:0.9375rem;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}
.calendar-filter-btn:hover { background: var(--hover-bg); color: var(--title-color); }
.calendar-filter-btn.active { background: var(--tree-active-bg); color: var(--accent-color); }
.calendar-filter-icon { display: inline-flex; font-size: 0.9rem; }
.calendar-filter-icon svg { width: 15px; height: 15px; }
.calendar-filter-popover {
  width: min(244px, calc(100vw - 16px));
  padding: calc(var(--space-3) / 2);
  border-color: var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--container-color);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
}
.calendar-filter-popover-body { display: flex; flex-direction: column; }
.calendar-filter-popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 0 var(--space-2) var(--space-1);
  border-bottom: 1px solid var(--border-light);
}
.calendar-filter-popover-title,
.calendar-filter-popover-all {
  padding: 2px 4px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  font-size: var(--small-font-size);
}
.calendar-filter-popover-title { color: var(--text-secondary); font-weight: var(--font-semi-bold); }
.calendar-filter-popover-title.actionable { color: var(--accent-color); cursor: pointer; }
.calendar-filter-popover-all { color: var(--text-tertiary); font-size: var(--smaller-font-size); cursor: pointer; }
.calendar-filter-popover-title.actionable:hover,
.calendar-filter-popover-all:hover { background: var(--hover-bg); color: var(--title-color); }
.calendar-filter-list {
  display: flex;
  flex-direction: column;
  padding-top: var(--space-1);
  max-height: 320px;
  overflow-y: auto;
  min-width: 148px;
}
.calendar-filter-option {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 28px;
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-color);
  font: inherit;
  font-size: var(--small-font-size);
  text-align: left;
  cursor: pointer;
}
.calendar-filter-option:hover,
.calendar-filter-option.active { background: var(--hover-bg); color: var(--title-color); }
.calendar-filter-option.active { border-radius: 0; }
.calendar-filter-option.active.selection-run-start {
  border-top-left-radius: var(--radius-sm);
  border-top-right-radius: var(--radius-sm);
}
.calendar-filter-option.active.selection-run-end {
  border-bottom-right-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-sm);
}
.calendar-filter-option.active:hover {
  background: color-mix(in srgb, var(--title-color) 14%, transparent);
}
.calendar-filter-option.active:has(+ .calendar-filter-option:hover),
.calendar-filter-option:hover:has(+ .calendar-filter-option.active) {
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}
.calendar-filter-option.active + .calendar-filter-option:hover,
.calendar-filter-option:hover + .calendar-filter-option.active {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.calendar-filter-check {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  color: var(--accent-color);
  font-size: 0.75rem;
  font-weight: var(--font-semi-bold);
}
.calendar-filter-option .calendar-legend-dot { flex: 0 0 auto; width: 8px; height: 8px; }
.calendar-filter-option-glyph,
.calendar-filter-property-glyph {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}
.calendar-filter-option-glyph { width: 14px; height: 14px; }
.calendar-filter-property-glyph { width: 1em; height: 1em; margin-right: var(--space-2); vertical-align: -0.15em; }
.calendar-filter-option-glyph svg,
.calendar-filter-property-glyph svg { width: 100%; height: 100%; }
.calendar-filter-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.calendar-filter-option-count {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.calendar-filter-property-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}
.calendar-filter-property-value {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}
.calendar-filter-empty {
  padding: 6px 8px;
  color: var(--text-tertiary, var(--text-secondary));
  font-size: var(--smaller-font-size);
}

`

export const inlineFilterStyles = `.calendar-filter-inline-rows {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 6px 6px;
  border-bottom: 1px solid var(--border-light);
}
.calendar-filter-inline-row { display: flex; flex-direction: column; min-width: 0; }
.calendar-filter-inline-head {
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);
  transition: background-color var(--duration-fast, 120ms) var(--ease-out, ease);
}
.calendar-filter-inline-head:hover { background: var(--hover-bg); }
.calendar-filter-inline-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 30px;
  padding: 4px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
/* The header stays quieter than the rows it opens — section label first, its
   contents second. */
.calendar-filter-inline-head:hover .calendar-filter-inline-trigger { color: var(--text-secondary); }
.calendar-filter-inline-row.active .calendar-filter-inline-count { color: var(--accent-color); }
.calendar-filter-inline-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  color: var(--text-tertiary);
}
.calendar-filter-inline-icon svg { width: 16px; height: 16px; }
.calendar-filter-inline-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.calendar-filter-inline-count {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  font-weight: 400;
}
.calendar-filter-inline-chevron {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
  transition: transform var(--duration-fast, 120ms) var(--ease-out, ease);
}
.calendar-filter-inline-chevron.open { transform: rotate(90deg); }
.calendar-filter-inline-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}
.calendar-filter-inline-clear svg { width: 14px; height: 14px; }
.calendar-filter-inline-clear:hover { background: var(--hover-bg); color: var(--title-color); }
/* Rows sit flush under their header — no rail, no second indent level: the dot
   column alone is enough to read them as belonging to the section above. */
.calendar-filter-inline-list {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  padding-bottom: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.calendar-filter-inline-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 3px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
/* Dot sits in the same 18px slot the header icon uses, so every label in the
   block starts on one line. */
.calendar-filter-inline-option .calendar-legend-dot { width: 8px; height: 8px; margin: 0 5px; }
.calendar-filter-inline-option:hover { background: var(--hover-bg); color: var(--title-color); }
/* Off: hollow dot and struck-through label, so a hidden row reads as switched
   off from either the colour column or the text. */
.calendar-filter-inline-option.off { color: var(--text-tertiary); text-decoration: line-through; }
.calendar-filter-inline-option.off .calendar-legend-dot {
  background: transparent !important;
  box-shadow: inset 0 0 0 1.5px var(--text-tertiary);
}
.calendar-filter-inline-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.calendar-legend-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 4px);
  padding: 2px var(--space-2, 8px);
  border: 1px solid var(--border-medium);
  border-radius: 999px;
  background: var(--container-color);
  color: var(--text-secondary);
  font-size: var(--smaller-font-size);
  cursor: pointer;
}
.calendar-legend-chip:hover { color: var(--text-color); }
.calendar-legend-chip.off { opacity: 0.4; text-decoration: line-through; }
.calendar-legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }

`
