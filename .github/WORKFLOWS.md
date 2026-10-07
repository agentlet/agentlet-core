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
   3. `npm stage publish --provenance --access public`: the version is staged on npm, not public yet. The step writes the stage id and the approval instructions to the job summary.
   4. Create the GitHub release for the tag, or update it, and attach `sbom-bundle.cdx.json`. This happens after staging, so a failure here never leaves npm half-staged. The GitHub release can appear before the npm version is approved.
4. A maintainer approves the staged version with 2FA, on npmjs.com (package `agentlet-core`, Staged Packages tab) or with `npm stage list agentlet-core` then `npm stage approve <stage-id>`. Only then does it become public. `npm stage reject <stage-id>` discards it. Retry it alone with `gh release upload <tag> reports/security/sbom-bundle.cdx.json --clobber`.

A tag on a commit that fails any check therefore never reaches `npm publish`. If a check fails, fix the problem on `main`, delete the failed tag (`git push origin :refs/tags/<tag>` and `git tag -d <tag>`) and tag the fixed commit again. Nothing was published, so reusing the version is safe.

Because `test.yml` is also called from here, its checks and e2e jobs show up in the release run as `checks / checks` and `checks / e2e (<project>)`. The check names reported on pull requests do not change, so branch protection is unaffected.

The job needs `id-token: write` so that npm can authenticate to the registry with a short-lived OIDC token (see below) and attach a signed provenance attestation, and `contents: write` to create the release. Right before staging, a step upgrades npm to 11.15.0 or later, which staged publishing requires (trusted publishing alone needs 11.5.1), and fails if the result is older. Trusted publishing also requires Node.js 22.14.0 or later, which `22.x` provides, and a GitHub-hosted runner.

### Authentication: npm trusted publishing (OIDC) with staged publishing

`npm stage publish` authenticates with the job's OIDC identity ([npm documentation](https://docs.npmjs.com/trusted-publishers)), not with a stored token: no `NPM_TOKEN` secret and no `NODE_AUTH_TOKEN` are used. npm exchanges the identity for a short-lived publish token, only if the workflow run matches the trusted publisher configured for the package on npmjs.com. Provenance is then generated automatically. `--provenance` stays in the command so that the publish fails instead of going out without an attestation. `registry-url` stays on `actions/setup-node` because npm needs it.

The trusted publisher is configured once, by a package maintainer, on npmjs.com: package `agentlet-core`, Settings, Trusted Publisher, GitHub Actions, with these values (all case-sensitive, nothing is verified when saving, a mistake only shows up at publish time):

| Field | Value |
| --- | --- |
| Organization or user | `agentlet` |
| Repository | `agentlet-core` |
| Workflow filename | `release.yml` |
| Environment name | empty (the workflow does not use a GitHub environment) |
| Allowed actions | `npm stage publish` only: "Allow npm publish" and "Allow npm dist-tag" stay unchecked |

With only staging allowed, even a compromised workflow or action cannot make a version public: a maintainer must approve each staged version with 2FA ([staged publishing](https://docs.npmjs.com/staged-publishing/)). npm marks a new trusted publisher as pending validation until its first use, within a deadline shown on npmjs.com.

The `repository.url` in `package.json` must match the GitHub repository, and does (`git+https://github.com/agentlet/agentlet-core.git`). If the workflow file is renamed, the trusted publisher must be updated to the new filename. The setting lives in the settings of an existing package, and `agentlet-core` already exists on npm.

Once a release has been staged through OIDC and approved:

1. On npmjs.com, open the package Settings, Publishing access, select "Require two-factor authentication and disallow tokens" and save. This blocks token-based publishes.
2. Revoke the automation token that was used as `NPM_TOKEN` (npmjs.com, Access tokens).
3. Delete the `NPM_TOKEN` repository secret (GitHub, Settings, Secrets and variables, Actions).

If the trusted publisher is missing or wrong, a tag push still runs the checks, build, SBOM and scan, and then fails at the publish step with an authentication error. Nothing is published, and the job can be re-run after fixing the npmjs.com settings.

## Action pinning and Dependabot

Every action in `.github/workflows/` is pinned by the full 40-character commit SHA, with the release tag in a trailing comment, for example `actions/checkout@<sha> # v7.0.1`. A tag can be moved to different code after the fact, a commit SHA cannot, so a compromised upstream release cannot change what the workflows run. The shared actions from `agentlet/.github` follow the same style.

To pin a new action or bump a pin by hand, resolve the tag to a commit (dereference annotated tags, whose object type is `tag`, with a second call):

```bash
gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.type + " " + .object.sha'
gh api repos/<owner>/<repo>/git/tags/<sha> --jq '.object.sha'   # only for annotated tags
```

`.github/dependabot.yml` keeps the pins and the npm dependencies current, weekly on Monday at 09:00 UTC. No reviewers or assignees are set.

- `npm`: minor and patch updates are grouped into one pull request (`npm-minor-patch`). Major updates are ignored: they are upgraded one at a time, with their migration. The ignore rule only applies to version updates, so a Dependabot security update still opens for a vulnerable dependency even when the fix is a major version. `xlsx` is ignored, because SheetJS is pinned to a tarball URL on `cdn.sheetjs.com`, which Dependabot does not track, see SECURITY.md and CONTRIBUTING.md. Commits use the `chore` prefix.
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
