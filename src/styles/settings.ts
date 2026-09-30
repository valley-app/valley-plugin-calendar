export const integrationStyles = `/* Calendar's integration page starts with a bordered plugin card rather than a
   labeled row, so it needs its own air beneath the Settings breadcrumb. */
.calendar-sync-settings { gap: var(--space-3); }
.calendar-account-row { width: 100%; text-align: left; font: inherit; color: inherit; }
.calendar-account-row > svg { flex-shrink: 0; }
.calendar-account-identity { display: flex; align-items: center; gap: var(--space-3); padding-block: var(--space-3); border-bottom: 1px solid var(--border-light); }
.calendar-account-identity .settings-list-meta { flex: 1; min-width: 0; }
.calendar-sync-calendar { border-bottom: 1px solid var(--border-light); }
.calendar-source-intro {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--container-color-alt);
  color: var(--text-secondary);
  font-size: var(--smaller-font-size);
  line-height: 1.5;
}
.calendar-source-intro p { margin: 0; }

.calendar-plugins-settings .settings-plugin-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
`

export const noteDateStyles = `/* ── Note-date source editor (Settings → Calendar → Note dates) ──────────── */
.notedate-source-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 10px 0;
  padding: 14px 16px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  background: var(--container-color-alt);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.notedate-source-row:hover { border-color: var(--border-medium); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); }
.notedate-source-head { display: flex; align-items: center; gap: 10px; }
.notedate-source-swatch {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2px solid var(--swatch-ring, transparent);
  border-radius: var(--radius);
  background: var(--swatch-fill, var(--accent-color));
  color: var(--swatch-on, var(--accent-contrast, var(--title-color)));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.notedate-source-swatch:hover { transform: scale(1.06); }
.notedate-source-swatch.unset {
  border: 1px dashed var(--border-medium);
  background: none;
  box-shadow: none;
  color: var(--text-tertiary, var(--text-secondary));
}
.notedate-swatch-none { font-size:13px; line-height: 1; }
.notedate-glyph-picker { position: relative; flex: 0 0 auto; }
.notedate-glyph-grid {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius);
  background: var(--surface-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.notedate-glyph-opt {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.notedate-glyph-opt:hover { background: var(--hover-bg); color: var(--text-color); }
.notedate-glyph-opt.active { border-color: var(--accent-color); color: var(--accent-color); }
.notedate-source-title {
  flex: 1;
  min-width: 0;
  border-color: transparent;
  background: transparent;
  font-size:0.875rem;
  font-weight: var(--font-semi-bold, 600);
}
.notedate-source-title:hover { background: var(--hover-bg); }
.notedate-source-title:focus { border-color: var(--border-medium); background: var(--surface-color); }
/* Layout only — the kit's ColorField owns the chip itself, including the
   fill/ring/unset drawing. Sizing it up from the kit's default 20px is the only
   thing this surface asks of it, and the Map's pin-source row asks for the same
   26px, so the pair read as one control in both places. */
.notedate-source-color { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.notedate-source-color .settings-color-swatch { width: 26px; height: 26px; }
.notedate-color-wrap { position: relative; display: inline-flex; }
.notedate-color-clear {
  position: absolute;
  top: -4px;
  right: -4px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  background: var(--surface-color);
  color: var(--text-secondary);
  font-size:0.5625rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.notedate-color-wrap:hover .notedate-color-clear { opacity: 1; }
.notedate-color-clear:hover { color: var(--text-color); }
.notedate-source-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.notedate-source-toggle { gap: 5px; }
.notedate-source-toggle svg { width: 14px; height: 14px; }
.notedate-source-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
.notedate-source-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.notedate-source-field.wide { grid-column: 1 / -1; }
.notedate-source-field > label {
  font-size:0.625rem;
  font-weight: var(--font-semi-bold, 600);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary, var(--text-secondary));
}
.notedate-source-field .settings-path-input { width: 100%; }
.notedate-source-field .notedate-source-limit { max-width: 100px; }
.notedate-source-inline { display: flex; align-items: center; gap: 8px; }
.notedate-source-inline .settings-path-input { flex: 1; min-width: 0; }
.notedate-source-inline-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  font-size:0.71875rem;
  color: var(--text-secondary);
  cursor: pointer;
}
/* What the rule currently finds — a rule matching nothing must not stay silent. */
.notedate-source-stats {
  margin: -2px 0 8px;
  font-size:0.71875rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary, var(--text-secondary));
}
.notedate-source-stats.warn { color: var(--tint-red-text, #b91c1c); }

.notedate-source-show { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
.notedate-source-show-row { display: flex; align-items: center; gap: 6px; width: 100%; }
.notedate-source-show-row .settings-path-input { flex: 1; min-width: 0; }
.notedate-source-show-remove {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--text-tertiary, var(--text-secondary));
  font-size:1.0625rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.12s ease, background 0.12s ease;
}
.notedate-source-show-row:hover .notedate-source-show-remove { opacity: 1; }
.notedate-source-show-remove:hover { background: var(--hover-bg); color: var(--text-color); }
.notedate-source-advanced { border-top:1px solid var(--border-light); padding-top:4px; }
.notedate-source-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 4px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size:0.75rem;
  text-align: left;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}
.notedate-source-advanced-toggle:hover { color: var(--text-color); background:var(--hover-bg); }
.notedate-source-advanced-toggle:focus-visible { outline:2px solid var(--accent-color); outline-offset:2px; }
.notedate-source-advanced-toggle svg { display:block; flex:0 0 16px; width:16px; height:16px; transition:transform 0.12s ease; }
.notedate-source-advanced-toggle[aria-expanded='true'] svg { transform:rotate(90deg); }
.notedate-source-advanced-body { padding:8px 6px 4px; }
@media (prefers-reduced-motion: reduce) { .notedate-source-advanced-toggle, .notedate-source-advanced-toggle svg { transition:none; } }

.notedate-source-list { display:flex; flex-direction:column; gap:12px; }
.notedate-source-list .notedate-source-row { margin:0; padding:12px; gap:10px; }
.notedate-source-sortable { position:relative; min-width:0; }
.notedate-source-sortable[data-drop-position]::before { content:''; position:absolute; z-index:2; left:0; right:0; height:var(--drop-knob, 6px); margin:0; background:var(--drop-indicator-fill, var(--accent-color)); pointer-events:none; }
.notedate-source-list .notedate-source-sortable[data-drop-position='before']::before { top:-6px; transform:translateY(-50%); }
.notedate-source-list .notedate-source-sortable[data-drop-position='after']::before { bottom:-6px; transform:translateY(50%); }
.notedate-sidebar-list .notedate-source-sortable[data-drop-position='before']::before { top:0; transform:translateY(-50%); }
.notedate-sidebar-list .notedate-source-sortable[data-drop-position='after']::before { bottom:0; transform:translateY(50%); }
.notedate-source-head { flex-wrap:nowrap; min-width:0; gap:8px; }
.notedate-source-grip, .notedate-source-disclosure { display:grid; place-items:center; flex:0 0 22px; width:22px; height:28px; align-self:center; border:0; border-radius:var(--radius-sm); padding:0; margin:0; background:none; color:var(--text-secondary); cursor:pointer; }
.notedate-source-grip { cursor:grab; color:var(--text-tertiary); }
.notedate-source-grip:active { cursor:grabbing; }
.notedate-source-grip:hover, .notedate-source-disclosure:hover { background:var(--hover-bg); color:var(--text-color); }
.notedate-source-grip svg, .notedate-source-disclosure svg { display:block; width:16px; height:16px; }
.notedate-source-disclosure[aria-expanded='true'] svg, .notedate-sources-heading[aria-expanded='true'] > svg { transform:rotate(90deg); }
.notedate-source-summary { display:flex; flex:1; flex-direction:column; align-items:flex-start; gap:3px; min-width:0; border:0; padding:0; background:none; color:var(--text-color); font:inherit; font-weight:600; text-align:left; cursor:pointer; overflow-wrap:anywhere; }
.notedate-source-summary small { font-size:var(--smaller-font-size); color:var(--text-secondary); overflow-wrap:anywhere; }
.notedate-source-head > [data-plugin-widget-inline] { flex:0 0 auto; }
.notedate-source-details { display:flex; flex-direction:column; gap:12px; min-width:0; }
.notedate-source-tools { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
.notedate-source-toggle { display:inline-flex; align-items:center; justify-content:center; }
.notedate-source-toggle svg { display:block; flex:0 0 auto; vertical-align:middle; }
.notedate-add-source-row { display:flex; align-items:center; padding:12px 0 4px; }
.notedate-add-source { display:inline-flex; align-items:center; justify-content:center; gap:6px; width:auto; margin:0; min-height:28px; padding:5px 10px; border:1px solid var(--border-medium); border-radius:var(--radius); background:var(--hover-bg); color:var(--text-color); font:inherit; }
.notedate-add-source svg, .notedate-add-field svg { display:block; width:14px; height:14px; flex-shrink:0; padding:0; background:none; }
.notedate-add-source:hover { background:var(--selected-bg, var(--hover-bg)); border-color:var(--accent-color); }
.notedate-add-field { display:inline-flex; align-items:center; gap:6px; align-self:flex-start; }
.notedate-sources-header { display:flex; align-items:center; gap:8px; flex:0 0 var(--app-bar-height, 38px); height:var(--app-bar-height, 38px); min-height:var(--app-bar-height, 38px); box-sizing:border-box; padding:0 10px; border-bottom:1px solid var(--border-light); font-size:var(--small-font-size); font-weight:600; background:var(--container-color); }
.notedate-sources-header > span:first-child, .notedate-sources-heading { flex:1; min-width:0; }
.notedate-sources-description { margin:10px 0; color:var(--text-secondary); font-size:var(--smaller-font-size); line-height:1.5; }
.notedate-sidebar-sources { flex:0 0 auto; min-height:0; }
.notedate-sidebar-sources .notedate-sources-header { position:sticky; top:0; z-index:1; }
.notedate-sidebar-list { padding:4px 6px; }
.notedate-sidebar-row { display:flex; align-items:center; gap:4px; min-height:36px; min-width:0; }
.notedate-sidebar-row:hover { background:var(--hover-bg); border-radius:var(--radius); }
.notedate-sidebar-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notedate-sidebar-details { display:flex; flex-direction:column; gap:6px; padding:4px 10px 12px 54px; color:var(--text-secondary); font-size:var(--smaller-font-size); overflow-wrap:anywhere; }
.notedate-sidebar-details button { align-self:flex-start; border:0; background:none; color:var(--accent-color); padding:0; font:inherit; cursor:pointer; }

.notedate-settings { container-type:inline-size; }
.notedate-source-row { container-type:inline-size; }
.notedate-source-grid .settings-path-input, .notedate-source-grid .settings-select, .notedate-source-grid .settings-select-trigger, .notedate-source-grid .settings-path-field, .notedate-source-grid .settings-path-control { width:100%; min-width:0; max-width:100%; box-sizing:border-box; }
.notedate-source-grid [data-plugin-widget] { min-width:0; }
.notedate-source-inline { flex-wrap:wrap; }
.notedate-asset-glyph { display:inline-flex; align-items:center; justify-content:center; width:1em; height:1em; flex-shrink:0; }
.notedate-asset-glyph svg { display:block; width:100%; height:100%; }
.notedate-source-swatch .notedate-asset-glyph, .notedate-glyph-opt .notedate-asset-glyph { width:16px; height:16px; }
.notedate-icon-folder { flex-wrap:wrap; gap:8px; }
.notedate-icon-folder > .settings-toggle-text { flex:1; min-width:180px; overflow-wrap:anywhere; }
.notedate-sources-search { margin:12px 0; }
.notedate-sources-search input { width:100%; min-width:0; border:0; background:none; outline:0; box-shadow:none; color:inherit; }
.notedate-sources-search input:focus, .notedate-sources-search input:focus-visible { border:0; outline:none; box-shadow:none; background:none; }
.notedate-icon-error { grid-column:1 / -1; width:180px; font-size:var(--smaller-font-size); }
.notedate-sources-heading { display:flex; align-items:center; gap:8px; background:none; border:0; color:inherit; padding:0; font:inherit; text-align:left; cursor:pointer; }
.notedate-sources-heading svg { width:16px; height:16px; flex-shrink:0; }
.notedate-sidebar-glyph { display:flex; width:18px; height:18px; flex-shrink:0; }
.calendar-agenda-panel > .notedate-sidebar-sources .notedate-sidebar-list { max-height:240px; overflow:auto; }
.notedate-sidebar-sources .notedate-sources-description { padding:0 6px; }
@container (max-width:480px) { .notedate-source-grid { grid-template-columns:minmax(0, 1fr); } }
`
