#!/usr/bin/env node

/**
 * Build system for Agentlet Core
 * Supports building the core framework and individual modules
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

/**
 * How each build obtains SheetJS, pdf.js and html2canvas (see
 * src/libraries/embeddedLibraries.ts): 'script' = separate chunk files,
 * 'split' = ES module chunks, 'inline' = inlined in the output file.
 */
function libsDefine(mode) {
    return { __AGENTLET_LIBS__: JSON.stringify(mode) };
}

/** On-demand library chunks: source entry (under src/libraries/chunks/) and output name (without .js). */
const LIBRARY_CHUNKS = {
    xlsx: { entry: 'xlsx.ts', out: 'agentlet-xlsx.min' },
    html2canvas: { entry: 'html2canvas.ts', out: 'agentlet-html2canvas.min' },
    pdfjs: { entry: 'pdfjs.ts', out: 'agentlet-pdfjs.min' }
};

/** "123.45 KB (gzip 45.67 KB)" for a built file, KB being 1024 bytes like the other size lines, gzip at the default level like `gzip -c`. */
function describeSize(file) {
    const bytes = fs.readFileSync(file);
    const gzipped = zlib.gzipSync(bytes).length;
    return `${(bytes.length / 1024).toFixed(2)} KB (gzip ${(gzipped / 1024).toFixed(2)} KB)`;
}

class AgentletCoreBuilder {
    constructor() {
        this.srcDir = path.join(__dirname, '..', 'src');
        this.distDir = path.join(__dirname, '..', 'dist');
        this.resourcesDir = path.join(__dirname, '..', 'resources');
        const tsEntryPoint = path.join(this.srcDir, 'index.ts');
        this.entryPoint = fs.existsSync(tsEntryPoint) ? tsEntryPoint : path.join(this.srcDir, 'index.js');
        
        // Build configurations
        this.configs = {
            core: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outfile: path.join(this.distDir, 'agentlet-core.js'),
                globalName: 'AgentletCore',
                minify: false,
                sourcemap: true,
                metafile: true,
                // SheetJS, pdf.js and html2canvas are not part of this file:
                // each is a chunk loaded on first use (see buildChunks()).
                define: libsDefine('script'),
                // esbuild's iife+globalName output only assigns to the global
                // variable. Since package.json's "require"/"default" exports
                // condition resolves to this file, also assign module.exports
                // (CommonJS/Node/webpack `require`) when available, so both
                // `<script>` globals and `require('agentlet-core')` work from
                // the same bundle. Browsers without `module` are unaffected.
                footer: {
                    js: 'if (typeof module === "object" && module.exports) { module.exports = AgentletCore; }'
                }
            },

            coreMinified: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outfile: path.join(this.distDir, 'agentlet-core.min.js'),
                globalName: 'AgentletCore',
                minify: true,
                sourcemap: false,
                metafile: true,
                define: libsDefine('script'),
                footer: {
                    js: 'if (typeof module === "object" && module.exports) { module.exports = AgentletCore; }'
                }
            },

