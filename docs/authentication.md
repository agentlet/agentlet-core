# Authentication Feature Documentation

The Agentlet Core authentication feature provides a flexible, customizable authentication system that integrates seamlessly with the Agentlet panel. It supports various Identity Providers (IDPs) and authentication flows through popup-based authentication with customizable token extraction.

## Features

- **Customizable Login Button**: Configurable text, icon, and styling
- **Popup-based Authentication**: Opens IDP in a popup window with custom dimensions
- **Flexible Token Extraction**: Support for various token formats and extraction methods
- **Message-based Communication**: Secure communication between popup and parent window
- **Multiple IDP Support**: Works with OIDC, OAuth2, SAML, and custom providers
- **Event-driven Architecture**: Comprehensive success, error, and cancellation handling
- **Security Features**: Origin validation and secure token handling

## Configuration

### Basic Configuration

```javascript
const config = {
    auth: {
        enabled: true,                    // Enable/disable authentication
        buttonText: 'Login',              // Button text
        buttonIcon: '🔐',                 // Button icon
        loginUrl: 'https://your-idp.com/auth', // IDP authentication URL
        popupWidth: 400,                  // Popup width in pixels
        popupHeight: 600,                 // Popup height in pixels
        allowedOrigins: ['https://your-idp.com'], // Allowed origins for security
        
        // Event handlers
        onSuccess: (result) => {
            console.log('Authentication successful!', result);
        },
        onError: (result) => {
            console.error('Authentication failed:', result.error);
        },
        onCancel: () => {
            console.log('Authentication cancelled');
        }
    }
};
```

### Advanced Configuration

```javascript
const config = {
    auth: {
        enabled: true,
        buttonText: 'Enterprise Login',
        buttonIcon: '🏢',
        loginUrl: 'https://enterprise-idp.com/oauth/authorize?...',
        popupWidth: 600,
        popupHeight: 800,
        popupFeatures: 'scrollbars=yes,resizable=yes,status=no',
        allowedOrigins: ['https://enterprise-idp.com'],
        
        // Custom token extraction function
        tokenExtractor: (data) => {
            if (data.includes('#access_token=')) {
                const match = data.match(/access_token=([^&]+)/);
                return match ? match[1] : null;
            }
            return null;
        },
        
        // Custom message handler for complex scenarios
        messageHandler: (data, authManager) => {
            if (data.type === 'ENTERPRISE_AUTH_SUCCESS') {
                authManager.handleSuccess(data.accessToken, {
                    refreshToken: data.refreshToken,
                    userInfo: data.user
                });
            }
        },
        
        onSuccess: (result) => {
            // Handle enterprise-specific authentication
            localStorage.setItem('enterprise_token', result.token);
            updateUserInterface(result);
        }
    }
};
```

## Integration

### Initialize Agentlet with Authentication

```javascript
import AgentletCore from './src/index.js';

const agentlet = new AgentletCore({
    enableUI: true,
    auth: {
        enabled: true,
        buttonText: 'Login',
        loginUrl: 'https://your-idp.com/auth',
        onSuccess: (result) => {
            console.log('Authenticated!', result);
        }
    }
});

await agentlet.init();
```

### Programmatic Control

```javascript
// Access authentication manager
const auth = window.agentlet.auth;

// Check if authentication is enabled
if (auth.isEnabled()) {
    // Start authentication programmatically
    auth.startAuthentication();
}

// Get current authentication state
const state = auth.getState();
console.log('Auth state:', state);

// Update configuration dynamically
auth.updateConfig({
    buttonText: 'New Login Text',
    loginUrl: 'https://new-idp.com/auth'
});
```

## Identity Provider Examples

### Auth0 Integration

