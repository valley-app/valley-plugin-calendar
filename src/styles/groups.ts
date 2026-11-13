/**
 * The own-groups editor in Calendar Settings uses the shared Groups list classes
 * (`.settings-groups`), so it lines up exactly like Settings → Appearance → Groups.
 * The host's sandbox style contract carries the same rules on app builds that
 * include them; this copy keeps the editor aligned on hosts that predate them.
 * Keep it identical to the contract block.
 */
export const groupListStyles = `/* Groups lists: the shared Groups editor and every plugin's own-group editor.
   One grid holds the rows and the add row, so their columns line up: grip, name,
   colour, usage count, remove. The add row's action spans the usage and
   remove columns, so its edges meet theirs whatever the label's length. The grip
   hangs 5px into the gutter like every reorder handle in Settings, so its column
   is 11px and the name keeps its place. */
.settings-colorrules.settings-groups {
  display: grid;
  grid-template-columns: 11px minmax(0, 1fr) 20px minmax(calc(2.2 * var(--smaller-font-size)), auto) 28px;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-2);
}

/* The list owns its whole row: title and description above, the list below. */
.settings-path-row.settings-groups-row {
  display: block;
}

.settings-groups > * {
  grid-column: 1 / -1;
}

.settings-groups > .settings-colorrule-row {
  position: relative;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
}

.settings-groups > .settings-colorrule-add {
  margin-top: var(--space-1);
}

.settings-groups > .settings-colorrule-row > .settings-colorrule-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  max-width: none;
  height: 20px;
  min-height: 0;
  margin: 0 0 0 -5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.875rem;
  cursor: grab;
}

.settings-groups > .settings-colorrule-row > .settings-colorrule-grip:active {
  cursor: grabbing;
}

.settings-groups > .settings-colorrule-row > .settings-colorrule-grip-placeholder {
  visibility: hidden;
  cursor: default;
}

.settings-groups > .settings-colorrule-row > :is(.settings-colorrule-key, .settings-input-stack) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.settings-groups .settings-group-usage {
  min-width: 2.2em;
  color: var(--text-tertiary);
  font-size: var(--smaller-font-size);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.settings-groups .settings-colormap-remove {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 1.1rem;
  cursor: pointer;
}

/* A plugin's glyph is mirrored into the host button as its own box: an inline
   svg leaves descender space under it and sits above the centre. */
.settings-colormap-remove svg {
  display: block;
}

.settings-groups > .settings-colorrule-row > .settings-colorrule-add-action {
  display: grid;
  grid-column: span 2;
  min-width: 0;
}

/* One cell: a host-drawn button's placeholder in a plugin has no width of its own,
   so a hidden copy of the label (\`.settings-colorrule-add-sizer\`, a medium
   \`.settings-button\`) sizes the column for languages with a longer label. */
.settings-groups .settings-colorrule-add-action > * {
  grid-area: 1 / 1;
  min-width: 0;
}

.settings-groups .settings-colorrule-add-sizer {
  visibility: hidden;
  pointer-events: none;
}

.settings-groups .settings-colormap-add-btn {
  width: 100%;
}

/* Host-drawn fields inside a group row fill their column. */
.settings-colorrule-row > #plugin-widget-root > :is(.select-field, .settings-path-input, .settings-input-stack) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.settings-groups > .settings-colorrule-row.drop-before::before {
  top: calc(var(--space-2) / -2);
  margin: 0;
  transform: translateY(-50%);
}

.settings-groups > .settings-colorrule-row.drop-after::before {
  bottom: calc(var(--space-2) / -2);
  margin: 0;
  transform: translateY(50%);
}
`
