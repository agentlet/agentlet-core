# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The default OpenAI model is now `gpt-6-luna` (was `gpt-4o-mini`), OpenAI's
  most cost-efficient current model, which accepts text and image input on
  the Chat Completions endpoint. Set `OPENAI_MODEL` (or pass `model`) to keep
  using another model.
- The provider now builds the Chat Completions request per model. Classic
  models (gpt-4o, gpt-4, gpt-3.5 and OpenAI-compatible servers) still get
  `max_tokens` and `temperature`. gpt-5, gpt-6 and o-series models get
  `max_completion_tokens` instead, and no `temperature` (they reject it while
  reasoning is on). `gpt-6-luna` and `gpt-6-sol` are sent
  `reasoning_effort: "none"`, so the token budget goes to the answer and
  `temperature` stays valid.

## [2.3.0] - 2026-10-01

### Added

- `window.agentlet.records`: structured copy and paste between web apps, as
  designed in `docs/rfcs/0001-records-api.md`. A record is a small versioned
  JSON envelope (type, typed fields, labels, source). It is data only: no
  selector or code is ever taken from it.
- Building records: `create()`, `fromForm()`, `fromTable()`, `fromElement()`
  (a table, a form, a `dl`, or label and value pairs) and `pick()`, which
  uses the element selector. `validate()` checks any value against the
  envelope, rejects an unknown major version, ignores unknown top-level keys
  and enforces a 1 MB limit.
- Record types: `defineType()`, `getType()` and `listTypes()`, with the
  built-in types `table`, `fields`, `contact`, `address` and `organization`
  on the HTML `autocomplete` vocabulary, with English and French synonyms.
- Clipboard transport: `copy()` writes the custom `web application/...`
  format, `text/html` with the record embedded in `data-agentlet-record`,
  and `text/plain` (a table, a list or `Label: value` lines). It retries
  without the custom format where the browser rejects it, as Firefox does.
  `read()`, `fromPasteEvent()` and `onPaste()` read it back. `onPaste()`
  requires a `scope` element, usually the target form, and throws a
  `TypeError` without it. A paste without a record is never intercepted. `pasteFromClipboard()` reads the clipboard
  from a click, for pages that block paste events.
- Argument checks: `fromElement()`, `fromForm()`, `fromTable()`, `match()`,
  `fill()` and `pasteFromClipboard()` throw a clear `TypeError` that names
  the method (for example `records.fromElement() expects an Element`) when
  they get something that is not an element, instead of an error from
  inside the extractor.
- `copy()` copies in two steps, both inside the user gesture. First a `copy`
  event with `text/html` (record embedded) and `text/plain`, which needs no
  clipboard permission and works in Chromium, Firefox and WebKit. Then
  `navigator.clipboard.write()` with the custom format, as an enhancement. If
  the API is missing or refused, as in webviews, iframes without the
  `clipboard-write` permissions policy and locked-down browsers, the copy
  event content stays and smart paste keeps working.
  `RecordCopyResult.method` reports `'clipboard-api'` or `'copy-event'`. If
  both paths fail, `copy()` rejects with an error that says copying was
  blocked by the browser and names both attempts. A successful `copy()` now
  fires a `copy` event on the document, and briefly selects an off-screen
  element (the previous selection and focus are restored), because WebKit
  only enables the copy command with a selection.
- Filling: `match()` maps record fields to a target form by remembered
  mapping, `autocomplete`, `name` or `id`, label and input type, with a veto
  for a value a field cannot take. `fill()` shows a preview dialog, then
  fills through `forms.fill()`. It never submits the form. Corrections made
  in the preview are remembered per record type and form, on the target
  origin, with `storage.local`.
- Password, `one-time-code` and `cc-*` fields are never copied and never
  filled. `copy()` accepts `redact` to drop more keys. The clipboard can be
  read by other applications: never copy secrets.
- The events `records:copied`, `records:pasted` and `records:filled` carry
  the record type, counts and the source origin, never values.
- Public types for all of the above, and the
  `data-processing/records-copy-paste` example.

### Changed

- The dependency vulnerability scan now uses the shared `dependency-scan` and
  `sbom-from-esbuild` actions from `agentlet/.github` instead of an in-repo
  copy (`tools/security/`, `npm run security:sbom`, `npm run security:scan`).
  The SBOM, the gate rule, the exceptions file and the code scanning
  category are unchanged.

### Documentation

- The README now opens with what agentlet-core does, has a Quick start that
  works from npm or a CDN bookmarklet without cloning the repository, and
  compares agentlet with userscripts, hand-written extensions and RPA.
