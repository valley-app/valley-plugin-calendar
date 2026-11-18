export const agendaStyles = `/* ── Agenda panel header actions ────────────────────────────────────────────── */
.agenda-header-actions { display:inline-flex; align-items:center; gap:5px; }
.agenda-today-btn { display:inline-flex; align-items:center; height:var(--shell-control-toolbar, 26px);
  padding:0 8px; font:inherit; font-size:var(--small-font-size); font-weight:var(--font-semi-bold); cursor:pointer;
  border:none; border-radius:var(--shell-control-radius, var(--radius-sm)); background:var(--accent-tint-bg);
  color:var(--title-color); -webkit-app-region:no-drag; }
.agenda-today-btn:hover { background:var(--hover-bg); }

/* Sources and note dates: a row of icon segments that opens one list
   inline, selected like the Properties segment switcher. */
.agenda-filter-bar { display:flex; align-items:center; gap:var(--space-1); flex:0 0 auto; height:var(--app-bar-height); box-sizing:border-box;
  padding:0 var(--space-2); border-bottom:1px solid var(--border-light); }
.agenda-filter-seg { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; padding:0;
  width:var(--shell-control-action, 28px); height:var(--shell-control-toolbar, 26px); border:none;
  border-radius:var(--shell-control-radius, var(--radius-sm)); background:transparent; color:var(--text-secondary); cursor:pointer; }
.agenda-filter-seg:hover { background:var(--hover-bg); color:var(--text-color); }
.agenda-filter-seg.filtered { color:var(--accent-color); }
.agenda-filter-seg.active { background:var(--accent-tint-bg); color:var(--title-color); }
.agenda-filter-seg svg { width:var(--shell-glyph-medium, 16px); height:var(--shell-glyph-medium, 16px); }
.agenda-filter-panel { flex:0 0 auto; max-height:45%; overflow:auto; padding:calc(var(--space-3) / 2); border-bottom:1px solid var(--border-light); }
.agenda-filter-panel-noteDates { flex:1 1 0; max-height:none; min-height:0; padding:0; border-bottom:none; }
/* Search, Groups and the day list; hidden while the Note dates list fills the sidebar. */
.agenda-main { display:flex; flex:1 1 0; flex-direction:column; min-height:0; }
.agenda-main[hidden] { display:none; }
.agenda-filter-panel .calendar-filter-list { max-height:none; overflow:visible; }

/* The Groups section under the search field, as in Contacts (18 Nov): All
   entries, the groups with their subgroups one step in, No group. Every row
   keeps a slot for the fold chevron inside the row so the dots line up. It
   never takes more than a third of the sidebar and scrolls inside itself. */
.calendar-groups { display:flex; flex-direction:column; flex:0 0 auto; min-height:0; max-height:34%; margin:0 5px 4px; padding-bottom:6px;
  border-bottom:1px solid var(--border-light); }
.calendar-groups.folded { padding-bottom:2px; }
.calendar-groups.embedded { max-height:none; margin:0; border-bottom:none; }
.calendar-groups-head { display:flex; align-items:center; gap:2px; flex:none; min-height:28px; }
.calendar-groups-title { display:flex; align-items:center; gap:6px; flex:1; min-width:0; height:26px; padding:0 4px; border:none;
  border-radius:var(--radius-sm); background:none; color:var(--text-tertiary); font-family:var(--interface-font);
  font-size:var(--small-font-size); font-weight:var(--font-semi-bold); text-align:left; cursor:pointer; }
.calendar-groups-title:hover { color:var(--title-color); }
.calendar-groups-title:focus-visible, .calendar-groups-row:focus-visible { outline:2px solid var(--accent-color); outline-offset:-2px; }
.calendar-groups-title:focus:not(:focus-visible), .calendar-groups-row:focus:not(:focus-visible) { outline:none; }
.calendar-groups-chevron { display:inline-grid; place-items:center; width:18px; height:18px; flex:none; margin-right:-2px; }
.calendar-groups-chevron svg { width:12px; height:12px; }
.calendar-groups-name { flex:none; }
.calendar-groups-summary { min-width:0; overflow:hidden; color:var(--title-color); font-weight:var(--font-normal, 400);
  text-overflow:ellipsis; white-space:nowrap; }
.calendar-groups-head .panel-tool-btn { flex:none; }
/* A mouse click leaves no focus box; the ring is for keyboard focus only. */
.calendar-groups-head .panel-tool-btn:focus:not(:focus-visible) { outline:none; box-shadow:none; }
.calendar-groups-list { display:flex; flex-direction:column; gap:2px; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
.calendar-groups-item { position:relative; flex:none; }
.calendar-groups-row { display:flex; align-items:center; gap:6px; width:100%; min-height:28px; padding:4px 7px 4px 24px;
  border:none; border-radius:var(--radius-sm); background:none; color:var(--text-secondary);
  font-family:var(--interface-font); font-size:var(--small-font-size); text-align:left; cursor:pointer; user-select:none; }
/* The chevron lies over the row, so hovering it lights the whole row like the rest of it. */
.calendar-groups-row:hover, .calendar-groups-item:has(.calendar-groups-fold:hover) > .calendar-groups-row { background:var(--hover-bg); color:var(--text-color); }
/* Declared after :hover so the selected rows keep their tint under the pointer. */
.calendar-groups-row.active, .calendar-groups-item:has(.calendar-groups-fold:hover) > .calendar-groups-row.active { background:var(--accent-tint-bg); color:var(--title-color); }
.calendar-groups-dot { width:8px; height:8px; margin:0 3px; border-radius:50%; flex:none; background:var(--text-tertiary); }
.calendar-groups-dot.all { box-sizing:border-box; border:1.5px solid currentColor; background:none; opacity:.75; }
.calendar-groups-row.sub .calendar-groups-dot { margin-left:17px; }
.calendar-groups-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.calendar-groups-count { flex:none; color:var(--text-tertiary); font-size:var(--smaller-font-size); font-variant-numeric:tabular-nums; }
.calendar-groups-row.active .calendar-groups-count { color:inherit; }
.calendar-groups-fold { position:absolute; top:50%; left:4px; z-index:1; display:inline-flex; align-items:center; justify-content:center;
  width:18px; height:18px; padding:0; border:none; border-radius:var(--radius-sm); background:none;
  color:var(--text-tertiary); transform:translateY(-50%); cursor:pointer; }
.calendar-groups-fold:hover { color:var(--title-color); }
.calendar-groups-fold svg { width:14px; height:14px; }

/* ── Agenda panel (left sidebar) ─────────────────────────────────────────── */
.calendar-agenda-panel { width: 100%; height: 100%; min-height: 0; }
.calendar-agenda-panel .panel-header { width: 100%; }
.agenda-body { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; padding: 0 calc(var(--space-3) / 2) var(--space-4); }
.agenda-section { display: flex; flex-direction: column; gap: 4px; }
.agenda-days { display: flex; flex: 0 0 auto; flex-direction: column; min-width: 0; }
.agenda-section-spaced { padding-top: var(--space-3); }
.agenda-year-sep {
  font-size: var(--small-font-size);
  font-weight: var(--font-semi-bold);
  color: var(--text-secondary);
  padding: var(--space-2) var(--space-2) var(--space-1);
  letter-spacing: 0.05em;
}
.agenda-day-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: var(--space-1) 4px;
  margin-bottom: 2px;
  border: none;
  background: var(--container-color);
  cursor: pointer;
  text-align: left;
}
.agenda-day-dow { font-size: 0.62rem; font-weight: var(--font-semi-bold); color: var(--text-secondary); letter-spacing: 0.04em; }
.agenda-day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: 11px;
  font-size: var(--small-font-size);
  font-weight: var(--font-semi-bold);
  color: var(--title-color);
}
.agenda-day-month { font-size: 0.68rem; font-weight: var(--font-medium); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.agenda-day-header:hover .agenda-day-num { background: var(--bg-hover, rgba(0, 0, 0, 0.04)); }
.agenda-day-header.today .agenda-day-num { color: var(--accent-color); }
.agenda-day-header.selected .agenda-day-num {
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
  color: var(--accent-color);
}
.agenda-day-empty { padding: 2px 8px 4px; font-size: var(--small-font-size); color: var(--text-tertiary); }
.agenda-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  flex-shrink: 0;
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.agenda-card:hover,
.agenda-card:has([data-plugin-widget-hover]),
.agenda-card:focus-visible { background: var(--hover-bg); }
.agenda-card-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.agenda-card-title {
  font-size: var(--small-font-size);
  font-weight: var(--font-medium);
  color: var(--title-color);
  overflow-wrap: anywhere;
}
.agenda-card-time {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--small-font-size) - 1px);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
.agenda-card.completed { opacity: 0.55; }
.agenda-card.completed .agenda-card-title { text-decoration: line-through; }

.agenda-card-leading { display: flex; align-items: center; justify-content: center; flex: 0 0 16px; width: 16px; min-height: 18px; }
.agenda-card-icon { display: inline-flex; width: 14px; height: 14px; }
.agenda-card-icon .calendar-chip-glyph { width: 14px; height: 14px; }
.agenda-card-icon svg { color: inherit; }
.agenda-card-location { display: flex; align-items: baseline; gap: 4px; padding: 0; border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: calc(var(--small-font-size) - 1px); text-align: left; overflow-wrap: anywhere; }
button.agenda-card-location { cursor: pointer; }
button.agenda-card-location:hover { color: var(--accent-color); }
.agenda-card-location svg { width: 12px; height: 12px; flex-shrink: 0; align-self: flex-start; margin-top: 2px; }
.agenda-card-note {
  color: var(--text-tertiary, var(--text-secondary));
  font-size: calc(var(--small-font-size) - 1px);
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.agenda-card .agenda-card-note { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.agenda-card .calendar-completion-wrap { margin-top: 0; }
.agenda-card .calendar-completion { margin: 0; }
.agenda-card-note > :first-child { margin-top: 0; }
.agenda-card-note > :last-child { margin-bottom: 0; }
.agenda-card-note img { max-width: 100%; }
.calendar-chip-glyph { display: inline-flex; width: 1em; height: 1em; flex-shrink: 0; }
.calendar-chip-glyph svg { width: 100%; height: 100%; }
/* The Calendar page as a table (18 Nov, like To-Do's main table): sticky 37px + 1px header, 37px rows. */
.calendar-scroll-area[data-view='table'] { overflow:hidden; container-type:inline-size; }
.calendar-table-scroll { flex:1 1 auto; min-height:0; overflow:auto; outline:none; }
.calendar-table { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; font-size:var(--small-font-size); }
.calendar-table th { position:sticky; top:0; z-index:2; box-sizing:border-box; height:38px; padding:0 10px; border-bottom:1px solid var(--border-light);
  background:var(--pane-bg, var(--body-color)); color:var(--text-secondary); font-weight:var(--font-semi-bold); text-align:left; white-space:nowrap; }
.calendar-table td { box-sizing:border-box; height:37px; padding:0 10px; border-bottom:1px solid var(--border-light); color:var(--text-secondary); vertical-align:middle; overflow:hidden; }
.calendar-table-row { cursor:default; }
.calendar-table-row:hover td { background:var(--hover-bg); }
.calendar-table-row.selected td { background:var(--accent-tint-bg); }
.calendar-table-row.completed .calendar-table-title { color:var(--text-tertiary); text-decoration:line-through; }
.calendar-table-text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.calendar-table .calendar-table-mark { width:38px; padding:0 0 0 12px; }
.calendar-table .calendar-table-title { width:auto; color:var(--title-color); }
.calendar-table .calendar-table-date { width:150px; }
.calendar-table .calendar-table-time { width:112px; font-variant-numeric:tabular-nums; }
.calendar-table .calendar-table-group { width:132px; }
.calendar-table .calendar-table-source { width:110px; }
.calendar-table .calendar-table-place { width:130px; }
.calendar-table .calendar-table-note { width:22%; }
.calendar-table td.calendar-table-note { color:var(--text-tertiary); }
.calendar-table-dot { display:block; width:9px; height:9px; margin-left:4px; border-radius:50%; }
.calendar-table-sort { display:inline-flex; align-items:center; gap:4px; max-width:100%; padding:2px 4px; margin-left:-4px; border:none; border-radius:var(--radius-sm);
  background:transparent; color:inherit; font:inherit; cursor:pointer; }
.calendar-table-sort:hover { background:var(--hover-bg); color:var(--text-color); }
.calendar-table-sort.active { color:var(--title-color); }
.calendar-table-sort > span:first-child { overflow:hidden; text-overflow:ellipsis; }
.calendar-table-sort-mark { color:var(--text-tertiary); }
.calendar-table-empty { display:grid; flex:1 1 auto; place-items:center; min-height:120px; padding:var(--space-4); color:var(--text-tertiary); font-size:var(--small-font-size); }
/* Narrow panes keep Title, Date and Time. */
@container (max-width: 640px) { .calendar-table .calendar-table-source, .calendar-table .calendar-table-place, .calendar-table .calendar-table-note { display:none; } }
@container (max-width: 460px) { .calendar-table .calendar-table-group { display:none; } }
`