```javascript
const auth0Config = {
    auth: {
        enabled: true,
        buttonText: 'Login with Auth0',
        loginUrl: 'https://your-domain.auth0.com/authorize?' +
                 'response_type=token&' +
                 'client_id=YOUR_CLIENT_ID&' +
                 'redirect_uri=YOUR_REDIRECT_URI&' +
                 'scope=openid profile email',
        popupWidth: 500,
        popupHeight: 700,
        allowedOrigins: ['https://your-domain.auth0.com'],
        
        tokenExtractor: (data) => {
            if (data.includes('#access_token=')) {
                const match = data.match(/access_token=([^&]+)/);
                return match ? match[1] : null;
            }
            return null;
        },
        
        onSuccess: (result) => {
            localStorage.setItem('auth0_token', result.token);
        }
    }
};
```

### Google OAuth Integration

```javascript
const googleConfig = {
    auth: {
        enabled: true,
        buttonText: 'Sign in with Google',
        buttonIcon: '🔍',
        loginUrl: 'https://accounts.google.com/oauth/v2/auth?' +
                 'client_id=YOUR_GOOGLE_CLIENT_ID&' +
                 'redirect_uri=YOUR_REDIRECT_URI&' +
                 'response_type=code&' +
                 'scope=openid email profile',
        popupWidth: 500,
        popupHeight: 600,
        allowedOrigins: ['https://accounts.google.com'],
        
        tokenExtractor: (data) => {
            if (data.includes('code=')) {
                const match = data.match(/code=([^&]+)/);
                return match ? match[1] : null;
            }
            return null;
        },
        
        onSuccess: async (result) => {
            // Exchange code for access token
            const tokenResponse = await exchangeCodeForToken(result.token);
            localStorage.setItem('google_token', tokenResponse.access_token);
        }
    }
};
```

### Custom Enterprise IDP

```javascript
const enterpriseConfig = {
    auth: {
        enabled: true,
        buttonText: 'Enterprise SSO',
        loginUrl: 'https://enterprise.com/oauth/authorize?...',
        popupWidth: 600,
        popupHeight: 800,
        allowedOrigins: ['https://enterprise.com'],
        
        messageHandler: (data, authManager) => {
            if (data.type === 'ENTERPRISE_SUCCESS') {
                authManager.handleSuccess(data.token, {
                    userInfo: data.user,
                    permissions: data.permissions
                });
            } else if (data.type === 'ENTERPRISE_ERROR') {
                authManager.handleError(new Error(data.message));
            }
        },
        
        onSuccess: (result) => {
            setupEnterpriseSession(result);
        }
    }
};
```

## Communication Patterns

### Standard Message Format

The authentication system expects messages in this format:

```javascript
// Success message
{
    type: 'auth_result',
    success: true,
    token: 'your-access-token'
}

// Error message
{
    type: 'auth_result',
    success: false,
    error: 'Error description'
}

// Cancel message
{
    type: 'auth_cancel'
}
```

### Custom Message Handling

For complex scenarios, use the `messageHandler` function:

```javascript
messageHandler: (data, authManager) => {
    console.log('Received message:', data);
    
    if (data.type === 'CUSTOM_AUTH_SUCCESS') {
        authManager.handleSuccess(data.accessToken, {
            refreshToken: data.refreshToken,
            expiresIn: data.expiresIn,
            userInfo: data.user
        });
    } else if (data.type === 'CUSTOM_AUTH_ERROR') {
        authManager.handleError(new Error(data.message));
    }
}
```

### Token Extraction

Use the `tokenExtractor` function for custom token formats:

```javascript
tokenExtractor: (data) => {
    // Extract from URL hash (Auth0 style)
    if (data.includes('#access_token=')) {
        const match = data.match(/access_token=([^&]+)/);
        return match ? match[1] : null;
    }
    
    // Extract from query params (OAuth2 style)
    if (data.includes('?code=')) {
        const match = data.match(/code=([^&]+)/);
        return match ? match[1] : null;
    }
    
    // Extract from custom format
    if (data.startsWith('token:')) {
        return data.substring(6);
    }
    
    return null;
}
```

