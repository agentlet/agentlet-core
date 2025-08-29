# Script Injection Migration to chrome.scripting.executeScript

## Overview

This document describes the migration of Agentlet Core's script injection mechanism from DOM `<script>` tag manipulation to the more robust `chrome.scripting.executeScript` API, while maintaining compatibility with non-extension environments.

## Why Migrate?

### Problems with DOM Script Injection
- **Security vulnerabilities**: Direct DOM manipulation can be blocked by CSP
- **Timing issues**: Script execution order is unpredictable
- **Browser inconsistencies**: Different browsers handle dynamic scripts differently
- **Extension limitations**: Content Security Policy can block inline scripts

### Benefits of chrome.scripting.executeScript
- **Enhanced security**: Runs in proper execution context
- **Reliable timing**: Guaranteed execution order
- **Better isolation**: Proper world separation (MAIN vs ISOLATED)
- **CSP compliance**: Bypasses content security policy restrictions
- **Error handling**: Better error reporting and handling

## Architecture

### Multi-Environment Support
The new `ScriptInjector` class supports three execution environments:

1. **Extension Background/Popup**: Uses `chrome.scripting.executeScript` directly
2. **Content Script**: Messages background script for injection
3. **Web Page/Bookmarklet**: Falls back to DOM manipulation

### Components

#### 1. ScriptInjector Class (`src/utils/ScriptInjector.js`)
- Main injection utility with automatic environment detection
- Security validation for module code
- Promise-based API for reliable error handling
- Support for code, function, and file injection

#### 2. Background Script Integration (`extension/background.js`)
- Handles `INJECT_SCRIPT` messages from content scripts
- Implements chrome.scripting.executeScript wrapper
- Provides injection result feedback

#### 3. Content Script Integration (`extension/content.js`)
- Embeds ScriptInjector utility in page context
- Routes injection requests to background script
- Maintains fallback DOM injection capability

## Usage Examples

### Basic Code Injection
```javascript
const injector = window.agentlet.utils.ScriptInjector;

await injector.inject({
    code: 'console.log("Hello from injected script!");'
});
```

### Function Injection with Arguments
```javascript
const testFunction = function(name, count) {
    for (let i = 0; i < count; i++) {
        console.log(`Hello ${name}!`);
    }
};

await injector.inject({
    func: testFunction,
    args: ['World', 3]
});
```

### Module Injection with Security Validation
```javascript
await injector.injectModule({
    moduleCode: moduleSource,
    moduleUrl: 'my-module://example',
    validateSecurity: true
});
```

### Extension Environment Injection
```javascript
// From background script or popup
const injector = new ScriptInjector();

await injector.inject({
    code: 'alert("Injected from extension!");',
    tabId: currentTabId,
    target: 'main'
});
```

## API Reference

### ScriptInjector Constructor
```javascript
const injector = new ScriptInjector();
```

### inject(options)
Main injection method supporting multiple input types.

**Parameters:**
- `options.code` (string): JavaScript code to inject
- `options.file` (string): File path to inject (extension environment)
- `options.func` (function): Function to inject
- `options.args` (array): Arguments for function injection
- `options.tabId` (number): Target tab ID (extension environment)
- `options.target` (string): Execution world ('main' or 'isolated')
- `options.allFrames` (boolean): Inject into all frames

**Returns:** Promise resolving to injection result

### injectModule(options)
Specialized method for module injection with security validation.

**Parameters:**
- `options.moduleCode` (string): Module source code
- `options.moduleUrl` (string): Module identifier/URL
- `options.validateSecurity` (boolean): Enable security validation (default: true)
- `options.tabId` (number): Target tab ID (extension environment)

**Returns:** Promise resolving to injection result

### Static Methods
- `ScriptInjector.isExtensionEnvironment()`: Check if chrome.scripting is available
- `ScriptInjector.isContentScriptEnvironment()`: Check if content script environment
- `ScriptInjector.createFunctionInjection(func, ...args)`: Helper for function injection

## Security Features

