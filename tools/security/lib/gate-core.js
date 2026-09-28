'use strict';

/**
 * Pure logic for the dependency vulnerability gate: normalising osv-scanner
 * JSON output into findings, matching/expiring exceptions, deciding which
 * findings block a PR, and building the SARIF/markdown/table reports.
 *
 * No network access, no process.exit, no console output - see
 * tests/tools/security/gate-core.test.js. tools/security/scan.mjs is the
 * thin CLI wrapper that calls osv-scanner, fetches EPSS/KEV, and prints
 * what these functions compute.
 */

const { compareVersions, satisfiesRange, upperBoundFromRange } = require('./semver-lite.js');

const SEVERITY_ORDER = ['unknown', 'low', 'medium', 'high', 'critical'];

/**
 * Normalise an OSV `database_specific.severity` string (GHSA-flavoured:
 * LOW/MODERATE/HIGH/CRITICAL) to our four-bucket scale.
 */
function severityFromLabel(label) {
    if (!label) {
        return null;
    }
    const normalised = String(label).toUpperCase();
    if (normalised === 'MODERATE') {
        return 'medium';
    }
    if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalised)) {
        return normalised.toLowerCase();
    }
    return null;
}

/**
 * Very small, dependency-free CVSS v3.x base score calculator, used only
 * as a fallback when an OSV vulnerability has a CVSS vector but no
 * `database_specific.severity` label (common for non-GHSA sources).
 * Returns a 0-10 base score, or null if the vector cannot be parsed.
 */
function cvss3BaseScore(vector) {
    if (typeof vector !== 'string' || !vector.startsWith('CVSS:3')) {
        return null;
    }
    const parts = Object.fromEntries(
        vector.split('/').slice(1).map(p => p.split(':'))
    );

    const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[parts.AV];
    const ac = { L: 0.77, H: 0.44 }[parts.AC];
    const ui = { N: 0.85, R: 0.62 }[parts.UI];
    const s = parts.S;
    const pr = {
        N: { U: 0.85, C: 0.85 },
        L: { U: 0.62, C: 0.68 },
        H: { U: 0.27, C: 0.5 }
    }[parts.PR]?.[s];
    const cia = { N: 0, L: 0.22, H: 0.56 };
    const c = cia[parts.C];
    const i = cia[parts.I];
    const a = cia[parts.A];

    if ([av, ac, ui, pr, c, i, a].some(v => v === undefined)) {
        return null;
    }

    const iss = 1 - (1 - c) * (1 - i) * (1 - a);
    const impact = s === 'U' ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
    const exploitability = 8.22 * av * ac * pr * ui;

    if (impact <= 0) {
        return 0;
    }

    const base = s === 'U' ? impact + exploitability : 1.08 * (impact + exploitability);
    return Math.ceil(Math.min(base, 10) * 10) / 10;
}

function severityFromScore(score) {
    if (score === null || score === undefined) {
        return null;
    }
    if (score >= 9) {
        return 'critical';
    }
    if (score >= 7) {
        return 'high';
    }
    if (score >= 4) {
        return 'medium';
    }
    if (score > 0) {
        return 'low';
    }
    return null;
}

/**
 * Normalise the severity of a single OSV vulnerability record to one of
 * 'critical' | 'high' | 'medium' | 'low' | 'unknown'.
 */
function normalizeSeverity(vulnerability) {
    const label = severityFromLabel(vulnerability?.database_specific?.severity);
    if (label) {
        return label;
    }

    const severities = vulnerability?.severity || [];
    for (const entry of severities) {
        if (entry.type === 'CVSS_V3' || entry.type === 'CVSS_V4') {
            const score = cvss3BaseScore(entry.score);
            const fromScore = severityFromScore(score);
            if (fromScore) {
                return fromScore;
            }
        }
        if (typeof entry.score === 'number') {
            const fromScore = severityFromScore(entry.score);
            if (fromScore) {
                return fromScore;
            }
        }
    }

    return 'unknown';
}

