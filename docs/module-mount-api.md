# Module mount API

`Module` exposes two additional lifecycle hooks, `mount()` and `unmount()`,
alongside the existing `initModule()` / `activateModule()` / `cleanupModule()`
hooks. They give module authors an explicit, imperative place to attach a UI
framework root (React, Lit, Vue, or anything else) to the panel, instead of
only returning an HTML string from `getContent()`.

## Why

`getContent()` works well for HTML built from a template string, but it
cannot host a framework component: there is nowhere to call `createRoot()`,
attach a custom element, or clean up a framework instance when the module is
replaced. `mount()`/`unmount()` fill that gap while keeping the default,
`getContent()`-based behavior unchanged for every module that does not
override them.

The core ships no UI framework of its own and never renders agentlet
content in a component tree it owns. Each agentlet bundles whatever
framework it needs and mounts it directly into the container the core
hands it. Because the core stays out of that tree, two agentlets on the
same page can use two different (or even two different copies of the same)
frameworks without interfering with each other - the core only calls
`mount(container, context)` and `unmount(container)` on whichever module is
active.

## The two hooks

```typescript
/**
 * Render this module's content into `container`. Called by the core
 * whenever this module becomes (or stays) the active module: on init,
 * module switch, URL change, or a manual refresh - see `context.trigger`.
 *
 * Default implementation: `container.innerHTML = this.getContent();`
 */
async mount(container: HTMLElement, context: ModuleMountContext): Promise<void>;

/**
 * Tear down what `mount()` set up (e.g. unmount a framework root). Called
 * by the core before a different module mounts, and by `cleanup()` if this
 * module is still mounted.
 *
 * The core clears the container's content itself after this resolves, so
 * the default implementation is a no-op.
 */
async unmount(container: HTMLElement): Promise<void>;
```

Both are defined on the `Module` base class (`src/core/Module.ts`), so every
module gets them for free. Overriding `mount()` replaces the default
`getContent()`-based rendering entirely; overriding `unmount()` is only
needed when `mount()` created something that needs explicit teardown (a
framework root, a subscription, a timer, an appended custom element, ...).

## The context object

```typescript
interface ModuleMountContext {
    root: ShadowRoot | HTMLElement;
    theme: AgentletTheme;
    eventBus: EventBusAPI;
    api: AgentletAPI;
    trigger: ModuleMountTrigger;
}
```

