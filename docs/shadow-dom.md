# Shadow DOM UI

By default, the agentlet panel, dialogs, toasts and other framework UI mount
inside an open [shadow root](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot)
attached to a dedicated `<div id="agentlet-host">` in `document.body`,
instead of being appended to `document.body` directly. This isolates the
panel's CSS from the host page's CSS in both directions, without changing
any of the public JavaScript API.

See it in practice: [`examples/ui/style-isolation.html`](../examples/ui/style-isolation.html)
loads a page with deliberately hostile CSS and shows the panel rendering
unaffected by it (and vice versa). The behavior is covered end to end by
[`tests/examples/specs/ui-style-isolation.spec.js`](../tests/examples/specs/ui-style-isolation.spec.js).

## What is isolated

- **CSS in both directions.** The host page's stylesheets (resets like
  `* { box-sizing: ... }`, generic element selectors like `button`, `h3`,
  `input`, global `font-family`/`color` on `body`, and so on) no longer
  reach into the panel, dialogs, or toasts. Symmetrically, the framework's
  own stylesheet no longer leaks out into the host page: a host page
  `button` or `h3` keeps whatever styling the host page gives it.
- **IDs and classes.** `#agentlet-container`, `#agentlet-toggle`,
  `#agentlet-message-bubbles`, `.agentlet-dialog-overlay` and every other
  framework id/class now live inside the shadow root, so they can no
  longer collide with ids or classes the host page happens to reuse, and a
  host page selector targeting them (`#agentlet-container { ... }`) simply
  matches nothing.