- The README states the measured bundle size: `dist/agentlet-core.min.js` is
  1.30 MB minified and 378 KB gzipped, and `dist/pdf.worker.min.mjs` is a
  separate 1.04 MB file. The earlier "about 1.4 MB compressed" figure was
  wrong.
- CONTRIBUTING.md no longer says the codebase is migrating to TypeScript or
  that modules are sandboxed, and no longer mentions a module registry. There
  is no public registry, and modules run with the host page's privileges.
- `.github/WORKFLOWS.md` describes the workflows that exist (`test.yml`,
  `security.yml`, `release.yml`).

### Removed

- The experimental extension's "Analyze with AI" context menu, which
  showed a canned word count and keyword sentiment instead of an AI
  answer, and inserted the selected text into the dialog as HTML. Its AI
  assistant now calls `window.agentlet.ai`, and its welcome page no
  longer claims features it does not have.

### Fixed

- `tables.extractAndDownload()` without a `filename` option no longer throws
  "Cannot read properties of undefined (reading 'slice')". It uses the
  default `table-data-YYYY-MM-DD.xlsx` name again. In `tables.download()`
  too, `filename`, `sheetName` and `includeMetadata` passed as `undefined`
  now keep their defaults.

### Security

- Form extraction (`forms.extract()`, `exportForAI()`, `quickExport()`)
  reports `type="password"` fields with a `null` value and without their
  `value` attribute, so a password no longer reaches an AI prompt by
  accident. Pass `includePasswordValues: true` to get them back.
- `AuthManager` only accepts messages from the login popup it opened.
  Before, any window or frame on the page could post a forged token, and
  with an empty `allowedOrigins` any origin was accepted. A warning is now
  logged when `allowedOrigins` is empty.
- `AuthManager` no longer logs the popup's message, which carries the
  token, in debug mode, and `FormFiller` no longer logs filled values.
- SECURITY.md describes the threat model: what the host page can see,
  where API keys live, how to proxy the provider key, and what data leaves
  the page. Vulnerabilities are reported through GitHub security
  advisories, as the previous email address did not receive mail.

## [2.2.0] - 2026-10-01

### Added

- `tables.extract()` and `tables.extractAll()` accept `cellText`
  (`'textContent'`, the default, `'innerText'` or `'blocks'`) and
  `cellSeparator`, so text stacked in a cell ("John Davis" above "CTO")
  reads "John Davis CTO" instead of "John DavisCTO".
- `excludeColumns` drops columns by header text, index or RegExp, such as
  an "Actions" or selection column.
- `tables.extractAll()` accepts `firstPageSelector` or
  `previousButtonSelector` to start from page 1 instead of the page
  currently shown. Without them it still starts from the current page.

### Changed

- A module's optional `getStyles()` is now injected into the panel before
  each mount, once per activation, including when `mount()` is overridden.
  It was previously never called. CSS a module already injected itself
  with the same string is not added twice.
- Pagination controls marked `aria-disabled="true"` now count as disabled.

### Fixed

- Relative `url` values in a registry entry resolve against the registry
  script's URL instead of the host page, so `"./module-bundle.js"` loads
  from next to the registry. `getRegistryEntries()` returns the resolved
  URLs.
- Scaffolded agentlets resolve the registry and the PDF.js worker against
  the URL the core bundle was loaded from, so the bookmarklet works on any
  origin, not only on the dev server page. The registry now registers the
  module itself: `src/index.js` no longer depends on the agentlet's name or
  sets `skipRegistryModuleRegistration`.
- The scaffold's default registry URL in registry mode points to
  `agentlets-registry.js`, the file the scaffold generates, instead of
  `agentlets-registry.json`.

## [2.1.1] - 2026-09-28

### Added

- Each GitHub release now attaches `sbom-bundle.cdx.json`, a CycloneDX SBOM
  of the dependencies bundled into the published build. Pull requests and
  pushes to `main` are scanned against known vulnerabilities, and the scan
  runs nightly on `main` and on the latest release.
- `npm run test:examples:docker` runs a targeted subset of the Playwright
  e2e suite inside the official Playwright Docker image, for a quick
  recheck on hosts where the local OS is too old for the Playwright browser
  builds `npm run test:examples` needs. CI remains the reference for a full
  run of the suite.

### Changed

- The npm package no longer declares any runtime `dependencies`, so
  `npm install agentlet-core` installs nothing else.
  - `hotkeys-js`, `html2canvas`, `pdfjs-dist` and `xlsx` are already inlined
    in every `dist/` bundle and are now `devDependencies`. If your own code
    imported one of them directly and relied on agentlet-core installing it,
    add it to your own `package.json`.
  - `express`, `cors`, and `dotenv` were only used by the local
    `tools/dev-server.js` dev tooling and are now `devDependencies` too.
