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

The core makes no third-party request by itself. SheetJS, html2canvas and pdf.js are loaded on demand from the folder the core script was served from, and during PDF conversion pdf.js reads its worker, character maps and standard fonts from that same folder (`pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/` in `dist/`). Earlier releases fetched the character maps and fonts from cdnjs.cloudflare.com. Set `libraryBaseUrl` (or `pdfWorkerUrl`, `pdfCMapUrl` and `pdfStandardFontsUrl`) to serve these files from your own origin; with a `script-src` or `connect-src` that allows only that origin, allow the folder the core is loaded from.

Form extraction reports `type="password"` fields with a `null` value and without their `value` attribute, so a password does not reach a prompt by accident. Pass `includePasswordValues: true` to override this when the extraction stays on the page. Other fields, including hidden ones when `includeHidden` is set, are reported as they are.

### Authentication popup

`AuthManager` only accepts messages from the login popup it opened, and checks their origin against `allowedOrigins` when that list is set. Set `allowedOrigins` to the origin of the page that posts the result back. A warning is logged when it is empty.

### Content Security Policy

A page with a strict Content Security Policy can block the bookmarklet from loading its script. Host the agentlet on an origin the page's `script-src` allows, or use the extension or native integration modes. Agentlet's panel still writes markup with `innerHTML`, so it does not run on pages that enforce Trusted Types.

## Dependency scanning

Every pull request and push to `main` scans the dependencies bundled into the published build for known vulnerabilities, and blocks on critical or high findings that have a fix or are known to be exploited. The scan also runs nightly on `main` and on the latest release, and each release attaches an SBOM of the bundled dependencies. See `.github/WORKFLOWS.md`.

### Resolved: xlsx (SheetJS)

- GHSA-4r6h-8v6p-xvw6 (prototype pollution), fixed upstream in 0.19.3.
- GHSA-5pgg-2g8v-p4x9 (regular expression denial of service), fixed upstream in 0.20.2.

`xlsx` is pinned to 0.20.3, which includes both fixes. The npm registry's last published release is 0.18.5, so 0.20.3 is installed from the SheetJS project's own CDN (cdn.sheetjs.com) rather than from npm.
