# Registry Script Injection

This document explains the event-based script injection approach for loading agentlet registries, which replaces the previous JSON-based fetch method.

## Overview

The new approach uses JavaScript files instead of JSON files for agentlet registries, loaded via `<script>` tag injection rather than `fetch()` calls. This solves CORS (Cross-Origin Resource Sharing) issues that commonly occur when loading registry files from different domains.

## Benefits

### ✅ **CORS Resolution**
- Script tags can load from any domain without CORS restrictions
- No need for server-side CORS headers configuration
- Works in corporate environments with strict cross-origin policies

### ✅ **Better Caching**
- Browsers cache `.js` files more aggressively than JSON responses
- Registry files can leverage CDN caching strategies
- Improved loading performance for repeat visits

### ✅ **Enterprise Friendly**
- Works with Content Security Policy (CSP) restrictions
- Compatible with corporate firewalls that may block fetch requests
- More reliable across different hosting environments

### ✅ **Enhanced Reliability**
- Fallback mechanisms for event handling
- Better error handling and timeout management
- More consistent behavior across browsers

## Technical Implementation

### Registry File Format

**Previous format** (`agentlets-registry.json`):
```json
{
    "agentlets": [
        {
            "name": "hello-world",
            "url": "https://example.com/hello-world.js",
            "module": "HelloWorldModule"
        }
    ]
}
```

**New format** (`agentlets-registry.js`):
```javascript
(function() {
    'use strict';

    const registry = {
        "agentlets": [
            {
                "name": "hello-world",
                "url": "https://example.com/hello-world.js",
                "module": "HelloWorldModule"
            }
        ]
    };

    // Dispatch via custom event
    const event = new CustomEvent('agentletRegistryLoaded', {
        detail: registry
    });

    setTimeout(() => {
        window.dispatchEvent(event);
    }, 10);
})();
```

### Loading Process

1. **Script Injection**: ModuleRegistry creates a `<script>` tag with the registry URL
2. **Event Listener**: Sets up a listener for the `agentletRegistryLoaded` custom event
3. **Timeout Protection**: 10-second timeout prevents hanging on failed loads
4. **Event Dispatch**: Registry script dispatches the event with data
5. **Data Processing**: Same processing logic as before, just different loading method

### Code Changes

#### ModuleRegistry.js
```javascript
// New method for script-based loading
loadRegistryScript(url) {
    return new Promise((resolve, reject) => {
        const timeoutMs = 10000;
        let timeoutId, eventListener;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (eventListener) {
                window.removeEventListener('agentletRegistryLoaded', eventListener);
            }
        };

        // Event listener for registry data
        eventListener = (event) => {
            cleanup();
            resolve(event.detail);
        };

        window.addEventListener('agentletRegistryLoaded', eventListener, { once: true });

        // Timeout protection
        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Registry loading timeout: ${url}`));
        }, timeoutMs);

        // Inject script
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => console.log(`Registry script loaded: ${url}`);
        script.onerror = () => {
            cleanup();
            reject(new Error(`Failed to load registry script: ${url}`));
        };

        document.head.appendChild(script);
    });
}
```

## Configuration

### AgentletCore Configuration
No changes required to AgentletCore configuration. The `registryUrl` should now point to a `.js` file instead of `.json`:

```javascript
const agentlet = new AgentletCore({
    registryUrl: 'https://cdn.example.com/agentlets-registry.js'  // Changed from .json to .js
});
```

### Server Configuration

#### File Serving
Ensure your server serves `.js` files with the correct Content-Type header:
```
Content-Type: application/javascript
```

#### CDN Setup
Registry files work well with CDNs:
```javascript
// Example CDN setup
registryUrl: 'https://cdn.jsdelivr.net/gh/yourorg/agentlets@main/registry.js'
```

#### CORS Headers (Optional)
While not required for script loading, you may still want CORS headers for other API calls:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

## Migration Guide

### Step 1: Convert Registry Format
Convert your existing `registry.json` to `registry.js`:

```bash
# Example conversion script (pseudo-code)
cat registry.json | jq . > temp.json
echo "(function() { const registry = " >> registry.js
cat temp.json >> registry.js
echo "; window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: registry })); })();" >> registry.js
```

### Step 2: Update Configuration
Change your registryUrl configuration:
```javascript
// Before
registryUrl: 'https://your-cdn.com/registry.json'

