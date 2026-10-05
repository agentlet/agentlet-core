#!/usr/bin/env node
/**
 * Guard rail for the on-demand layout of dist/.
 *
 * SheetJS (xlsx), pdf.js (pdfjs-dist) and html2canvas are not inlined in the
 * core bundle any more: the script builds load them from chunk files next to
 * the core, the ES module build reaches them through dynamic imports, and only
 * the single-file, bookmarklet and extension builds still carry them. Nothing
 * else would notice if a change to tools/build.js or src/libraries/ quietly
 * put a library back into the core (the bundle would still work, just 1 MB
 * heavier) or dropped a file the core fetches at runtime. This script checks,
 * after a build:
 *
 * - the build metafiles (reports/security/meta/, written by tools/build.js):
 *   no script or ES module core bundle has an input from one of the three
 *   libraries, the single-file builds do, and each chunk bundles exactly its
 *   own library;
 * - the files the core fetches at runtime exist: the chunk file names that
 *   src/libraries/LibraryUrls.ts resolves, `pdf.worker.min.mjs`, `cmaps/`,
 *   `standard_fonts/` and the ES module chunks in `dist/chunks/`;
 * - everything the core loads is covered by package.json's "files" list, so it
 *   reaches the npm tarball;
 * - no third-party (cdnjs) request is left in the files a page downloads.
 *
 * Run standalone with `npm run verify:dist-chunks` (after `npm run build`), or
 * automatically at the end of `node tools/build.js` / `npm run build`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const metaDir = path.join(rootDir, 'reports', 'security', 'meta');

const LIBRARY_PACKAGES = {
    xlsx: 'node_modules/xlsx/',
    html2canvas: 'node_modules/html2canvas/',
    pdfjs: 'node_modules/pdfjs-dist/'
};

function fail(message) {
    console.error(`❌ ${message}`);
    process.exit(1);
}

function readMetafile(name) {
    const file = path.join(metaDir, `${name}.meta.json`);
    if (!existsSync(file)) {
        fail(`Build metafile ${path.relative(rootDir, file)} not found. Run \`npm run build\` first.`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
}

/** Library names that have at least one bundled input in the given metafile. */
function bundledLibraries(metafile) {
    const inputs = Object.keys(metafile.inputs);
    return Object.entries(LIBRARY_PACKAGES)
        .filter(([, prefix]) => inputs.some(input => input.includes(prefix)))
        .map(([name]) => name);
}

function checkLibraries(label, metafileName, expected) {
    const actual = bundledLibraries(readMetafile(metafileName)).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        fail(`${label}: bundles [${actual.join(', ') || 'none'}] but should bundle [${wanted.join(', ') || 'none'}].`);
    }
    console.log(`✅ ${label}: bundles [${wanted.join(', ') || 'none'}].`);
}

// 1. Which libraries each output carries.
checkLibraries('dist/agentlet-core.js', 'agentlet-core', []);
checkLibraries('dist/agentlet-core.min.js', 'agentlet-core.min', []);
checkLibraries('dist/agentlet-core.esm.js (entry and chunks)', 'agentlet-core.esm', ['xlsx', 'html2canvas', 'pdfjs']);
checkLibraries('dist/agentlet-core.full.min.js', 'agentlet-core.full.min', ['xlsx', 'html2canvas', 'pdfjs']);
checkLibraries('dist/bookmarklet.js', 'bookmarklet', ['xlsx', 'html2canvas', 'pdfjs']);
checkLibraries('dist/extension/agentlet-core.js', 'extension', ['xlsx', 'html2canvas', 'pdfjs']);

// The ES module entry itself must stay free of the libraries: they have to be
// in their own chunks, or an ESM consumer downloads them with the core.
const esmMeta = readMetafile('agentlet-core.esm');
const esmEntry = esmMeta.outputs[Object.keys(esmMeta.outputs).find(output => output.endsWith('agentlet-core.esm.js'))];
if (!esmEntry) {
    fail('dist/agentlet-core.esm.js is missing from the ES module build metafile.');
}
const esmEntryLibraries = Object.keys(esmEntry.inputs).filter(input =>
    Object.values(LIBRARY_PACKAGES).some(prefix => input.includes(prefix)));
if (esmEntryLibraries.length > 0) {
    fail(`dist/agentlet-core.esm.js still inlines library code (${esmEntryLibraries[0]}, ...); it should only import dist/chunks/.`);
}
console.log('✅ dist/agentlet-core.esm.js: entry file has no library code, only dynamic imports of dist/chunks/.');

