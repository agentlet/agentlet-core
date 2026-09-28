const {
    normalizeSeverity,
    cvss3BaseScore,
    extractCveAliases,
    extractFixedVersion,
    parseOsvScanOutput,
    enrichFindings,
    partitionExceptions,
    exceptionMatches,
    isBlockingFinding,
    evaluateGate,
    buildSarif
} = require('../../../tools/security/lib/gate-core.js');

function makeOsvVulnerability(overrides = {}) {
    return {
        id: 'GHSA-4r6h-8v6p-xvw6',
        aliases: ['CVE-2023-30533'],
        summary: 'Prototype Pollution in sheetJS',
        database_specific: { severity: 'HIGH' },
        affected: [
            {
                database_specific: { last_known_affected_version_range: '< 0.19.3' },
                ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }]
            }
        ],
        references: [{ type: 'ADVISORY', url: 'https://example.com/advisory' }],
        ...overrides
    };
}

function makeOsvScanOutput(vulnerabilities, { name = 'xlsx', version = '0.18.5' } = {}) {
    return {
        results: [
            {
                source: { path: 'reports/security/sbom-bundle.cdx.json', type: 'sbom' },
                packages: [
                    {
                        package: { name, version, ecosystem: 'npm' },
                        vulnerabilities
                    }
                ]
            }
        ]
    };
}

describe('normalizeSeverity', () => {
    test('prefers the GHSA-style database_specific.severity label', () => {
        expect(normalizeSeverity({ database_specific: { severity: 'HIGH' } })).toBe('high');
    });

    test('maps MODERATE to medium', () => {
        expect(normalizeSeverity({ database_specific: { severity: 'MODERATE' } })).toBe('medium');
    });

    test('falls back to a CVSS v3 vector when no label is present', () => {
        // AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H -> base score 9.8 (critical)
        const severity = normalizeSeverity({
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }]
        });
        expect(severity).toBe('critical');
    });

    test('returns unknown when nothing usable is present', () => {
        expect(normalizeSeverity({})).toBe('unknown');
    });
});

describe('cvss3BaseScore', () => {
    test('returns null for a non-CVSS3 vector', () => {
        expect(cvss3BaseScore('not-a-vector')).toBeNull();
    });

    test('computes a plausible score for a low-severity vector', () => {
        const score = cvss3BaseScore('CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N');
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(4);
    });
});

describe('extractCveAliases / extractFixedVersion', () => {
    test('extracts CVE ids from aliases', () => {
        expect(extractCveAliases({ aliases: ['CVE-2023-30533', 'GHSA-4r6h-8v6p-xvw6'] }))
            .toEqual(['CVE-2023-30533']);
    });

    test('prefers an explicit fixed event over the range hint', () => {
        const vuln = makeOsvVulnerability({
            affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.3' }] }] }]
        });
        expect(extractFixedVersion(vuln)).toBe('1.2.3');
    });

    test('falls back to parsing last_known_affected_version_range', () => {
        expect(extractFixedVersion(makeOsvVulnerability())).toBe('0.19.3');
    });

    test('returns null when no fix information exists', () => {
        expect(extractFixedVersion({ affected: [{ ranges: [{ events: [{ introduced: '0' }] }] }] })).toBeNull();
    });
});

describe('parseOsvScanOutput', () => {
    test('flattens one finding per package+vulnerability', () => {
        const output = makeOsvScanOutput([makeOsvVulnerability()]);
        const findings = parseOsvScanOutput(output, { scope: 'bundle' });

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
            scope: 'bundle',
            packageName: 'xlsx',
            packageVersion: '0.18.5',
            id: 'GHSA-4r6h-8v6p-xvw6',
            severity: 'high',
            fixedVersion: '0.19.3'
        });
    });

    test('handles empty results gracefully', () => {
        expect(parseOsvScanOutput({ results: [] })).toEqual([]);
        expect(parseOsvScanOutput({})).toEqual([]);
    });
});

describe('enrichFindings', () => {
    test('attaches the max EPSS score across CVE aliases and KEV membership', () => {
        const findings = [{ cveIds: ['CVE-2023-30533'], id: 'GHSA-4r6h-8v6p-xvw6', aliases: ['CVE-2023-30533'] }];
        const enriched = enrichFindings(findings, {
            epssByCve: { 'CVE-2023-30533': 0.42 },
            kevIds: new Set(['GHSA-4r6h-8v6p-xvw6'])
        });
        expect(enriched[0].epss).toBe(0.42);
        expect(enriched[0].kev).toBe(true);
    });

    test('leaves epss null and kev false when no data matches', () => {
        const findings = [{ cveIds: [], id: 'GHSA-x', aliases: [] }];
        const enriched = enrichFindings(findings, { epssByCve: {}, kevIds: new Set() });
        expect(enriched[0].epss).toBeNull();
        expect(enriched[0].kev).toBe(false);
    });
});

