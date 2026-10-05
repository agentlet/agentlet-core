# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | No        |

## Reporting a vulnerability

Report vulnerabilities privately, either through GitHub ([open a security advisory](https://github.com/agentlet/agentlet-core/security/advisories/new)) or by email to [security@agentlet.io](mailto:security@agentlet.io). Please do not open a public issue.

You will get an acknowledgement within a few days. Fixes ship as a patch release with an entry in the changelog.

## Threat model

An agentlet is JavaScript injected into a page you do not control, by a bookmarklet, an extension or the page itself. It runs with the page's privileges, in the page's JavaScript context. That has consequences you should know before deploying one.

### What the host page can see

- **Everything the agentlet holds in memory.** `window.agentlet` is a global, so any other script on the page, including third-party analytics and any XSS payload, can read it.
- **Everything the agentlet stores.** Environment variables are persisted in the host origin's `localStorage` under the key `agentlet`, readable by any script on that origin.
- **The agentlet's network calls.** Other scripts on the page can wrap `fetch` and observe requests.

Agentlet modules are not sandboxed. A module you register can do anything the page can do.

### API keys

`window.agentlet.ai` calls the provider straight from the browser, sending `OPENAI_API_KEY` as a bearer token. A key set this way is readable by every script on the host page, as described above.

Do not put a long-lived provider key in the browser on any page that loads third-party scripts or handles untrusted content. Instead:

1. **Use a proxy.** Set `OPENAI_BASE_URL` to an endpoint on your own backend that speaks the OpenAI API, and set `OPENAI_API_KEY` to a short-lived token your backend issued to the signed-in user. The backend checks that token, adds the real provider key and forwards the request. The real key never reaches the browser.
2. **Do not persist secrets.** Pass your own `envManager` to `new AgentletCore({ envManager })`, for example one that keeps values in memory only, or `envManager: null` to disable environment variables.
3. **Scope the key.** If a key must reach the browser, use a project key with a spending limit, and rotate it.

### Data sent to an AI provider

Agentlet sends no page data on its own and has no telemetry. A module sends what it passes to `window.agentlet.ai`: prompts, form structures, table data or screenshots of page elements. Review what your module captures before pointing it at pages with personal or customer data.

The only third-party request the core makes by itself is during PDF conversion, which downloads pdf.js character maps and standard fonts from cdnjs.cloudflare.com. The PDF content is not sent.

Form extraction reports `type="password"` fields with a `null` value and without their `value` attribute, so a password does not reach a prompt by accident. Pass `includePasswordValues: true` to override this when the extraction stays on the page. Other fields, including hidden ones when `includeHidden` is set, are reported as they are.

### Authentication popup

`AuthManager` only accepts messages from the login popup it opened, and checks their origin against `allowedOrigins` when that list is set. Set `allowedOrigins` to the origin of the page that posts the result back. A warning is logged when it is empty.

### Content Security Policy

A page with a strict Content Security Policy can block the bookmarklet from loading its script. Host the agentlet on an origin the page's `script-src` allows, or use the extension or native integration modes.

#### HTML escaping in the panel

Values the core renders itself (the panel title and module name, the page URL, environment variable names and values, user initials from an identity provider, the `minimizeWithImage` URL, keyboard shortcut descriptions, the title of `showModal()`) are written as text or escaped before they reach the HTML parser, and the core's own buttons use `addEventListener`, not inline `on*` attributes. `minimizeWithImage` accepts only `http:`, `https:`, `data:image/...` and relative URLs; anything else is ignored with a console warning.

#### APIs that accept HTML by contract

These APIs insert caller-provided markup as HTML on purpose. The core does not sanitize it: the caller owns that markup and must escape any value that comes from the page, a user or a server before putting it in.

- A module's `getContent()` (rendered by the default `mount()`, and by the core for modules that do not extend `Module`).
- The `info`, `fullscreen` and `command` dialogs (`Dialog.show()`, `showInfo()`, `showFullscreen()`, `showCommandPrompt()`) when `allowHtml: true` is set (`message`, and `customContent` for the fullscreen dialog). Without it the text is rendered with `textContent`. `Dialog.escapeHtml()` is available for the interpolated parts.
- `MessageBubble.show()` and `updateMessage()` with `allowHtml: true`, and the `icon` of a bubble (an emoji or an HTML snippet).
- The `content` argument of `agentlet.showModal(title, content)` (the title is text).

A module that renders untrusted data (page text, records, server responses) in `getContent()`, in `mount()` or in an `allowHtml` dialog is responsible for escaping it, or for building nodes with `textContent`.

#### Trusted Types

The panel is still not compatible with pages that enforce Trusted Types (`require-trusted-types-for 'script'`). What blocks it:

- The HTML-by-contract sinks above, plus the core's own template-based dialogs (settings, help, environment variables, keyboard shortcuts, the records preview), assign strings to `innerHTML`. Without a Trusted Types policy the browser rejects those assignments.
- `ScriptInjector` and the module loader create `<script>` elements and set their `src` or text, and `ScriptInjector` can build functions from strings (`new Function`), which also needs `'unsafe-eval'`.
- Bundled libraries (html2canvas, PDF.js, SheetJS, hotkeys-js) are not audited for Trusted Types.

Escaping removes the injection risk in the core's own markup, but does not make these sinks Trusted Types safe.

## Dependency scanning

Every pull request and push to `main` scans the dependencies bundled into the published build for known vulnerabilities, and blocks on critical or high findings that have a fix or are known to be exploited. The scan also runs nightly on `main` and on the latest release, and each release attaches an SBOM of the bundled dependencies. See `.github/WORKFLOWS.md`.

### Resolved: xlsx (SheetJS)

- GHSA-4r6h-8v6p-xvw6 (prototype pollution), fixed upstream in 0.19.3.
- GHSA-5pgg-2g8v-p4x9 (regular expression denial of service), fixed upstream in 0.20.2.

`xlsx` is pinned to 0.20.3, which includes both fixes. The npm registry's last published release is 0.18.5, so 0.20.3 is installed from the SheetJS project's own CDN (cdn.sheetjs.com) rather than from npm.