// Each chunk bundles exactly its own library.
const chunkMeta = readMetafile('chunks');
const chunkFiles = {
    xlsx: 'agentlet-xlsx.min.js',
    html2canvas: 'agentlet-html2canvas.min.js',
    pdfjs: 'agentlet-pdfjs.min.js'
};
for (const [name, fileName] of Object.entries(chunkFiles)) {
    const output = chunkMeta.outputs[Object.keys(chunkMeta.outputs).find(key => key.endsWith(`/${fileName}`))];
    if (!output) {
        fail(`${fileName} is missing from the chunk build metafile.`);
    }
    const bundled = Object.entries(LIBRARY_PACKAGES)
        .filter(([, prefix]) => Object.keys(output.inputs).some(input => input.includes(prefix)))
        .map(([libName]) => libName);
    if (bundled.length !== 1 || bundled[0] !== name) {
        fail(`${fileName} bundles [${bundled.join(', ') || 'none'}] but should bundle only [${name}].`);
    }
}
console.log('✅ dist chunks: each bundles exactly its own library.');

// 2. The files the core fetches at runtime exist, under the names LibraryUrls.ts resolves.
const urlsSource = readFileSync(path.join(rootDir, 'src', 'libraries', 'LibraryUrls.ts'), 'utf8');
const declaredChunkFiles = [...urlsSource.matchAll(/'(agentlet-[a-z0-9]+\.min\.js)'/g)].map(match => match[1]).sort();
if (JSON.stringify(declaredChunkFiles) !== JSON.stringify(Object.values(chunkFiles).sort())) {
    fail(`src/libraries/LibraryUrls.ts names chunk files [${declaredChunkFiles.join(', ')}], but tools/build.js and this check expect [${Object.values(chunkFiles).sort().join(', ')}].`);
}

const requiredFiles = [
    ...Object.values(chunkFiles),
    'agentlet-core.js',
    'agentlet-core.min.js',
    'agentlet-core.esm.js',
    'agentlet-core.full.min.js',
    'pdf.worker.min.mjs'
];
for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
    if (!existsSync(filePath) || statSync(filePath).size === 0) {
        fail(`dist/${file} is missing or empty.`);
    }
}

for (const dir of ['cmaps', 'standard_fonts', 'chunks']) {
    const dirPath = path.join(distDir, dir);
    if (!existsSync(dirPath) || readdirSync(dirPath).length === 0) {
        fail(`dist/${dir}/ is missing or empty.`);
    }
}
if (readdirSync(path.join(distDir, 'chunks')).filter(file => file.endsWith('.js')).length < 3) {
    fail('dist/chunks/ should hold one ES module chunk per on-demand library (3 .js files).');
}
console.log('✅ dist/: chunk files, pdf.worker.min.mjs, cmaps/, standard_fonts/ and chunks/ are present.');

// 3. package.json "files" must cover all of it.
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const shipped = pkg.files;
const covered = (relativePath) => shipped.some(entry => {
    if (entry === relativePath) return true;
    if (entry.endsWith('/')) return relativePath.startsWith(entry);
    if (entry.endsWith('/*.js')) return path.posix.dirname(relativePath) === entry.slice(0, -'/*.js'.length) && relativePath.endsWith('.js');
    return false;
});
const mustShip = [
    ...requiredFiles.map(file => `dist/${file}`),
    ...readdirSync(path.join(distDir, 'chunks')).filter(file => file.endsWith('.js')).map(file => `dist/chunks/${file}`),
    'dist/cmaps/Adobe-Japan1-UCS2.bcmap',
    'dist/standard_fonts/LiberationSans-Regular.ttf'
];
for (const file of mustShip) {
    if (!covered(file)) {
        fail(`${file} is loaded by the core at runtime but is not covered by package.json "files".`);
    }
}
console.log('✅ package.json "files" covers every file the core loads at runtime.');

// 4. No third-party request left in what a page downloads.
const downloaded = [
    'agentlet-core.min.js',
    'agentlet-core.full.min.js',
    'agentlet-xlsx.min.js',
    'agentlet-html2canvas.min.js',
    'agentlet-pdfjs.min.js'
];
for (const file of downloaded) {
    const content = readFileSync(path.join(distDir, file), 'utf8');
    if (content.includes('cdnjs.cloudflare.com')) {
        fail(`dist/${file} still references cdnjs.cloudflare.com.`);
    }
}
console.log('✅ No cdnjs.cloudflare.com reference in the files a page downloads.');

console.log('\n🎉 dist/ matches the on-demand loading layout.');