- Dependency vulnerabilities in dev tooling (Jest, Playwright, plop, and
  their transitive dependencies) have been fixed.

### Security

- `xlsx` is upgraded to 0.20.3, fixing GHSA-4r6h-8v6p-xvw6 (prototype
  pollution) and GHSA-5pgg-2g8v-p4x9 (regular expression denial of
  service). The npm registry's last published `xlsx` release is 0.18.5, so
  0.20.3 comes from the SheetJS project's own CDN (cdn.sheetjs.com). It is
  only fetched when building agentlet-core itself, not when installing the
  npm package. The bundles grow accordingly, for example
  `agentlet-core.min.js` from about 1236 KB to 1305 KB.

## [2.1.0] - 2026-09-28

### Added

- `moduleRegistry.loadModule(entry)` loads and registers one registry entry
  on demand, without activating it, even if its pattern matches the current
  URL.
- Registry entries can be marked `lazy: true`. They are skipped by `init()`'s
  eager load, listed by `moduleRegistry.getRegistryEntries()` with
  `loaded: false`, and not a candidate for URL-based module detection until
  loaded with `loadModule()`.
- Dialogs accept `icon: ''` or `icon: null` to omit the title icon entirely.
- The npm package now ships `dist/pdf.worker.min.mjs`, matching the bundled
  `pdfjs-dist` version, about 1 MB unpacked.

### Fixed

- `window.agentlet.modules.get()` and `getAll()` now see modules that were
  loaded through the registry.
- A module activated with `activateModule()` is no longer reverted by the
  1 second URL poll, and stays active across a URL change while it still
  matches.
- Hash-based navigation is now detected immediately, instead of only on the
  next poll tick.
- `pdfWorkerUrl` is now always applied. It used to be silently ignored in
  bundled builds.
- A relative `registryUrl` is now resolved against the page to derive the
  PDF worker URL.
- Dialog headers now take a matching background and text colour from
  `headerBackground`/`headerTextColor` when the dialog-specific keys are not
  set, with a readable text colour derived from hex or `rgb()` backgrounds.
- Dialogs now follow `setTheme()`, whether already open or opened later.
- No informational console output is written unless `debugMode: true`.
  Warnings and errors are unaffected, and a failed module script load still
  logs an error.
- The page's `localStorage`/`sessionStorage` methods are no longer patched
  unless a storage change listener is registered, and host writes to
  unrelated keys no longer remount the active module.
- Cookie polling only runs while something listens for cookie changes.
- Removed a spurious "Activation already in progress" warning at init.
- `cleanup()` now restores everything the core patched or listened to.
- The example registry scripts dispatch `agentletRegistryLoaded`
  synchronously, removing a race with the loader's timeout.

### Changed

- The default PDF.js worker path is `./pdf.worker.min.mjs`, was
  `./pdf.worker.min.js`.
- Removed the automatic fallback to a worker hosted on cdnjs.cloudflare.com.
  A clear error now names `pdfWorkerUrl` and `configurePDFWorker()` instead.
- Scaffold template tests assert visible effects instead of core console
  messages.

## [2.0.1] - 2026-09-25

### Fixed

- The package can be loaded outside a browser. `require('agentlet-core')` and
  `import('agentlet-core')` used to throw `ReferenceError: DOMMatrix is not defined`
  under Node, because pdf.js ran browser code as soon as the bundle was evaluated.
  pdf.js is now loaded during `init()`, so importing the package works for server
  rendering, tooling and tests; only `new AgentletCore().init()` needs a browser.
  `window.pdfjsLib` is still available once `init()` resolves. Every build now checks
  that the bundles load under plain Node.
- `require('agentlet-core/package.json')` works: `./package.json` is part of
  `exports`.
- A scaffolded project now depends on the published package
  (`"agentlet-core": "^<version>"`) by default instead of a `file:` link to a local
  checkout. `--core=local` keeps the `file:` link for developing the core itself.

### Changed

- CI runs on Node 22, with `actions/checkout`, `actions/setup-node` and
  `actions/upload-artifact` at `v7` (Node 24 runtime).

## [2.0.0] - 2026-09-25

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

[2.3.0]: https://github.com/agentlet/agentlet-core/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/agentlet/agentlet-core/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/agentlet/agentlet-core/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/agentlet/agentlet-core/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/agentlet/agentlet-core/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/agentlet/agentlet-core/compare/v1.0.0...v2.0.0