function severityAtLeast(severity, threshold) {
    return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

/**
 * CVE ids among a vulnerability's aliases (its own id is usually the
 * GHSA id; OSV cross-references the CVE, if any, via `aliases`).
 */
function extractCveAliases(vulnerability) {
    return (vulnerability?.aliases || []).filter(id => /^CVE-\d{4}-\d+$/i.test(id));
}

/**
 * All ids (primary id + aliases) a vulnerability is known by, used to
 * match against exceptions and EPSS/KEV data keyed by either GHSA or CVE.
 */
function allIds(vulnerability) {
    const ids = new Set();
    if (vulnerability?.id) {
        ids.add(vulnerability.id);
    }
    for (const alias of vulnerability?.aliases || []) {
        ids.add(alias);
    }
    return [...ids];
}

/**
 * Best-effort fixed version for a vulnerability, ignoring which specific
 * range/branch it came from. Kept for simple single-range cases (and
 * backwards compatibility); `evaluateAffectedness` below is what
 * `parseOsvScanOutput` actually uses, since it correctly picks the range
 * that contains the installed version rather than always the first one
 * (see its doc comment for why that distinction matters).
 */
function extractFixedVersion(vulnerability) {
    for (const affected of vulnerability?.affected || []) {
        for (const range of affected.ranges || []) {
            for (const event of range.events || []) {
                if (event.fixed) {
                    return event.fixed;
                }
            }
        }
        const rangeText = affected.database_specific?.last_known_affected_version_range;
        const upperBound = typeof rangeText === 'string' ? upperBoundFromRange(rangeText) : null;
        if (upperBound) {
            return upperBound;
        }
    }
    return null;
}

/**
 * Decides whether `installedVersion` of `packageName` is actually affected
 * by an OSV vulnerability record, and if so which version fixes it.
 *
 * This matters for two real cases seen in practice:
 *
 * 1. Multi-branch advisories (e.g. GHSA-96hv-2xvq-fx4p for `ws`, which has
 *    four separate `affected` entries, one per major-version branch, each
 *    with its own `fixed` event: 1.x->5.2.5, 6.x->6.2.4, 7.x->7.5.11,
 *    8.x->8.21.0). Naively returning the first `fixed` event found (as the
 *    old `extractFixedVersion` did) reports the wrong fix for every branch
 *    but the first - e.g. suggesting `ws@8.18.3` should upgrade to 5.2.5,
 *    which is a downgrade. This function evaluates each range's
 *    introduced/fixed (or last_affected) interval against the installed
 *    version with a real semver comparator and only uses the fixed version
 *    from the range that actually contains it.
 *
 * 2. Advisories with no fixed npm release at all (e.g. `xlsx`'s
 *    GHSA-4r6h-8v6p-xvw6/GHSA-5pgg-2g8v-p4x9: the real fix was only ever
 *    published to the SheetJS CDN, never to the npm registry). OSV then
 *    has no `fixed`/`last_affected` event - only `introduced: "0"` - which
 *    literally means "every version is affected" if read naively. GHSA
 *    still records the true upper bound in the affected entry's
 *    `database_specific.last_known_affected_version_range` (e.g.
 *    "< 0.19.3"). This function evaluates the installed version against
 *    that range and reports the package as NOT actually affected once it
 *    is upgraded past that bound (e.g. `xlsx@0.20.3`), even though the
 *    open-ended OSV range alone can't express that.
 *
 * @returns {{ affected: boolean, fixedVersion: string|null, reason: string|null }}
 *   `reason` is set (human-readable) whenever a range hint was used to
 *   decide `affected: false`, for the "not affected per advisory range"
 *   report/log section.
 */
function evaluateAffectedness(vulnerability, packageName, installedVersion) {
    const allAffected = vulnerability?.affected || [];
    const relevant = allAffected.filter(a => !a.package?.name || a.package.name === packageName);
    const entries = relevant.length > 0 ? relevant : allAffected;

    let affected = false;
    let fixedVersion = null;
    let reason = null;

    for (const affectedEntry of entries) {
        const rangeHint = affectedEntry.database_specific?.last_known_affected_version_range;

        for (const range of affectedEntry.ranges || []) {
            if (range.type !== 'SEMVER') {
                continue;
            }
            const events = range.events || [];
            const introduced = events.find(e => e.introduced !== undefined)?.introduced;
            const fixedEvent = events.find(e => e.fixed !== undefined);
            const lastAffectedEvent = events.find(e => e.last_affected !== undefined);

            const geIntroduced = introduced === undefined ||
                compareVersions(installedVersion, introduced) >= 0;

            if (fixedEvent || lastAffectedEvent) {
                // Closed (or half-open) interval expressed directly by OSV
                // events - the normal, well-formed case. Only the range
                // whose interval actually contains the installed version
                // may set fixedVersion.
                const belowEnd = fixedEvent
                    ? compareVersions(installedVersion, fixedEvent.fixed) < 0
                    : compareVersions(installedVersion, lastAffectedEvent.last_affected) <= 0;

                if (geIntroduced && belowEnd) {
                    affected = true;
                    if (fixedEvent && fixedVersion === null) {
                        fixedVersion = fixedEvent.fixed;
                    }
                }
                continue;
            }

            // Open-ended range (no fixed/last_affected event at all). Fall
            // back to GHSA's last_known_affected_version_range hint, if
            // present, to determine both whether this version is really
            // affected and what the real fix version is.
            if (typeof rangeHint === 'string') {
                const satisfiesHint = satisfiesRange(installedVersion, rangeHint);
                if (satisfiesHint === null) {
                    // Unparseable hint: can't verify exclusion, so stay
                    // conservative and treat it as affected with an
                    // unknown fix rather than silently dropping a finding.
                    affected = true;
                } else if (satisfiesHint) {
                    affected = true;
                    const bound = upperBoundFromRange(rangeHint);
                    if (bound && fixedVersion === null) {
                        fixedVersion = bound;
                    }
                } else {
                    reason = `installed version ${installedVersion} does not satisfy the advisory's ` +
                        `known-affected range (${rangeHint})`;
                }
                continue;
            }

            // No hint and no upper bound at all: nothing tells us this
            // version is safe, so treat the open-ended range at face value.
            if (geIntroduced) {
                affected = true;
            }
        }
    }

    return { affected, fixedVersion, reason: affected ? null : reason };
}

/**
 * Flatten osv-scanner's JSON output (osv-scanner scan source --format json)
 * into one finding per package+vulnerability. `scope` and `sourcePath` are
 * carried through for reporting/SARIF location purposes.
 *
 * Findings osv-scanner reports but that `evaluateAffectedness` determines
 * are not actually affected (see its doc comment) get `affected: false`
 * and a `notAffectedReason`; callers (see scan.mjs) must exclude these
 * from the gate and from SARIF, but should still surface them for
 * transparency (they are still what osv-scanner reported).
 */
function parseOsvScanOutput(osvJson, { scope, sourcePath } = {}) {
    const findings = [];
    for (const result of osvJson?.results || []) {
        const resolvedSourcePath = sourcePath || result.source?.path;
        for (const pkg of result.packages || []) {
            for (const vulnerability of pkg.vulnerabilities || []) {
                const { affected, fixedVersion, reason } = evaluateAffectedness(
                    vulnerability, pkg.package.name, pkg.package.version
                );
                findings.push({
                    scope,
                    sourcePath: resolvedSourcePath,
                    packageName: pkg.package.name,
                    packageVersion: pkg.package.version,
                    ecosystem: pkg.package.ecosystem,
                    id: vulnerability.id,
                    aliases: vulnerability.aliases || [],
                    cveIds: extractCveAliases(vulnerability),
                    summary: vulnerability.summary || vulnerability.details?.slice(0, 200) || '',
                    severity: normalizeSeverity(vulnerability),
                    affected,
                    notAffectedReason: reason,
                    fixedVersion,
                    references: (vulnerability.references || []).map(r => r.url),
                    epss: null,
                    kev: false
                });
            }
        }
    }
    return findings;
}

/**
 * Splits findings into those osv-scanner AND our own range evaluation
 * agree are affected, versus those excluded by
 * `database_specific.last_known_affected_version_range` (see
 * `evaluateAffectedness`). Callers should gate/SARIF only `affected`, but
 * still report `notAffected` for transparency.
 */
function partitionByAffected(findings) {
    const affected = [];
    const notAffected = [];
    for (const finding of findings) {
        (finding.affected === false ? notAffected : affected).push(finding);
    }
    return { affected, notAffected };
}

/**
 * Merge EPSS scores (keyed by CVE id, values 0-1) and a KEV id set (GHSA
 * or CVE) into a list of findings. Returns a new array; does not mutate.
 */
function enrichFindings(findings, { epssByCve = {}, kevIds = new Set() } = {}) {
    return findings.map(finding => {
        let epss = null;
        for (const cve of finding.cveIds) {
            if (epssByCve[cve] !== undefined && epssByCve[cve] !== null) {
                epss = epss === null ? epssByCve[cve] : Math.max(epss, epssByCve[cve]);
            }
        }
        const kev = allIds(finding).some(id => kevIds.has(id)) ||
            finding.cveIds.some(id => kevIds.has(id));
        return { ...finding, epss, kev };
    });
}

/**
 * Load and validate the exceptions file's entries against `today`
 * (a YYYY-MM-DD string). Returns { valid, expired } - both keep all
 * fields plus is used for the unused-exception warning after gating.
 */
function partitionExceptions(exceptions, today) {
    const valid = [];
    const expired = [];
    for (const exception of exceptions || []) {
        if (exception.expires && exception.expires < today) {
            expired.push(exception);
        } else {
            valid.push(exception);
        }
    }
    return { valid, expired };
}

/**
 * Does `exception` cover `finding`? Matches on any alias id and, when the
 * exception names a package, requires the package to match too.
 */
function exceptionMatches(exception, finding) {
    const ids = new Set(allIds({ id: finding.id, aliases: finding.aliases }));
    if (!ids.has(exception.id)) {
        return false;
    }
    if (exception.package && exception.package !== finding.packageName) {
        return false;
    }
    return true;
}

/**
 * Core gate rule (bundle scope only, see scan.mjs): a finding blocks the
 * gate when it is critical/high AND (a fixed version exists OR it is a
 * known-exploited (KEV) vuln), OR unconditionally when it is a KEV finding
 * regardless of severity - unless a valid, unexpired exception covers it.
 */
function isBlockingFinding(finding, { minSeverity = 'high' } = {}) {
    if (finding.kev) {
        return true;
    }
    return severityAtLeast(finding.severity, minSeverity) && Boolean(finding.fixedVersion);
}

/**
 * Evaluate the full gate for one scope's findings.
 *
 * @returns {{
 *   pass: boolean,
 *   blockingFindings: object[],
 *   exemptedFindings: object[],
 *   nonBlockingFindings: object[],
 *   expiredExceptions: object[],
 *   unusedExceptions: object[]
 * }}
 */
function evaluateGate(findings, exceptions, { today = new Date().toISOString().slice(0, 10), minSeverity = 'high', blocking = true } = {}) {
    const { valid: validExceptions, expired: expiredExceptions } = partitionExceptions(exceptions, today);

    const blockingFindings = [];
    const exemptedFindings = [];
    const nonBlockingFindings = [];
    const usedExceptionKeys = new Set();

    for (const finding of findings) {
        const matchingException = validExceptions.find(exception => exceptionMatches(exception, finding));
        const wouldBlock = blocking && isBlockingFinding(finding, { minSeverity });

        if (wouldBlock && matchingException) {
            usedExceptionKeys.add(matchingException.id + '|' + (matchingException.package || ''));
            exemptedFindings.push({ ...finding, exception: matchingException });
        } else if (wouldBlock) {
            blockingFindings.push(finding);
        } else {
            nonBlockingFindings.push(finding);
        }
    }

    const unusedExceptions = validExceptions.filter(
        exception => !usedExceptionKeys.has(exception.id + '|' + (exception.package || ''))
    );

    // Expired exceptions are themselves a gate failure, independent of
    // whether they would have matched anything.
    const pass = blockingFindings.length === 0 && expiredExceptions.length === 0;

    return {
        pass,
        blockingFindings,
        exemptedFindings,
        nonBlockingFindings,
        expiredExceptions,
        unusedExceptions
    };
}

const SARIF_LEVEL_BY_SEVERITY = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
    unknown: 'note'
};

