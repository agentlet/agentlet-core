#!/usr/bin/env node
/**
 * Guard rail for loading agentlet-core under plain Node.js - no jsdom, no
 * browser. agentlet-core is a browser library, but merely requiring/
 * importing the package (SSR, bundler dependency graphs, test collection,
 * `npm install && node -e "require('agentlet-core')"`, ...) must not throw:
 * only `new AgentletCore().init()` should ever need a browser.
 *
 * This used to fail with `ReferenceError: DOMMatrix is not defined` because
 * src/index.ts statically imported `pdfjs-dist`, which touches browser
 * globals as a side effect of evaluating its module body. pdf.js is now
 * loaded lazily (`await import('pdfjs-dist')` inside `AgentletCore.init()`,
 * see src/index.ts), so requiring/importing the package no longer evaluates
 * it at all.
 *
 * This is intentionally a plain Node script, not a Jest test:
 * jest.config.js's `testEnvironment` is `jsdom`, which defines `DOMMatrix`
 * and friends - a Jest test would pass even if this regressed. Each check
 * below spawns a fresh, bare `node` subprocess (running a temp script file,
 * not `node -e`, so quoting stays simple) so nothing this repo's own
 * tooling (Jest, ts-node, etc.) might have polyfilled leaks in.
 *
 * Run standalone with `npm run verify:node-import` (after `npm run build`),
 * or automatically at the end of `node tools/build.js` / `npm run build`
 * (buildAll() only - see tools/build.js).
 *
 * This checks the package from its own working tree via Node's
 * "self-referencing" package resolution (requiring/importing a package by
 * its own `name`, resolved through package.json's `exports` - the same
 * resolution a real external consumer's `require('agentlet-core')` goes
 * through), so it also exercises the `exports` map itself (including
 * `./package.json`, see package.json). It does not cover what actually
 * ships in a published tarball (trimmed `files` list, real dependency
 * installation); tools/verify-tarball-import.mjs covers that separately
 * (see that file for why it isn't run on every build).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const distCjs = path.join(rootDir, 'dist', 'agentlet-core.js');
const distEsm = path.join(rootDir, 'dist', 'agentlet-core.esm.js');

function fail(message) {
    console.error(`❌ ${message}`);
    process.exit(1);
}

if (!existsSync(distCjs)) {
    fail(`dist/agentlet-core.js not found at ${distCjs}. Run \`npm run build\` first.`);
}
if (!existsSync(distEsm)) {
    fail(`dist/agentlet-core.esm.js not found at ${distEsm}. Run \`npm run build\` first.`);
}

// Expected named exports (see the bottom of src/index.ts) - a coarse shape
// check, not an exhaustive one: enough to catch a bundle that silently lost
// its exports, without duplicating the full public API list maintained in
// src/types/public-api.d.ts.
const expectedNamedExports = [
    'AgentletCore', 'Module', 'ModuleRegistry', 'ElementSelector', 'Dialog',
    'MessageBubble', 'ScreenCapture', 'ScriptInjector', 'EnvManager',
    'CookieManager', 'StorageManager', 'AuthManager', 'FormExtractor',
    'FormFiller', 'TableExtractor', 'PDFProcessor', 'ShortcutManager'
];

// Node's self-referencing package resolution (require('agentlet-core') from
// within the package itself, resolved via package.json's own "exports")
// only kicks in for a requiring file that lives *inside* this package's
// directory tree (Node walks up from the requiring file to find the nearest
// package.json). A generic OS tmpdir() is outside that tree, so the temp
// check scripts live under dist/ instead - already gitignored, and this
// script already requires dist/ to exist (the build just produced it).
const tmpDir = path.join(rootDir, 'dist', '.verify-node-import-tmp');
mkdirSync(tmpDir, { recursive: true });

function runNodeScript(label, filename, nodeArgs, script) {
    const scriptPath = path.join(tmpDir, filename);
    writeFileSync(scriptPath, script, 'utf8');

    const result = spawnSync(process.execPath, [...nodeArgs, scriptPath], {
        cwd: rootDir,
        encoding: 'utf8'
    });

    if (result.error) {
        fail(`${label}: failed to spawn node: ${result.error.message}`);
    }
    if (result.status !== 0) {
        console.error(result.stdout);
        console.error(result.stderr);
        fail(`${label}: exited with status ${result.status}`);
    }
    if (result.stderr && result.stderr.trim()) {
        // Node's own module-type warnings (e.g. MODULE_TYPELESS_PACKAGE_JSON)
        // are noise, not failures - only a non-zero exit (above) fails.
        console.warn(`⚠️  ${label} stderr:\n${result.stderr.trim()}`);
    }

    const lines = result.stdout.trim().split('\n');
    try {
        return JSON.parse(lines[lines.length - 1]);
    } catch (error) {
        fail(`${label}: could not parse JSON result from stdout:\n${result.stdout}\n(${error.message})`);
    }
}

function checkShape(label, shape) {
    if (typeof shape.defaultIsFunction !== 'boolean' || !shape.defaultIsFunction) {
        fail(`${label}: default export is not a class/function (typeof default === ${JSON.stringify(shape.defaultType)}).`);
    }
    const missing = expectedNamedExports.filter(name => !shape.namedExports.includes(name));
    if (missing.length > 0) {
        fail(`${label}: missing expected named export(s): ${missing.join(', ')}.`);
    }
}

try {
    console.log('🔎 require("agentlet-core") under plain Node (no jsdom)...');
    const cjsShape = runNodeScript('CJS require', 'check-cjs.cjs', [], `
        const mod = require('agentlet-core');
        const pkgJson = require('agentlet-core/package.json');
        console.log(JSON.stringify({
            defaultIsFunction: typeof mod.default === 'function',
            defaultType: typeof mod.default,
            defaultIsAgentletCore: mod.default === mod.AgentletCore,
            namedExports: Object.keys(mod).filter(k => k !== 'default'),
            packageJsonVersion: pkgJson.version
        }));
    `);
    checkShape('CJS require', cjsShape);
    if (!cjsShape.defaultIsAgentletCore) {
        fail('CJS require: module.default !== module.AgentletCore (named and default export should be the same class).');
    }
    if (cjsShape.packageJsonVersion !== pkg.version) {
        fail(`CJS require: require('agentlet-core/package.json').version (${cjsShape.packageJsonVersion}) does not match package.json's own version (${pkg.version}).`);
    }
    console.log(`✅ require('agentlet-core') and require('agentlet-core/package.json') work under plain Node (version ${cjsShape.packageJsonVersion}).`);

    console.log('🔎 import("agentlet-core") under plain Node (no jsdom)...');
    const esmShape = runNodeScript('ESM import', 'check-esm.mjs', [], `
        const mod = await import('agentlet-core');
        console.log(JSON.stringify({
            defaultIsFunction: typeof mod.default === 'function',
            defaultType: typeof mod.default,
            namedExports: Object.keys(mod).filter(k => k !== 'default')
        }));
    `);
    checkShape('ESM import', esmShape);
    console.log('✅ import(\'agentlet-core\') resolves to dist/agentlet-core.esm.js and works under plain Node.');

    console.log('\n🎉 agentlet-core loads under plain Node (no jsdom) for both require() and import().');
} finally {
    rmSync(tmpDir, { recursive: true, force: true });
}
