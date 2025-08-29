# CLAUDE.md - Agentlet core library memory

## Project overview
**Agentlet** is a JavaScript bookmarklet framework that offers a modular foundation for building intelligent web automation tools powered by AI. It enables you to enhance and modernize your web applications in a powerful and unconventional way. The framework features a plugin-based architecture, advanced form handling, authentication management, screenshot utilities, and everything you need to quickly implement AI-powered tools via bookmarklets. Agentlet can also be embedded as a browser extension, offering a more robust alternative to the basic bookmarklet setup when your technical environment allows it.

Inspired by the concepts of applets and bookmarklets, these lightweight AI tools are referred to as **agentlets**.

The agentlet ecosystem includes a core framework, a collection of example implementations, and a specialized tool called the `agentlet-designer`, a dedicated agentlet for creating custom agentlets tailored to specific applications.

`agentlet-core` is the foundation that provides core capabilities. Developers can then build their own agentlets on top of it.

Key features of the `agentlet-core` framework:
- Element selector: Add dynamic element selection to your agentlets, with the ability to limit the selection to specific types of elements (e.g., forms, tables, images).
- Screenshot capture: Built-in support for HTML2Canvas allows rendering any web page element as an image or base64, ideal for feeding into AI models.
- Form extractor: Extracts structured data from forms, including field names, labels, placeholders, current values, options, and bounding boxes.
- Form filler: Automatically populates forms using structured data. You can chain the form extractor → AI model → form filler to automate form completion.
- Utility functions: Includes methods to display information, collect user input, wait, show tooltips or bubbles, and more.
- Data access: Retrieve information from cookies and local storage.
- Environment management: Manage local environment variables.
- Authentication: Supports integration with various identity providers.
- Script injector: Easily run JavaScript code via bookmarklets or browser extensions.
- Simplified lifecycle: Clean 3-hook lifecycle system (init, activate, cleanup) for predictable module behavior.

These primitives enable AI developers to rapidly create agentlets that enhance their applications. Note that backend AI APIs (such as those wrapping OpenAI services or AWS Bedrock) are still required, along with proper authentication mechanisms.

## Key components

### Core architecture
- **AgentletCore** (`src/index.js`) - Main application class with plugin architecture
- **ModuleLoader** (`src/plugin-system/ModuleLoader.js`) - Dynamic module loading system
- **BaseModule/BaseSubmodule** (`src/core/`) - Base classes with simplified 3-hook lifecycle (init, activate, cleanup)

### Form automation system
- **FormExtractor** (`src/utils/FormExtractor.js`) - Extracts form structure with AI-ready data
- **FormFiller** (`src/utils/FormFiller.js`) - Safe, context-aware form filling with jQuery integration
- **APIs**: `window.agentlet.forms.{extract, exportForAI, quickExport, fill, fillFromAI, fillMultiple}`

### Table extraction system
- **TableExtractor** (`src/utils/TableExtractor.js`) - Extracts structured data from HTML tables with Excel export
- Handles pagination automatically and provides Excel download using SheetJS
- **APIs**: `window.agentlet.tables.{extract, extractAll, download, extractAndDownload}`

### Authentication system
- **AuthManager** (`src/utils/AuthManager.js`) - Customizable popup-based authentication
- Supports OIDC, OAuth2, custom IDPs with configurable token extraction
- Optional login button in agentlet panel

### AI integration system
- **AIManager** (`src/utils/AIProvider.js`) - Direct AI API integration with provider abstraction
- **PDFProcessor** (`src/utils/PDFProcessor.js`) - PDF-to-image conversion using PDF.js for document analysis
- Currently supports OpenAI API with multimodal capabilities (text + images + PDFs)
- Uses environment variables for API key management (OPENAI_API_KEY, OPENAI_MODEL, etc.)
- **APIs**: `window.agentlet.ai.{sendPrompt, sendPromptWithPDF, convertPDFToImages, isAvailable, getStatus}`

### Utility classes
- **ElementSelector** - Advanced DOM element selection
- **Dialog** - Unified dialog system (info, input, wait, progress)
- **MessageBubble** - Toast notifications and status messages
- **ScreenCapture** - Screen capture functionality
- **ScriptInjector** - Safe script injection
- **EnvManager** - Environment variable management
- **CookieManager/StorageManager** - Data persistence

## API Quick Reference

