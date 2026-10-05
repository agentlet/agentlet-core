# GitHub Actions workflows

This repository has three workflows in `.github/workflows/`: `test.yml`, `security.yml` and `release.yml`. All run on `ubuntu-latest` with Node.js 22.x. The status badges for the first two are in the README.

## `test.yml`: tests

**Trigger**: pushes to `main`, pull requests to `main`, and `workflow_call`. `release.yml` calls this workflow so that a release runs exactly the same checks, see below.

Two jobs run in parallel, with no dependency between them:

- `checks`: `npm ci`, Jest unit tests, `npm run lint`, `npm run typecheck` and `npm run build`. Timeout: 10 minutes.
- `e2e`: a matrix over `chromium`, `firefox` and `webkit` (`fail-fast: false`). Each job installs only its own browser with `npx playwright install --with-deps <project>`, cached in `~/.cache/ms-playwright` under a key made of the runner OS, the installed `@playwright/test` version and the project. On a cache hit it only installs the browser's system libraries with `npx playwright install-deps <project>`. It then runs `npm run test:examples -- --project=<project>`. On failure it uploads `tests/examples/test-results/` as `test-artifacts-<project>` (3 days retention). Timeout: 25 minutes.

`tests/examples/playwright.config.js` sets 4 workers on CI (override with `E2E_WORKERS`) and a `globalTimeout` of 20 minutes on CI, 45 minutes locally. Each job runs the build again through Playwright's `globalSetup`, because each job has its own checkout.

## `security.yml`: dependency vulnerability scan

**Trigger**: pull requests to `main`, pushes to `main`, a nightly schedule (03:17 UTC) and manual dispatch.

The `scan` job installs dependencies, builds the project, generates an SBOM of what the published bundles ship (the shared `sbom-from-esbuild` action) and scans it (the shared `dependency-scan` action, which installs a pinned `osv-scanner` release checksum-verified against the release's `SHA256SUMS`). It uploads the results to the GitHub Security tab as SARIF (skipped for pull requests from forks, whose token is read-only) and as the `security-scan-reports` artifact, and fails the job if the gate failed. On the nightly run, it also opens or updates a `security`-labeled issue when the scan of `main` fails the gate (the action's `issue-on-failure`).

The nightly-only `nightly-release-scan` job downloads the SBOM attached to the latest GitHub release and rescans it, opening or updating a separate `security`-labeled issue if that fails. The issue is deduplicated by its exact title, which includes the release tag.

### Shared actions