### Validation Patterns
The ScriptInjector automatically scans for dangerous patterns:
- `eval()` calls
- `Function()` constructor
- `innerHTML` assignments
- `document.write()` calls
- `<script>` tag injection
- `javascript:` URIs
- `data:text/html` URIs
- `vbscript:` URIs

### Module Structure Validation
- Checks for minimum Agentlet module structure
- Warns about non-Agentlet modules
- Validates module size and complexity

### Execution Isolation
- Wraps injected code in IIFE for isolation
- Provides proper error handling and logging
- Supports source mapping for debugging

## Migration Guide

### For Module Developers

#### Before (Old DOM Injection)
```javascript
function loadExternalScript(url) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => console.log('Loaded');
    document.head.appendChild(script);
}
```

#### After (New ScriptInjector)
```javascript
async function loadExternalScript(url) {
    const injector = window.agentlet.utils.ScriptInjector;
    await injector.inject({ file: url });
    console.log('Loaded');
}
```

### For Extension Developers

#### Before (Direct DOM Manipulation)
```javascript
// content.js
const script = document.createElement('script');
script.textContent = moduleCode;
document.head.appendChild(script);
```

#### After (ScriptInjector with Background Messaging)
```javascript
// content.js
const injector = new ScriptInjector();
await injector.injectModule({
    moduleCode: moduleCode,
    moduleUrl: moduleUrl
});
```

## Backwards Compatibility

### Fallback Mechanisms
1. **Extension environment**: Attempts chrome.scripting.executeScript first
2. **Content script**: Falls back to background messaging
3. **Web page**: Falls back to DOM manipulation
4. **Error recovery**: Automatic fallback on injection failure

### Legacy Support
- Old DOM injection methods still work in web page environments
- Gradual migration path for existing modules
- No breaking changes to public APIs

## Performance Considerations

### Injection Speed
- **Extension environment**: Fastest (direct API access)
- **Content script**: Medium (messaging overhead)
- **Web page**: Slowest (DOM manipulation)

### Memory Usage
- ScriptInjector instances are lightweight
- Automatic cleanup of temporary variables
- Efficient promise-based architecture

### Error Handling
- Comprehensive error messages
- Timeout protection for async operations
- Graceful degradation on failures

## Testing

### Test Environment Setup
```javascript
// Include the script-injector-example.js for interactive testing
// Available methods:
window.scriptInjectorExample.injectSimpleCode();
window.scriptInjectorExample.injectFunction();
window.scriptInjectorExample.injectModule();
```

### Extension Testing
1. Load the built extension in Chrome
2. Test on various websites with different CSP policies
3. Verify background script injection works correctly
4. Check content script fallback behavior

### Bookmarklet Testing
1. Use the updated agentlet-designer bookmarklet
2. Test script injection on restrictive sites
3. Verify fallback to DOM injection works
4. Check cross-origin injection handling

## Troubleshooting

### Common Issues

#### "ScriptInjector not available"
- Ensure agentlet-core is loaded before using ScriptInjector
- Check that the ScriptInjector was properly initialized

#### "Content script injection timeout"
- Verify background script is responding
- Check for browser extension permissions
- Increase timeout if needed for slow networks

#### "DOM injection setup failed"
- Check for Content Security Policy restrictions
- Verify document.head is available
- Look for JavaScript execution blocks

### Debug Tips
1. Check `window.agentlet.utils.ScriptInjector` availability
2. Use browser dev tools to inspect injection attempts
3. Monitor console for injection success/failure messages
4. Test in different execution environments

## Future Enhancements

### Planned Features
- Support for WebAssembly injection
- Advanced CSP bypass techniques
- Cross-frame injection improvements
- Performance monitoring and metrics

### API Stability
- Current API is stable for production use
- Minor additions may be made for new features
- No breaking changes planned for v1.x

---

For more examples and detailed API documentation, see:
- `examples/script-injector-example.js`
- `src/utils/ScriptInjector.js`
- Chrome Extension documentation on scripting API