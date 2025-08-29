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