// After
registryUrl: 'https://your-cdn.com/registry.js'
```

### Step 3: Deploy Registry File
Upload the new `.js` file to your CDN or server, ensuring proper Content-Type headers.

### Step 4: Test
Verify the registry loads correctly by checking browser console for:
```
📦 Registry script loaded: https://your-cdn.com/registry.js
📦 Registry data received via event
✅ Registry loaded successfully: X agentlet(s)
```

## Error Handling

### Common Issues

#### Timeout Errors
```
Registry loading timeout after 10000ms: https://...
```
**Solution**: Check network connectivity and file availability

#### Script Load Failures
```
Failed to load registry script: https://...
```
**Solution**: Verify URL is correct and file exists

#### Event Not Dispatched
**Symptoms**: Script loads but no registry data received
**Solution**: Check registry.js file format and event dispatch code

### Debugging

Enable debug logging:
```javascript
const agentlet = new AgentletCore({
    debugMode: true,
    registryUrl: 'https://your-cdn.com/registry.js'
});
```

Check browser console for detailed loading information.

## Security Considerations

### Content Integrity
Consider adding integrity checks for registry files:
```javascript
script.integrity = 'sha384-your-hash-here';
script.crossOrigin = 'anonymous';
```

### Trusted Domains
Only load registry scripts from trusted domains:
```javascript
const trustedDomains = ['cdn.your-domain.com', 'cdn.jsdelivr.net'];
const url = new URL(registryUrl);
if (!trustedDomains.includes(url.hostname)) {
    throw new Error('Untrusted registry domain');
}
```

### CSP Compatibility
Ensure your Content Security Policy allows script loading:
```
script-src 'self' https://cdn.your-domain.com;
```

## Performance Considerations

### Caching Strategy
- Set appropriate cache headers on registry files
- Use CDN for global distribution
- Consider cache busting for updates: `registry.js?v=1.2.3`

### File Size
- Keep registry files small (< 100KB recommended)
- Consider compression (gzip/brotli)
- Split large registries if needed

### Loading Performance
- Registry loading is asynchronous and non-blocking
- 10-second timeout prevents hanging
- Failed loads don't prevent core initialization

## Best Practices

1. **Version Your Registry**: Include version info in registry metadata
2. **Error Handling**: Always include try-catch in registry scripts
3. **Fallback Mechanisms**: Consider fallback URLs or data
4. **Testing**: Test registry loading across different environments
5. **Monitoring**: Monitor registry load success rates
6. **Documentation**: Keep registry format documented for team

## Example Registry Templates

### Minimal Registry
```javascript
(function() {
    const registry = { "agentlets": [] };
    window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: registry }));
})();
```

### Production Registry
```javascript
(function() {
    'use strict';

    const registry = {
        "agentlets": [
            // Your agentlets here
        ],
        "meta": {
            "version": "1.0.0",
            "lastUpdated": new Date().toISOString()
        }
    };

    try {
        const event = new CustomEvent('agentletRegistryLoaded', {
            detail: registry,
            bubbles: false,
            cancelable: false
        });

        setTimeout(() => {
            window.dispatchEvent(event);
            console.log('Registry loaded successfully');
        }, 10);

    } catch (error) {
        console.error('Registry loading failed:', error);
        // Fallback if needed
        window.AGENTLET_REGISTRY_FALLBACK = registry;
    }
})();
```

This new approach provides a more robust and reliable way to load agentlet registries while maintaining the same functionality and API compatibility.