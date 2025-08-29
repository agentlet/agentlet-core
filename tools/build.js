#!/usr/bin/env node

/**
 * Build system for Agentlet Core
 * Supports building the core framework and individual modules
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

class AgentletCoreBuilder {
    constructor() {
        this.srcDir = path.join(__dirname, '..', 'src');
        this.distDir = path.join(__dirname, '..', 'dist');
        this.resourcesDir = path.join(__dirname, '..', 'resources');
        this.entryPoint = path.join(this.srcDir, 'index.js');
        
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
                sourcemap: true
            },
            
            coreMinified: {
                entryPoints: [this.entryPoint],
                bundle: true,
                format: 'iife',
                target: 'es2020',
                outfile: path.join(this.distDir, 'agentlet-core.min.js'),
                globalName: 'AgentletCore',
                minify: true,
                sourcemap: false
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
     * Copy PDF.js worker files to dist directory
     */
    copyPDFJSWorker() {
        try {
            const workerSrcPath = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
            const workerDestPath = path.join(this.distDir, 'pdf.worker.min.js');
            
            if (fs.existsSync(workerSrcPath)) {
                fs.copyFileSync(workerSrcPath, workerDestPath);
                console.log(`📄 PDF.js worker copied to: ${workerDestPath}`);
            } else {
                console.warn('⚠️ PDF.js worker not found in node_modules, skipping copy');
            }
        } catch (error) {
            console.warn(`⚠️ Failed to copy PDF.js worker: ${error.message}`);
        }
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
        
        const config = minified ? this.configs.coreMinified : this.configs.core;
        
        try {
            const result = await esbuild.build(config);
            
            const outputFile = config.outfile;
            const stats = fs.statSync(outputFile);
            const sizeKB = (stats.size / 1024).toFixed(2);
            
            console.log(`✅ Core built successfully`);
            console.log(`   📦 Output: ${outputFile}`);
            console.log(`   📏 Size: ${sizeKB} KB`);
            
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
     * Build bookmarklet
     */
    async buildBookmarklet() {
        console.log('🔖 Building bookmarklet...');
        
        try {
            const result = await esbuild.build(this.configs.bookmarklet);
            
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
        // Remove source maps and comments
        code = code.replace(/\/\*.*?\*\//gs, '');
        code = code.replace(/\/\/.*$/gm, '');
        
        // Remove unnecessary whitespace
        code = code.replace(/\s+/g, ' ');
        code = code.trim();
        
        // Ensure proper bookmarklet wrapping
        if (!code.startsWith('javascript:')) {
            code = 'javascript:' + code;
        }
        
        return code;
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
        <a href="${bookmarkletCode}" class="bookmarklet-link">Agentlet Core</a>
        
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
     * Generate module template
     */
    generateModuleTemplate(moduleName) {
        const className = moduleName.charAt(0).toUpperCase() + moduleName.slice(1) + 'Module';
        
        return `/**
 * ${className} - Agentlet Core Module
 * Generated module template
 */

export default class ${className} extends BaseModule {
    constructor(config = {}) {
        super({
            name: '${moduleName}',
            version: '1.0.0',
            description: '${className} integration for Agentlet Core',
            patterns: ['example.com'], // Replace with actual URL patterns
            matchMode: 'includes',
            capabilities: ['page-analysis', 'form-filling'], // Define capabilities
            permissions: [], // Define required permissions
            dependencies: [], // Define module dependencies
            ...config
        });
    }

    /**
     * Check if this module should be active for the given URL
     */
    checkPattern(url) {
        // Custom pattern matching logic
        return super.checkPattern(url);
    }

    /**
     * Perform page analysis
     */
    async performPageAnalysis() {
        console.log(\`Analyzing page for \${this.name} module\`);
        
        // Your page analysis logic here
        // Example: Extract form fields, detect UI elements, etc.
        
        this.emit('pageAnalysisCompleted', {
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Perform module launching
     */
    async performModuleLaunch() {
        console.log(\`Launching \${this.name} module\`);
        
        // Your module launching logic here
        // Example: Initialize components, set up event listeners, etc.
        
        this.emit('moduleLaunchCompleted');
    }

    /**
     * Get module-specific content for the UI
     */
    getContent(context = {}) {
        const template = \`
            <div class="agentlet-module-content" data-module="\${this.name}">
                <div class="agentlet-module-header">
                    <h3>\${this.name.charAt(0).toUpperCase() + this.name.slice(1)} Assistant</h3>
                    <span class="agentlet-module-version">v\${this.version}</span>
                </div>
                <div class="agentlet-module-body">
                    <p><strong>Status:</strong> \${this.isActive ? 'Active' : 'Inactive'}</p>
                    <p><strong>Current URL:</strong> \${window.location.href}</p>
                    <p><strong>Capabilities:</strong> \${this.capabilities.join(', ')}</p>
                </div>
                <div class="agentlet-module-actions">
                    <button class="agentlet-btn" onclick="window.agentlet.modules.get('\${this.name}').performAction('analyze')">
                        Analyze Page
                    </button>
                    <button class="agentlet-btn agentlet-btn-secondary" onclick="window.agentlet.modules.get('\${this.name}').performAction('refresh')">
                        Refresh
                    </button>
                </div>
            </div>
        \`;
        
        return template;
    }

    /**
     * Handle custom actions
     */
    async performAction(action, params = {}) {
        switch (action) {
            case 'analyze':
                await this.analyzePage();
                break;
            case 'extract-forms':
                return this.extractForms();
            default:
                return super.performAction(action, params);
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

    /**
     * Handle URL updates
     */
    async handleURLUpdate(newUrl) {
        console.log(\`\${this.name} module: Handling URL update to \${newUrl}\`);
        
        // Your URL-specific logic here
        
        this.emit('urlUpdateHandled', { url: newUrl });
    }

    /**
     * Handle localStorage changes
     */
    onLocalStorageChange(key, newValue) {
        console.log(\`\${this.name} module: localStorage changed - \${key} = \${newValue}\`);
        
        // Your localStorage handling logic here
        
        this.emit('localStorageHandled', { key, newValue });
    }
}`;
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
                'agentlet-core': '^1.0.0'
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
        const className = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
        
        return `# ${className} Module for Agentlet Core

This module provides ${moduleName} integration for the Agentlet Core framework.

## Installation

### From NPM (if published)
\`\`\`bash
npm install agentlet-${moduleName}-module
\`\`\`

### From CDN
\`\`\`javascript
window.agentletConfig = {
    moduleRegistry: [
        {
            name: '${moduleName}',
            url: 'https://cdn.example.com/agentlet-${moduleName}-module@1.0.0/dist/module.js'
        }
    ]
};
\`\`\`

## Configuration

\`\`\`javascript
window.agentletConfig = {
    moduleRegistry: [
        {
            name: '${moduleName}',
            url: './path/to/module.js',
            options: {
                // Module-specific options
                debugMode: true,
                customSetting: 'value'
            }
        }
    ]
};
\`\`\`

## Features

- Automatic detection of ${moduleName} pages
- Page analysis and content extraction
- Custom UI integration
- Form processing capabilities
- Real-time updates

## URL Patterns

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

### Events Emitted
- \`pageAnalysisCompleted\` - When page analysis is done
- \`layoutPatchingCompleted\` - When layout modifications are complete
- \`formsExtracted\` - When forms are extracted from the page

### Actions Supported
- \`analyze\` - Analyze the current page
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
            this.ensureDir(extensionDir);
            
            // Build core library for extension
            const result = await esbuild.build(this.configs.extension);
            
            // Copy extension files
            await this.copyExtensionFiles(extensionDir);
            
            // Copy modules
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
     */
    async copyExtensionFiles(extensionDir) {
        const extensionSrcDir = path.join(__dirname, '..', 'extension');
        
        // Files to copy
        const filesToCopy = [
            'manifest.json',
            'background.js',
            'content.js'
        ];
        
        for (const file of filesToCopy) {
            const srcPath = path.join(extensionSrcDir, file);
            const destPath = path.join(extensionDir, file);
            
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`   📄 Copied ${file}`);
            }
        }
        
        // Copy PDF.js worker to extension directory
        try {
            const workerSrcPath = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
            const workerDestPath = path.join(extensionDir, 'pdf.worker.min.js');
            
            if (fs.existsSync(workerSrcPath)) {
                fs.copyFileSync(workerSrcPath, workerDestPath);
                console.log(`   📄 Copied PDF.js worker`);
            }
        } catch (error) {
            console.warn(`   ⚠️ Failed to copy PDF.js worker to extension: ${error.message}`);
        }
        
        // Create additional extension files
        await this.createExtensionUI(extensionDir);
        await this.createExtensionIcons(extensionDir);
    }

    /**
     * Copy modules to extension
     */
    async copyModules(extensionDir) {
        const modulesDir = path.join(extensionDir, 'modules');
        this.ensureDir(modulesDir);
        
        // Copy example module
        const exampleModuleSrc = path.join(__dirname, '..', 'examples', 'simple-test-module.js');
        const exampleModuleDest = path.join(modulesDir, 'simple-test-module.js');
        
        if (fs.existsSync(exampleModuleSrc)) {
            fs.copyFileSync(exampleModuleSrc, exampleModuleDest);
            console.log('   📦 Copied simple-test-module.js');
        }
    }

    /**
     * Create extension UI files
     */
    async createExtensionUI(extensionDir) {
        // Create popup.html
        const popupHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            width: 300px;
            height: 400px;
            margin: 0;
            padding: 15px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0e0e0;
        }
        .logo {
            font-size: 20px;
            margin-right: 10px;
        }
        .title {
            font-weight: 600;
            color: #333;
        }
        .status {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 6px;
            background: #f8f9fa;
            border: 1px solid #e9ecef;
        }
        .status.active {
            background: #d4edda;
            border-color: #c3e6cb;
            color: #155724;
        }
        .actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .btn {
            padding: 10px 15px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-primary:hover {
            background: #0056b3;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #545b62;
        }
        .footer {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #6c757d;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">🤖</div>
        <div class="title">Agentlet Core</div>
    </div>
    
    <div id="status" class="status">
        <div id="status-text">Checking status...</div>
    </div>
    
    <div class="actions">
        <button id="toggle-btn" class="btn btn-primary">Activate on Page</button>
        <button id="ai-assistant-btn" class="btn btn-secondary">AI Assistant</button>
        <button id="settings-btn" class="btn btn-secondary">Settings</button>
    </div>
    
    <div class="footer">
        <div>Version 1.0.0</div>
    </div>
    
    <script src="popup.js"></script>
</body>
</html>`;
        
        fs.writeFileSync(path.join(extensionDir, 'popup.html'), popupHtml.trim());
        
        // Create popup.js
        const popupJs = `
// Extension popup script
class AgentletPopup {
    constructor() {
        this.currentTab = null;
        this.init();
    }

    async init() {
        await this.getCurrentTab();
        await this.updateStatus();
        this.setupEventListeners();
    }

    async getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTab = tab;
    }

    async updateStatus() {
        const statusEl = document.getElementById('status');
        const statusTextEl = document.getElementById('status-text');
        const toggleBtn = document.getElementById('toggle-btn');

        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' });
            const isActive = response.data?.agentletActive || false;

            if (isActive) {
                statusEl.classList.add('active');
                statusTextEl.textContent = 'Active on this page';
                toggleBtn.textContent = 'Deactivate';
                toggleBtn.className = 'btn btn-secondary';
            } else {
                statusEl.classList.remove('active');
                statusTextEl.textContent = 'Not active on this page';
                toggleBtn.textContent = 'Activate on Page';
                toggleBtn.className = 'btn btn-primary';
            }
        } catch (error) {
            statusTextEl.textContent = 'Status unknown';
            console.error('Failed to get tab state:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('toggle-btn').addEventListener('click', () => {
            this.toggleAgentlet();
        });

        document.getElementById('ai-assistant-btn').addEventListener('click', () => {
            this.activateAIAssistant();
        });

        document.getElementById('settings-btn').addEventListener('click', () => {
            this.openSettings();
        });
    }

    async toggleAgentlet() {
        try {
            await chrome.tabs.sendMessage(this.currentTab.id, { type: 'TOGGLE_AGENTLET' });
            await this.updateStatus();
        } catch (error) {
            // Try injection through background script
            await chrome.runtime.sendMessage({ 
                type: 'TOGGLE_AGENTLET',
                tabId: this.currentTab.id 
            });
            setTimeout(() => this.updateStatus(), 1000);
        }
    }

    async activateAIAssistant() {
        try {
            await chrome.tabs.sendMessage(this.currentTab.id, { type: 'ACTIVATE_AI_ASSISTANT' });
            window.close();
        } catch (error) {
            console.error('Failed to activate AI assistant:', error);
        }
    }

    async openSettings() {
        await chrome.tabs.create({ 
            url: chrome.runtime.getURL('options.html') 
        });
        window.close();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AgentletPopup();
});`;
        
        fs.writeFileSync(path.join(extensionDir, 'popup.js'), popupJs.trim());
        
        // Create options.html
        const optionsHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Agentlet Core Settings</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        .header {
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .logo {
            font-size: 32px;
            margin-right: 15px;
        }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }
        .section h3 {
            margin-top: 0;
            color: #333;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 14px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            margin-right: 10px;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .saved-notification {
            padding: 10px;
            background: #d4edda;
            border: 1px solid #c3e6cb;
            border-radius: 4px;
            color: #155724;
            margin-bottom: 20px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">🤖</div>
        <div>
            <h1>Agentlet Core Settings</h1>
            <p>Configure your AI-powered web automation experience</p>
        </div>
    </div>

    <div id="saved-notification" class="saved-notification">
        Settings saved successfully!
    </div>

    <form id="settings-form">
        <div class="section">
            <h3>General Settings</h3>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="enabled"> Enable Agentlet Core
                </label>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="auto-activate"> Auto-activate on compatible pages
                </label>
            </div>
            
            
            <div class="form-group">
                <label for="theme">Theme:</label>
                <select id="theme">
                    <option value="default">Default</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                </select>
            </div>
        </div>

        <div class="section">
            <h3>Advanced Settings</h3>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="debug-mode"> Enable debug mode
                </label>
            </div>
            
            <div class="form-group">
                <label for="trusted-domains">Trusted Domains (one per line):</label>
                <textarea id="trusted-domains" rows="4" placeholder="example.com
another-domain.com"></textarea>
            </div>
        </div>

        <div class="section">
            <h3>Modules</h3>
            <p>Manage additional modules for enhanced functionality</p>
            <div id="modules-list">
                <!-- Modules will be populated here -->
            </div>
        </div>

        <div>
            <button type="submit" class="btn btn-primary">Save Settings</button>
            <button type="button" id="reset-btn" class="btn btn-secondary">Reset to Defaults</button>
        </div>
    </form>

    <script src="options.js"></script>
</body>
</html>`;
        
        fs.writeFileSync(path.join(extensionDir, 'options.html'), optionsHtml.trim());
        
        // Create options.js
        const optionsJs = `
// Extension options script
class AgentletOptions {
    constructor() {
        this.form = document.getElementById('settings-form');
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
    }

    async loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            const settings = response.data || {};

            // Populate form fields
            document.getElementById('enabled').checked = settings.enabled !== false;
            document.getElementById('auto-activate').checked = settings.autoActivate !== false;
            document.getElementById('theme').value = settings.theme || 'default';
            document.getElementById('debug-mode').checked = settings.debugMode || false;
            
            const trustedDomains = settings.trustedDomains || [];
            document.getElementById('trusted-domains').value = trustedDomains.join('\\n');

            this.loadModules(settings.moduleRegistry || []);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    loadModules(modules) {
        const modulesList = document.getElementById('modules-list');
        modulesList.innerHTML = '';

        modules.forEach(module => {
            const moduleDiv = document.createElement('div');
            moduleDiv.style.cssText = 'padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;';
            
            moduleDiv.innerHTML = \`
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>\\\${module.name}</strong>
                        \\\${module.builtin ? '<span style="color: #28a745;">(Built-in)</span>' : ''}
                        <br>
                        <small style="color: #666;">\\\${module.url}</small>
                    </div>
                    <label>
                        <input type="checkbox" \\\${module.enabled !== false ? 'checked' : ''} 
                               onchange="agentletOptions.toggleModule('\\\${module.name}', this.checked)">
                        Enabled
                    </label>
                </div>
            \`;
            
            modulesList.appendChild(moduleDiv);
        });
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetSettings();
        });
    }

    async saveSettings() {
        const settings = {
            enabled: document.getElementById('enabled').checked,
            autoActivate: document.getElementById('auto-activate').checked,
            theme: document.getElementById('theme').value,
            debugMode: document.getElementById('debug-mode').checked,
            trustedDomains: document.getElementById('trusted-domains').value
                .split('\\n')
                .map(domain => domain.trim())
                .filter(domain => domain.length > 0)
        };

        try {
            await chrome.runtime.sendMessage({ 
                type: 'UPDATE_SETTINGS', 
                settings: settings 
            });
            
            this.showSavedNotification();
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings');
        }
    }

    async toggleModule(moduleName, enabled) {
        // Implementation for toggling modules
        console.log('Toggle module:', moduleName, enabled);
    }

    async resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            await chrome.storage.sync.clear();
            location.reload();
        }
    }

    showSavedNotification() {
        const notification = document.getElementById('saved-notification');
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Global reference for inline event handlers
let agentletOptions;

document.addEventListener('DOMContentLoaded', () => {
    agentletOptions = new AgentletOptions();
});`;
        
        fs.writeFileSync(path.join(extensionDir, 'options.js'), optionsJs.trim());
        
        console.log('   📄 Created extension UI files');
    }

    /**
     * Create extension icons
     */
    async createExtensionIcons(extensionDir) {
        const iconsDir = path.join(extensionDir, 'icons');
        this.ensureDir(iconsDir);
        
        // Create simple SVG icons (in a real project, you'd use proper PNG icons)
        const iconSizes = [16, 32, 48, 128];
        
        iconSizes.forEach(size => {
            const svg = `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="4" fill="#007bff"/>
    <text x="12" y="16" text-anchor="middle" fill="white" font-size="14" font-family="Arial">🤖</text>
</svg>`;
            
            // For now, save as SVG (should be converted to PNG in production)
            fs.writeFileSync(path.join(iconsDir, `icon-${size}.svg`), svg.trim());
        });
        
        console.log('   🎨 Created extension icons (SVG placeholders)');
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
        
        const results = {
            core: await this.buildCore(false),
            coreMinified: await this.buildCore(true),
            bookmarklet: await this.buildBookmarklet(),
            extension: await this.buildExtension()
        };
        
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
  --target=<target>     Build specific target (core, bookmarklet, extension, all)
  --minified           Build minified version
  --module=<name>      Generate module template
  --package            Package extension for distribution
  --help               Show this help

Examples:
  node build.js                           # Build all targets
  node build.js --target=core             # Build core only
  node build.js --target=core --minified  # Build minified core
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
                    break;
                case 'bookmarklet':
                    await builder.buildBookmarklet();
                    break;
                case 'extension':
                    const result = await builder.buildExtension();
                    if (result.success && packageExtension) {
                        await builder.packageExtension();
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