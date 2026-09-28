#!/usr/bin/env node
/**
 * Dependency vulnerability scan + blocking quality gate.
 *
 * Runs osv-scanner (must be on PATH - see .github/WORKFLOWS.md for how CI
 * installs a pinned release binary, and `brew install osv-scanner` for
 * local use) in two scopes:
 *
 *  - "bundle":   reports/security/sbom-bundle.cdx.json (from `npm run
 *                security:sbom`, run after `npm run build`). What
 *                agentlet-core actually SHIPS. BLOCKING.
 *  - "lockfile": package-lock.json, the full install tree (build tooling,
 *                test runners, etc). REPORTING ONLY, never blocks - a dev
 *                dependency CVE cannot reach a consumer of the published
 *                package.
 *
 * Findings are enriched with EPSS (exploitation probability) and CISA KEV
 * (known-exploited) status, best-effort: a network failure here is a
 * warning, never a scan failure. See tools/security/lib/gate-core.js for
 * the pure severity/gate/SARIF logic this script drives.
 *
 * Usage: npm run security:scan -- [options]
 *   --min-severity=<low|medium|high|critical>  default: high
 *   --bundle-sbom=<path>     default: reports/security/sbom-bundle.cdx.json
 *   --lockfile=<path>        default: package-lock.json
 *   --exceptions=<path>      default: security/vulnerability-exceptions.json
 *   --out-dir=<path>         default: reports/security
 *   --skip-lockfile          only scan the bundle scope
 *   --offline                skip EPSS/KEV network enrichment
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseOsvScanOutput,
    enrichFindings,
    evaluateGate,
    buildSarif,
    SEVERITY_ORDER
} from './lib/gate-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');

function parseArgs(argv) {
    const options = {
        minSeverity: 'high',
        bundleSbom: path.join('reports', 'security', 'sbom-bundle.cdx.json'),
        lockfile: 'package-lock.json',
        exceptions: path.join('security', 'vulnerability-exceptions.json'),
        outDir: path.join('reports', 'security'),
        skipLockfile: false,
        offline: false
    };
    for (const arg of argv) {
        if (arg.startsWith('--min-severity=')) {
            options.minSeverity = arg.split('=')[1];
        } else if (arg.startsWith('--bundle-sbom=')) {
            options.bundleSbom = arg.split('=')[1];
        } else if (arg.startsWith('--lockfile=')) {
            options.lockfile = arg.split('=')[1];
        } else if (arg.startsWith('--exceptions=')) {
            options.exceptions = arg.split('=')[1];
        } else if (arg.startsWith('--out-dir=')) {
            options.outDir = arg.split('=')[1];
        } else if (arg === '--skip-lockfile') {
            options.skipLockfile = true;
        } else if (arg === '--offline') {
            options.offline = true;
        }
    }
    if (!SEVERITY_ORDER.includes(options.minSeverity)) {
        throw new Error(`Invalid --min-severity=${options.minSeverity}. Must be one of ${SEVERITY_ORDER.join(', ')}.`);
    }
    return options;
}

function checkOsvScannerAvailable() {
    try {
        execFileSync('osv-scanner', ['--version'], { stdio: 'pipe' });
    } catch {
        console.error([
            '❌ osv-scanner is not on PATH.',
            '',
            '   Install it locally with: brew install osv-scanner',
            '   (CI installs a pinned release binary - see .github/workflows/security.yml).'
        ].join('\n'));
        process.exit(1);
    }
}

/**
 * Run `osv-scanner scan source` against either an SBOM or a lockfile and
 * return its parsed JSON output. osv-scanner exits non-zero whenever it
 * finds any vulnerability at all, which is expected and not an error here
 * (we compute our own gate from the JSON) - only a missing/invalid target
 * or a JSON parse failure is treated as a hard failure.
 */
