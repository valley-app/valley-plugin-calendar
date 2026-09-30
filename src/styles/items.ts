export const itemStyles = `
.calendar-completion-wrap { display: inline-flex; align-items: center; flex-shrink: 0; }
.calendar-completion { appearance: none; border: 1px solid currentColor; border-radius: 50%; width: 14px; height: 14px; margin: 0 4px 0 0; cursor: pointer; accent-color: var(--accent-color); }
.calendar-completion:checked { background: radial-gradient(circle, var(--accent-color) 0 45%, transparent 50%); }
.calendar-completion:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 2px; }
.calendar-completion-error { color: var(--negative-color); font-size: var(--font-size-small); }
.agenda-card { width: 100%; box-sizing: border-box; }
/* ── Item badges ──────────────────────────────────────────────────────────
   What an item carries, drawn on the item. Tertiary and small on purpose: they
   are a hint that something is there, never a second title. */
.calendar-badges {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  color: var(--text-tertiary);
}
.calendar-badges svg { width: 11px; height: 11px; }

/* A group that comes from Preferences is shared with every other plugin — the
   tag says so, because editing that row changes it everywhere. */
.calendar-group-scope {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-color-alt);
  color: var(--text-tertiary);
  font-size: var(--smaller-font-size);
}

/* ── Calendar context menu ───────────────────────────────────────────────── */
.cal-ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) - 1);
}
.calendar-context-menu {
  position: fixed;
  z-index: var(--z-modal);
  min-width: 160px;
  padding: var(--space-1);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--container-color);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
}
.calendar-context-menu button {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-color);
  font-size: var(--small-font-size);
  text-align: left;
  cursor: pointer;
}
.calendar-context-menu button:hover { background: var(--hover-bg); color: var(--title-color); }
.calendar-context-menu button.calendar-context-menu-danger { color: var(--negative-color); }
.calendar-context-menu button.calendar-context-menu-danger:hover { background: color-mix(in srgb, var(--negative-color) 12%, transparent); color: var(--negative-color); }
.calendar-context-menu-label { display: block; padding: 4px var(--space-2) 2px; font-size: var(--small-font-size); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.calendar-context-menu-sep { height: 1px; margin: var(--space-1) 0; background: var(--border-light); }

`
