/**
 * Smoke-test module for the TypeScript tooling introduced in step 2.1 of the
 * progressive TypeScript migration (see CONTRIBUTING.md).
 *
 * This file has no runtime consumers yet: it exists purely to prove that
 * tsc, babel-jest and esbuild can all parse, type-check, transform and
 * bundle a .ts source file living alongside the existing .js codebase.
 *
 * Step 2.2 will replace/extend src/types/ with the public API types.
 */

/**
 * Semantic-version string in the form "major.minor.patch", optionally
 * followed by a pre-release/build suffix (e.g. "2.0.0", "2.0.0-beta.1").
 */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Type guard narrowing an unknown value to a valid Agentlet version string.
 */
export function isAgentletVersion(value: unknown): value is string {
    return typeof value === 'string' && SEMVER_PATTERN.test(value);
}

/**
 * Returns the given version string if valid, otherwise a fallback.
 */
export function normalizeAgentletVersion(value: unknown, fallback = '0.0.0'): string {
    return isAgentletVersion(value) ? value : fallback;
}
