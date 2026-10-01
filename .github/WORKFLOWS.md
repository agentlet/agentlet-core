# GitHub Actions workflows

This repository has three workflows in `.github/workflows/`: `test.yml`, `security.yml` and `release.yml`. All run on `ubuntu-latest` with Node.js 22.x. The status badges for the first two are in the README.

## `test.yml`: tests

**Trigger**: pushes to `main` and pull requests to `main`.

Two jobs run in parallel, with no dependency between them:

- `checks`: `npm ci`, Jest unit tests, `npm run lint`, `npm run typecheck` and `npm run build`. Timeout: 10 minutes.
- `e2e`: a matrix over `chromium`, `firefox` and `webkit` (`fail-fast: false`). Each job installs only its own browser with `npx playwright install --with-deps <project>` and runs `npm run test:examples -- --project=<project>`. On failure it uploads `tests/examples/test-results/` as `test-artifacts-<project>` (3 days retention). Timeout: 25 minutes.

`tests/examples/playwright.config.js` sets 4 workers on CI (override with `E2E_WORKERS`) and a `globalTimeout` of 20 minutes on CI, 45 minutes locally. Each job runs the build again through Playwright's `globalSetup`, because each job has its own checkout.

## `security.yml`: dependency vulnerability scan

**Trigger**: pull requests to `main`, pushes to `main`, a nightly schedule (03:17 UTC) and manual dispatch.

The `scan` job installs dependencies, installs a pinned `osv-scanner` release (checksum-verified against the release's `SHA256SUMS`), builds the project, generates an SBOM of what the published bundles ship (`npm run security:sbom`) and scans it (`npm run security:scan`). It uploads the results to the GitHub Security tab as SARIF (skipped for pull requests from forks, whose token is read-only) and as the `security-scan-reports` artifact, and fails the job if the gate failed.

Two nightly-only jobs also run:

- `nightly-main-issue` opens or updates a `security`-labeled issue when the nightly scan of `main` fails the gate.
- `nightly-release-scan` downloads the SBOM attached to the latest GitHub release and rescans it, opening or updating a separate `security`-labeled issue if that fails.

### Why the SBOM is built from esbuild metafiles

esbuild inlines every bundled dependency into one file, so a scanner pointed at `dist/` or at the npm tarball finds no packages. `package-lock.json` lists the whole install tree, but most of it (build tools, test runners, linters) is never shipped.

So the scan has two scopes:

- **bundle (blocking)**: a CycloneDX SBOM built from the esbuild metafiles that `tools/build.js` writes to `reports/security/meta/*.meta.json` (gitignored, never published). `tools/security/sbom.mjs` maps every bundled `node_modules` input to its package and writes `reports/security/sbom-bundle.cdx.json`. This is what a consumer of agentlet-core actually runs.
- **lockfile (reporting only)**: `package-lock.json` scanned directly. It never blocks a pull request.

### Running the scan locally

```bash
brew install osv-scanner
npm run build           # writes reports/security/meta/*.meta.json
npm run security:sbom   # writes reports/security/sbom-bundle.cdx.json
npm run security:scan   # runs osv-scanner on both scopes and applies the gate
```

`npm run security:scan` accepts `--min-severity=<low|medium|high|critical>` (default `high`), `--skip-lockfile` and `--offline` (skips the EPSS and KEV lookups). The header comment of `tools/security/scan.mjs` lists every flag. Reports land in `reports/security/`: `results.sarif`, `scan-report.json` and `scan-summary.md`.

### Gate rule

A finding in the bundle scope fails the gate when it is high or critical severity and a fixed version is known, or when it is in CISA's Known Exploited Vulnerabilities (KEV) catalog, unless a valid entry in `security/vulnerability-exceptions.json` covers it. An expired exception stops matching and also fails the gate by itself, so it has to be renewed or removed. Severity comes from OSV's `database_specific.severity` when present, and from the CVSS v3.x base score otherwise.

### Exceptions

```json
{
  "exceptions": [
    {
      "id": "GHSA-xxxx-xxxx-xxxx",
      "package": "some-package",
      "reason": "Why this is accepted temporarily",
      "expires": "2026-12-31",
      "owner": "github-handle"
    }
  ]
}
```

- `id`: a GHSA or CVE id. It matches a finding on any of its OSV aliases.
- `package`: optional. When present, the exception applies only to that package.
- `reason`: required.
- `expires`: required, `YYYY-MM-DD`.
- `owner`: optional.

An exception is a time-boxed decision to accept a known risk. Give it a real owner and a realistic expiry. An exception that matched nothing in a run produces a warning, so stale entries get noticed.

### EPSS and KEV data

Findings are enriched with EPSS scores (`api.first.org`) and the CISA KEV catalog. Both lookups are best effort: a network failure prints a warning and marks the data as unknown instead of failing the scan. The gate rule does not need EPSS.

## `release.yml`: npm publish

**Trigger**: pushing a tag that matches `v*`.

Steps, in order:

1. Check that the tag (without the leading `v`) equals the `version` in `package.json`, and fail early if not. npm versions are immutable, so a mismatch is not recoverable after publishing.
2. `npm ci`, `npm test`, `npm run build`.
3. Generate the SBOM (`npm run security:sbom`) before publishing, so a failure stops before anything is published.
4. `npm publish --provenance --access public`.
5. Create the GitHub release for the tag, or update it, and attach `sbom-bundle.cdx.json`. This happens after publishing, so a failure here never leaves npm half-published. Retry it alone with `gh release upload <tag> reports/security/sbom-bundle.cdx.json --clobber`.

The job needs `id-token: write` so that npm can attach a signed provenance attestation, and `contents: write` to create the release.

### Required secret: `NPM_TOKEN`

Publishing authenticates with an npm automation token stored as the repository secret `NPM_TOKEN` (Settings, Secrets and variables, Actions). Create the token on npmjs.com under Access tokens, with the Automation type, using an account that can publish `agentlet-core`. Without the secret, a tag push runs the tests and build and then fails at the publish step.

## Dependabot

`.github/dependabot.yml.disabled` holds a Dependabot configuration that is not active. Rename it to `dependabot.yml` to enable it. Note that SheetJS is pinned to a tarball URL on `cdn.sheetjs.com`, which Dependabot does not track, see CONTRIBUTING.md.

## Running the checks locally

```bash
npm test              # Jest unit tests
npm run lint
npm run typecheck
npm run build
npm run test:examples # Playwright e2e suite (needs `npx playwright install`)
```

### Running two e2e suites at once

`tests/examples/playwright.config.js` serves the examples on the port in `E2E_PORT` (default `3030`). With two worktrees on one machine, give each its own port. Otherwise the second run reuses the first run's server and tests the wrong checkout.

```bash
E2E_PORT=3131 npm run test:examples
```

### Targeted e2e recheck in Docker

When Playwright can no longer download a browser build for your host operating system, `npm run test:examples:docker` runs one or a few specs in the official Playwright Docker image instead:

```bash
npm run test:examples:docker -- tests/examples/specs/ui-dialogs.spec.js --project=chromium
```

`tools/e2e-docker.sh` pulls the image that matches the Playwright version in `package-lock.json`, keeps the container's `node_modules` in a separate named volume, runs `npm ci` in the container and sets `PW_TEST_HTML_REPORT_OPEN=never` so a failing run does not wait for the HTML report server. Use it for a targeted recheck only. A full run is slow and timing-sensitive on Docker Desktop's default macOS VM, and CI is the reference result for the full suite.