describe('exceptions: partitioning, matching, expiry', () => {
    test('partitions expired vs valid entries against a given "today"', () => {
        const exceptions = [
            { id: 'GHSA-a', expires: '2020-01-01' },
            { id: 'GHSA-b', expires: '2099-01-01' }
        ];
        const { valid, expired } = partitionExceptions(exceptions, '2026-01-01');
        expect(valid).toEqual([{ id: 'GHSA-b', expires: '2099-01-01' }]);
        expect(expired).toEqual([{ id: 'GHSA-a', expires: '2020-01-01' }]);
    });

    test('matches on any alias id', () => {
        const finding = { id: 'GHSA-4r6h-8v6p-xvw6', aliases: ['CVE-2023-30533'], packageName: 'xlsx' };
        expect(exceptionMatches({ id: 'CVE-2023-30533' }, finding)).toBe(true);
        expect(exceptionMatches({ id: 'GHSA-4r6h-8v6p-xvw6' }, finding)).toBe(true);
        expect(exceptionMatches({ id: 'GHSA-unrelated' }, finding)).toBe(false);
    });

    test('requires the package to match when the exception names one', () => {
        const finding = { id: 'GHSA-4r6h-8v6p-xvw6', aliases: [], packageName: 'xlsx' };
        expect(exceptionMatches({ id: 'GHSA-4r6h-8v6p-xvw6', package: 'xlsx' }, finding)).toBe(true);
        expect(exceptionMatches({ id: 'GHSA-4r6h-8v6p-xvw6', package: 'other-pkg' }, finding)).toBe(false);
    });
});

describe('isBlockingFinding', () => {
    test('blocks high/critical findings with a known fix', () => {
        expect(isBlockingFinding({ severity: 'high', fixedVersion: '1.0.0', kev: false })).toBe(true);
        expect(isBlockingFinding({ severity: 'critical', fixedVersion: '1.0.0', kev: false })).toBe(true);
    });

    test('does not block high severity with no fix available', () => {
        expect(isBlockingFinding({ severity: 'high', fixedVersion: null, kev: false })).toBe(false);
    });

    test('does not block medium/low severity even with a fix', () => {
        expect(isBlockingFinding({ severity: 'medium', fixedVersion: '1.0.0', kev: false })).toBe(false);
    });

    test('always blocks a KEV finding regardless of severity or fix', () => {
        expect(isBlockingFinding({ severity: 'low', fixedVersion: null, kev: true })).toBe(true);
    });
});

describe('evaluateGate', () => {
    const blockingFinding = { id: 'GHSA-a', aliases: [], packageName: 'xlsx', severity: 'high', fixedVersion: '1.0.0', kev: false };
    const nonBlockingFinding = { id: 'GHSA-b', aliases: [], packageName: 'xlsx', severity: 'medium', fixedVersion: null, kev: false };

    test('fails when a blocking finding has no covering exception', () => {
        const result = evaluateGate([blockingFinding], [], { today: '2026-01-01' });
        expect(result.pass).toBe(false);
        expect(result.blockingFindings).toHaveLength(1);
    });

    test('passes when a valid exception covers the only blocking finding', () => {
        const result = evaluateGate([blockingFinding], [{ id: 'GHSA-a', package: 'xlsx', expires: '2099-01-01' }], { today: '2026-01-01' });
        expect(result.pass).toBe(true);
        expect(result.exemptedFindings).toHaveLength(1);
        expect(result.blockingFindings).toHaveLength(0);
    });

    test('fails when the only covering exception is expired, even though it would otherwise match', () => {
        const result = evaluateGate([blockingFinding], [{ id: 'GHSA-a', package: 'xlsx', expires: '2020-01-01' }], { today: '2026-01-01' });
        expect(result.pass).toBe(false);
        expect(result.expiredExceptions).toHaveLength(1);
        expect(result.blockingFindings).toHaveLength(1);
    });

    test('reports unused exceptions without failing the gate', () => {
        const result = evaluateGate([nonBlockingFinding], [{ id: 'GHSA-unrelated', expires: '2099-01-01' }], { today: '2026-01-01' });
        expect(result.pass).toBe(true);
        expect(result.unusedExceptions).toHaveLength(1);
    });

    test('never blocks anything when blocking: false (reporting scope)', () => {
        const result = evaluateGate([blockingFinding], [], { today: '2026-01-01', blocking: false });
        expect(result.pass).toBe(true);
        expect(result.blockingFindings).toHaveLength(0);
        expect(result.nonBlockingFindings).toHaveLength(1);
    });
});

describe('buildSarif', () => {
    test('produces one rule per unique id and one result per finding', () => {
        const findings = [
            { id: 'GHSA-a', severity: 'high', packageName: 'xlsx', packageVersion: '0.18.5', fixedVersion: '1.0.0', kev: false, summary: 's', references: [], sourcePath: 'package.json', scope: 'bundle' },
            { id: 'GHSA-a', severity: 'high', packageName: 'xlsx', packageVersion: '0.18.5', fixedVersion: '1.0.0', kev: false, summary: 's', references: [], sourcePath: 'package.json', scope: 'bundle' },
            { id: 'GHSA-b', severity: 'critical', packageName: 'foo', packageVersion: '1.0.0', fixedVersion: null, kev: true, summary: 't', references: ['https://x'], sourcePath: 'package-lock.json', scope: 'lockfile' }
        ];
        const sarif = buildSarif(findings, { toolVersion: '2.1.0' });

        expect(sarif.version).toBe('2.1.0');
        expect(sarif.runs[0].tool.driver.rules).toHaveLength(2);
        expect(sarif.runs[0].results).toHaveLength(3);
        expect(sarif.runs[0].results[2].level).toBe('error');
        expect(sarif.runs[0].results[2].message.text).toContain('KEV');
    });

    test('handles an empty findings list', () => {
        const sarif = buildSarif([]);
        expect(sarif.runs[0].results).toEqual([]);
        expect(sarif.runs[0].tool.driver.rules).toEqual([]);
    });
});