            // The same core with SheetJS, pdf.js and html2canvas inlined, for
            // consumers that want one self-contained file.
            coreFull: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outfile: path.join(this.distDir, 'agentlet-core.full.min.js'),
                globalName: 'AgentletCore',
                minify: true,
                sourcemap: false,
                metafile: true,
                define: libsDefine('inline'),
                footer: {
                    js: 'if (typeof module === "object" && module.exports) { module.exports = AgentletCore; }'
                }
            },

            // One classic-script file per on-demand library, built as
            // minified IIFEs that set window.XLSX / window.pdfjsLib /
            // window.html2canvas. `outdir` + `out` names keep the files
            // next to the core bundle.
            chunks: {
                entryPoints: Object.entries(LIBRARY_CHUNKS).map(([, chunk]) => ({
                    in: path.join(this.srcDir, 'libraries', 'chunks', chunk.entry),
                    out: chunk.out
                })),
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outdir: this.distDir,
                minify: true,
                sourcemap: false,
                metafile: true,
                legalComments: 'eof'
            },

            // Code splitting turns the three dynamic imports in
            // src/libraries/embeddedLibraries.ts into ES module chunks under
            // dist/chunks/. A bundler consuming the package makes them its own
            // lazy chunks; a plain <script type="module"> fetches them
            // relative to the module URL.
            coreEsm: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'esm',
                target: 'es2020',
                outdir: this.distDir,
                entryNames: 'agentlet-core.esm',
                chunkNames: 'chunks/[name]-[hash]',
                splitting: true,
                minify: false,
                sourcemap: true,
                metafile: true,
                define: libsDefine('split'),
                // The only way an ES module can learn its own URL; read by
                // src/libraries/LibraryUrls.ts.
                banner: {
                    js: 'const __AGENTLET_MODULE_URL__ = import.meta.url;'
                }
            },

            bookmarklet: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outfile: path.join(this.distDir, 'bookmarklet.js'),
                globalName: 'AgentletCore',
                minify: true,
                sourcemap: false,
                metafile: true,
                // A javascript: URL has no script URL to resolve chunks
                // against, so the bookmarklet carries everything.
                define: libsDefine('inline'),
                banner: {
                    js: 'javascript:(function(){'
                },
                footer: {
                    js: '})();'
                }
            },

            extension: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outfile: path.join(this.distDir, 'extension', 'agentlet-core.js'),
                globalName: 'AgentletCore',
                minify: true,
                sourcemap: false,
                metafile: true,
                // Content scripts run in an isolated world: a chunk loaded
                // through a page script tag would not be visible to them.
                define: libsDefine('inline'),
                external: ['chrome']
            }
        };
    }

    /**
     * Ensure dist directory exists
     */
    ensureDistDir() {
        if (!fs.existsSync(this.distDir)) {
            fs.mkdirSync(this.distDir, { recursive: true });
            console.log(`📁 Created dist directory: ${this.distDir}`);
        }
    }

    /**
     * Copy resources to dist directory
     */
    copyResources() {
        if (!fs.existsSync(this.resourcesDir)) {
            console.log('📁 No resources directory found, skipping resource copy');
            return;
        }

        const distResourcesDir = path.join(this.distDir, 'resources');
        
        try {
            this.copyDirectoryRecursive(this.resourcesDir, distResourcesDir);
            console.log(`📁 Resources copied to: ${distResourcesDir}`);
        } catch (error) {
            console.warn(`⚠️ Failed to copy resources: ${error.message}`);
        }
    }

    /**
     * Write an esbuild metafile to a gitignored reports directory (never
     * under dist/, and never listed in package.json's "files", so it is
     * never published to npm). This is the shipped-inventory input for the
     * shared dependency-scan tooling (the sbom-from-esbuild action in
     * agentlet/.github), which maps every bundled `node_modules` input back
     * to its npm package.
     */
    writeMetafile(name, metafile) {
        if (!metafile) {
            return;
        }
        try {
            const metaDir = path.join(__dirname, '..', 'reports', 'security', 'meta');
            fs.mkdirSync(metaDir, { recursive: true });
            const metaPath = path.join(metaDir, `${name}.meta.json`);
            fs.writeFileSync(metaPath, JSON.stringify(metafile, null, 2));
        } catch (error) {
            console.warn(`⚠️ Failed to write esbuild metafile for ${name}: ${error.message}`);
        }
    }

    /**
     * Copy the hand-written public API type declarations to dist directory
     */
    copyTypeDeclarations() {
        const declarationSrcPath = path.join(this.srcDir, 'types', 'public-api.d.ts');
        const declarationDestPath = path.join(this.distDir, 'agentlet-core.d.ts');

        try {
            if (!fs.existsSync(declarationSrcPath)) {
                console.warn('⚠️ No src/types/public-api.d.ts found, skipping type declarations copy');
                return;
            }

            this.ensureDistDir();
            fs.copyFileSync(declarationSrcPath, declarationDestPath);
            console.log(`📄 Type declarations copied to: ${declarationDestPath}`);
        } catch (error) {
            console.warn(`⚠️ Failed to copy type declarations: ${error.message}`);
        }
    }

    /**
     * Cheap guard rail for the type declarations just copied to
     * dist/agentlet-core.d.ts: type-checks a minimal consumer file against
     * it (see tools/verify-dist-types.mjs and CONTRIBUTING.md's "Public
     * API declarations" section for why this exists instead of generating
     * the declarations from source).
     */
    verifyDistTypes() {
        const scriptPath = path.join(__dirname, 'verify-dist-types.mjs');
        const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
        return { success: result.status === 0 };
    }

    /**
     * Guard rail for dist/agentlet-core.js and dist/agentlet-core.esm.js:
     * makes sure plain `require('agentlet-core')` / `import('agentlet-core')`
     * (no jsdom, no browser) still work after this build - see
     * tools/verify-node-import.mjs for why this exists.
     */
    verifyNodeImport() {
        const scriptPath = path.join(__dirname, 'verify-node-import.mjs');
        const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
        return { success: result.status === 0 };
    }

    /**
     * Copy the PDF.js worker file to the dist directory. Kept as
     * `pdf.worker.min.mjs` (its real name in pdfjs-dist, and a module worker
     * pdf.js always loads with `new Worker(url, { type: 'module' })`) rather
     * than renamed to `.js`, to match `LibrarySetup.ts`'s default
     * `pdfWorkerUrl` resolution and to keep a host's copy of this file
     * indistinguishable from the one it could take directly from its own
     * `node_modules/pdfjs-dist/build/`.
     *
     * Also copies the `cmaps/` and `standard_fonts/` folders of the installed
     * pdfjs-dist (same version as the bundled library), which PDFProcessor
     * passes to pdf.js so it never fetches them from a third-party host.
     */
    copyPDFJSWorker(destDir = this.distDir) {
        // buildAll() reaches this from several targets; copy once per folder.
        this.copiedPdfAssets = this.copiedPdfAssets || new Set();
        if (this.copiedPdfAssets.has(destDir)) {
            return;
        }
        this.copiedPdfAssets.add(destDir);

        try {
            const pdfjsDir = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
            const workerSrcPath = path.join(pdfjsDir, 'build', 'pdf.worker.min.mjs');
            const workerDestPath = path.join(destDir, 'pdf.worker.min.mjs');

            if (fs.existsSync(workerSrcPath)) {
                fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(workerSrcPath, workerDestPath);
                console.log(`📄 PDF.js worker copied to: ${workerDestPath}`);
            } else {
                console.warn('⚠️ PDF.js worker not found in node_modules, skipping copy');
            }

            for (const folder of ['cmaps', 'standard_fonts']) {
                const folderSrcPath = path.join(pdfjsDir, folder);
                const folderDestPath = path.join(destDir, folder);
                if (fs.existsSync(folderSrcPath)) {
                    fs.rmSync(folderDestPath, { recursive: true, force: true });
                    this.copyDirectoryRecursive(folderSrcPath, folderDestPath);
                    console.log(`📄 PDF.js ${folder} copied to: ${folderDestPath}`);
                } else {
                    console.warn(`⚠️ PDF.js ${folder} not found in node_modules, skipping copy`);
                }
            }
        } catch (error) {
            console.warn(`⚠️ Failed to copy PDF.js worker and assets: ${error.message}`);
        }
    }

    /**
     * Build the on-demand library chunks (agentlet-xlsx.min.js,
     * agentlet-html2canvas.min.js, agentlet-pdfjs.min.js): classic scripts
     * the script builds of the core load on first use.
     */
    async buildChunks() {
        console.log('🔨 Building on-demand library chunks...');
        this.ensureDistDir();

        try {
            const result = await esbuild.build(this.configs.chunks);
            this.writeMetafile('chunks', result.metafile);

            const outputs = Object.values(LIBRARY_CHUNKS).map(chunk => {
                const outputFile = path.join(this.distDir, `${chunk.out}.js`);
                const size = fs.statSync(outputFile).size;
                console.log(`   📦 ${path.basename(outputFile)}: ${describeSize(outputFile)}`);
                return { outputFile, size };
            });

            if (result.warnings && result.warnings.length > 0) {
                console.warn('⚠️  Warnings:', result.warnings);
            }

            return { success: true, outputs, size: outputs.reduce((sum, output) => sum + output.size, 0) };
        } catch (error) {
            console.error('❌ Chunk build failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Build the single-file core (agentlet-core.full.min.js), which inlines
     * SheetJS, pdf.js and html2canvas.
     */
    async buildCoreFull() {
        console.log('🔨 Building Agentlet Core (single file, libraries inlined)...');
        this.ensureDistDir();

        const config = this.configs.coreFull;
        try {
            const result = await esbuild.build(config);
            this.writeMetafile('agentlet-core.full.min', result.metafile);

            const stats = fs.statSync(config.outfile);
            console.log(`✅ Core (single file) built successfully`);
            console.log(`   📦 Output: ${config.outfile}`);
            console.log(`   📏 Size: ${describeSize(config.outfile)}`);

            if (result.warnings && result.warnings.length > 0) {
                console.warn('⚠️  Warnings:', result.warnings);
            }

            return { success: true, outputFile: config.outfile, size: stats.size };
        } catch (error) {
            console.error('❌ Single-file build failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Guard rail for the on-demand layout of dist/: the script builds of the
     * core must not contain the libraries any more, and every file they load
     * on demand must exist. See tools/verify-dist-chunks.mjs.
     */
    verifyDistChunks() {
        const scriptPath = path.join(__dirname, 'verify-dist-chunks.mjs');
        const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
        return { success: result.status === 0 };
    }

    /**
     * Recursively copy directory
     */
    copyDirectoryRecursive(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const items = fs.readdirSync(src);
        
        items.forEach(item => {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            const stat = fs.statSync(srcPath);
            
            if (stat.isDirectory()) {
                this.copyDirectoryRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        });
    }

    /**
     * Build core framework
     */
    async buildCore(minified = false) {
        console.log(`🔨 Building Agentlet Core ${minified ? '(minified)' : '(development)'}...`);
        
        // Copy resources for core builds
        this.copyResources();

        // Copy PDF.js worker
        this.copyPDFJSWorker();

        // Copy public API type declarations
        this.copyTypeDeclarations();

        const config = minified ? this.configs.coreMinified : this.configs.core;
        
        try {
            const result = await esbuild.build(config);
            this.writeMetafile(minified ? 'agentlet-core.min' : 'agentlet-core', result.metafile);

            const outputFile = config.outfile;
            const stats = fs.statSync(outputFile);
            const sizeKB = (stats.size / 1024).toFixed(2);
            
            console.log(`✅ Core built successfully`);
            console.log(`   📦 Output: ${outputFile}`);
            console.log(`   📏 Size: ${minified ? describeSize(outputFile) : `${sizeKB} KB`}`);
            
            if (result.warnings && result.warnings.length > 0) {
                console.warn('⚠️  Warnings:', result.warnings);
            }
            
            return { success: true, outputFile, size: stats.size };

        } catch (error) {
            console.error('❌ Build failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Build core framework as an ESM bundle (for "import" consumers)
     */
    async buildCoreEsm() {
        console.log('🔨 Building Agentlet Core (ESM)...');

        // Copy resources for core builds
        this.copyResources();

        // Copy PDF.js worker
        this.copyPDFJSWorker();

        // Copy public API type declarations
        this.copyTypeDeclarations();

        const config = this.configs.coreEsm;

        try {
            // Chunk names carry a content hash, so drop the previous build's.
            fs.rmSync(path.join(this.distDir, 'chunks'), { recursive: true, force: true });

            const result = await esbuild.build(config);
            this.writeMetafile('agentlet-core.esm', result.metafile);

            const outputFile = path.join(this.distDir, 'agentlet-core.esm.js');
            const stats = fs.statSync(outputFile);
            const sizeKB = (stats.size / 1024).toFixed(2);

            console.log(`✅ Core (ESM) built successfully`);
            console.log(`   📦 Output: ${outputFile}`);
            console.log(`   📏 Size: ${sizeKB} KB`);

            if (result.warnings && result.warnings.length > 0) {
                console.warn('⚠️  Warnings:', result.warnings);
            }

            return { success: true, outputFile, size: stats.size };

        } catch (error) {
            console.error('❌ ESM build failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Build bookmarklet
     */
    async buildBookmarklet() {
        console.log('🔖 Building bookmarklet...');
        
        try {
            const result = await esbuild.build(this.configs.bookmarklet);
            this.writeMetafile('bookmarklet', result.metafile);

            const outputFile = this.configs.bookmarklet.outfile;
            let bookmarkletCode = fs.readFileSync(outputFile, 'utf8');
            
            // Additional bookmarklet optimizations
            bookmarkletCode = this.optimizeBookmarklet(bookmarkletCode);
            
            // Write optimized bookmarklet
            const optimizedFile = path.join(this.distDir, 'bookmarklet-optimized.js');
            fs.writeFileSync(optimizedFile, bookmarkletCode);
            
            const stats = fs.statSync(optimizedFile);
            const sizeKB = (stats.size / 1024).toFixed(2);
            
            console.log(`✅ Bookmarklet built successfully`);
            console.log(`   📦 Output: ${optimizedFile}`);
            console.log(`   📏 Size: ${sizeKB} KB`);
            
            // Generate bookmarklet link
            this.generateBookmarkletHTML(bookmarkletCode);
            
            return { success: true, outputFile: optimizedFile, size: stats.size };
            
        } catch (error) {
            console.error('❌ Bookmarklet build failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Optimize bookmarklet code
     */
    optimizeBookmarklet(code) {
        // Re-minify with esbuild rather than stripping comments with regexes:
        // regexes cannot tell comments from string, template or regex literals
        // (e.g. /\*/g) and silently deleted large stretches of the bundle.
        // Legal comments are kept since dist/ is published.
        const source = code.replace(/^javascript:/, '');
        const minified = esbuild.transformSync(source, {
            minify: true,
            legalComments: 'eof',
            target: 'es2020'
        }).code.trim();

        // Browsers percent-decode javascript: URLs and drop raw tabs and
        // newlines, so encode those characters to keep the executed code
        // identical (e.g. `i%60` would otherwise decode to a backtick).
        const encoded = minified.replace(/[%\t\n\r]/g,
            c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

        return `javascript:${encoded}`;
    }

    /**
     * Generate HTML file with bookmarklet link
     */
    generateBookmarkletHTML(bookmarkletCode) {
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agentlet Core Bookmarklet</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        .bookmarklet {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .bookmarklet-link {
            display: inline-block;
            background: #007bff;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 10px 0;
        }
        .bookmarklet-link:hover {
            background: #0056b3;
        }
        .code {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 10px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 12px;
            overflow-x: auto;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <h1>Agentlet Core Bookmarklet</h1>
    
    <div class="bookmarklet">
        <h2>Installation</h2>
        <p>Drag this link to your bookmarks bar:</p>
        <a href="${this.escapeHtml(bookmarkletCode)}" class="bookmarklet-link">Agentlet Core</a>
        
        <h3>Manual Installation</h3>
        <p>If dragging doesn't work, you can manually create a bookmark with this code:</p>
        <div class="code">${this.escapeHtml(bookmarkletCode)}</div>
    </div>
    
    <div class="bookmarklet">
        <h2>Usage</h2>
        <ol>
            <li>Navigate to any webpage</li>
            <li>Click the "Agentlet Core" bookmark</li>
            <li>The Agentlet Core interface will appear on the page</li>
            <li>Modules will automatically load based on the current website</li>
        </ol>
    </div>
    
    <div class="bookmarklet">
        <h2>Configuration</h2>
        <p>You can configure Agentlet Core by setting <code>window.agentletConfig</code> before loading:</p>
        <div class="code">
window.agentletConfig = {
    moduleRegistry: [
        {
            name: 'test-module',
            url: 'https://example.com/test-module.js'
        }
    ],
    trustedDomains: ['example.com'],
    theme: 'default',
    debugMode: true,
    env: {
        API_BASE_URL: 'https://api.example.com',
        API_KEY: 'your-api-key',
        ENABLE_FEATURES: 'true',
        UI_THEME: 'dark'
    }
};
        </div>
    </div>
    
    <p><small>Generated on ${new Date().toISOString()}</small></p>
</body>
</html>`;
        
        const htmlFile = path.join(this.distDir, 'bookmarklet.html');
        fs.writeFileSync(htmlFile, htmlContent.trim());
        
        console.log(`📄 Bookmarklet HTML generated: ${htmlFile}`);
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Build module template
     */
    async buildModuleTemplate(moduleName) {
        console.log(`🧩 Building module template: ${moduleName}...`);
        
        const templateDir = path.join(__dirname, 'templates', 'module');
        const outputDir = path.join(this.distDir, 'templates', moduleName);
        
        // Create template structure
        this.ensureDir(outputDir);
        
        // Generate module files
        const moduleTemplate = this.generateModuleTemplate(moduleName);
        const packageTemplate = this.generatePackageTemplate(moduleName);
        const readmeTemplate = this.generateReadmeTemplate(moduleName);
        
        fs.writeFileSync(path.join(outputDir, 'module.js'), moduleTemplate);
        fs.writeFileSync(path.join(outputDir, 'package.json'), packageTemplate);
        fs.writeFileSync(path.join(outputDir, 'README.md'), readmeTemplate);
        
        console.log(`✅ Module template created: ${outputDir}`);
        
        return { success: true, outputDir };
    }

    /**
     * Derive the identifiers used by the generated module files.
     * `moduleName` may be kebab-case (e.g. `my-app`), so it is converted
     * before being used as a class or global name.
     */
    getModuleIdentifiers(moduleName) {
        const words = moduleName.split(/[^a-zA-Z0-9]+/).filter(Boolean);
        const pascalName = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
        const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1);

        return {
            className: `${pascalName}Module`,
            // Global the registry reads back after loading the script (`module` field)
            globalName: `${camelName}AgentletModule`,
            title: words.join(' ')
        };
    }

    /**
     * Generate module template
     *
     * Mirrors plop-templates/agentlet/src/module.js: the module extends
     * `window.agentlet.Module` and exposes its class on `window` so the
     * registry can instantiate it with `new ModuleClass()`.
     */
    generateModuleTemplate(moduleName) {
        const { className, globalName, title } = this.getModuleIdentifiers(moduleName);

        return `/**
 * ${className} - Agentlet Core Module
 * Generated module template
 */
(function() {
    'use strict';

    class ${className} extends window.agentlet.Module {
        constructor() {
            super({
                name: '${moduleName}',
                version: '1.0.0',
                description: '${title} integration for Agentlet Core',
                patterns: ['example.com'], // Replace with actual URL patterns
                matchMode: 'includes'
            });
        }

        async initModule() {
            // Called once during module startup
            this.log(\`Initializing \${this.name} module\`);
        }

        async activateModule(context = {}) {
            // Called when the module becomes active and on URL changes
            this.log(\`Activating \${this.name} module\`, context);

            if (context.trigger === 'urlChange') {
                this.log(\`URL changed from \${context.oldUrl} to \${context.newUrl}\`);
            }
        }

        async cleanupModule(context = {}) {
            // Called when the module is deactivated or cleaned up
            this.log(\`Cleaning up \${this.name} module\`, context);
        }

        /**
         * Get module-specific content for the UI
         */
        getContent() {
            const moduleRef = \`window.agentlet.modules.get('\${this.name}')\`;

            return \`
                <div class="agentlet-module-content" data-module="\${this.name}">
                    <div class="agentlet-module-header">
                        <h3>${title} assistant</h3>
                        <span class="agentlet-module-version">v\${this.version}</span>
                    </div>
                    <div class="agentlet-module-body">
                        <p><strong>Status:</strong> \${this.isActive ? 'Active' : 'Inactive'}</p>
                        <p><strong>Current URL:</strong> \${window.location.href}</p>
                    </div>
                    <div class="agentlet-module-actions">
                        <button class="agentlet-btn" onclick="\${moduleRef}.performAction('extract-forms')">
                            Extract forms
                        </button>
                        <button class="agentlet-btn agentlet-btn-secondary" onclick="\${moduleRef}.performAction('refresh')">
                            Refresh
                        </button>
                    </div>
                </div>
            \`;
        }

        /**
         * Handle custom actions triggered from the UI
         */
        async performAction(action) {
            switch (action) {
                case 'extract-forms':
                    return this.extractForms();
                case 'refresh':
                    window.agentlet.ui.refreshContent();
                    return undefined;
                default:
                    this.warn(\`Unknown action: \${action}\`);
                    return undefined;
            }
        }

        /**
         * Extract forms from the page
         */
        extractForms() {
            const forms = Array.from(document.querySelectorAll('form')).map(form => ({
                id: form.id,
                action: form.action,
                method: form.method,
                fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
                    name: field.name,
                    type: field.type,
                    required: field.required
                }))
            }));

            this.emit('formsExtracted', { forms });
            return forms;
        }
    }

    // Make the module class available globally for the registry to instantiate
    window.${globalName} = ${className};
})();
`;
    }

    /**
     * Generate package.json template
     */
    generatePackageTemplate(moduleName) {
        return JSON.stringify({
            name: `agentlet-${moduleName}-module`,
            version: '1.0.0',
            description: `Agentlet Core module for ${moduleName}`,
            main: 'module.js',
            scripts: {
                build: 'esbuild module.js --bundle --format=iife --outfile=dist/module.js',
                'build:min': 'esbuild module.js --bundle --format=iife --minify --outfile=dist/module.min.js'
            },
            keywords: ['agentlet-core', 'module', moduleName],
            author: '',
            license: 'MIT',
            peerDependencies: {
                'agentlet-core': '^2.0.0'
            },
            devDependencies: {
                esbuild: '^0.25.5'
            }
        }, null, 2);
    }

    /**
     * Generate README template
     */
    generateReadmeTemplate(moduleName) {
        const { className, globalName, title } = this.getModuleIdentifiers(moduleName);
        const heading = title.charAt(0).toUpperCase() + title.slice(1);

        return `# ${heading} module for Agentlet Core

This module provides ${title} integration for the Agentlet Core framework.

## Loading the module

The built script (\`dist/module.js\`) defines \`${className}\` and exposes it as
\`window.${globalName}\`. Reference it from an agentlets registry script, and
point \`registryUrl\` in your Agentlet Core configuration at that registry:

\`\`\`javascript
(function() {
    const registry = {
        agentlets: [
            {
                name: '${moduleName}',
                url: 'https://cdn.example.com/agentlet-${moduleName}-module@1.0.0/dist/module.js',
                module: '${globalName}'
            }
        ]
    };

    window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: registry }));
})();
\`\`\`

See \`docs/registry-script-injection.md\` in agentlet-core for the registry format.

## URL patterns

This module activates on URLs matching:
- \`example.com\` (update this with actual patterns)

## Development

### Building
\`\`\`bash
npm run build        # Development build
npm run build:min    # Production build
\`\`\`

### Testing
Load the module in Agentlet Core and test on target pages.

## API

### Events emitted
- \`formsExtracted\` - When forms are extracted from the page

### Actions supported
- \`extract-forms\` - Extract all forms from the page
- \`refresh\` - Refresh module content

## License

MIT
`;
    }

    /**
     * Ensure directory exists
     */
    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Build Chrome extension
     */
    async buildExtension() {
        console.log('🔧 Building Chrome extension...');
        
        try {
            const extensionDir = path.join(this.distDir, 'extension');
            // Start clean so files from older builds never end up in the package
            fs.rmSync(extensionDir, { recursive: true, force: true });
            this.ensureDir(extensionDir);
            
            // Build core library for extension
            const result = await esbuild.build(this.configs.extension);
            this.writeMetafile('extension', result.metafile);
            
            // Copy extension files
            await this.copyExtensionFiles(extensionDir);
            
            // Copy the bundled modules (the only modules the extension can inject)
            await this.copyModules(extensionDir);
            
            // Generate extension package info
            const packageInfo = await this.generateExtensionPackageInfo(extensionDir);
            
            console.log(`✅ Extension built successfully`);
            console.log(`   📦 Output: ${extensionDir}`);
            console.log(`   📏 Core size: ${(packageInfo.coreSize / 1024).toFixed(2)} KB`);
            console.log(`   📄 Files: ${packageInfo.fileCount}`);
            
            if (result.warnings && result.warnings.length > 0) {
                console.warn('⚠️  Warnings:', result.warnings);
            }
            
            return { success: true, outputDir: extensionDir, ...packageInfo };
            
        } catch (error) {
            console.error('❌ Extension build failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Copy extension files
     *
     * The extension is least-privilege: everything it can ever inject is
     * copied here from the repository, nothing is generated from templates
     * and nothing is downloaded at runtime.
     */
    async copyExtensionFiles(extensionDir) {
        const extensionSrcDir = path.join(__dirname, '..', 'extension');

        // Source files copied verbatim
        const filesToCopy = [
            'background.js',
            'bootstrap.js',
            'bundled-modules.js',
            'popup.html',
            'popup.js',
            'options.html',
            'options.js',
            'welcome.html',
            'welcome.js'
        ];

        for (const file of filesToCopy) {
            const srcPath = path.join(extensionSrcDir, file);
            if (!fs.existsSync(srcPath)) {
                throw new Error(`Missing extension file: extension/${file}`);
            }
            fs.copyFileSync(srcPath, path.join(extensionDir, file));
            console.log(`   📄 Copied ${file}`);
        }

        // The manifest version always follows package.json
        const manifest = JSON.parse(fs.readFileSync(path.join(extensionSrcDir, 'manifest.json'), 'utf8'));
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        manifest.version = packageJson.version;
        fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
        console.log(`   📄 Wrote manifest.json (version ${manifest.version})`);

        // Icons
        const iconsSrc = path.join(extensionSrcDir, 'icons');
        const iconsDest = path.join(extensionDir, 'icons');
        this.ensureDir(iconsDest);
        for (const icon of fs.readdirSync(iconsSrc)) {
            fs.copyFileSync(path.join(iconsSrc, icon), path.join(iconsDest, icon));
        }
        console.log('   🎨 Copied icons');
    }

    /**
     * Read the list of bundled modules from extension/bundled-modules.js.
     * The file is plain ES module source; it is evaluated here as data
     * (an array of file names) with a regular expression, not executed.
     */
    readBundledModuleList() {
        const listPath = path.join(__dirname, '..', 'extension', 'bundled-modules.js');
        const source = fs.readFileSync(listPath, 'utf8');
        const match = source.match(/export const BUNDLED_MODULES = \[([^\]]*)\];/);
        if (!match) {
            throw new Error('extension/bundled-modules.js must contain: export const BUNDLED_MODULES = [ ... ];');
        }
        const names = [...match[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] !== undefined ? m[1] : m[2]);
        const stripped = match[1].replace(/'[^']*'|"[^"]*"|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[\s,]/g, '');
        if (stripped !== '') {
            throw new Error('extension/bundled-modules.js: BUNDLED_MODULES may only contain string literals');
        }
        return names;
    }

    /**
     * Copy the bundled modules into the extension. The list in
     * extension/bundled-modules.js and the files in extension/modules/ must
     * match exactly, so nothing unlisted is ever packaged.
     */
    async copyModules(extensionDir) {
        const modulesSrc = path.join(__dirname, '..', 'extension', 'modules');
        const modulesDir = path.join(extensionDir, 'modules');
        this.ensureDir(modulesDir);

        const listed = this.readBundledModuleList();
        const onDisk = fs.existsSync(modulesSrc)
            ? fs.readdirSync(modulesSrc).filter(name => !name.startsWith('.'))
            : [];

        for (const name of listed) {
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test(name)) {
                throw new Error(`Invalid bundled module name: ${name}`);
            }
            if (!onDisk.includes(name)) {
                throw new Error(`Bundled module listed but missing: extension/modules/${name}`);
            }
        }
        for (const name of onDisk) {
            if (!listed.includes(name)) {
                throw new Error(`extension/modules/${name} is not listed in extension/bundled-modules.js`);
            }
            fs.copyFileSync(path.join(modulesSrc, name), path.join(modulesDir, name));
            console.log(`   📦 Copied module ${name}`);
        }
        if (listed.length === 0) {
            console.log('   📦 No bundled modules');
        }
    }

    /**
     * Generate extension package info
     */
    async generateExtensionPackageInfo(extensionDir) {
        const files = this.getAllFiles(extensionDir);
        const coreFile = path.join(extensionDir, 'agentlet-core.js');
        const coreSize = fs.existsSync(coreFile) ? fs.statSync(coreFile).size : 0;
        
        return {
            fileCount: files.length,
            coreSize: coreSize,
            totalSize: files.reduce((sum, file) => {
                try {
                    return sum + fs.statSync(file).size;
                } catch {
                    return sum;
                }
            }, 0)
        };
    }

    /**
     * Get all files in directory recursively
     */
    getAllFiles(dir) {
        const files = [];
        
        const scan = (currentDir) => {
            const items = fs.readdirSync(currentDir);
            
            items.forEach(item => {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    scan(fullPath);
                } else {
                    files.push(fullPath);
                }
            });
        };
        
        scan(dir);
        return files;
    }

    /**
     * Package extension for distribution
     */
    async packageExtension() {
        console.log('📦 Packaging extension for distribution...');
        
        const extensionDir = path.join(this.distDir, 'extension');
        const packageDir = path.join(this.distDir, 'packages');
        this.ensureDir(packageDir);
        
        try {
            // Create ZIP package
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();
            
            // Add all extension files to ZIP
            const files = this.getAllFiles(extensionDir);
            files.forEach(file => {
                const relativePath = path.relative(extensionDir, file);
                zip.addLocalFile(file, path.dirname(relativePath));
            });
            
            const zipPath = path.join(packageDir, 'agentlet-core-extension.zip');
            zip.writeZip(zipPath);
            
            const zipStats = fs.statSync(zipPath);
            
            console.log(`✅ Extension packaged successfully`);
            console.log(`   📦 Package: ${zipPath}`);
            console.log(`   📏 Size: ${(zipStats.size / 1024).toFixed(2)} KB`);
            
            return { success: true, packagePath: zipPath, size: zipStats.size };
            
        } catch (error) {
            console.error('❌ Extension packaging failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Build all targets including extension
     */
    async buildAll() {
        console.log('🏗️  Building all targets...\n');
        
        this.ensureDistDir();
        
        // Copy resources first
        this.copyResources();

        // Copy PDF.js worker
        this.copyPDFJSWorker();

        // Copy public API type declarations
        this.copyTypeDeclarations();

        const results = {
            core: await this.buildCore(false),
            coreMinified: await this.buildCore(true),
            coreFull: await this.buildCoreFull(),
            chunks: await this.buildChunks(),
            coreEsm: await this.buildCoreEsm(),
            bookmarklet: await this.buildBookmarklet(),
            extension: await this.buildExtension()
        };

        // Guard rail: make sure dist/agentlet-core.d.ts actually loads and
        // type-checks now that every target (and the declarations copy
        // they each repeat) has finished.
        results.distTypes = this.verifyDistTypes();

        // Guard rail: make sure the just-built dist/agentlet-core.js and
        // dist/agentlet-core.esm.js still load under plain Node (no jsdom).
        results.nodeImport = this.verifyNodeImport();

        // Guard rail: the script builds must not contain the on-demand
        // libraries, and every file they load on demand must exist.
        results.distChunks = this.verifyDistChunks();

        console.log('\n📋 Build Summary:');
        Object.entries(results).forEach(([target, result]) => {
            const status = result.success ? '✅' : '❌';
            const size = result.size || result.coreSize || result.totalSize;
            const sizeText = size ? ` (${(size / 1024).toFixed(2)} KB)` : '';
            console.log(`   ${status} ${target}${sizeText}`);
        });
        
        const allSuccessful = Object.values(results).every(r => r.success);
        
        if (allSuccessful) {
            console.log('\n🎉 All builds completed successfully!');
        } else {
            console.log('\n⚠️  Some builds failed. Check the logs above.');
            process.exit(1);
        }
        
        return results;
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const builder = new AgentletCoreBuilder();
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Agentlet Core Build System

Usage:
  node build.js [options]

Options:
  --target=<target>     Build specific target (core, esm, full, chunks, bookmarklet, extension, all)
  --minified           Build minified version
  --module=<name>      Generate module template
  --package            Package extension for distribution
  --help               Show this help

Examples:
  node build.js                           # Build all targets
  node build.js --target=core             # Build core and its on-demand library chunks
  node build.js --target=core --minified  # Build minified core and its chunks
  node build.js --target=esm              # Build the ES module core and its dist/chunks/
  node build.js --target=full             # Build the single-file core (libraries inlined)
  node build.js --target=chunks           # Build the on-demand library chunks only
  node build.js --target=bookmarklet      # Build bookmarklet
  node build.js --target=extension        # Build Chrome extension
  node build.js --target=extension --package  # Build and package extension
  node build.js --module=myapp           # Generate module template
`);
        return;
    }
    
    const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'all';
    const minified = args.includes('--minified');
    const moduleTemplate = args.find(arg => arg.startsWith('--module='))?.split('=')[1];
    const packageExtension = args.includes('--package');
    
    try {
        if (moduleTemplate) {
            await builder.buildModuleTemplate(moduleTemplate);
        } else {
            switch (target) {
                case 'core':
                    await builder.buildCore(minified);
                    await builder.buildChunks();
                    break;
                case 'esm':
                    await builder.buildCoreEsm();
                    break;
                case 'full':
                    await builder.buildCoreFull();
                    break;
                case 'chunks':
                    await builder.buildChunks();
                    break;
                case 'bookmarklet':
                    await builder.buildBookmarklet();
                    break;
                case 'extension':
                    const result = await builder.buildExtension();
                    if (!result.success) {
                        process.exit(1);
                    }
                    if (packageExtension) {
                        const packaged = await builder.packageExtension();
                        if (!packaged.success) {
                            process.exit(1);
                        }
                    }
                    break;
                case 'all':
                default:
                    await builder.buildAll();
                    break;
            }
        }
    } catch (error) {
        console.error('❌ Build process failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AgentletCoreBuilder;