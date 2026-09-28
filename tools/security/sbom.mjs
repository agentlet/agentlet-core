#!/usr/bin/env node
/**
 * Builds a CycloneDX SBOM of what agentlet-core's published bundles
 * actually SHIP, using the esbuild metafiles written by tools/build.js
 * (metafile: true on every npm-published + bookmarklet/extension target).
 *
 * Why this exists instead of a filesystem/container scanner: esbuild
 * inlines every bundled dependency into a single file, so a tool like
 * syft finds zero components in dist/ or in the npm pack tarball. The
 * metafile is the only reliable inventory of what a bundle contains.
 *
 * Usage:
 *   npm run build          # writes reports/security/meta/*.meta.json
 *   npm run security:sbom  # reads them, writes reports/security/sbom-bundle.cdx.json
 *
 * Output directory (reports/security/) is gitignored: this is a build
 * artifact, regenerated on demand, never committed and never published
 * (package.json's "files" allowlist does not mention it - see
 * `npm pack --dry-run`).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPackageDirs, dedupePackages, buildSbom } from './lib/sbom-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');
const metaDir = path.join(rootDir, 'reports', 'security', 'meta');
const outDir = path.join(rootDir, 'reports', 'security');
const outFile = path.join(outDir, 'sbom-bundle.cdx.json');

function fail(message) {
    console.error(`❌ ${message}`);
    process.exit(1);
}

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadMetafiles() {
    if (!existsSync(metaDir)) {
        fail(`No esbuild metafiles found at ${metaDir}. Run \`npm run build\` first.`);
    }
    const files = readdirSync(metaDir).filter(f => f.endsWith('.meta.json'));
    if (files.length === 0) {
        fail(`No *.meta.json files found in ${metaDir}. Run \`npm run build\` first.`);
    }
    return files.map(f => ({ name: f.replace(/\.meta\.json$/, ''), metafile: readJson(path.join(metaDir, f)) }));
}

/**
 * Resolve one bundled package's package.json using the exact
 * node_modules directory the metafile pointed at (handles scoped and
 * nested node_modules, and packages pinned at different versions in
 * different places in the tree).
 */
function resolvePackage(packageDir) {
    const packageJsonPath = path.join(rootDir, packageDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
        console.warn(`⚠️ Could not find package.json for ${packageDir}, skipping`);
        return null;
    }
    const pkg = readJson(packageJsonPath);
    let license;
    if (typeof pkg.license === 'string') {
        license = pkg.license;
    } else if (pkg.license && pkg.license.type) {
        license = pkg.license.type;
    } else if (Array.isArray(pkg.licenses) && pkg.licenses[0]) {
        license = pkg.licenses[0].type;
    }
    return {
        name: pkg.name,
        version: pkg.version,
        license,
        description: pkg.description
    };
}

function main() {
    const entries = loadMetafiles();
    const metafiles = entries.map(e => e.metafile);
    const packageDirs = collectPackageDirs(metafiles);

    const resolved = packageDirs
        .map(resolvePackage)
        .filter(Boolean);
    const packages = dedupePackages(resolved);

    const rootPkg = readJson(path.join(rootDir, 'package.json'));
    const sbom = buildSbom({
        rootComponent: {
            name: rootPkg.name,
            version: rootPkg.version,
            description: rootPkg.description
        },
        packages
    });

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, JSON.stringify(sbom, null, 2));

    console.log(`📦 Shipped-inventory SBOM: ${packages.length} bundled package(s) across ${entries.length} target(s)`);
    for (const pkg of packages.slice().sort((a, b) => a.name.localeCompare(b.name))) {
        console.log(`   - ${pkg.name}@${pkg.version}${pkg.license ? ` (${pkg.license})` : ''}`);
    }
    console.log(`📄 Written to ${path.relative(rootDir, outFile)}`);
}

main();
