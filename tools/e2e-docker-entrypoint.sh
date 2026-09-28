#!/usr/bin/env bash
#
# Runs *inside* the Playwright Docker container, invoked by e2e-docker.sh.
# Not meant to be run directly on the host.
set -euo pipefail

# The suite's webServer shells out to `python3 -m http.server`. The
# `-noble` tags ship python3 already; this is a safety net in case a future
# or different Playwright image tag doesn't. Only affects this container,
# not the image.
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found in the image; installing it (required by the test webServer)"
  apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 >/dev/null
fi

npm ci

# The config's default worker count (`workers: process.env.CI ? 2 : undefined`)
# falls back to auto-detecting from the CPU count when CI isn't set, which
# collapses to a single worker on a 2-CPU Docker Desktop VM (its default
# allocation). Pin --workers so a targeted rerun of a few specs still gets
# some parallelism, and raise --global-timeout as a generous safety net.
# This script is for targeted reruns (one spec, one browser), not a full
# run of the suite; see .github/WORKFLOWS.md for why. Both flags are plain
# `playwright test` options and can be overridden by passing your own after
# `--` (last one wins).
set +e
npx playwright test --config=tests/examples/playwright.config.js \
  --workers=2 --global-timeout=3600000 "$@"
status=$?
set -e

# The container runs as root (apt-get above needs it), so anything it wrote
# into the bind-mounted repo (dist/, tests/examples/test-results/) would
# otherwise be left root-owned on the host.
chown -R "${HOST_UID}:${HOST_GID}" dist tests/examples/test-results 2>/dev/null || true

exit "$status"