### AI integration
```javascript
// Check if AI is available
const isAvailable = window.agentlet.ai.isAvailable();

// Send a text prompt
const response = await window.agentlet.ai.sendPrompt("Analyze this data and provide insights");

// Send prompt with images
const images = [screenshotBase64, documentImage];
const analysis = await window.agentlet.ai.sendPrompt("What do you see in these images?", images);

// Send prompt with PDF document (converts to images automatically)
const fileInput = document.getElementById('pdfFile');
const pdfAnalysis = await window.agentlet.ai.sendPromptWithPDF(
    "Analyze this PDF document and summarize the key points",
    fileInput.files[0], // PDF File object
    {
        pdfOptions: {
            scale: 1.5,        // Higher resolution
            maxPages: 10,      // Limit pages for efficiency
            format: 'image/png'
        },
        showInConsole: true    // Display converted images in console
    }
);

// Convert PDF to images without sending to AI
const pdfImages = await window.agentlet.ai.convertPDFToImages(fileInput.files[0]);

// Get AI status (includes PDF support info)
const status = window.agentlet.ai.getStatus();
console.log(status.currentProvider); // 'openai'
console.log(status.available); // true/false
console.log(status.pdfSupport.available); // true/false
console.log(status.pdfSupport.capabilities.maxRecommendedPages); // 10

// Set environment variables for AI
window.agentlet.env.OPENAI_API_KEY = 'sk-...';
window.agentlet.env.OPENAI_MODEL = 'gpt-4o-mini';
window.agentlet.ai.refresh(); // Refresh after env changes
```

### Form extraction
```javascript
// Simple array export
const fields = window.agentlet.forms.quickExport(formElement);

// AI-structured export
const formData = window.agentlet.forms.exportForAI(element, options);

// Complete extraction
const fullData = window.agentlet.forms.extract(element, options);
```

### Form filling
```javascript
// Basic filling
const result = window.agentlet.forms.fill(parentElement, selectorValues, options);

// AI-powered filling
const result = window.agentlet.forms.fillFromAI(parentElement, aiFormData, userValues, options);

// Multiple forms with retry
const results = await window.agentlet.forms.fillMultiple(parentElement, formDataArray, options);
```

### Table extraction and Excel export
```javascript
// Simple table extraction
const tableData = window.agentlet.tables.extract(tableElement);

// Extract all pages (handles pagination automatically)
const allData = await window.agentlet.tables.extractAll(tableElement, options);

// Download as Excel file
const result = window.agentlet.tables.download(tableData, {
    filename: 'data.xlsx',
    sheetName: 'Sheet1',
    includeMetadata: true
});

// Extract and download in one step
const result = await window.agentlet.tables.extractAndDownload(tableElement, {
    includePagination: true,
    filename: 'complete-data.xlsx'
});
```

### Authentication
```javascript
// Configure in AgentletCore initialization
const agentlet = new AgentletCore({
    auth: {
        enabled: true,
        buttonText: 'Login',
        loginUrl: 'https://idp.example.com/auth',
        popupWidth: 500,
        popupHeight: 600,
        tokenExtractor: (popup) => { /* custom logic */ }
    }
});
```

### Module lifecycle
```javascript
// Simplified 3-hook lifecycle for modules and submodules
class MyAgentlet extends window.agentlet.BaseModule {
    async initModule() {
        // Called once during module startup
        console.log('Initializing module');
        window.agentlet.refreshjQuery();
        // Setup logic here
    }
    
    async activateModule(context = {}) {
        // Called when module becomes active or on URL changes
        console.log('Activating module', context);
        if (context.trigger === 'urlChange') {
            console.log(`URL changed from ${context.oldUrl} to ${context.newUrl}`);
        }
        // Activation logic here
    }
    
    async cleanupModule(context = {}) {
        // Called during module cleanup or deactivation
        console.log('Cleaning up module', context);
        // Cleanup logic here
    }
}
```

### jQuery management
```javascript
// Refresh jQuery reference if loaded after agentlet initialization
window.agentlet.refreshjQuery();
```

## Development rules

- Agentlet is an open-source, GitHub hosted framework
- Never commit & push if tests fail locally
- Always test first before any git-related action

### Commit message format (Conventional Commits)

This repository enforces [Conventional Commits](https://www.conventionalcommits.org/) specification using commitlint and husky.

**Format:**
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Required types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc)
- `refactor`: Code refactoring without changing functionality
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `build`: Build system changes (webpack, npm scripts, etc)
- `ci`: CI/CD configuration changes (GitHub Actions, etc)
- `chore`: Maintenance tasks (updating dependencies, etc)
- `revert`: Reverting previous commits
- `disable`: Disabling features or functionality
- `simplify`: Simplifying code or architecture

**Rules:**
- Use lowercase for subject line
- Don't end subject with period
- Keep header under 72 characters
- Use present tense ("add" not "added")
- Use imperative mood ("move cursor to..." not "moves cursor to...")

**Examples:**
```bash
feat: add table extraction API for agentlets
fix: resolve jQuery reference issue in form filler
docs: update API documentation for table extractor
style: improve CSS formatting in panel component
refactor: use CLI parameters for plop instead of file modification
disable: turn off Playwright video recording
```

**Validation:** Commits are automatically validated via husky git hooks. Invalid commits will be rejected.