- **`document.querySelector`/`getElementById` no longer see the UI.**
  `document.getElementById('agentlet-container')` returns `null`; the
  panel is only reachable by piercing the shadow root (see
  [Consequences for agentlet authors](#consequences-for-agentlet-authors)
  below).

### Theming: the host page can no longer reach `#agentlet-container` or `.agentlet-*`

Before shadow DOM, a host page could restyle the panel directly, for
example:

```css
/* Before: reached into the panel directly - no longer matches anything */
body.theme-vscode #agentlet-container {
    background: #1E1E1E !important;
}
body.theme-vscode .agentlet-action-btn {
    background: #3C3C3C !important;
    color: #CCCCCC !important;
}
```

Under shadow DOM, `#agentlet-container` and every `.agentlet-*` class live
inside the shadow root, so page-level rules like these stop matching
anything - silently, with no error. Customization now goes through the
`--agentlet-*` CSS custom properties (see
[CSS custom properties still inherit through](#css-custom-properties-still-inherit-through)
below), or through the theme API:

```css
/* After: set the same custom properties the panel's own stylesheet reads */
body.theme-vscode {
    --agentlet-background-color: #1E1E1E;
    --agentlet-action-button-background: #3C3C3C;
    --agentlet-action-button-text: #CCCCCC;
}
```

```javascript
// Or do the same thing from JavaScript at any time
window.agentlet.themeManager.updateTheme({
    backgroundColor: '#1E1E1E',
    actionButtonBackground: '#3C3C3C',
    actionButtonText: '#CCCCCC'
});
window.agentlet.ui.regenerateStyles();
```

[`examples/ui/custom-styling.html`](../examples/ui/custom-styling.html) is
built entirely around this pattern - see its `<style>` block for the full
set of `--agentlet-*` properties used by each theme, and
[`src/ui/StyleInjector.js`](../src/ui/StyleInjector.js)'s
`generateCSSProperties()` for the complete list of properties the panel's
stylesheet consumes.

One caveat: dialogs (info, fullscreen, wait, ...) are currently painted
with inline styles built once from a theme snapshot captured when
`AgentletCore` initializes (see `src/utils/ui/Dialog.js`), not from these
CSS custom properties, so a theme change made after initialization does
not retroactively restyle already-configured dialog colors.

## What is NOT isolated

- **JavaScript globals.** `window.agentlet`, `window.AgentletCore`, and
  anything else a module or the host page puts on `window` is shared as
  before; the shadow root only isolates rendering and CSS, not the
  JavaScript execution context.
- **Events bubble out, with retargeting.** A click inside the panel still
  bubbles up through `document`, so page-level listeners (delegated click
  handlers, analytics, etc.) keep firing. What changes is `event.target`:
  once the event crosses the shadow boundary, the platform retargets it to
  the shadow host (`#agentlet-host`) rather than exposing the real element
  inside the shadow tree, to preserve encapsulation. Use
  `event.composedPath()[0]` when you need the actual originating element.
  `ShortcutManager` already does this (see `getEventTarget()` in
  `src/utils/ui/ShortcutManager.js`) so keyboard shortcuts keep working
  the same whether or not their target is inside the shadow root.
- **CSS custom properties still inherit through.** `all: initial` on
  `:host` (the shadow root's reset, see `generateHostResetStyles()` in
  `src/ui/StyleInjector.js`) resets every inheritable CSS property except
  custom properties, which are explicitly excluded from that reset by the
  CSS spec. This is why the `--agentlet-*` theme variables, injected into
  `<head>` on `:root` (`<style id="agentlet-core-theme">`) regardless of
  `shadowDom`, still cascade into the shadow tree and keep theming working.
  It is also how `examples/ui/custom-styling.html` re-themes the panel
  from host-page CSS, see above.
- **z-index still competes with the host page.** The shadow host
  (`#agentlet-host`) is a normal element in the page's DOM and stacking
  context; putting the panel in a shadow root does not give it a separate
  stacking context or exempt it from the host page's own high z-index
  elements. See [`docs/z-index-usage-guide.md`](z-index-usage-guide.md)
  for how the framework picks its z-index values.
- **`position: fixed` behaves the same.** Elements positioned `fixed`
  inside the shadow tree are still positioned relative to the viewport (or
  a transformed/filtered ancestor, per normal CSS rules) exactly as they
  would be outside a shadow root.

## The `shadowDom` option

```javascript
const agentlet = new AgentletCore({
    shadowDom: true // default; set to false to opt out
});
```

- `shadowDom: true` (the default) - the panel, dialogs, toasts and other
  framework UI mount inside `#agentlet-host`'s shadow root, as described
  above.
- `shadowDom: false` - restores the exact pre-shadow-DOM behavior: every
  framework element is appended directly to `document.body` (and the UI
  stylesheet goes into `<head>` as `<style id="agentlet-core-styles">`
  instead of into the shadow root). This is a **transition escape hatch**
  for agentlets that depend on reaching into the panel from page-level CSS
  or `document.querySelector`, and is expected to be **removed in a later
  major version**. New agentlets should not rely on it.

`examples/ui/style-isolation.html` exposes both an "Initialize agentlet
core" button (`shadowDom: true`) and an "Initialize with shadowDom: false"
button, so the difference is directly comparable in one page; see also
`tests/examples/specs/ui-style-isolation.spec.js` for the corresponding
assertions on the `shadowDom: false` path.

## Consequences for agentlet authors

- **Use `window.agentlet.ui.root` / `window.agentlet.ui.query()` /
  `window.agentlet.ui.queryAll()` instead of `document.querySelector` /
  `document.getElementById` / `document.querySelectorAll` to reach
  framework UI elements.** `window.agentlet.ui.root` is the `ShadowRoot`
  when `shadowDom` is enabled, or `document.body` when it is disabled, so
  code written against `ui.root`/`ui.query()`/`ui.queryAll()` works
  unchanged either way.
- **`Module.injectStyles(css)` targets the UI root.** When the module is
  mounted (via the `mount()`/`unmount()` lifecycle described in
  `src/core/Module.ts`), `injectStyles()` appends its `<style>` element to
  the root captured from the mount context - the shadow root in the default
  `shadowDom: true` mode, so the CSS reaches the module's own content
  rendered inside it. In `shadowDom: false` mode (where the UI root is
  `document.body`) and before a module has ever been mounted, it falls back
  to `document.head`, the historical behavior. See
  `examples/ui/localhost-demo-module.js` for an example of relying on the
  framework's built-in classes (`.agentlet-btn`, `.agentlet-btn-secondary`,
  etc.) instead of module-level CSS.
- **`document.activeElement` returns `#agentlet-host`, not the actually
  focused element**, once focus is inside the shadow root - this is
  standard shadow DOM behavior, the same encapsulation principle as event
  retargeting above. Use `window.agentlet.ui.root.activeElement` to get
  the real focused element inside the panel/dialog.
- **Keyboard shortcuts already handle this.** `ShortcutManager` resolves
  the real event target via `event.composedPath()` rather than
  `event.target`, so shortcuts keep working the same whether they
  originate inside the shadow root or on the host page.
- **`PageHighlighter`, `ElementSelector`, and `ScreenCapture` stay in the
  page DOM by design.** These utilities draw overlays directly on top of
  host-page elements being selected, highlighted, or captured, so they
  need to live in the same DOM/stacking context as those elements rather
  than inside the panel's shadow root.
- **Standalone use of `Dialog`/`MessageBubble` without `AgentletCore`**
  (`new Dialog()` / `new MessageBubble()`, both named exports) falls back
  to mounting in `document.body` when no `window.agentlet.ui.root` exists
  yet - the shadow root is only used once an `AgentletCore` instance has
  created one and pointed these shared instances at it.
