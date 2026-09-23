# {{name}} 📎

This agentlet 📎 was generated using the `agentlet-core` 📎 scaffolding tool.{{#if template}}

**Template**: {{#if (eq template 'minimal')}}Minimal (simple starter){{else}}Full (comprehensive example){{/if}}{{/if}}{{#if ui}}
**UI**: {{#if (eq ui 'react')}}React (a React 18 root is mounted into the panel via `Module.mount()`/`unmount()` in `src/module.js`){{else}}html (`getContent()`, no framework){{/if}}. See [Module mount API](https://github.com/agentlet/agentlet-core/blob/main/docs/module-mount-api.md) in `agentlet-core` for the full `mount()`/`unmount()` reference, including vanilla and custom-element (Lit) examples.{{/if}}

## Getting Started

Follow these steps to build and run your agentlet 📎:

### 1. Install Dependencies

Navigate to your agentlet's directory and install the necessary dependencies.

```bash
npm install
```

### 2. Build the Agentlet (Production)

This command will compile your agentlet's source code and bundle it into a single, minified file located in the `dist` directory.

```bash
npm run build
```

### 3. Start the Development Server

To test and debug your agentlet 📎, you need to serve the bundled file. This command starts a local development server that serves a non-minified version of your agentlet.

```bash
npm start
```

The server will be available at `http://localhost:8080`.

### 4. Use the Bookmarklets

Once the server is running, open `dist/index.html` in your browser. You will find two bookmarklets:

*   **{{name}} (Production):** Loads the minified version of your agentlet 📎. Use this for testing the final build.
*   **{{name}} (Debug):** Loads the non-minified version of your agentlet 📎 from the local development server. Use this for debugging with your browser's developer tools.

Drag either of these links to your browser's bookmarks bar. Click the desired bookmarklet on any webpage (especially `http://localhost:8080` for testing the scaffolded agentlet's `matches` function) to load and run your agentlet 📎.

### 5. Run the tests

```bash
npm test
```

This runs the generated Playwright specs in `tests/`. `@playwright/test` is
pinned to an exact version (`1.54.1`, not `^1.54.1`) in `package.json`
rather than left to float on semver: this is the version this scaffold was
verified against, and newer Playwright releases have dropped support for
some still-common operating systems (for example macOS 13). If you need a
newer Playwright, upgrade deliberately and re-verify `npm test` afterwards.