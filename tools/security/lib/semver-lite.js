'use strict';

/**
 * Small, dependency-free semver comparator - just enough to evaluate the
 * version ranges OSV/GHSA advisories express, without pulling in the
 * `semver` package (tools/security stays dependency-free so the nightly
 * CI job can run `node tools/security/scan.mjs` without `npm ci`; see
 * .github/workflows/security.yml's nightly-release-scan job).
 *
 * Handles:
 *  - version comparison with basic prerelease precedence (a version with a
 *    prerelease sorts before the same version without one, per semver;
 *    multiple prerelease identifiers are compared pairwise, numeric
 *    identifiers numerically, everything else lexically)
 *  - single constraints: "<", "<=", ">", ">=", "=" (or no operator, which
 *    means "=")
 *  - ranges: several constraints joined by whitespace and/or commas,
 *    ANDed together (this is how GHSA writes
 *    `database_specific.last_known_affected_version_range`, e.g.
 *    "< 0.19.3" or ">= 1.0.0, < 2.0.0")
 */

function parseVersion(version) {
    const match = String(version).trim().match(
        /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/
    );
    if (!match) {
        return { major: 0, minor: 0, patch: 0, prerelease: null };
    }
    return {
        major: Number(match[1] || 0),
        minor: Number(match[2] || 0),
        patch: Number(match[3] || 0),
        prerelease: match[4] ? match[4].split('.') : null
    };
}

function comparePrereleaseIdentifiers(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] === undefined) {
            return -1; // fewer identifiers has lower precedence
        }
        if (b[i] === undefined) {
            return 1;
        }
        const aNum = /^\d+$/.test(a[i]);
        const bNum = /^\d+$/.test(b[i]);
        if (aNum && bNum) {
            const diff = Number(a[i]) - Number(b[i]);
            if (diff !== 0) {
                return diff < 0 ? -1 : 1;
            }
        } else {
            if (a[i] === b[i]) {
                continue;
            }
            return a[i] < b[i] ? -1 : 1;
        }
    }
    return 0;
}

/**
 * Compares two version strings. Returns -1, 0 or 1 (a<b, a===b, a>b).
 */
function compareVersions(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);

    for (const key of ['major', 'minor', 'patch']) {
        if (va[key] !== vb[key]) {
            return va[key] < vb[key] ? -1 : 1;
        }
    }

    if (!va.prerelease && !vb.prerelease) {
        return 0;
    }
    if (!va.prerelease) {
        return 1; // a has no prerelease, b does: a is greater
    }
    if (!vb.prerelease) {
        return -1;
    }
    return comparePrereleaseIdentifiers(va.prerelease, vb.prerelease);
}

/**
 * A single "<op><version>" constraint, e.g. "<0.19.3" or ">= 1.0.0".
 */
function satisfiesConstraint(version, operator, constraintVersion) {
    const cmp = compareVersions(version, constraintVersion);
    switch (operator) {
        case '<': return cmp < 0;
        case '<=': return cmp <= 0;
        case '>': return cmp > 0;
        case '>=': return cmp >= 0;
        case '=':
        case '==':
        default:
            return cmp === 0;
    }
}

const CONSTRAINT_PATTERN = /(<=|>=|<|>|=)\s*(v?\d[0-9A-Za-z.+-]*)/g;

/**
 * Parses a range string into a list of {operator, version} constraints.
 * Returns an empty array if nothing recognisable was found.
 */
function parseRange(rangeText) {
    const constraints = [];
    let match;
    CONSTRAINT_PATTERN.lastIndex = 0;
    while ((match = CONSTRAINT_PATTERN.exec(String(rangeText))) !== null) {
        constraints.push({ operator: match[1], version: match[2] });
    }
    return constraints;
}

/**
 * Whether `version` satisfies every constraint in `rangeText` (constraints
 * are ANDed, matching how GHSA writes compound ranges). Returns null when
 * the range text has no recognisable constraint at all, so callers can
 * decide how to treat the unparseable case (this module deliberately does
 * not guess).
 */
function satisfiesRange(version, rangeText) {
    const constraints = parseRange(rangeText);
    if (constraints.length === 0) {
        return null;
    }
    return constraints.every(c => satisfiesConstraint(version, c.operator, c.version));
}

/**
 * Best-effort upper bound extracted from a range string such as
 * "< 0.19.3" or ">= 1.0.0, < 2.0.0" -> "0.19.3" / "2.0.0". When several
 * "<"/"<=" constraints are present, the smallest (tightest) one is
 * returned. Returns null if no upper-bound constraint is found.
 */
function upperBoundFromRange(rangeText) {
    const upperBounds = parseRange(rangeText)
        .filter(c => c.operator === '<' || c.operator === '<=')
        .map(c => c.version);
    if (upperBounds.length === 0) {
        return null;
    }
    return upperBounds.reduce((min, v) => (compareVersions(v, min) < 0 ? v : min));
}

module.exports = {
    parseVersion,
    compareVersions,
    satisfiesConstraint,
    parseRange,
    satisfiesRange,
    upperBoundFromRange
};