function runOsvScanner({ sbomPath, lockfilePath }) {
    const args = ['scan', 'source', '--format', 'json'];
    if (sbomPath) {
        args.push('--sbom', sbomPath);
    } else if (lockfilePath) {
        args.push('-L', lockfilePath);
    }

    let stdout;
    try {
        stdout = execFileSync('osv-scanner', args, { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
        // osv-scanner exits 1 when vulnerabilities are found - stdout still
        // has the JSON we need. Any other failure (bad target, exit >1
        // with no stdout, spawn failure) is real.
        if (error.stdout) {
            stdout = error.stdout;
        } else {
            throw new Error(`osv-scanner failed: ${error.message}`);
        }
    }

    try {
        return JSON.parse(stdout);
    } catch (parseError) {
        throw new Error(`Could not parse osv-scanner JSON output: ${parseError.message}`);
    }
}

async function fetchEpss(cveIds, { offline }) {
    if (offline || cveIds.length === 0) {
        return {};
    }
    try {
        const url = `https://api.first.org/data/v1/epss?cve=${cveIds.join(',')}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const body = await response.json();
        const map = {};
        for (const entry of body.data || []) {
            map[entry.cve] = Number(entry.epss);
        }
        return map;
    } catch (error) {
        console.warn(`⚠️ EPSS enrichment unavailable (${error.message}); marking EPSS as unknown.`);
        return {};
    }
}

async function fetchKev({ offline }) {
    if (offline) {
        return new Set();
    }
    try {
        const url = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const body = await response.json();
        return new Set((body.vulnerabilities || []).map(v => v.cveID));
    } catch (error) {
        console.warn(`⚠️ CISA KEV enrichment unavailable (${error.message}); marking KEV as unknown.`);
        return new Set();
    }
}

function severityIcon(severity) {
    return { critical: '🟣', high: '🔴', medium: '🟠', low: '🟡', unknown: '⚪' }[severity] || '⚪';
}

function printTable(title, findings) {
    console.log(`\n${title} (${findings.length} finding${findings.length === 1 ? '' : 's'})`);
    if (findings.length === 0) {
        console.log('  (none)');
        return;
    }
    for (const finding of findings) {
        const fixed = finding.fixedVersion ? `fix: ${finding.fixedVersion}` : 'no fix yet';
        const epss = finding.epss === null || finding.epss === undefined ? 'epss: unknown' : `epss: ${(finding.epss * 100).toFixed(1)}%`;
        const kev = finding.kev ? 'KEV' : '';
        console.log(`  ${severityIcon(finding.severity)} ${finding.severity.padEnd(8)} ${finding.packageName}@${finding.packageVersion}  ${finding.id}  (${fixed}, ${epss}${kev ? `, ${kev}` : ''})`);
    }
}

function buildMarkdownSummary({ bundleGate, lockfileFindings, exceptions }) {
    const lines = ['# Dependency vulnerability scan', ''];

    lines.push('## Bundle scope (blocking)');
    lines.push('');
    lines.push(bundleGate.pass ? '✅ Gate passed.' : '❌ Gate failed.');
    lines.push('');
    if (bundleGate.blockingFindings.length > 0) {
        lines.push('| Severity | Package | Advisory | Fixed | EPSS | KEV |');
        lines.push('|---|---|---|---|---|---|');
        for (const f of bundleGate.blockingFindings) {
            const epss = f.epss === null || f.epss === undefined ? 'unknown' : `${(f.epss * 100).toFixed(1)}%`;
            lines.push(`| ${f.severity} | ${f.packageName}@${f.packageVersion} | [${f.id}](${f.references[0] || ''}) | ${f.fixedVersion || 'none'} | ${epss} | ${f.kev ? 'yes' : 'no'} |`);
        }
        lines.push('');
    }
    if (bundleGate.expiredExceptions.length > 0) {
        lines.push('**Expired exceptions (fail the gate until removed or renewed):**');
        for (const e of bundleGate.expiredExceptions) {
            lines.push(`- \`${e.id}\` (${e.package || 'any package'}), expired ${e.expires}`);
        }
        lines.push('');
    }
    if (bundleGate.unusedExceptions.length > 0) {
        lines.push('**Unused exceptions (no matching finding this run):**');
        for (const e of bundleGate.unusedExceptions) {
            lines.push(`- \`${e.id}\` (${e.package || 'any package'})`);
        }
        lines.push('');
    }

    lines.push('## Lockfile scope (reporting only, never blocks)');
    lines.push('');
    lines.push(`${lockfileFindings.length} finding(s) across the full install tree (build tooling and dev dependencies included).`);
    lines.push('');
    lines.push(`_Exceptions file: \`${exceptions.path}\` (${exceptions.list.length} entr${exceptions.list.length === 1 ? 'y' : 'ies'})._`);

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    checkOsvScannerAvailable();

    const bundleSbomPath = path.join(rootDir, options.bundleSbom);
    if (!existsSync(bundleSbomPath)) {
        console.error(`❌ Bundle SBOM not found at ${options.bundleSbom}. Run \`npm run build && npm run security:sbom\` first.`);
        process.exit(1);
    }

    const exceptionsPath = path.join(rootDir, options.exceptions);
    let exceptionsList = [];
    if (existsSync(exceptionsPath)) {
        const parsed = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
        exceptionsList = Array.isArray(parsed) ? parsed : (parsed.exceptions || []);
    } else {
        console.warn(`⚠️ No exceptions file at ${options.exceptions}; proceeding with zero exceptions.`);
    }

    console.log('🔎 Scanning shipped bundle SBOM (blocking scope)...');
    const bundleRaw = runOsvScanner({ sbomPath: bundleSbomPath });
    let bundleFindings = parseOsvScanOutput(bundleRaw, { scope: 'bundle', sourcePath: 'package.json' });

    let lockfileFindings = [];
    if (!options.skipLockfile) {
        const lockfilePath = path.join(rootDir, options.lockfile);
        if (existsSync(lockfilePath)) {
            console.log('🔎 Scanning package-lock.json (reporting only)...');
            const lockfileRaw = runOsvScanner({ lockfilePath });
            lockfileFindings = parseOsvScanOutput(lockfileRaw, { scope: 'lockfile', sourcePath: options.lockfile });
        } else {
            console.warn(`⚠️ No lockfile found at ${options.lockfile}, skipping lockfile scope.`);
        }
    }

    const allFindings = [...bundleFindings, ...lockfileFindings];
    const allCveIds = [...new Set(allFindings.flatMap(f => f.cveIds))];

    console.log(`🌐 Enriching ${allCveIds.length} CVE id(s) with EPSS + CISA KEV${options.offline ? ' (skipped: --offline)' : ''}...`);
    const [epssByCve, kevIds] = await Promise.all([
        fetchEpss(allCveIds, options),
        fetchKev(options)
    ]);

    bundleFindings = enrichFindings(bundleFindings, { epssByCve, kevIds });
    lockfileFindings = enrichFindings(lockfileFindings, { epssByCve, kevIds });

    const bundleGate = evaluateGate(bundleFindings, exceptionsList, { minSeverity: options.minSeverity, blocking: true });
    // Lockfile scope is reporting-only: never blocks, so evaluate with an
    // always-false blocking rule but keep using the same function for a
    // single source of truth on severity buckets etc.
    const lockfileGate = evaluateGate(lockfileFindings, [], { minSeverity: options.minSeverity, blocking: false });

    printTable('Bundle scope - blocking findings', bundleGate.blockingFindings);
    printTable('Bundle scope - exempted findings (valid exception on file)', bundleGate.exemptedFindings);
    printTable('Lockfile scope - all findings (reporting only)', lockfileGate.nonBlockingFindings);

    if (bundleGate.expiredExceptions.length > 0) {
        console.log(`\n❌ ${bundleGate.expiredExceptions.length} expired exception(s) in ${options.exceptions}:`);
        for (const e of bundleGate.expiredExceptions) {
            console.log(`   - ${e.id} (${e.package || 'any package'}) expired ${e.expires} - remove or renew it.`);
        }
    }
    if (bundleGate.unusedExceptions.length > 0) {
        console.log(`\n⚠️  ${bundleGate.unusedExceptions.length} unused exception(s) in ${options.exceptions} (no matching finding this run):`);
        for (const e of bundleGate.unusedExceptions) {
            console.log(`   - ${e.id} (${e.package || 'any package'})`);
        }
    }

    const outDir = path.join(rootDir, options.outDir);
    mkdirSync(outDir, { recursive: true });

    const rootPkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const sarif = buildSarif(allFindings, { toolName: 'agentlet-core-vuln-scan', toolVersion: rootPkg.version, lockfilePath: options.lockfile });
    writeFileSync(path.join(outDir, 'results.sarif'), JSON.stringify(sarif, null, 2));

    const jsonReport = {
        generatedAt: new Date().toISOString(),
        minSeverity: options.minSeverity,
        bundle: bundleGate,
        lockfile: lockfileGate
    };
    writeFileSync(path.join(outDir, 'scan-report.json'), JSON.stringify(jsonReport, null, 2));

    const markdown = buildMarkdownSummary({ bundleGate, lockfileFindings, exceptions: { path: options.exceptions, list: exceptionsList } });
    if (process.env.GITHUB_STEP_SUMMARY) {
        writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n', { flag: 'a' });
    }
    writeFileSync(path.join(outDir, 'scan-summary.md'), markdown);

    console.log(`\n📄 SARIF:   ${path.relative(rootDir, path.join(outDir, 'results.sarif'))}`);
    console.log(`📄 JSON:    ${path.relative(rootDir, path.join(outDir, 'scan-report.json'))}`);
    console.log(`📄 Summary: ${path.relative(rootDir, path.join(outDir, 'scan-summary.md'))}`);

    if (!bundleGate.pass) {
        console.log('\n❌ Vulnerability gate FAILED (bundle scope).');
        process.exit(1);
    }
    console.log('\n✅ Vulnerability gate passed (bundle scope).');
}

main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
