<h1 align="center" style="border-bottom: none;">agentlet</h1>
<h3 align="center">Augment your web applications without friction</h3>

<p align="center">
  <a href="https://agentlet.io">agentlet.io</a> &nbsp;|&nbsp; <a href="https://agentlet.io/docs/">Documentation</a>
</p>

**Agentlet** augments existing web applications with enhanced capabilities including form automation, data extraction, AI integration, and UX improvements, all deployed via lightweight bookmarklets or browser extensions.

This removes the immediate need for backend modifications, complex deployments, or lengthy development cycles, allowing teams to rapidly enhance user workflows.

> Agentlet
> *noun* (software engineering, AI systems)
>
> A lightweight, embeddable software agent injected into an existing application (typically via browser bookmarklet or extension), designed to enhance the host application with autonomous or semi-autonomous capabilities such as automation, AI, analytics, or UX augmentation, all without requiring backend changes.

**Agentlet** offers three deployment approaches: bookmarklets for instant deployment, browser extensions for enhanced capabilities, and native integration for applications that can embed the framework directly. See [the agentlet approach](https://agentlet.io/docs/concepts/approach/) and [deployment modes](https://agentlet.io/docs/concepts/deployment-modes/) for a full comparison, including with traditional RPA tools.

![Agentlet demo](https://raw.githubusercontent.com/agentlet/agentlet-core/main/docs/img/demo-part2.gif)

## Highlights

- Zero backend changes required for web application enhancement
- Three deployment options: bookmarklets, browser extensions, or native integration
- Instant deployment via bookmarklet injection, no installation required
- Simple form automation with extraction, AI processing, and intelligent filling
- Table to Excel export with user-controlled pagination (Excel optional)
- Screenshot capture integration for AI-powered visual analysis
- Clean module architecture with a predictable lifecycle (`initModule`, `activateModule`, `cleanupModule`) plus optional `mount`/`unmount` hooks for mounting a UI framework root
- Optional authentication management with identity provider integration
- Built-in scaffolding tools for rapid agentlet development
- Focused and lightweight, only the features you actually need

## The agentlet ecosystem

The agentlet ecosystem includes a core framework, a collection of example implementations, and a specialized tool called the `agentlet-designer`, a dedicated agentlet for creating custom agentlets tailored to specific applications.

`agentlet-core` (this repository) is the foundation that provides core capabilities: core classes and a module loader, a build system, utility components, and test suites. Developers build their own agentlets on top of it.

Agentlet also offers a demo repository (`agentlet-demo-apps`) containing AI-generated, mocked business applications designed for testing and neutral demo use.

## Installation

```bash
npm install agentlet-core
```

```javascript
// Resolves to dist/agentlet-core.esm.js. The default export is the class.
import AgentletCore, { Module } from 'agentlet-core';
```

```javascript
// Resolves to dist/agentlet-core.js, which exposes the module namespace
// rather than the class itself, so read the class off `default`. This
// matches the browser global, where the class is `window.AgentletCore.default`.
const { default: AgentletCore, Module } = require('agentlet-core');
```

## Quick example

```javascript
import AgentletCore, { Module } from 'agentlet-core';

class MyModule extends Module {
    constructor() {
        super({
            name: 'my-module',
            patterns: 'example.com' // matches any URL containing this string
        });
    }

    getContent() {
        return '<div>Hello from my agentlet!</div>';
    }
}

const agentlet = new AgentletCore();
await agentlet.init();
agentlet.modules.register(new MyModule());
```

## Getting started

- [Install](https://agentlet.io/docs/getting-started/install/)
- [Quick demo](https://agentlet.io/docs/getting-started/quick-demo/)
- [Scaffold a new agentlet](https://agentlet.io/docs/getting-started/scaffold/)
- [Manual setup](https://agentlet.io/docs/getting-started/manual-setup/)

## Documentation

Full documentation lives at **[agentlet.io/docs](https://agentlet.io/docs/)**, including:

- Concepts: [the agentlet approach](https://agentlet.io/docs/concepts/approach/), [architecture](https://agentlet.io/docs/concepts/architecture/), [deployment modes](https://agentlet.io/docs/concepts/deployment-modes/), [security](https://agentlet.io/docs/concepts/security/)
- Guides: [AI](https://agentlet.io/docs/guides/ai/), [authentication](https://agentlet.io/docs/guides/authentication/), [dialogs and shortcuts](https://agentlet.io/docs/guides/dialogs-and-shortcuts/), [environment variables](https://agentlet.io/docs/guides/environment-variables/), forms ([AI-ready](https://agentlet.io/docs/guides/forms-ai-ready/), [extraction](https://agentlet.io/docs/guides/forms-extraction/), [filling](https://agentlet.io/docs/guides/forms-filling/), [select options](https://agentlet.io/docs/guides/forms-select-options/)), [mount API](https://agentlet.io/docs/guides/mount-api/), [script injection](https://agentlet.io/docs/guides/script-injection/), [shadow DOM](https://agentlet.io/docs/guides/shadow-dom/), [tables and Excel](https://agentlet.io/docs/guides/tables-and-excel/), [TypeScript](https://agentlet.io/docs/guides/typescript/), [z-index](https://agentlet.io/docs/guides/z-index/)
- [Public API reference](https://agentlet.io/docs/reference/public-api/)

## Consuming the package

As of version 2.0.0, the package ships the built `dist` output instead of raw `src` sources: `dist/agentlet-core.js` (IIFE global, also usable via `require`), `dist/agentlet-core.esm.js` (ES module), `dist/agentlet-core.min.js` (minified IIFE), and `dist/agentlet-core.d.ts` (TypeScript declarations), about 1.4 MB compressed, no sourcemaps, no browser extension bundle, no bookmarklet HTML. Consumers no longer need their own bundler rule to transpile `agentlet-core`'s sources, the package is pre-built, so a bundler only needs to resolve and include it as-is.

If you are upgrading from 1.x and had such a rule pointing at `agentlet-core`, it can be removed, since `node_modules` is typically excluded from bundler transform rules already.

## Credits and acknowledgments

### Core dependencies

The agentlet framework is built on several excellent open-source libraries:

- **[PDF.js](https://mozilla.github.io/pdf.js/)** - Mozilla Foundation - PDF rendering and processing
- **[html2canvas](https://html2canvas.hertzen.com/)** - HTML to canvas screenshot generation
- **[SheetJS](https://sheetjs.com/)** - Excel file generation and manipulation

### Testing and development

- **[Jest](https://jestjs.io/)** - JavaScript testing framework
- **[JSDOM](https://github.com/jsdom/jsdom)** - DOM implementation for testing
- **[esbuild](https://esbuild.github.io/)** - Bundler and minifier for distribution builds

## License

MIT, see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details, including [commit message rules](https://agentlet.io/docs/contributing/commit-rules/) and the [documentation style guide](https://agentlet.io/docs/contributing/documentation-style/).
