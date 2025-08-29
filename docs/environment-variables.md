# Environment Variables in Agentlet Core

Agentlet Core includes a robust frontend environment variable management system that allows you to configure your application and modules securely.

## Features

- **Secure Storage**: Environment variables are stored in localStorage with sensitive value masking
- **Real-time Updates**: Listen for changes and react to environment variable updates
- **Validation**: Validate environment variables against schemas
- **Export/Import**: Export configurations in multiple formats (JSON, ENV, JS)
- **Proxy Access**: Convenient property-style access to variables
- **Change Listeners**: Subscribe to environment variable changes

## Basic Usage

### Configuration on Initialization

```javascript
window.agentletConfig = {
    env: {
        API_BASE_URL: 'https://api.example.com',
        API_KEY: 'your-api-key-here',
        ENABLE_DEBUG: 'true',
        UI_THEME: 'dark'
    },
    // Other Agentlet Core configuration...
};
```

### Runtime Access

```javascript
// Access through the proxy (recommended)
const apiUrl = agentlet.env.API_BASE_URL;
const apiKey = agentlet.env.API_KEY;

// Or use methods directly
const timeout = agentlet.env.get('API_TIMEOUT', '5000');
agentlet.env.set('FEATURE_FLAG', 'enabled');
```

## API Reference

### Setting Variables

```javascript
// Set a single variable
agentlet.env.set('API_KEY', 'new-key');

// Set multiple variables
agentlet.env.setMultiple({
    API_URL: 'https://new-api.com',
    VERSION: '2.0.0',
    DEBUG: 'false'
});

// Load from an object (merges by default)
agentlet.env.loadFromObject(configObject);
```

### Getting Variables

```javascript
// Get with default value
const apiUrl = agentlet.env.get('API_URL', 'https://default.com');

// Check if variable exists
if (agentlet.env.has('API_KEY')) {
    // Use the API key
}

// Get all variables (sensitive values masked)
const allVars = agentlet.env.getAll();

// Get all variables including sensitive values
const allVarsWithSensitive = agentlet.env.getAll(true);
```

### Removing Variables

```javascript
// Delete a single variable
agentlet.env.delete('OLD_CONFIG');

// Clear all variables
agentlet.env.clear();
```

### Change Listeners

```javascript
// Listen for changes
agentlet.env.addChangeListener((key, newValue, oldValue) => {
    console.log(`${key} changed from ${oldValue} to ${newValue}`);
    
    if (key === 'API_URL') {
        // Reconfigure API client
        updateApiConfiguration();
    }
});

// Remove listener
const listener = (key, newValue, oldValue) => { /* ... */ };
agentlet.env.addChangeListener(listener);
agentlet.env.removeChangeListener(listener);
```

## Validation

Define validation schemas to ensure environment variables meet requirements:

```javascript
const schema = {
    required: ['API_URL', 'API_KEY'],
    variables: {
        API_URL: {
            type: 'string',
            pattern: '^https?://',
            required: true
        },
        API_KEY: {
            type: 'string',
            minLength: 10,
            required: true
        },
        TIMEOUT: {
            type: 'number',
            required: false
        },
        ENABLE_FEATURE: {
            type: 'boolean',
            required: false
        }
    }
};

const validation = agentlet.env.validate(schema);
if (!validation.valid) {
    console.error('Environment validation failed:', validation.errors);
}
```

## Export and Import

```javascript
// Export as JSON
const jsonConfig = agentlet.env.export('json');

// Export as .env file format
const envFile = agentlet.env.export('env');

// Export as JavaScript
const jsConfig = agentlet.env.export('js');

// Import from object
const remoteConfig = await fetch('/api/config').then(r => r.json());
agentlet.env.loadFromObject(remoteConfig);
```

## Security Features

### Sensitive Value Masking

Environment variables containing sensitive keywords (password, secret, token, key, api_key, auth) are automatically masked in logs and exports:

```javascript
agentlet.env.set('API_SECRET', 'super-secret-key');
console.log(agentlet.env.getAll()); // Shows: "su***et-key"
```

### Secure Storage

- Variables are stored in localStorage as JSON
- Sensitive values are never logged in full
- Export functions allow excluding sensitive values

## Module Integration

### Using Environment Variables in Modules

```javascript
class MyModule extends BaseModule {
    constructor(config = {}) {
        super(config);
        this.env = window.agentlet?.env;
        this.initializeFromEnv();
    }
    
    initializeFromEnv() {
        if (!this.env) return;
        
        this.config = {
            apiUrl: this.env.get('MODULE_API_URL', 'https://default.com'),
            retries: parseInt(this.env.get('MODULE_RETRIES', '3')),
            enabled: this.env.get('MODULE_ENABLED', 'true') === 'true'
        };
        
        // Listen for configuration changes
        this.env.addChangeListener((key, newValue) => {
            if (key.startsWith('MODULE_')) {
                this.updateConfiguration();
            }
        });
    }
    
    updateConfiguration() {
        // Reconfigure module when environment changes
        this.config.apiUrl = this.env.get('MODULE_API_URL');
        this.reconnect();
    }
}
```

## Common Patterns

### Feature Flags

```javascript
// Set feature flags
agentlet.env.setMultiple({
    FEATURE_NEW_UI: 'true',
    FEATURE_ANALYTICS: 'false',
    FEATURE_BETA_MODE: 'true'
});

// Use in code
if (agentlet.env.get('FEATURE_NEW_UI') === 'true') {
    loadNewUI();
}
```

### Environment-Specific Configuration

```javascript
// Different configs for different environments
const environment = window.location.hostname === 'localhost' ? 'development' : 'production';

const configs = {
    development: {
        API_URL: 'http://localhost:3000',
        DEBUG_LEVEL: 'verbose',
        ENABLE_MOCKS: 'true'
    },
    production: {
        API_URL: 'https://api.production.com',
        DEBUG_LEVEL: 'error',
        ENABLE_MOCKS: 'false'
    }
};

agentlet.env.loadFromObject(configs[environment]);
```

### Dynamic Configuration Loading

```javascript
async function loadRemoteConfiguration() {
    try {
        const response = await fetch('/api/frontend-config');
        const config = await response.json();
        agentlet.env.loadFromObject(config);
        console.log('Remote configuration loaded successfully');
    } catch (error) {
        console.error('Failed to load remote configuration:', error);
    }
}

// Load on startup
document.addEventListener('DOMContentLoaded', loadRemoteConfiguration);
```

## Statistics and Debugging

```javascript
// Get statistics about environment variables
const stats = agentlet.env.getStatistics();
console.log(`Total variables: ${stats.total}`);
console.log(`Sensitive variables: ${stats.sensitive}`);
console.log(`Storage size: ${stats.totalSize} bytes`);

// Debug access (when debugMode is enabled)
if (agentlet.debug) {
    const envManager = agentlet.debug.envManager;
    // Direct access to EnvManager for debugging
}
```

## Best Practices

1. **Use Descriptive Names**: Use clear, consistent naming conventions (e.g., `API_BASE_URL`, `FEATURE_ENABLED`)

2. **Validate Early**: Validate environment variables on application startup

3. **Provide Defaults**: Always provide sensible default values

4. **Group Related Variables**: Use prefixes to group related variables (e.g., `API_*`, `UI_*`, `FEATURE_*`)

5. **Listen for Changes**: Use change listeners to react to configuration updates

6. **Secure Sensitive Data**: Be careful with API keys and secrets; consider using secure storage solutions

7. **Document Variables**: Maintain documentation of all environment variables and their purposes

## Examples

See `examples/env-config-example.js` for comprehensive examples and patterns.