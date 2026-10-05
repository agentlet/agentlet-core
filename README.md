<h1 align="center" style="border-bottom: none;">agentlet</h1>
<h3 align="center">A side panel for web apps you cannot change</h3>

<p align="center">
  <a href="https://agentlet.io">agentlet.io</a> &nbsp;|&nbsp; <a href="https://agentlet.io/docs/">Documentation</a>
</p>

<p align="center">
  <a href="https://github.com/agentlet/agentlet-core/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/agentlet/agentlet-core/actions/workflows/test.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/agentlet/agentlet-core/actions/workflows/security.yml"><img alt="Security" src="https://github.com/agentlet/agentlet-core/actions/workflows/security.yml/badge.svg?branch=main"></a>
  <a href="https://www.npmjs.com/package/agentlet-core"><img alt="npm version" src="https://img.shields.io/npm/v/agentlet-core"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/agentlet/agentlet-core"></a>
</p>

**agentlet-core** injects a side panel into a web app you cannot change. You load it with a bookmarklet, a browser extension, or from the app itself, and write small page-specific tools on top of it that read and fill forms, export tables to Excel, capture parts of the page as images, and call an AI model.

There is nothing to deploy on the server side, apart from a backend or proxy for the AI model if you use one. See [the agentlet approach](https://agentlet.io/docs/concepts/approach/) and [deployment modes](https://agentlet.io/docs/concepts/deployment-modes/) for how bookmarklets, extensions and embedding differ.

![Agentlet demo](https://raw.githubusercontent.com/agentlet/agentlet-core/main/docs/img/demo-part2.gif)

> **agentlet** (n.): a small, page-specific tool injected into a web app you don't control, like a bookmarklet with a side panel, forms, tables and AI.

## Highlights

- No changes to the host application's code or backend
- Three deployment options: bookmarklet, browser extension, or embedded in the app
- Bookmarklet deployment needs no installation
- Form extraction and filling, including filling from AI output
- Table to Excel export with user-controlled pagination
- Screenshot capture for AI-based visual analysis
- Module architecture with a predictable lifecycle (`initModule`, `activateModule`, `cleanupModule`) plus optional `mount`/`unmount` hooks for mounting a UI framework root
- Optional authentication through an identity provider
- Scaffolding tools for new agentlets
- One large bundle: html2canvas, pdf.js and SheetJS are included (see [Size](#size))

## The agentlet ecosystem

The agentlet ecosystem includes a core framework, a collection of example implementations, and [`agentlet-designer`](https://github.com/agentlet/agentlet-designer), which generates custom agentlets from a live page: a Claude Code skill today, an in-page designer agentlet later.

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

## Quick start

This takes about two minutes and needs no clone of this repository. You get a side panel that counts the forms and tables on the page, with a button that downloads the first table as an Excel file.

### As a bookmarklet

1. Create a new bookmark in your browser and paste this single line as its URL. It loads `agentlet-core` from [jsDelivr](https://www.jsdelivr.com/) and registers a small module. It works the same when pasted into the DevTools console.

   ```text
javascript:(async () => { if (!window.agentlet) { await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/agentlet-core@2/dist/agentlet-core.min.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); await new window.AgentletCore.default().init(); } class PageSummary extends window.agentlet.Module { constructor() { super({ name: 'page-summary', patterns: '*' }); } getContent() { const forms = document.querySelectorAll('form').length; const tables = document.querySelectorAll('table').length; return `<p>This page has ${forms} form(s) and ${tables} table(s).</p> <button onclick="window.agentlet.tables.extractAndDownload(document.querySelector('table'), { filename: 'table.xlsx' })"> Download the first table as Excel </button>`; } } if (!window.agentlet.modules.get('page-summary')) { window.agentlet.modules.register(new PageSummary()); } })();
   ```

2. Open a page that has a table, for example a Wikipedia list article, and click the bookmark.
3. The side panel opens on the right. Click "Download the first table as Excel".

The readable source of that bookmarklet:

```javascript
(async () => {
    if (!window.agentlet) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/agentlet-core@2/dist/agentlet-core.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        await new window.AgentletCore.default().init();
    }

    class PageSummary extends window.agentlet.Module {
        constructor() {
            super({ name: 'page-summary', patterns: '*' });
        }

        getContent() {
            const forms = document.querySelectorAll('form').length;
            const tables = document.querySelectorAll('table').length;
            return `<p>This page has ${forms} form(s) and ${tables} table(s).</p>
                <button onclick="window.agentlet.tables.extractAndDownload(document.querySelector('table'), { filename: 'table.xlsx' })">
                    Download the first table as Excel
                </button>`;
        }
    }

    if (!window.agentlet.modules.get('page-summary')) {
        window.agentlet.modules.register(new PageSummary());
    }
})();
```

Notes and limits:

- `agentlet-core@2` follows the latest 2.x release. Pin an exact version such as `agentlet-core@2.2.0` if you want reproducible behaviour.
- The bookmarklet loads a script from a CDN, so it needs network access and does not work on pages whose Content Security Policy forbids that. For example, github.com refuses the script (`script-src`), and nothing appears. On such pages, embed the bundle in the app or use a browser extension.
- A bookmarklet runs only when you click it. It is not re-injected after a page reload.

### From npm, in your own page

```bash
mkdir my-agentlet && cd my-agentlet
npm init -y
npm install agentlet-core
```

Save this as `index.html` in that folder, serve the folder (for example with `python3 -m http.server 8000`) and open `http://localhost:8000`:

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>My first agentlet</title>
</head>
<body>
    <h1>Orders</h1>
    <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Amount</th></tr></thead>
        <tbody>
            <tr><td>1001</td><td>Acme</td><td>120.50</td></tr>
            <tr><td>1002</td><td>Globex</td><td>89.00</td></tr>
        </tbody>
    </table>

    <script src="node_modules/agentlet-core/dist/agentlet-core.min.js"></script>
    <script type="module">
        const core = new window.AgentletCore.default();
        await core.init();

        class OrdersExport extends window.agentlet.Module {
            constructor() {
                super({ name: 'orders-export', patterns: '*' });
            }

            getContent() {
                const rows = document.querySelectorAll('tbody tr').length;
                return `<p>${rows} orders on this page.</p>
                    <button onclick="window.agentlet.tables.extractAndDownload(document.querySelector('table'), { filename: 'orders.xlsx' })">
                        Download as Excel
                    </button>`;
            }
        }

        window.agentlet.modules.register(new OrdersExport());
    </script>
</body>
</html>
```

Here `new window.AgentletCore.default()` is the same class you get from `import AgentletCore from 'agentlet-core'` in a bundler. `window.agentlet` exists once `init()` has resolved.

## How it compares

| | Userscript (Tampermonkey and similar) | Hand-written browser extension | RPA robot | agentlet-core |
|---|---|---|---|---|
| Runs where | In your browser, through a userscript manager | In your browser, installed from a store or as a developer build | Often outside the page, on a server or desktop | In the page, in the user's own session |
| Install for the user | Install the manager, then the script | Install the extension | Robot runtime and credentials | Nothing for a bookmarklet, an extension build, or nothing if the app embeds it |
| Runs automatically on matching pages | Yes | Yes | Scheduled or triggered | Only when embedded or loaded by an extension. A bookmarklet needs a click |
| Works on pages with a strict CSP | Yes | Yes | Not applicable | Not as a CDN bookmarklet |
| UI, forms, tables, screenshots, AI helpers | Write them yourself | Write them yourself | Tool dependent | Included |
| Module lifecycle and URL matching | Match rules in the script header | Match rules in the manifest | Not applicable | Included, including URL changes in single page apps |
| Cross-origin requests and background work | `GM_xmlhttpRequest`, storage APIs | Full extension APIs | Yes | Same limits as the host page |

Where the alternatives are simpler or better:

- **Userscripts** are the right tool when only you will use the script, you do not mind installing a manager, and you want it to run on every visit without a click. They are less work than agentlet for a one-off tweak.
- **A hand-written extension** is better when you need browser APIs, background work, requests that ignore the page's CORS rules, or a store listing. agentlet-core can still sit inside an extension as the panel and helper layer. The extension build in `extension/` is an unpublished experiment.
- **RPA** is better for unattended, scheduled work and for desktop applications. An agentlet runs attended, inside the page, with the page's privileges.

What agentlet adds is the shared layer: a module lifecycle and URL matching, one side panel, form, table, screenshot and AI helpers, and three ways to ship the same code (bookmarklet, extension, embedded).

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
- [Generate with Claude Code](https://agentlet.io/docs/getting-started/generate-with-claude-code/)
- [Manual setup](https://agentlet.io/docs/getting-started/manual-setup/)

## Documentation

Full documentation lives at **[agentlet.io/docs](https://agentlet.io/docs/)**, including:

- Concepts: [the agentlet approach](https://agentlet.io/docs/concepts/approach/), [architecture](https://agentlet.io/docs/concepts/architecture/), [deployment modes](https://agentlet.io/docs/concepts/deployment-modes/), [security](https://agentlet.io/docs/concepts/security/)
- Guides: [AI](https://agentlet.io/docs/guides/ai/), [authentication](https://agentlet.io/docs/guides/authentication/), [dialogs and shortcuts](https://agentlet.io/docs/guides/dialogs-and-shortcuts/), [environment variables](https://agentlet.io/docs/guides/environment-variables/), forms ([AI-ready](https://agentlet.io/docs/guides/forms-ai-ready/), [extraction](https://agentlet.io/docs/guides/forms-extraction/), [filling](https://agentlet.io/docs/guides/forms-filling/), [select options](https://agentlet.io/docs/guides/forms-select-options/)), [mount API](https://agentlet.io/docs/guides/mount-api/), [script injection](https://agentlet.io/docs/guides/script-injection/), [shadow DOM](https://agentlet.io/docs/guides/shadow-dom/), [tables and Excel](https://agentlet.io/docs/guides/tables-and-excel/), [TypeScript](https://agentlet.io/docs/guides/typescript/), [z-index](https://agentlet.io/docs/guides/z-index/)
- [Public API reference](https://agentlet.io/docs/reference/public-api/)

## Security and API keys

An agentlet runs inside the host page, with the page's privileges, and is not sandboxed. Any other script on that page can read `window.agentlet` and the environment variables it keeps in `localStorage`, including `OPENAI_API_KEY`. For anything beyond local experiments, point `OPENAI_BASE_URL` at a proxy on your backend so the real provider key never reaches the browser. [SECURITY.md](SECURITY.md) describes the threat model, what data leaves the page, and how to report a vulnerability.

The browser extension in `extension/` is an unpublished experiment. It is not on any extension store and is not part of the npm package. It is built to need little trust: it asks for `activeTab`, `scripting` and `storage` only, has no host permissions and no content script, injects the bundled core into a tab only when you click or press its shortcut, and runs only modules shipped inside the package, never code fetched from a URL.

## Size

The package ships built files in `dist/`: `agentlet-core.js` (IIFE global, also used by `require`), `agentlet-core.esm.js` (ES module), `agentlet-core.min.js` (minified IIFE), `agentlet-core.d.ts` (TypeScript declarations) and `pdf.worker.min.mjs` (the pdf.js worker). There are no sourcemaps, no browser extension bundle and no bookmarklet HTML in the package. A bundler only needs to resolve and include it as-is.

Measured on version 2.2.0:

| File | Size | Gzip |
|---|---|---|
| `dist/agentlet-core.min.js` | 1.30 MB | 378 KB |
| `dist/pdf.worker.min.mjs` (separate file, only needed for PDFs) | 1.04 MB | 286 KB |

The npm tarball is 1.8 MB (7.9 MB unpacked, because it also holds the unminified IIFE and ESM builds). In `agentlet-core.min.js`, by minified bytes, SheetJS is about 33%, pdf.js 29%, agentlet's own code 21% and html2canvas 16%. Every dependency is bundled into one file and none is loaded on demand, so a bookmarklet pays the full download on each page where it is used, and the browser may cache it between pages.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for details, including [commit message rules](https://agentlet.io/docs/contributing/commit-rules/) and the [documentation style guide](https://agentlet.io/docs/contributing/documentation-style/). Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

This project is developed with heavy use of [Claude Code](https://claude.com/claude-code). [CLAUDE.md](CLAUDE.md) holds the conventions it follows, and all changes go through the same tests, lint and review as any other contribution.