## Security Considerations

### Origin Validation

Always specify allowed origins:

```javascript
allowedOrigins: [
    'https://your-idp.com',
    'https://auth.your-domain.com'
]
```

### Secure Token Storage

```javascript
onSuccess: (result) => {
    // Store tokens securely
    localStorage.setItem('auth_token', result.token);
    
    // Set expiration
    const expirationTime = Date.now() + (result.expiresIn * 1000);
    localStorage.setItem('auth_token_expires', expirationTime);
    
    // Use HTTPS-only cookies for sensitive data
    document.cookie = `auth_token=${result.token}; Secure; HttpOnly; SameSite=Strict`;
}
```

### Token Validation

```javascript
onSuccess: async (result) => {
    try {
        // Validate token with your backend
        const validation = await validateToken(result.token);
        if (validation.valid) {
            setupAuthenticatedSession(result);
        } else {
            throw new Error('Invalid token');
        }
    } catch (error) {
        console.error('Token validation failed:', error);
    }
}
```

## Events

The authentication system emits events through the Agentlet event bus:

```javascript
// Listen for authentication events
window.agentlet.eventBus.on('auth:success', (result) => {
    console.log('Authentication successful:', result);
});

window.agentlet.eventBus.on('auth:error', (result) => {
    console.error('Authentication failed:', result);
});

window.agentlet.eventBus.on('auth:cancel', (result) => {
    console.log('Authentication cancelled:', result);
});
```

## Testing

Use the provided test file to verify your authentication configuration:

1. Open `examples/auth-test.html` in a browser
2. Configure your authentication settings
3. Test various scenarios using the mock IDP
4. Verify success, error, and cancellation flows

## Troubleshooting

### Common Issues

1. **Popup Blocked**: Ensure popups are allowed for your domain
2. **CORS Issues**: Configure proper CORS headers on your IDP
3. **Message Not Received**: Check `allowedOrigins` configuration
4. **Token Extraction Failed**: Verify your `tokenExtractor` function

### Debug Mode

Enable debug logging:

```javascript
const config = {
    debugMode: true,
    auth: {
        // ... your auth config
    }
};
```

### Console Commands

```javascript
// Check authentication state
window.agentlet.auth.getState();

// Test authentication flow
window.agentlet.auth.startAuthentication();

// View current configuration
window.agentlet.debug.getConfig().auth;
```

## API Reference

### AuthManager Methods

- `isEnabled()`: Check if authentication is enabled
- `startAuthentication()`: Start the authentication flow
- `getState()`: Get current authentication state
- `updateConfig(config)`: Update authentication configuration
- `createProxy()`: Create a safe proxy for external access

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable authentication |
| `buttonText` | string | `'Login'` | Text for the login button |
| `buttonIcon` | string | `'🔐'` | Icon for the login button |
| `loginUrl` | string | `''` | IDP authentication URL |
| `popupWidth` | number | `400` | Popup window width |
| `popupHeight` | number | `600` | Popup window height |
| `popupFeatures` | string | Custom | Popup window features |
| `allowedOrigins` | array | `[]` | Allowed origins for messages |
| `tokenExtractor` | function | `null` | Custom token extraction function |
| `messageHandler` | function | `null` | Custom message handler |
| `onSuccess` | function | `null` | Success callback |
| `onError` | function | `null` | Error callback |
| `onCancel` | function | `null` | Cancel callback |

## Examples

See the `examples/` directory for complete working examples:

- `auth-example.js`: Comprehensive configuration examples
- `auth-test.html`: Interactive testing page

## Best Practices

1. **Always validate tokens** on your backend
2. **Use HTTPS** for all authentication endpoints
3. **Implement token refresh** for long-lived sessions
4. **Handle errors gracefully** with user-friendly messages
5. **Test thoroughly** with different IDP configurations
6. **Follow security best practices** for token storage and transmission