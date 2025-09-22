/**
 * Example Builder - Simple template system for Agentlet examples
 * Creates consistent example structure while preserving flexibility
 */

class ExampleBuilder {
    constructor(config = {}) {
        this.config = {
            title: config.title || 'Agentlet Example',
            category: config.category || '',
            name: config.name || '',
            defaultStatus: config.defaultStatus || 'Click initialize button to start the demo.',
            faviconPath: config.faviconPath || '../../../resources/favicons/favicon.ico',
            examplesCssPath: config.examplesCssPath || '../../shared/examples.css',
            layoutCssPath: config.layoutCssPath || '../../shared/two-column-layout.css',
            consoleUtilsPath: config.consoleUtilsPath || '../../shared/console-utils.js',
            additionalHead: config.additionalHead || '',
            breadcrumb: this.buildBreadcrumb(config.category, config.name),
            ...config
        };
    }

    /**
     * Build breadcrumb navigation
     */
    buildBreadcrumb(category, name) {
        let breadcrumb = '<a href="../../">Examples</a>';
        if (category) {
            breadcrumb += ` → <a href="../">${category}</a>`;
        }
        if (name) {
            breadcrumb += ` → ${name}`;
        }
        return breadcrumb;
    }

    /**
     * Create main content section with controls
     */
    createMainContent(sections = []) {
        let content = `<h1>${this.config.title}</h1>\n`;

        sections.forEach(section => {
            switch (section.type) {
                case 'description':
                    content += `<p>${section.content}</p>\n`;
                    break;

                case 'features':
                    content += `
                        <div class="example-section">
                            <h3>What this example shows:</h3>
                            <ul>
                                ${section.items.map(item => `<li>${item}</li>`).join('\n                ')}
                            </ul>
                        </div>\n`;
                    break;

                case 'controls':
                    content += `
                        <div class="controls">
                            <h4>${section.title || 'Controls'}</h4>
                            ${section.buttons.map(btn =>
                                `<button onclick="${btn.onclick}" id="${btn.id}"${btn.style ? ` style="${btn.style}"` : ''}>${btn.text}</button>`
                            ).join('\n                            ')}
                        </div>\n`;
                    break;

                case 'html':
                    content += `${section.content}\n`;
                    break;
            }
        });

        return content;
    }

    /**
     * Create additional content (API docs, code examples, etc.)
     */
    createAdditionalContent(sections = []) {
        let content = '';

        sections.forEach(section => {
            switch (section.type) {
                case 'api-reference':
                    content += `
                        <div class="example-section">
                            <h3>📜 ${section.title || 'API Reference'}:</h3>
                            <div class="code-block">
                                ${section.blocks.map(block => `
                                    <h4>${block.title}</h4>
                                    <pre><code class="language-javascript">${block.code}</code></pre>
                                `).join('')}
                            </div>
                        </div>\n`;
                    break;

                case 'info-section':
                    content += `
                        <div class="example-section">
                            <h3>${section.title}</h3>
                            ${section.content}
                        </div>\n`;
                    break;

                case 'html':
                    content += `${section.content}\n`;
                    break;
            }
        });

        return content;
    }

    /**
     * Generate complete HTML from template
     */
    build(mainContentSections = [], additionalContentSections = [], customScript = '') {
        const template = this.getTemplate();

        const replacements = {
            '{{TITLE}}': this.config.title,
            '{{FAVICON_PATH}}': this.config.faviconPath,
            '{{EXAMPLES_CSS_PATH}}': this.config.examplesCssPath,
            '{{LAYOUT_CSS_PATH}}': this.config.layoutCssPath,
            '{{CONSOLE_UTILS_PATH}}': this.config.consoleUtilsPath,
            '{{ADDITIONAL_HEAD}}': this.config.additionalHead,
            '{{BREADCRUMB}}': this.config.breadcrumb,
            '{{MAIN_CONTENT}}': this.createMainContent(mainContentSections),
            '{{ADDITIONAL_CONTENT}}': this.createAdditionalContent(additionalContentSections),
            '{{DEFAULT_STATUS_MESSAGE}}': this.config.defaultStatus,
            '{{EXAMPLE_SCRIPT}}': customScript
        };

        let html = template;
        Object.entries(replacements).forEach(([placeholder, value]) => {
            html = html.replace(new RegExp(placeholder, 'g'), value);
        });

        return html;
    }

    /**
     * Get the base template (would read from file in real implementation)
     */
    getTemplate() {
        // In a real implementation, this would read from example-template.html
        // For now, returning the template content directly
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <link rel="icon" type="image/x-icon" href="{{FAVICON_PATH}}">
    <link rel="stylesheet" href="{{EXAMPLES_CSS_PATH}}">
    <link rel="stylesheet" href="{{LAYOUT_CSS_PATH}}">
    {{ADDITIONAL_HEAD}}
</head>
<body>
    <div class="container">
        <div class="two-column-container">
            <!-- Left Column: Content and Controls -->
            <div class="left-column">
                <!-- Standard breadcrumb navigation -->
                <div class="nav-breadcrumb">
                    {{BREADCRUMB}}
                </div>

                <!-- Main example content -->
                <div class="example-main-content">
                    {{MAIN_CONTENT}}
                </div>

                <!-- Additional sections -->
                <div class="example-additional-content">
                    {{ADDITIONAL_CONTENT}}
                </div>
            </div>

            <!-- Right Column: Console and Status (standardized) -->
            <div class="right-column">
                <div class="console-header">
                    <h3>📟 Console Output</h3>
                    <button onclick="clearConsole()" class="console-clear-btn">🗑️ Clear</button>
                </div>
                <div class="console-section" id="console"></div>

                <h3>📊 Status</h3>
                <div class="status-section" id="status">
                    {{DEFAULT_STATUS_MESSAGE}}
                </div>

                <h3>📈 Statistics</h3>
                <div class="stats-section" id="stats">
                    <div>Messages logged: <span id="messageCount">0</span></div>
                    <div>Errors: <span id="errorCount">0</span></div>
                    <div>Warnings: <span id="warningCount">0</span></div>
                    <div>Last action: <span id="lastAction">None</span></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Standard console utilities -->
    <script src="{{CONSOLE_UTILS_PATH}}"></script>

    <!-- Example-specific JavaScript -->
    <script>
        {{EXAMPLE_SCRIPT}}
    </script>
</body>
</html>`;
    }
}

// Export for Node.js usage or direct browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExampleBuilder;
} else {
    window.ExampleBuilder = ExampleBuilder;
}