The scanner is not part of this repository. `security.yml` and `release.yml` call two composite actions from the organization repository [agentlet/.github](https://github.com/agentlet/.github/tree/main/actions/dependency-scan), pinned by commit SHA like every other action (the trailing comment names the tag):

- `agentlet/.github/actions/sbom-from-esbuild` builds the SBOM from the metafiles. `metafiles` takes an explicit newline or comma separated list (no glob), so the five files written by `tools/build.js` are listed in the workflows. Add a new build target there when `tools/build.js` gains one.
- `agentlet/.github/actions/dependency-scan` installs the pinned `osv-scanner`, applies the gate, uploads the SARIF (skipped on fork pull requests), uploads the reports and optionally opens a tracking issue. Its README documents every input. It only supports Linux x64 runners.

Bump the pin deliberately when a new action tag is released: the tags are named `dependency-scan-v1` and not semver, so Dependabot may not propose them. The `osv-scanner-version` input controls the scanner version.

### Why the SBOM is built from esbuild metafiles

esbuild inlines every bundled dependency into one file, so a scanner pointed at `dist/` or at the npm tarball finds no packages. `package-lock.json` lists the whole install tree, but most of it (build tools, test runners, linters) is never shipped.

So the scan has two scopes:

- **bundle (blocking)**: a CycloneDX SBOM built from the esbuild metafiles that `tools/build.js` writes to `reports/security/meta/*.meta.json` (gitignored, never published). The shared `sbom-from-esbuild` action maps every bundled `node_modules` input to its package and writes `reports/security/sbom-bundle.cdx.json`. This is what a consumer of agentlet-core actually runs.
- **lockfile (reporting only)**: `package-lock.json` scanned directly. It never blocks a pull request.

### Running the scan locally

```bash
brew install osv-scanner
git clone https://github.com/agentlet/.github.git ~/dev/agentlet-shared   # once
SHARED=~/dev/agentlet-shared/actions/dependency-scan

npm run build           # writes reports/security/meta/*.meta.json
node $SHARED/bin/sbom-from-esbuild-metafile.mjs \
  --out=reports/security/sbom-bundle.cdx.json \
  reports/security/meta/*.meta.json
node $SHARED/bin/scan.mjs \
  --blocking-sbom=reports/security/sbom-bundle.cdx.json \
  --lockfile=package-lock.json
```

`scan.mjs` accepts `--min-severity=<low|medium|high|critical>` (default `high`), `--lockfile=` (empty, to skip the lockfile), `--exceptions=<path>`, `--out-dir=<path>` and `--offline` (skips the EPSS and KEV lookups). The [action README](https://github.com/agentlet/.github/tree/main/actions/dependency-scan) lists every flag. Reports land in `reports/security/` (gitignored): `results.sarif`, `scan-report.json` and `scan-summary.md`.

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
- `owner`: required by policy, for review follow-up.

An exception is a time-boxed decision to accept a known risk. Give it a real owner and a realistic expiry. An exception that matched nothing in a run produces a warning, so stale entries get noticed.

### EPSS and KEV data

Findings are enriched with EPSS scores (`api.first.org`) and the CISA KEV catalog. Both lookups are best effort: a network failure prints a warning and marks the data as unknown instead of failing the scan. The gate rule does not need EPSS.

## `release.yml`: npm publish

**Trigger**: pushing a tag that matches `v*`.

Three jobs run in this order, each one starting only if the previous one succeeded:

1. `verify-tag` checks that the tag (without the leading `v`) equals the `version` in `package.json`, and fails early if not. npm versions are immutable, so a mismatch is not recoverable after publishing. It runs first and takes seconds, so a mistyped tag does not wait for the e2e suite.
2. `checks` calls `test.yml` as a reusable workflow (`uses: ./.github/workflows/test.yml`) on the tagged commit: Jest, `npm run lint`, `npm run typecheck`, `npm run build`, and the e2e suite on chromium, firefox and webkit, including the Playwright browser cache. There is no copy of these steps in `release.yml`, so the release gate cannot drift from what pull requests must pass. It only needs `contents: read`.
3. `release` (needs `verify-tag` and `checks`) does the following steps, in order:
   1. `npm ci`, `npm test`, `npm run build`. The build runs again here because this job has its own runner and checkout, and the SBOM and the package are built from it.
   2. Generate the SBOM (the shared `sbom-from-esbuild` action) and scan it (the shared `dependency-scan` action) before publishing, so a blocking vulnerability or a failure stops the job before anything is published.
   3. `npm publish --provenance --access public`.
   4. Create the GitHub release for the tag, or update it, and attach `sbom-bundle.cdx.json`. This happens after publishing, so a failure here never leaves npm half-published. Retry it alone with `gh release upload <tag> reports/security/sbom-bundle.cdx.json --clobber`.

A tag on a commit that fails any check therefore never reaches `npm publish`. If a check fails, fix the problem on `main`, delete the failed tag (`git push origin :refs/tags/<tag>` and `git tag -d <tag>`) and tag the fixed commit again. Nothing was published, so reusing the version is safe.

Because `test.yml` is also called from here, its checks and e2e jobs show up in the release run as `checks / checks` and `checks / e2e (<project>)`. The check names reported on pull requests do not change, so branch protection is unaffected.

The job needs `id-token: write` so that npm can attach a signed provenance attestation, and `contents: write` to create the release.

### Required secret: `NPM_TOKEN`

Publishing authenticates with an npm automation token stored as the repository secret `NPM_TOKEN` (Settings, Secrets and variables, Actions). Create the token on npmjs.com under Access tokens, with the Automation type, using an account that can publish `agentlet-core`. Without the secret, a tag push runs the tests and build and then fails at the publish step.

## Action pinning and Dependabot

Every action in `.github/workflows/` is pinned by the full 40-character commit SHA, with the release tag in a trailing comment, for example `actions/checkout@<sha> # v7.0.1`. A tag can be moved to different code after the fact, a commit SHA cannot, so a compromised upstream release cannot change what the workflows run. The shared actions from `agentlet/.github` follow the same style.

To pin a new action or bump a pin by hand, resolve the tag to a commit (dereference annotated tags, whose object type is `tag`, with a second call):

```bash
gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.type + " " + .object.sha'
gh api repos/<owner>/<repo>/git/tags/<sha> --jq '.object.sha'   # only for annotated tags
```

`.github/dependabot.yml` keeps the pins and the npm dependencies current, weekly on Monday at 09:00 UTC. No reviewers or assignees are set.

- `npm`: minor and patch updates are grouped into one pull request (`npm-minor-patch`), major updates arrive individually. `xlsx` is ignored, because SheetJS is pinned to a tarball URL on `cdn.sheetjs.com`, which Dependabot does not track, see SECURITY.md and CONTRIBUTING.md. Commits use the `chore` prefix.
- `github-actions`: all action updates are grouped into one pull request. Dependabot rewrites both the SHA and the trailing tag comment. Commits use the `ci` prefix.

Review a Dependabot pull request like any other change: the checks in `test.yml` and `security.yml` run on it.

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
