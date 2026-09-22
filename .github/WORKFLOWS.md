# GitHub Actions CI/CD Setup

This directory contains the GitHub Actions workflows and configuration for Agentlet Core.

## Workflows

### 🧪 `test.yml` - Quick Test Pipeline
**Trigger**: Every push to any branch, PRs to main/develop
- Runs on Node.js 20.x
- Executes Jest unit tests 
- Builds the project
- Runs Playwright integration tests
- Uploads test artifacts on failure

### 🚀 `ci.yml` - Full CI/CD Pipeline  
**Trigger**: Push to main/develop, PRs to main/develop
- **Test Matrix**: Node.js 20.x, 22.x
- **Steps**:
  - Install dependencies
  - Install Playwright browsers
  - Linting (if available)
  - Type checking (if available)
  - Unit tests with Jest
  - Build all targets
  - Playwright tests
  - Upload coverage to Codecov
- **Build & Package** (main branch only):
  - Build all distribution targets
  - Package browser extension
  - Upload build artifacts
- **Security Audit**:
  - npm audit for vulnerabilities
  - Dependency review for PRs

### 📦 `dependabot.yml` - Dependency Updates
- **npm dependencies**: Weekly updates on Mondays
- **GitHub Actions**: Weekly updates on Mondays  
- Auto-assigns to maintainer
- Limits to 10 open PRs

## Setup Requirements

### 1. Repository Secrets (Optional)
For Codecov integration, add this secret to your GitHub repository:
```
CODECOV_TOKEN=your_codecov_token
```
**Note**: Coverage upload will be skipped if this token is not provided, but CI will still pass.

### 2. Branch Protection Rules
Recommended settings for `main` branch:
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Required status checks:
  - `test`
  - `test (20.x, 22.x)` from CI pipeline
  - `build-and-package`
  - `security-audit`

### 3. Environment Variables
The workflows use these environment variables:
- `NODE_ENV=test` (set automatically)
- `CI=true` (set automatically by GitHub Actions)

## Test Coverage
- Unit tests generate coverage reports in `coverage/`
- Coverage is uploaded to Codecov on Node.js 20.x
- Playwright test results are stored in `tests/examples/test-results/`

## Artifacts
- **Test failures**: Test results and screenshots (3 day retention)
- **Build artifacts**: Distribution files (30 day retention)  
- **Extension package**: Browser extension zip (30 day retention)

## Local Development
To run the same checks locally:
```bash
# Unit tests
npm test

# Playwright tests  
npm run test:examples

# Build
npm run build

# Linting (if configured)
npm run lint

# Type checking (if configured)
npm run typecheck
```

## Status Badges
Add these to your README.md:
```markdown
[![CI/CD Pipeline](https://github.com/fvinas/agentlet-core/actions/workflows/ci.yml/badge.svg)](https://github.com/fvinas/agentlet-core/actions/workflows/ci.yml)
[![Tests](https://github.com/fvinas/agentlet-core/actions/workflows/test.yml/badge.svg)](https://github.com/fvinas/agentlet-core/actions/workflows/test.yml)
```

## Playwright e2e timing budget (`test.yml`)

The `tests/examples/specs/` suite holds 153 tests, run once per Playwright
project declared in `tests/examples/playwright.config.js`. That config used
to declare 4 projects (`chromium`, `firefox`, `webkit`, `chromium-headed`),
so a full run executed 4 x 153 = 612 individual tests.

On CI the config forced `workers: 1` (fully serial) while capping the
*entire* run with `globalTimeout: 300000`, or 5 minutes. A full run needs
roughly 22 minutes at 2 workers, so a serialized run of a third more tests
could not possibly finish inside 5 minutes. Playwright killed the run every
time, on every machine, regardless of flakiness or hardware. This matches
CI failing on 100% of runs since the e2e suite landed in commit `c25bf31`
(23 September 2025), three days before the first recorded failure.

Fix applied:

- `workers` on CI is now `2` rather than `1`. A GitHub `ubuntu-latest`
  runner has 4 vCPUs, which is also what Playwright's own default would
  pick there, and each worker gets an isolated browser instance, so this
  introduces no cross-test interference.
- The `chromium-headed` project was removed. It was a headed Chromium with
  a 1 second `slowMo`, but on CI it ran headless with `slowMo: 0`, making
  it byte-for-byte equivalent to the plain `chromium` project: 153 tests of
  duplicated work for zero extra coverage on every run. Locally its
  1s-per-action delay made a full run of the config dramatically slower.
  The same headed, slowed-down debugging experience remains available for
  any project through `npm run test:examples:visible` (`--headed`) and
  `npm run test:examples:debug`.
- `globalTimeout` is now 45 minutes (`2700000`ms) everywhere, up from 5.
  Measured reference point: 456 passed and 3 skipped in 22.3 minutes, with
  2 workers on a 4-core machine. The budget is a safety net against a hung
  run rather than a target, so it is deliberately generous and identical in
  both environments. An earlier attempt at this fix kept a tighter
  15 minute local budget, which cut the suite off mid-run with 157 tests
  never executed, so there is no tight local value worth keeping.
- `timeout: 30000` moved to the top level of the config. It previously sat
  inside `use` as `testTimeout`, a key Playwright ignores there. Its value
  matches Playwright's default, so this changes no behaviour; it only stops
  the config from advertising a setting that had no effect.
- The `test` job in `test.yml` now sets `timeout-minutes: 60`, giving the
  whole job (checkout, `npm ci`, jest, build, browser install, e2e) room
  above the 45 minute e2e budget.

## Shortcut leak into input fields

Running each Playwright project individually during the diagnosis surfaced
a real, reproducible cross-browser bug that CI had never got far enough to
reach: `ui-shortcuts.spec.js` "should prevent non-input shortcuts when
disabled in input fields" failed 3 times out of 3 on Firefox only.

`ShortcutManager.init()` sets `hotkeys.filter = () => true`, which disables
the library's own input filtering, so the wrapped callback runs even when
focus sits in a field and the manager enforces `allowInInputs` itself. That
branch returned early without calling `event.preventDefault()`. Chromium
inserts no character for an unhandled `Alt+H`, but Firefox inserts an `h`,
so the key of a shortcut the user believes is blocked leaked into the
field's value.

The branch now suppresses the browser default, but only for combinations
carrying a `ctrl`, `cmd`, `alt` or `meta` modifier. `shift` is deliberately
excluded, and bare keys are left alone: a shortcut registered on a plain
letter must keep typing that letter in a field, which is exactly what
`allowInInputs: false` promises. Suppressing unconditionally would have
broken ordinary typing on the host page for any consumer registering a
single-key shortcut, since `preventDefault` defaults to `true`.

If the suite grows significantly, re-measure with
`CI=true npx playwright test --config=tests/examples/playwright.config.js`
before assuming the existing budget still holds.