| Field      | Description |
| ---------- | ----------- |
| `root`     | The UI mount root: the shadow root when `shadowDom` is enabled (the default), or `document.body` otherwise. Same value as `window.agentlet.ui.root`. See [Shadow DOM UI](shadow-dom.md). |
| `theme`    | The current theme, as returned by `window.agentlet.themeManager.getTheme()`. Useful for passing colors into a framework component without a second lookup. |
| `eventBus` | The shared core event bus, the same instance as `window.agentlet.eventBus`. |
| `api`      | The full `window.agentlet` API surface, handed to `mount()` so a module does not need to rely on the `window.agentlet` global being ready yet. |
| `trigger`  | Why this mount/unmount is happening. See [`trigger` values](#trigger-values) below. |

## Lifecycle order

For a module extending `Module`, a full activation-to-cleanup cycle calls
the five hooks in this order:

1. **`initModule()`** - once, the first time the module is loaded (via `init()`).
2. **`activateModule(context)`** - every time the module becomes the active
   module, and again on every URL change while it stays active.
3. **`mount(container, context)`** - every time the panel content is
   (re)rendered for this module: on init, when this module becomes active,
   on URL changes, and on a manual `refreshContent()`. See
   [`trigger` values](#trigger-values) for how to tell these apart.
4. **`unmount(container)`** - before the *next* module mounts into the same
   container, and during `cleanup()` if the module is still mounted at that
   point. Guarded so a module already unmounted elsewhere is never unmounted
   twice.
5. **`cleanupModule(context)`** - when the module is deactivated or
   destroyed, after `unmount()` has already run.

`mount()`/`unmount()` run once per content update, which is more often than
`activateModule()`/`cleanupModule()`: the same active module gets a fresh
`mount()` call (with `trigger: 'urlChange'`) on every URL change even though
`activateModule()` also runs for that same change, and again on
`trigger: 'refresh'` even though neither `activateModule()` nor
`cleanupModule()` run at all.

`this.mounted` (boolean) and `this.mountedContainer` (the container element,
or `null`) are kept up to date by the core around every `mount()`/`unmount()`
call, regardless of whether a subclass overrides them, so an override can
check `this.mounted` to decide whether to update an already-mounted root in
place instead of re-rendering from scratch.

## State retention across refreshes

Keep any state a module needs to survive a re-render on the module instance
itself (`this.someState = ...`), not in the DOM the default `mount()`
produces. The default `mount()` implementation re-renders unconditionally
from `getContent()` on every call, so DOM-only state (an input's typed
value, a scroll position not tracked elsewhere) is lost across triggers
such as `urlChange` or `refresh` unless the module reads it back out before
re-rendering, or overrides `mount()` to update the existing root in place
(see `this.mounted` above) instead of replacing it.

## `injectStyles()` and the UI root

`injectStyles(css)` appends its `<style>` element to the root captured from
the most recent `mount()` call (`context.root`) rather than always to
`document.head`. In the default `shadowDom: true` mode that is the shadow
root, so styles reach content mounted inside it; see
[Shadow DOM UI](shadow-dom.md#consequences-for-agentlet-authors) for the
full fallback chain (`shadowDom: false`, or before any `mount()` has run).

## Error handling

If `mount()` throws or rejects, the core catches the error, logs it via
`console.error('Error rendering module content:', error)`, and renders the
panel's built-in error markup in place of the module's content:

```html
<div class="agentlet-error">
    <h3>Content Error</h3>
    <p>Failed to render module content</p>
</div>
```

The module is not left half-mounted: `_beforeMount()` runs before `mount()`
is called (so `this.mounted`/`this.mountedContainer` reflect the attempt),
and the next content update still calls `unmount()` on it as usual since
`this.mounted` is `true`. If `unmount()` itself throws, the core logs the
error the same way and continues - the container's content is cleared by
the core regardless, so a throwing `unmount()` cannot leave stale DOM behind.

## `trigger` values

`ModuleMountTrigger` is `'init' | 'moduleChange' | 'urlChange' | 'refresh' | string`:

- **`'init'`** - the core's first `updateModuleContent()` call during startup.
- **`'moduleChange'`** - a different module just became the active module.
- **`'urlChange'`** - the URL changed but the same module is still active.
- **`'refresh'`** - `window.agentlet.refreshContent()` / `ui.refreshContent()`
  was called explicitly, or an internal refresh with no more specific
  trigger (`refresh` is also the parameter's default value).

The type allows an arbitrary string too, since a caller can pass any value
through to `updateModuleContent(trigger)` directly.

## Code samples

### Vanilla, imperative DOM

```javascript
class VanillaCounterModule extends window.agentlet.Module {
    constructor() {
        super({ name: 'vanilla-counter', patterns: ['*'] });
        this.count = 0;
    }

    async mount(container, context) {
        container.innerHTML = `
            <div class="counter-panel">
                <p>Count: <span data-count>${this.count}</span></p>
                <button data-increment>+1</button>
            </div>
        `;
        const button = container.querySelector('[data-increment]');
        const label = container.querySelector('[data-count]');
        this._onClick = () => {
            this.count += 1;
            label.textContent = String(this.count);
        };
        button.addEventListener('click', this._onClick);
    }

    async unmount(container) {
        const button = container.querySelector('[data-increment]');
        button?.removeEventListener('click', this._onClick);
    }
}
```

See [`examples/basics/mount-vanilla.html`](../examples/basics/mount-vanilla.html)
for the full runnable version.

### React, with `createRoot()`/`unmount()`

```javascript
class ReactPanelModule extends window.agentlet.Module {
    constructor() {
        super({ name: 'react-panel', patterns: ['*'] });
        this._root = null;
    }

    async mount(container) {
        this._root = ReactDOM.createRoot(container);
        this._root.render(React.createElement(PanelComponent, { module: this }));
    }

    async unmount() {
        this._root?.unmount();
        this._root = null;
    }
}
```

See [`examples/basics/mount-react.html`](../examples/basics/mount-react.html),
which loads React 18 from a CDN as a UMD build.

### Custom element (Lit)

```javascript
class LitPanelModule extends window.agentlet.Module {
    async mount(container) {
        const element = document.createElement('lit-panel');
        element.module = this;
        container.appendChild(element);
    }

    async unmount(container) {
        container.querySelector('lit-panel')?.remove();
    }
}
```

See [`examples/basics/mount-lit.html`](../examples/basics/mount-lit.html)
for the full Lit custom element.

## Migration note

Existing agentlets that only implement `getContent()` need no change. The
default `mount()` still calls `container.innerHTML = this.getContent()`,
and the default `unmount()` is a no-op; both are inherited automatically
from `Module` and are only worth overriding when a module needs to mount a
framework root or otherwise manage DOM outside of what an HTML string can
express.

## TypeScript

```typescript
import type { ModuleMountContext, ModuleMountTrigger } from 'agentlet-core';

class TypedModule extends window.agentlet.Module {
    async mount(container: HTMLElement, context: ModuleMountContext): Promise<void> {
        console.log('mounting, trigger:', context.trigger satisfies ModuleMountTrigger);
        container.innerHTML = this.getContent();
    }
}
```

See [TypeScript support](typescript.md) for how these declarations are
imported and maintained.
