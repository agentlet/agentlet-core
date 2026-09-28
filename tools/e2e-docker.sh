#!/usr/bin/env bash
#
# Run one or a few tests/examples/ Playwright specs inside the official
# mcr.microsoft.com/playwright Docker image, for a targeted recheck.
#
# Use this instead of `npm run test:examples` when the host OS is too old
# for the Playwright browser builds the current @playwright/test version
# ships (for example macOS 13, which upstream Playwright has dropped
# browser-install support for past a certain version). This is a targeted
# recheck tool, not a substitute for a full local run of the suite: see the
# "Running a targeted e2e recheck in Docker" section of
# .github/WORKFLOWS.md for why, and why CI is the reference for a full run.
#
# Usage:
#   npm run test:examples:docker -- tests/examples/specs/ui-dialogs.spec.js --project=chromium
#   E2E_PORT=3131 npm run test:examples:docker -- tests/examples/specs/ui-dialogs.spec.js --project=chromium
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Pin the container's Playwright to the exact version resolved in the
# lockfile, so the client driving the tests always matches the browser
# build it launches - a version mismatch is exactly the failure mode this
# script exists to avoid.
PW_VERSION="$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
E2E_PORT="${E2E_PORT:-3030}"

# One named volume per checkout path for the container's node_modules, kept
# separate from whatever is on the host (native binaries such as esbuild
# are platform-specific, and the host is very likely not Linux if you're
# reaching for this script). This also means two worktrees never share one
# container's node_modules.
VOLUME_SUFFIX="$(printf '%s' "$REPO_ROOT" | shasum | cut -c1-12)"
VOLUME_NAME="agentlet-core-e2e-node-modules-${VOLUME_SUFFIX}"
docker volume create "$VOLUME_NAME" >/dev/null

echo "Image:  $IMAGE"
echo "Volume: $VOLUME_NAME"
echo "Port:   $E2E_PORT"

docker pull "$IMAGE"

docker run --rm \
  -v "$REPO_ROOT:/work" \
  -v "$VOLUME_NAME:/work/node_modules" \
  -w /work \
  -p "${E2E_PORT}:${E2E_PORT}" \
  -e "E2E_PORT=${E2E_PORT}" \
  -e "HOST_UID=$(id -u)" \
  -e "HOST_GID=$(id -g)" \
  -e "PW_TEST_HTML_REPORT_OPEN=never" \
  --ipc=host \
  "$IMAGE" \
  bash tools/e2e-docker-entrypoint.sh "$@"
