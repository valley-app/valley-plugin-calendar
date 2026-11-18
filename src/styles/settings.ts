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

export const noteDateStyles = `/* ── Note-date sources (Settings → Calendar → Note dates) ─────────────────
   The twin of Map pins: one flat list on fixed columns. Every line runs edge to
   edge like the header bar's (the frame insets content 10px); content keeps its inset. */
.notedate-settings-frame { display:flex; flex-direction:column; flex:1 1 auto; height:100%; min-height:0; min-width:0; margin:0 -10px; }
#plugin-root .settings-listpage-header.notedate-sources-header { margin-inline:0; padding-inline:10px; }
.settings-section.notedate-settings { padding:var(--space-3) 10px var(--space-4, 16px); }
.notedate-sources-header { display:flex; align-items:center; gap:8px; flex:0 0 var(--app-bar-height, 38px); height:var(--app-bar-height, 38px); min-height:var(--app-bar-height, 38px); box-sizing:border-box; padding:0 10px; border-bottom:1px solid var(--border-light); font-size:var(--small-font-size); font-weight:600; background:var(--container-color); }
.notedate-sources-header > span:first-child { flex:1; min-width:0; }
.notedate-sources-description { margin:10px 0; color:var(--text-secondary); font-size:var(--smaller-font-size); line-height:1.5; }
.notedate-sources-toolbar { display:flex; align-items:center; gap:var(--space-2); min-width:0; margin-bottom:var(--space-3); }
.notedate-sources-toolbar .notedate-sources-search { flex:1 1 auto; min-width:0; margin:0; }
.notedate-sources-search input { width:100%; min-width:0; border:0; background:none; outline:0; box-shadow:none; color:inherit; }
.notedate-sources-search input:focus, .notedate-sources-search input:focus-visible { border:0; outline:none; box-shadow:none; background:none; }
.notedate-sources-fold { flex:0 0 auto; }
.notedate-sources-fold svg { width:var(--shell-glyph-medium, 16px); height:var(--shell-glyph-medium, 16px); }
.notedate-add-source-row { display:flex; align-items:center; flex:0 0 auto; padding:2px; margin-right:-2px; }
.notedate-add-source { display:inline-flex; align-items:center; justify-content:center; gap:6px; width:auto; margin:0; min-height:28px; padding:5px 10px; border:1px solid var(--border-medium); border-radius:var(--radius); background:var(--hover-bg); color:var(--text-color); font:inherit; }
.notedate-add-source svg { display:block; width:14px; height:14px; flex-shrink:0; padding:0; background:none; }
.notedate-add-source:hover { background:var(--selected-bg, var(--hover-bg)); border-color:var(--accent-color); }
.notedate-sources-empty > span { display:block; }
.notedate-source-list { display:flex; flex-direction:column; min-width:0; container-type:inline-size; }
.notedate-source-sortable { position:relative; min-width:0; }
.notedate-source-list > .settings-visually-hidden { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
.notedate-source-sortable[data-drop-position]::before { content:''; position:absolute; z-index:2; left:-10px; right:-10px; height:var(--drop-knob, 6px); margin:0; background:var(--drop-indicator-fill, var(--accent-color)); pointer-events:none; }
.notedate-source-list .notedate-source-sortable[data-drop-position='before']::before { top:0; transform:translateY(-50%); }
.notedate-source-list .notedate-source-sortable[data-drop-position='after']::before { bottom:0; transform:translateY(50%); }
.notedate-source-row { min-width:0; margin:0 -10px; padding:0 10px; border-bottom:1px solid var(--border-light); }
/* The line under the toolbar sits directly on the first source. No pseudo-element here:
   host widgets copy their ancestors' classes into their own tree with this
   stylesheet, so a generated box on an ancestor class pushes every widget aside. */
.notedate-source-list > .notedate-source-sortable:first-of-type > .notedate-source-row { border-top:1px solid var(--border-light); }
/* The head never changes when the source opens: fixed height, same content. */
.notedate-source-head { display:grid; grid-template-columns:22px 24px minmax(0, 1fr) auto 22px auto; align-items:center; column-gap:8px;
  height:44px; box-sizing:border-box; min-width:0; cursor:pointer; }
.notedate-source-grip, .notedate-source-disclosure { display:grid; place-items:center; flex:0 0 22px; width:22px; height:28px; align-self:center; border:0; border-radius:var(--radius-sm); padding:0; margin:0; background:none; color:var(--text-secondary); cursor:pointer; }
.notedate-source-grip { cursor:grab; color:var(--text-tertiary); }
.notedate-source-grip:active { cursor:grabbing; }
.notedate-source-grip:hover, .notedate-source-disclosure:hover { background:var(--hover-bg); color:var(--text-color); }
.notedate-source-grip svg, .notedate-source-disclosure svg { display:block; width:16px; height:16px; }
.notedate-source-disclosure[aria-expanded='true'] svg { transform:rotate(90deg); }
.notedate-source-disclosure:focus-visible, .notedate-source-icon-btn:focus-visible, .notedate-glyph-opt:focus-visible { outline:2px solid var(--accent-color); outline-offset:2px; }
.notedate-source-disclosure:focus:not(:focus-visible) { outline:none; }
.notedate-source-disc { display:grid; place-items:center; width:24px; height:24px; box-sizing:border-box; border-radius:50%;
  background:var(--swatch-fill, var(--accent-color)); border:2px solid var(--swatch-ring, transparent); color:var(--swatch-on, var(--accent-contrast, var(--title-color))); box-shadow:0 0 0 1px var(--border-light); }
.notedate-source-disc.unset { background:var(--container-color-alt); color:var(--text-secondary); }
.notedate-source-disc .notedate-asset-glyph, .notedate-source-icon-btn .notedate-asset-glyph { width:12px; height:12px; }
.notedate-swatch-none { font-size:13px; line-height:1; }
.notedate-source-meta { display:flex; flex-direction:column; justify-content:center; gap:2px; min-width:0; }
.notedate-source-name { font-weight:600; color:var(--text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notedate-source-name.is-placeholder { color:var(--text-secondary); }
.notedate-source-sub { font-size:var(--smaller-font-size); color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notedate-source-warn { color:var(--tint-red-text, #b91c1c); }
.notedate-source-count { min-width:3ch; text-align:right; font-size:var(--smaller-font-size); font-variant-numeric:tabular-nums; color:var(--text-secondary); }
.notedate-source-row.is-off .notedate-source-name, .notedate-source-row.is-off .notedate-source-sub, .notedate-source-row.is-off .notedate-source-count { color:var(--text-tertiary, var(--text-secondary)); }
.notedate-source-row.is-off .notedate-source-disc { opacity:.45; }
/* What the source currently finds — a rule matching nothing must not stay silent. */
.notedate-source-stats { display:block; margin:0; font-size:var(--smaller-font-size); font-variant-numeric:tabular-nums; color:var(--text-secondary);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notedate-source-stats.warn { color:var(--tint-red-text, #b91c1c); }
/* The open source: a label column right beside its controls, lines only between groups. */
.notedate-source-editor { min-width:0; padding:2px 0 var(--space-3) calc(22px + 24px + 2 * 8px); }
.notedate-source-form { display:grid; grid-template-columns:132px minmax(0, 440px); column-gap:var(--space-3); row-gap:6px; align-items:center; min-width:0; }
.notedate-source-form-label { min-width:0; overflow-wrap:anywhere; }
.settings-row-control.notedate-source-form-control { width:100%; min-width:0; min-height:32px; justify-content:flex-start; flex-wrap:nowrap; }
.notedate-source-form-control > [data-plugin-widget]:not([data-plugin-widget-inline]) { flex:1 1 0; min-width:0; }
.notedate-source-form-note { min-width:0; margin-top:-2px; font-size:var(--smaller-font-size); line-height:1.4; color:var(--text-secondary); }
.notedate-source-group { min-width:0; margin-top:var(--space-3); padding-top:var(--space-3); border-top:1px solid var(--border-light); }
.notedate-source-group-title { margin:0 0 6px; font-size:var(--smaller-font-size); font-weight:600; color:var(--text-secondary); }
.notedate-source-footer { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); }
.notedate-source-use { display:inline-flex; align-items:center; gap:var(--space-2); min-width:0; }
.notedate-source-match-eq { flex:0 0 auto; color:var(--text-secondary); }
.notedate-source-range { display:inline-flex; width:96px; flex:0 0 auto; }
.notedate-source-icon-btn { display:grid; place-items:center; flex:0 0 auto; width:28px; height:28px; box-sizing:border-box; padding:0;
  border:1px solid var(--border-medium); border-radius:50%; background:none; color:var(--text-color); cursor:pointer; }
/* Layout only — the kit's ColorField owns the chip itself, including the
   fill/ring/unset drawing. Sizing it up from the kit's default 20px is the only
   thing this surface asks of it, and the Map's pin-source form asks for the same
   26px, so the pair read as one control in both places. */
.notedate-source-color { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
.notedate-source-color .settings-color-swatch { width:26px; height:26px; }
/* Both colours are optional: a set colour carries its own small clear button right
   beside it. Never a hover overlay on the chip: the kit swatch is a host widget, so
   the plugin document never sees the pointer over it and the button would never show. */
.notedate-color-wrap { display:inline-flex; align-items:center; gap:2px; }
.notedate-color-clear { display:grid; place-items:center; width:18px; height:18px; padding:0; border:0; border-radius:var(--radius-sm); background:none; color:var(--text-tertiary, var(--text-secondary)); cursor:pointer; }
.notedate-color-clear:hover { background:var(--hover-bg); color:var(--text-color); }
.notedate-color-clear:focus-visible { outline:2px solid var(--accent-color); outline-offset:1px; }
.notedate-color-clear svg { width:12px; height:12px; }
/* Layout only — these are kit Buttons, which own the frame, padding and typography. */
.notedate-source-toggle { display:inline-flex; align-items:center; justify-content:center; gap:5px; }
.notedate-source-toggle svg { display:block; flex:0 0 auto; width:14px; height:14px; vertical-align:middle; }
.notedate-icon-browser { width:100%; padding:6px; box-sizing:border-box; }
.notedate-glyph-grid { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:4px; padding-bottom:8px; max-height:180px; overflow-y:auto; }
.notedate-glyph-opt { min-width:0; height:32px; display:grid; place-items:center; padding:4px; border:1px solid transparent; border-radius:var(--radius); background:none; color:var(--text-secondary); cursor:pointer; }
.notedate-glyph-opt .notedate-asset-glyph { width:18px; height:18px; }
.notedate-glyph-opt:hover { background:var(--hover-bg); color:var(--text-color); }
.notedate-glyph-opt.active { border-color:var(--accent-color); background:var(--hover-bg); color:var(--accent-color); }
.notedate-icon-hint { margin:4px 0 8px; font-size:0.6875rem; line-height:1.4; color:var(--text-secondary); overflow-wrap:anywhere; }
.notedate-icon-actions { display:flex; flex-wrap:wrap; gap:8px; }
@container (max-width:480px) {
  .notedate-source-editor { padding-left:0; }
  .notedate-source-form { grid-template-columns:minmax(0, 1fr); row-gap:4px; }
  .notedate-source-form-label:empty { display:none; }
  .notedate-source-form-label + .notedate-source-form-control { margin-bottom:4px; }
}
.notedate-asset-glyph { display:inline-flex; align-items:center; justify-content:center; width:1em; height:1em; flex-shrink:0; }
.notedate-asset-glyph svg { display:block; width:100%; height:100%; }
/* Calendar sidebar: the note-date sources, drawn like Map's Map pins tab (18 Nov). */
.notedate-sidebar-sources { flex:0 0 auto; min-height:0; }
.notedate-sidebar-bar { position:sticky; top:0; z-index:1; display:flex; align-items:center; gap:6px; height:var(--app-bar-height); box-sizing:border-box; flex-shrink:0;
  padding:0 var(--space-2, 8px) 0 10px; border-bottom:1px solid var(--border-light); background:var(--container-color); }
.notedate-sidebar-bar-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notedate-sidebar-bar .panel-tool-btn.is-off { color:var(--text-tertiary, var(--text-secondary)); }
.notedate-sidebar-bar .panel-tool-btn svg { width:var(--shell-glyph-medium, 16px); height:var(--shell-glyph-medium, 16px); }
.notedate-sidebar-empty { padding:14px; color:var(--text-secondary); font-size:0.75rem; line-height:1.5; }
.notedate-tree { position:relative; padding:2px 0 8px; }
.notedate-row { position:relative; display:flex; align-items:center; gap:8px; min-width:0; padding:5px 10px 5px calc(6px + var(--notedate-tree-depth, 0) * 16px); cursor:pointer; }
.notedate-row:hover { background:var(--hover-bg); }
.notedate-row:focus { outline:none; }
.notedate-row:focus-visible { outline:2px solid var(--accent-color); outline-offset:-2px; }
.notedate-row-title { flex:1; min-width:0; font-size:0.8125rem; color:var(--text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notedate-row-count { flex:none; font-size:var(--smaller-font-size); font-variant-numeric:tabular-nums; color:var(--text-tertiary, var(--text-secondary)); white-space:nowrap; }
.notedate-row-action { display:grid; place-items:center; flex-shrink:0; padding:3px; border:none; border-radius:4px; background:none;
  color:var(--text-tertiary, var(--text-secondary)); cursor:pointer; opacity:0; }
.notedate-row:hover .notedate-row-action, .notedate-row:focus-within .notedate-row-action, .notedate-row-eye { opacity:1; }
.notedate-row-action svg { width:14px; height:14px; }
.notedate-row-action:hover { background:var(--container-color-alt); color:var(--text-color); }
.notedate-row-eye.is-off { color:var(--text-tertiary, var(--text-secondary)); }
.notedate-tree-slot { display:grid; place-items:center; flex:0 0 14px; width:14px; height:14px; margin-right:-4px; color:var(--text-tertiary, var(--text-secondary)); }
.notedate-tree-slot svg { width:12px; height:12px; transition:transform .12s ease; }
.notedate-source-chevron.open svg { transform:rotate(90deg); }
/* A source's glyph on a disc in its colour, like its entries in the calendar. */
.notedate-badge { display:grid; place-items:center; flex:0 0 18px; width:18px; height:18px; border-radius:50%;
  background:var(--badge-fill, var(--accent-color)); color:var(--badge-on, #fff); box-shadow:inset 0 0 0 1px rgba(0,0,0,.08); }
.notedate-badge .notedate-asset-glyph { width:11px; height:11px; }
.notedate-badge.is-small { flex-basis:14px; width:14px; height:14px; }
.notedate-badge.is-small .notedate-asset-glyph { width:8px; height:8px; }
.notedate-tree-row.is-hidden > .notedate-badge, .notedate-tree-row.is-hidden > .notedate-row-title, .notedate-tree-row.is-hidden > .notedate-row-count { opacity:.45; }
.notedate-tree-row.drop-before::before, .notedate-tree-row.drop-after::before { content:''; position:absolute; z-index:2; left:6px; right:0;
  height:var(--drop-knob, 2px); background:var(--drop-indicator-fill, var(--accent-color)); pointer-events:none; }
.notedate-tree-row.drop-before::before { top:0; transform:translateY(-50%); }
.notedate-tree-row.drop-after::before { bottom:0; transform:translateY(50%); }
.notedate-sidebar-sources.embedded .notedate-sidebar-bar { position:static; }
`
