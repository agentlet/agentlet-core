# CLAUDE.md - Agentlet core library memory

## Project overview
**Agentlet** is a JavaScript bookmarklet framework that offers a modular foundation for building intelligent web automation tools powered by AI. It enables you to enhance and modernize your web applications in a powerful and unconventional way. The framework features a plugin-based architecture, advanced form handling, authentication management, screenshot utilities, and everything you need to quickly implement AI-powered tools via bookmarklets. Agentlet can also be embedded as a browser extension, offering a more robust alternative to the basic bookmarklet setup when your technical environment allows it.

Inspired by the concepts of applets and bookmarklets, these lightweight AI tools are referred to as **agentlets**.

The agentlet ecosystem includes a core framework, a collection of example implementations, and a specialized tool called the `agentlet-designer`, a dedicated agentlet for creating custom agentlets tailored to specific applications.

`agentlet-core` is the foundation that provides core capabilities. Developers can then build their own agentlets on top of it.

Key features of the `agentlet-core` framework:
- **Simple Element Selection**: Easy DOM element selection with reliable CSS selectors.
- **Screenshot Capture**: Built-in support for HTML2Canvas to capture web page elements as images for AI processing.
- **Smart Form Handling**: Extract form structure and fill forms programmatically with AI-friendly data formats.
- **Table Processing**: Extract table data with optional Excel export using SheetJS.
- **AI Integration**: Direct integration with AI providers (OpenAI) including multimodal support for text, images, and PDFs.
- **Utility Functions**: Essential utilities for dialogs, messages, screen capture, and script injection.
- **Data Access**: Simple access to cookies, local storage, and environment variables.
- **Authentication**: Optional popup-based authentication for OAuth/OIDC flows.
- **Clean Architecture**: 3-hook module lifecycle (init, activate, cleanup) for predictable behavior.
- **No Dependencies**: Uses native DOM methods - no jQuery or complex dependencies required.

These primitives enable AI developers to rapidly create agentlets that enhance their applications. Note that backend AI APIs (such as those wrapping OpenAI services or AWS Bedrock) are still required, along with proper authentication mechanisms.

## Key components

### Core architecture
- **AgentletCore** (`src/index.js`) - Main application class with plugin architecture
- **ModuleLoader** (`src/plugin-system/ModuleLoader.js`) - Dynamic module loading system
- **BaseModule/BaseSubmodule** (`src/core/`) - Base classes with simplified 3-hook lifecycle (init, activate, cleanup)

### Form automation system (Simplified)
- **FormExtractor** (`src/utils/data-processing/FormExtractor.js`) - Simple form structure extraction with essential data
- **FormFiller** (`src/utils/data-processing/FormFiller.js`) - Basic form filling with context scoping and event triggering
- **APIs**: `window.agentlet.forms.{extract, exportForAI, quickExport, fill, fillFromAI, fillMultiple}`

### Table extraction system (Simplified)
- **TableExtractor** (`src/utils/data-processing/TableExtractor.js`) - Basic table data extraction with optional Excel export
- Simple pagination support (user provides next button selector) and Excel download using SheetJS
- **APIs**: `window.agentlet.tables.{extract, extractAll, download, extractAndDownload}`

### Authentication system
- **AuthManager** (`src/utils/system/AuthManager.js`) - Customizable popup-based authentication
- Supports OIDC, OAuth2, custom IDPs with configurable token extraction
- Optional login button in agentlet panel

### AI integration system
- **AIManager** (`src/utils/ai/AIProvider.js`) - Direct AI API integration with provider abstraction
- **PDFProcessor** (`src/utils/ai/PDFProcessor.js`) - PDF-to-image conversion using PDF.js for document analysis
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

### Form extraction (Simplified)
```javascript
// Quick export - simple array of fields (most common)
const fields = window.agentlet.forms.quickExport(formElement);
// Returns: [{selector: '#email', type: 'email', name: 'email', label: 'Email', ...}]

// AI-structured export - clean format for AI processing
const formData = window.agentlet.forms.exportForAI(element, options);

// Full extraction with all metadata
const fullData = window.agentlet.forms.extract(element, options);
```

### Form filling (Simplified)
```javascript
// Basic form filling - most common usage
const result = window.agentlet.forms.fill(parentElement, {
    '#email': 'user@example.com',
    '[name="firstName"]': 'John',
    '.password-field': 'secret123'
});

// AI-powered filling using extracted form data
const result = window.agentlet.forms.fillFromAI(parentElement, aiFormData, userValues, options);

// Multiple forms with basic retry logic
const results = await window.agentlet.forms.fillMultiple(parentElement, formDataArray, options);
```

### Table extraction and Excel export (Simplified)
```javascript
// Simple table extraction
const tableData = window.agentlet.tables.extract(tableElement);

// Extract with pagination (user must provide next button selector)
const allData = await window.agentlet.tables.extractAll(tableElement, {
    nextButtonSelector: '.next-page-btn', // User must specify
    maxPages: 10
});

// Download as Excel file
const result = await window.agentlet.tables.download(tableData, {
    filename: 'data.xlsx'
});

// Extract and download in one step
const result = await window.agentlet.tables.extractAndDownload(tableElement, {
    includePagination: true,
    nextButtonSelector: '.next-page-btn', // Required for pagination
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

### Native DOM Integration
```javascript
// Agentlet now uses native DOM methods for all operations
// No jQuery dependency required
const element = document.querySelector('.my-element');
element.addEventListener('click', handleClick);
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
fix: resolve DOM manipulation issue in form filler
docs: update API documentation for table extractor
style: improve CSS formatting in panel component
refactor: use CLI parameters for plop instead of file modification
disable: turn off Playwright video recording
```

**Validation:** Commits are automatically validated via husky git hooks. Invalid commits will be rejected.

## Documentation Style Guide

When creating or updating any project documentation (examples, README.md, or any .md files), follow these style guidelines to maintain a clean, professional appearance:

### Text and UI Guidelines
1. **Remove excessive emojis** - Don't use emojis in headings, section titles, or button text
   - ❌ `<h1>🚀 Hello World - Agentlet Core</h1>`
   - ✅ `<h1>Hello world</h1>`

2. **Fix capitalization** - Use sentence case (only first word capitalized), not Title Case
   - ❌ `<button>Initialize Agentlet Core</button>`
   - ✅ `<button>Initialize agentlet core</button>`
   - ❌ `<h4>Advanced Export Options</h4>`
   - ✅ `<h4>Advanced export options</h4>`

3. **Simplify text** - Remove marketing fluff and overly complex descriptions
   - ❌ "This example demonstrates the powerful AI integration capabilities..."
   - ✅ "This example demonstrates AI integration capabilities..."

4. **Avoid em dashes** - Use simple punctuation instead of em dashes (–) in sentences

### Goals
- **Professional appearance** - Examples should look clean and business-ready
- **Consistent style** - All examples follow the same formatting patterns
- **Focus on functionality** - Let the code and features speak for themselves
- **Easy maintenance** - Simple, clear text is easier to update and translate