/**
 * Build a minimal, valid SARIF 2.1.0 log for GitHub code scanning from a
 * flat findings list (mixing scopes is fine; each result carries its own
 * location).
 */
function buildSarif(findings, { toolName = 'agentlet-core-vuln-scan', toolVersion = '0.0.0', lockfilePath = 'package-lock.json' } = {}) {
    const ruleIds = new Set();
    const rules = [];
    const results = [];

    for (const finding of findings) {
        const ruleId = finding.id;
        if (!ruleIds.has(ruleId)) {
            ruleIds.add(ruleId);
            const helpLines = [
                finding.summary,
                finding.fixedVersion ? `Fixed in: ${finding.fixedVersion}` : 'No fixed version published yet.',
                `EPSS: ${finding.epss === null || finding.epss === undefined ? 'unknown' : finding.epss}`,
                `Known Exploited (KEV): ${finding.kev ? 'yes' : 'no'}`,
                ...finding.references.map(url => `Advisory: ${url}`)
            ].filter(Boolean);

            rules.push({
                id: ruleId,
                name: ruleId.replace(/[^a-zA-Z0-9]/g, '_'),
                shortDescription: { text: finding.summary || ruleId },
                fullDescription: { text: finding.summary || ruleId },
                help: { text: helpLines.join('\n') },
                properties: {
                    tags: ['security', 'dependency', finding.severity],
                    'security-severity': String(finding.cvssScore ?? '')
                }
            });
        }

        results.push({
            ruleId,
            level: SARIF_LEVEL_BY_SEVERITY[finding.severity] || 'warning',
            message: {
                text: `${finding.packageName}@${finding.packageVersion} is affected by ${ruleId}` +
                    (finding.fixedVersion ? ` (fixed in ${finding.fixedVersion})` : ' (no fix available yet)') +
                    (finding.kev ? ' - listed in CISA KEV.' : '')
            },
            locations: [
                {
                    physicalLocation: {
                        artifactLocation: { uri: finding.sourcePath || lockfilePath },
                        region: { startLine: 1 }
                    }
                }
            ],
            // Own key: primaryLocationLineHash is computed by the upload
            // action from the file contents, and every result points at
            // line 1, so it cannot tell findings apart.
            partialFingerprints: {
                'dependencyVulnerability/v1': `${finding.packageName}|${ruleId}|${finding.scope || ''}`
            }
        });
    }

    return {
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        runs: [
            {
                tool: {
                    driver: {
                        name: toolName,
                        version: toolVersion,
                        informationUri: 'https://github.com/agentlet/agentlet-core',
                        rules
                    }
                },
                results
            }
        ]
    };
}

module.exports = {
    SEVERITY_ORDER,
    normalizeSeverity,
    cvss3BaseScore,
    severityFromScore,
    severityAtLeast,
    extractCveAliases,
    extractFixedVersion,
    evaluateAffectedness,
    allIds,
    parseOsvScanOutput,
    partitionByAffected,
    enrichFindings,
    partitionExceptions,
    exceptionMatches,
    isBlockingFinding,
    evaluateGate,
    buildSarif
};
