# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

### Breaking changes

- The package now distributes the built `dist` output instead of raw `src` sources.
  `main`/`exports` point at `dist/agentlet-core.js` (CJS/IIFE global) and
  `dist/agentlet-core.esm.js` (ESM), and `files` no longer ships `src/`. Consumers
  no longer need their own bundler rule to transpile `agentlet-core`'s sources.
- `require('agentlet-core')` now returns the module namespace rather than the class
  directly: use `const { default: AgentletCore } = require('agentlet-core')`. This
  matches the existing browser global convention, `window.AgentletCore.default`.
  `import AgentletCore from 'agentlet-core'` (ESM) is unaffected. Named exports
  (`Dialog`, `FormExtractor`, `TableExtractor`, ...) behave identically on both paths.
- The agentlet panel, dialogs and toasts now mount inside an isolated shadow root by
  default, so the host page's CSS can no longer reach in and the framework's CSS can
  no longer leak out. A new `shadowDom` config option (default `true`) can be set to
  `false` to restore the pre-2.0 behavior of mounting directly on `document.body`, as
  a transition escape hatch.

### Added

- `mount()`/`unmount()` lifecycle hooks on `Module`, alongside `initModule`/
  `activateModule`/`cleanupModule`. A module can override them to attach a UI
  framework root (React, Lit, or any other) directly into its panel container
  instead of only returning an HTML string from `getContent()`; two agentlets can
  use two different frameworks (or two copies of the same one) on the same page
  without interfering. See the [mount API guide](https://agentlet.io/docs/guides/mount-api/).
- `agentlet.setTheme(config)`, which merges `config` into the theme defaults,
  re-injects the panel's CSS, and emits a `theme:changed` event on the core event
  bus with `{ theme, previousTheme }`. A module can subscribe to it through
  `context.eventBus` in `mount()`/`unmount()` to stay in sync with a theme change
  after it mounted, since `context.theme` is only a point-in-time snapshot.
- Hand-written TypeScript declarations for the public API (`window.agentlet`, the
  `Module` base class, and the `AgentletCore` config), published as `types` in
  `package.json`. JavaScript agentlet authors get autocompletion and type checking
  without writing TypeScript themselves. They stay hand-written by design rather
  than compiler-generated (see CONTRIBUTING.md), and a small standalone consumer
  file is compiled against the shipped `dist/agentlet-core.d.ts` on every build
  (`tools/verify-dist-types.mjs`) as a guard rail.
- `EventBus` (`window.agentlet.eventBus`) and `ThemeManager`
  (`window.agentlet.themeManager`), and `window.agentlet.ui.root` / `.host` /
  `.query()` / `.queryAll()` to work with the panel regardless of whether it lives
  in a shadow root or directly on the page.
- Scaffold: `--ui=html|react` option on the full template, generating a
  `mount()`/`unmount()`-based React module in addition to the existing HTML one.

### Changed

- Every source file under `src/` is migrated from JavaScript to TypeScript:
  `EventBus`, `ThemeManager`, `ZIndex`, `Module`, `PageHighlighter`, `Dialog`,
  `ScriptInjector`, `EnvManager`, `CookieManager`, `StorageManager`, `AuthManager`,
  `ElementSelector`, `ScreenCapture`, `FormExtractor`, `FormFiller`,
  `TableExtractor`, `AIProvider`, `PDFProcessor`, `MessageBubble`,
  `ShortcutManager`, `StyleInjector`, `UIManager`, `PanelManager`, `GlobalAPI`,
  `ModuleRegistry`, `ModuleManager`, `LibraryLoader`, `LibrarySetup`, and the core
  entry point.
- `ShortcutManager` resolves the real event target through `event.composedPath()`,
  so keyboard shortcuts keep working when focus is inside the shadow root.
- The scaffold template no longer bundles `html2canvas`, `xlsx`, `pdfjs-dist` or
  `hotkeys-js` itself, since the core bundle already ships them through
  `LibrarySetup`; generated bundles are noticeably smaller.
- `npm run test:scaffold` now installs the actual tarball produced by `npm pack`
  into the scaffolded project (rather than a `file:` link), and covers the full
  template with `--ui=react` in addition to the existing html coverage.

### Fixed

- Several dialog quirks: `autoClose`, overlay close, Enter-key activation, and
  textarea `resizable` are now honoured.
- Page highlighter tour navigation and per-highlight visibility.
- Panel manager reads the minimized state from the core instead of tracking its
  own, separate copy.
- Module registry: unregistering a module now removes it even if its `cleanup()`
  throws, URL monitoring stops when the registry itself is cleaned up, and the
  `url:changed` event now reports the previous URL, not just the new one.
- A regression where regex-based comment stripping in the build could corrupt the
  bookmarklet output.
- A module's `'*'` pattern, and simple unanchored glob patterns using `*`, now
  match any URL, instead of never matching.
- Form filling now updates React-controlled fields correctly, by going through the
  native input/textarea value setter before dispatching events, and by also
  dispatching a `click` event for checkboxes and radio buttons.
- The module template generated by `node tools/build.js --module=<name>` now
  extends the real `window.agentlet.Module` class instead of a nonexistent
  `BaseModule`.

### Distribution

- The published npm package contains exactly `dist/agentlet-core.js` (IIFE,
  also used by `require`), `dist/agentlet-core.min.js`, `dist/agentlet-core.esm.js`
  and `dist/agentlet-core.d.ts`, about 1.4 MB compressed.
  No sourcemaps, no Chrome extension bundle, and no bookmarklet HTML page ship in
  the package; the build still produces all of those under `dist/` for local
  development, they are simply excluded from what `npm publish` uploads.

[Public API reference](https://agentlet.io/docs/reference/public-api/) and the
rest of the documentation now live at [agentlet.io/docs](https://agentlet.io/docs/).
