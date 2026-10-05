#!/usr/bin/env node
/**
 * End-to-end version of tools/verify-node-import.mjs's checks: `npm pack`s
 * agentlet-core the way `npm publish` would (respecting package.json's
 * trimmed "files" list), installs the resulting tarball into a throwaway
 * empty project, and confirms `require('agentlet-core')`,
 * `import('agentlet-core')` and `require('agentlet-core/package.json')`
 * all work there under plain Node (no jsdom) - the exact repro from the
 * original bug report (`npm install agentlet-core` in an empty folder,
 * then `node -e "require('agentlet-core')"` threw
 * `ReferenceError: DOMMatrix is not defined`).
 *
 * This is deliberately NOT wired into `npm run build` /
 * tools/build.js (unlike tools/verify-node-import.mjs, which checks the
 * same import/require/package.json shape directly against dist/ and runs
 * on every build): packing and installing the tarball is slow and needs
 * network/registry access. The package has no runtime "dependencies" since
 * 2.1.1 (hotkeys-js, html2canvas, pdfjs-dist and xlsx are bundled into
 * dist/ and live in devDependencies), so this also proves the bundles need
 * nothing installed next to them. It also checks that every file the core
 * loads on demand (the library chunks, dist/chunks/, the PDF.js worker,
 * cmaps/ and standard_fonts/) made it into the tarball. Run it explicitly
 * instead:
 *
 *   npm run verify:tarball-import
 *
 * (or fold it into `npm run test:scaffold`, which already does a similar
 * pack + install + exercise cycle for the plop-templates/agentlet
 * scaffold - see tools/test-scaffold.js).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function fail(message) {
    console.error(`❌ ${message}`);
    process.exit(1);
}

function run(command, args, options = {}) {
    console.log(`📝 Running: ${command} ${args.join(' ')}${options.cwd ? ` (in ${options.cwd})` : ''}`);
    const result = spawnSync(command, args, { encoding: 'utf8', ...options });
    if (result.error) {
        fail(`Failed to run "${command} ${args.join(' ')}": ${result.error.message}`);
    }
    if (result.status !== 0) {
        console.error(result.stdout);
        console.error(result.stderr);
        fail(`"${command} ${args.join(' ')}" exited with status ${result.status}`);
    }
    return result;
}

if (!existsSync(path.join(rootDir, 'dist', 'agentlet-core.js'))) {
    fail('dist/agentlet-core.js not found. Run `npm run build` first (npm pack below packages whatever is currently in dist/).');
}

const packDestination = mkdtempSync(path.join(tmpdir(), 'agentlet-core-pack-'));
const projectDir = mkdtempSync(path.join(tmpdir(), 'agentlet-core-tarball-consumer-'));

try {
    console.log('📦 Packing agentlet-core with npm pack...');
    const packResult = run('npm', ['pack', '--pack-destination', packDestination, '--json'], { cwd: rootDir });
    const [{ filename, size, files: packedFiles }] = JSON.parse(packResult.stdout);
    const tarballPath = path.join(packDestination, filename);
    if (!existsSync(tarballPath)) {
        fail(`npm pack reported "${filename}" but it was not found at ${tarballPath}`);
    }
    console.log(`✅ Packed tarball: ${tarballPath} (${(size / 1024).toFixed(2)} KB)`);

    // Everything the core fetches at runtime (see src/libraries/LibraryUrls.ts
    // and tools/verify-dist-chunks.mjs) must be in the tarball.
    const packedPaths = packedFiles.map(file => file.path);
    const expectedPacked = [
        'dist/agentlet-core.js',
        'dist/agentlet-core.min.js',
        'dist/agentlet-core.full.min.js',
        'dist/agentlet-core.esm.js',
        'dist/agentlet-xlsx.min.js',
        'dist/agentlet-html2canvas.min.js',
        'dist/agentlet-pdfjs.min.js',
        'dist/pdf.worker.min.mjs'
    ];
    const missingPacked = expectedPacked.filter(file => !packedPaths.includes(file));
    if (missingPacked.length > 0) {
        fail(`The tarball is missing: ${missingPacked.join(', ')}.`);
    }
    const expectedFolders = [
        ['dist/chunks/', 3],
        ['dist/cmaps/', 1],
        ['dist/standard_fonts/', 1]
    ];
    for (const [folder, minimum] of expectedFolders) {
        const count = packedPaths.filter(file => file.startsWith(folder)).length;
        if (count < minimum) {
            fail(`The tarball has ${count} file(s) under ${folder}, expected at least ${minimum}.`);
        }
    }
    if (packedPaths.some(file => file.endsWith('.map'))) {
        fail('The tarball contains source maps; "files" in package.json should only list runtime files.');
    }
    console.log(`✅ The tarball carries the core, its on-demand chunks, the worker, cmaps/ and standard_fonts/ (${packedPaths.length} files).`);

    console.log(`\n📁 Creating empty consumer project at ${projectDir}...`);
    run('npm', ['init', '-y'], { cwd: projectDir });

    console.log('\n📦 Installing the tarball into the empty project...');
    run('npm', ['install', tarballPath], { cwd: projectDir });

    console.log('\n🔎 require("agentlet-core") under plain Node (no jsdom) from the installed tarball...');
    const cjsCheckPath = path.join(projectDir, 'check-cjs.cjs');
    writeFileSync(cjsCheckPath, `
        const mod = require('agentlet-core');
        const pkgJson = require('agentlet-core/package.json');
        console.log(JSON.stringify({
            defaultIsFunction: typeof mod.default === 'function',
            defaultIsAgentletCore: mod.default === mod.AgentletCore,
            namedExportCount: Object.keys(mod).filter(k => k !== 'default').length,
            packageJsonVersion: pkgJson.version
        }));
    `, 'utf8');
    const cjsResult = run(process.execPath, [cjsCheckPath], { cwd: projectDir });
    console.log(cjsResult.stdout.trim());
    const cjsShape = JSON.parse(cjsResult.stdout.trim().split('\n').pop());
    if (!cjsShape.defaultIsFunction || !cjsShape.defaultIsAgentletCore) {
        fail('Installed tarball: require("agentlet-core") default export is not the AgentletCore class.');
    }
    if (cjsShape.namedExportCount < 1) {
        fail('Installed tarball: require("agentlet-core") has no named exports.');
    }
    if (cjsShape.packageJsonVersion !== pkg.version) {
        fail(`Installed tarball: require('agentlet-core/package.json').version (${cjsShape.packageJsonVersion}) does not match this repo's package.json version (${pkg.version}).`);
    }

    console.log('\n🔎 import("agentlet-core") under plain Node (no jsdom) from the installed tarball...');
    const esmCheckPath = path.join(projectDir, 'check-esm.mjs');
    writeFileSync(esmCheckPath, `
        const mod = await import('agentlet-core');
        console.log(JSON.stringify({
            defaultIsFunction: typeof mod.default === 'function',
            namedExportCount: Object.keys(mod).filter(k => k !== 'default').length
        }));
    `, 'utf8');
    const esmResult = run(process.execPath, [esmCheckPath], { cwd: projectDir });
    console.log(esmResult.stdout.trim());
    const esmShape = JSON.parse(esmResult.stdout.trim().split('\n').pop());
    if (!esmShape.defaultIsFunction) {
        fail('Installed tarball: import("agentlet-core") default export is not a function/class.');
    }
    if (esmShape.namedExportCount < 1) {
        fail('Installed tarball: import("agentlet-core") has no named exports.');
    }

    console.log(`\n🎉 The packed tarball installs and loads correctly under plain Node (no jsdom). agentlet-core@${cjsShape.packageJsonVersion}`);
} finally {
    console.log('\n🧹 Cleaning up temp directories...');
    rmSync(packDestination, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
}
