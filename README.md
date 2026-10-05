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
- Large optional libraries: html2canvas, pdf.js and SheetJS are separate files, downloaded the first time a screenshot, a PDF or an Excel export needs them (see [Size](#size))

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
            patterns: 'example.com', // example.com and its subdomains
            matchMode: 'host'
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

### Matching URLs

`patterns` decides on which pages a module is active. With `matchMode: 'host'`, a string pattern is compared with the host of the page URL:

| Pattern | Matches | Does not match |
|---|---|---|
| `'example.com'` | `https://example.com/`, `https://app.example.com/x` | `https://example.com.evil.test/`, `https://notexample.com/`, `https://evil.test/?q=example.com` |
| `'localhost:3000'` | `http://localhost:3000/` | `http://localhost:3001/` |
| `'example.com/app'` | `https://example.com/app/users` | `https://example.com/apple` |
| `'https://example.com'` | `https://example.com/` | `http://example.com/` |
| `'file://'` | any `file:` URL | |

Matching is case-insensitive and internationalized names work in either form. The port is ignored unless the pattern names one. `'*'` still matches every page. Object patterns (`{ type: 'includes' | 'exact' | 'regex', value }`) are not affected by `matchMode`, so `{ type: 'includes', value: '/internal/' }` is the way to match a fragment of the URL.

The default, `matchMode: 'substring'`, is unchanged in 2.x: a string pattern matches any URL that contains it, so `'example.com'` also matches `https://evil.test/?q=example.com` and `https://example.com.evil.test/`. **Host matching becomes the default in agentlet-core 3.0.** Set `matchMode: 'host'` now, or `matchMode: 'substring'` to keep today's behaviour after 3.0. With `debugMode` on, a string pattern that looks like a host and is used in substring mode logs a one-time warning that points to this option.

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

The package ships built files in `dist/`:

- `agentlet-core.js` (IIFE global, also used by `require`), `agentlet-core.min.js` (minified IIFE) and `agentlet-core.esm.js` (ES module): the core alone. SheetJS, html2canvas and pdf.js are not inlined in them. Each one is loaded the first time a feature needs it: the first Excel export, screenshot or PDF conversion.
- `agentlet-xlsx.min.js`, `agentlet-html2canvas.min.js` and `agentlet-pdfjs.min.js`: those three libraries as separate files, which the two IIFE builds load next to the core script. The ES module build reaches them through the ES modules in `dist/chunks/` instead, which a bundler turns into its own lazy chunks.
- `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/`: the files pdf.js fetches while it converts a PDF, from the same `pdfjs-dist` version as the bundled library. Nothing is requested from a third-party host.
- `agentlet-core.full.min.js`: the core with all three libraries inlined, as one self-contained file for hosts that cannot serve several files. It registers them while `init()` runs, like the single `agentlet-core.min.js` did before on-demand loading.
- `agentlet-core.d.ts`: the TypeScript declarations.

There are no sourcemaps, no browser extension bundle and no bookmarklet HTML in the package.

Measured on the build that introduced on-demand loading, with SheetJS 0.20.3 (minified, size in bytes divided by 1000, gzip from `gzip -c file | wc -c`). Before it, `agentlet-core.min.js` was 1.38 MB, 398 KB gzipped (version 2.3.0), and every page paid for all of it.

| File | Size | Gzip | Downloaded |
|---|---|---|---|
| `dist/agentlet-core.min.js` (the core alone) | 292 KB | 76 KB | always |
| `dist/agentlet-xlsx.min.js` (SheetJS) | 503 KB | 162 KB | first Excel export |
| `dist/agentlet-html2canvas.min.js` | 205 KB | 48 KB | first screenshot |
| `dist/agentlet-pdfjs.min.js` (pdf.js) | 381 KB | 113 KB | first PDF conversion |
| `dist/pdf.worker.min.mjs` | 1.04 MB | 286 KB | first PDF conversion |
| `dist/cmaps/`, 169 files | 1.17 MB in total | | only the character maps a PDF needs |
| `dist/standard_fonts/`, 16 files | 0.78 MB in total | | only the standard fonts a PDF needs |
| `dist/agentlet-core.full.min.js` (everything inlined) | 1.39 MB | 401 KB | always |

A page that never exports to Excel, captures or converts a PDF downloads 76 KB gzipped instead of 398 KB. The npm tarball is 3.2 MB (9.1 MB unpacked, because it also holds the unminified IIFE and ESM builds, and the character maps and fonts).

### Where the files are loaded from

The IIFE builds resolve every on-demand file relative to the core script's own URL, so a host that serves the files of `dist/` together needs no setting, whether it loads the core from a CDN with a `<script>` tag or from its own server. The script tag the loader injects has no `crossorigin` attribute, so the server needs no CORS headers beyond what the core script itself needs. Set these `AgentletCore` options when the files live elsewhere:

| Option | Use |
|---|---|
| `libraryBaseUrl` | Folder URL that serves the chunk files, `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/`. Needed when the core is evaluated without a script URL (a `fetch()` plus `eval()` loader), is bundled into the host's own script, or the files are served from another place. Falls back to the folder of `registryUrl`, and to the extension root inside a browser extension. |
| `libraryUrls` | Per-library chunk URL, for example `{ xlsx: 'https://static.example.com/sheetjs.js' }`. |
| `pdfWorkerUrl` | URL of `pdf.worker.min.mjs`. |
| `pdfCMapUrl`, `pdfStandardFontsUrl` | URL of the folder with the character maps or the standard fonts. |
| `preloadLibraries` | `['xlsx', 'html2canvas', 'pdfjs']`, or a subset: load them while `init()` runs instead of on first use, so `window.XLSX`, `window.html2canvas` and `window.pdfjsLib` exist once it resolves. |

A failed load rejects with the URL it tried and the option to change. The ES module build needs none of the first two options: `import()` of its chunks resolves relative to the module, and a bundler (webpack, Vite, Rollup) handles them like any other lazy import. The PDF files are plain files, not modules: copy `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/` to where the app serves its assets and point `pdfWorkerUrl`, `pdfCMapUrl` and `pdfStandardFontsUrl` at them (a bundler rewrites the module URL, so there is nothing to derive them from; a page that loads `agentlet-core.esm.js` directly from the folder that serves them needs no option). The bookmarklet build (`dist/bookmarklet.js`, generated by `npm run build`) and the browser extension bundle carry all three libraries inline, as `agentlet-core.full.min.js` does.

`window.XLSX`, `window.html2canvas` and `window.pdfjsLib` are no longer defined right after `init()` unless you list them in `preloadLibraries` (or use `agentlet-core.full.min.js`). The asynchronous APIs (`tables.download()`, `ScreenCapture`, `ai.convertPDFToImages()` and the others) load what they need themselves. `TableExtractor.createExcelWorkbook()` is synchronous: call `await window.agentlet.tables.extractor.ensureXLSX()` first, or preload `xlsx`.

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
